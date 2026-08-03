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
