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
