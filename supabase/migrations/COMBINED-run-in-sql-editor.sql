-- ============================================================
-- Round Robin — run this whole file in the Supabase SQL editor.
-- Combines both migrations in the required order.
-- Safe to re-run.
-- ============================================================

-- ############ PART 1 of 2 : audit log + hardening ############

-- ============================================================
-- Security hardening ahead of a HIPAA-eligible release.
--
--   1. Append-only audit log covering who saw and changed what.
--   2. Triggers on every table that will eventually hold PHI.
--   3. Tightened grants so clients cannot mutate audit history.
--
-- None of this changes application behaviour; it adds the evidence trail a
-- security review asks for and that is very painful to backfill later.
-- ============================================================

-- ---------- Audit log ----------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete','read','export','auth')),
  table_name text NOT NULL,
  record_id uuid,
  clinic_id uuid,
  -- Column names only, never values: the log must not become a second copy of
  -- the data it is protecting.
  changed_columns text[],
  request_ip inet,
  user_agent text,
  detail jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON public.audit_log(occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Clients may read their own trail; nobody may write, update or delete it
-- directly. Only the SECURITY DEFINER trigger below and service_role insert.
REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated, service_role;

CREATE POLICY "Actors read their own audit trail" ON public.audit_log
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid());

CREATE POLICY "Admins read the full audit trail" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------- Generic change trigger ----------
CREATE OR REPLACE FUNCTION public.log_data_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[];
  v_record uuid;
  v_clinic uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key) INTO v_changed
      FROM jsonb_each(to_jsonb(NEW))
     WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key;
    -- Nothing actually changed (e.g. a touch trigger re-firing).
    IF v_changed IS NULL THEN RETURN NEW; END IF;
  END IF;

  v_record := COALESCE((to_jsonb(COALESCE(NEW, OLD)) ->> 'id')::uuid, NULL);
  BEGIN
    v_clinic := (to_jsonb(COALESCE(NEW, OLD)) ->> 'clinic_id')::uuid;
  EXCEPTION WHEN others THEN
    v_clinic := NULL;
  END;

  INSERT INTO public.audit_log (actor_id, action, table_name, record_id, clinic_id, changed_columns)
  VALUES (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_record,
    v_clinic,
    v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_data_change() FROM PUBLIC, anon, authenticated;

-- ---------- Attach to the tables that carry clinical context ----------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tasks', 'rounds', 'round_findings', 'round_wins',
    'reports', 'opportunities', 'coaching_plans',
    'clinic_assignments', 'user_roles', 'invitations'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
           FOR EACH ROW EXECUTE FUNCTION public.log_data_change()', t);
    END IF;
  END LOOP;
END $$;

-- ---------- Explicit read logging for server functions ----------
-- Called from a server handler when a user opens a record. Reads are not
-- trigger-able in Postgres, so the app records them deliberately.
CREATE OR REPLACE FUNCTION public.log_read(
  _table_name text,
  _record_id uuid DEFAULT NULL,
  _clinic_id uuid DEFAULT NULL,
  _detail jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.audit_log (actor_id, action, table_name, record_id, clinic_id, detail)
  VALUES (auth.uid(), 'read', _table_name, _record_id, _clinic_id, _detail);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_read(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_read(text, uuid, uuid, jsonb) TO authenticated, service_role;

-- ---------- Retention ----------
-- HIPAA expects six years of audit retention. This helper is intentionally
-- conservative and must be scheduled explicitly (pg_cron or an external job).
CREATE OR REPLACE FUNCTION public.prune_audit_log(_older_than interval DEFAULT interval '7 years')
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM public.audit_log WHERE occurred_at < now() - _older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_audit_log(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_audit_log(interval) TO service_role;

-- ---------- Tighten table grants ----------
-- pending_users is only ever written by the service-role client
-- (invitations.functions.ts / users.functions.ts), so authenticated clients do
-- not need write grants. RLS already blocked this; removing the grant is
-- defence in depth.
REVOKE INSERT, UPDATE, DELETE ON public.pending_users FROM authenticated;

-- NOTE: invitations deliberately keeps its INSERT/UPDATE/DELETE grant. The
-- admin invite flow issues those writes through the *user-scoped* client so
-- that the "Admins manage invitations" RLS policy is the thing enforcing
-- access. Revoking the grant here would break inviting users.

-- user_roles was only ever granted SELECT to authenticated; every write goes
-- through the service-role client. Re-asserted here so a future migration
-- can't silently widen it.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;


-- ############ PART 2 of 2 : make the app able to read your data ############

-- ============================================================
-- Make the app work without a service-role key.
--
-- The previous host did not issue SUPABASE_SERVICE_ROLE_KEY, and getScope() —
-- the single read that feeds the entire client store — used the service-role
-- client to fetch profiles and user_roles. Without the key that import throws,
-- the scope query fails, and every screen renders empty regardless of what is
-- actually in the database.
--
-- The fix is to let the *user-scoped* client do those reads safely:
--   1. user_roles gains a scoped SELECT policy mirroring "Scope read profiles".
--   2. Bootstrapping the first admin moves into a SECURITY DEFINER function.
--   3. A read-only directory RPC backs the admin screens, which previously
--      relied on auth.admin.listUsers().
-- ============================================================

-- ---------- 1. Scoped reads of user_roles ----------
-- Previously: you could read only your own roles. That meant a director could
-- see their managers' profiles but not their roles, so the org graph could not
-- be assembled client-side without escalating to service_role.
DROP POLICY IF EXISTS "Scope read user_roles" ON public.user_roles;
CREATE POLICY "Scope read user_roles" ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cao')
    -- Anyone you share a clinic assignment with.
    OR EXISTS (
      SELECT 1 FROM public.clinic_assignments mine
      WHERE mine.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.clinic_assignments theirs
          WHERE theirs.user_id = user_roles.user_id
            AND theirs.clinic_id = mine.clinic_id
        )
    )
    -- Anyone below you in the reporting tree.
    OR public.is_supervisor_of(auth.uid(), user_roles.user_id)
  );

-- ---------- 2. First-admin bootstrap without service_role ----------
-- Safe by construction: it only ever fires when the workspace has no roles at
-- all, so it cannot be used to escalate once anyone is set up.
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_any boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles) INTO v_any;
  IF v_any THEN RETURN false; END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_log (actor_id, action, table_name, detail)
  VALUES (auth.uid(), 'auth', 'user_roles', jsonb_build_object('event', 'bootstrap_first_admin'));

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;

-- ---------- 3. Admin directory RPC ----------
-- Replaces auth.admin.listUsers(). Admins get every account plus its roles,
-- profile and pending state, in one call, without a service-role key.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  title text,
  roles public.app_role[],
  is_pending boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  clinic_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.full_name, ''),
    COALESCE(p.title, ''),
    COALESCE(
      (SELECT array_agg(ur.role ORDER BY ur.role) FROM public.user_roles ur WHERE ur.user_id = u.id),
      ARRAY[]::public.app_role[]
    ),
    EXISTS (SELECT 1 FROM public.pending_users pu WHERE pu.user_id = u.id),
    u.created_at,
    u.last_sign_in_at,
    COALESCE(
      (SELECT array_agg(DISTINCT ca.clinic_id) FROM public.clinic_assignments ca WHERE ca.user_id = u.id),
      ARRAY[]::uuid[]
    )
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY u.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- ---------- 4. Role assignment RPC ----------
-- Admin-only, audited, and refuses to strip the last remaining admin so a
-- workspace can never lock itself out.
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admins int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change roles';
  END IF;

  IF _role <> 'admin' THEN
    SELECT count(*) INTO v_admins FROM public.user_roles WHERE role = 'admin';
    IF v_admins <= 1 AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Cannot remove the last administrator';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.pending_users WHERE user_id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) TO authenticated;

-- ---------- 5. Clinic assignment RPC ----------
CREATE OR REPLACE FUNCTION public.admin_set_clinic_assignment(
  _user_id uuid,
  _clinic_id uuid,
  _role public.app_role,
  _attach boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change clinic assignments';
  END IF;
  IF _role NOT IN ('manager', 'director', 'executive_director') THEN
    RAISE EXCEPTION 'Clinic assignments must be manager, director or executive_director';
  END IF;

  IF _attach THEN
    INSERT INTO public.clinic_assignments (clinic_id, user_id, role)
    VALUES (_clinic_id, _user_id, _role)
    ON CONFLICT (clinic_id, user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.clinic_assignments
     WHERE clinic_id = _clinic_id AND user_id = _user_id AND role = _role;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_clinic_assignment(uuid, uuid, public.app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_clinic_assignment(uuid, uuid, public.app_role, boolean) TO authenticated;

-- ---------- 6. Let admins write clinics through the user-scoped client ----------
-- The existing "Admins manage clinics" policy already covers this; this just
-- makes sure the grant is present for the admin UI's create-clinic call.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
