-- ============================================================
-- Office coordinator role.
--
-- Coordinators sit below practice managers: office coordinator -> practice
-- manager -> director -> executive director -> CAO. Like the other front-line
-- roles they are assigned per clinic, which is what grants them access to that
-- clinic's rounds and tasks through can_access_clinic().
--
-- Escalation tiers are unchanged: an issue a coordinator raises starts at
-- "Manager Resolve" with the clinic's practice manager.
--
-- Note on ALTER TYPE ... ADD VALUE: the new enum value cannot be *used* in the
-- same transaction that adds it, and the SQL editor runs a pasted script as
-- one transaction. So every comparison below goes through role::text rather
-- than casting the literal 'coordinator' to app_role.
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordinator';

-- ---------- Clinic assignments accept coordinators ----------
ALTER TABLE public.clinic_assignments
  DROP CONSTRAINT IF EXISTS clinic_assignments_role_check;
ALTER TABLE public.clinic_assignments
  ADD CONSTRAINT clinic_assignments_role_check
  CHECK (role::text IN ('coordinator', 'manager', 'director', 'executive_director'));

-- ---------- Admin RPC accepts coordinators ----------
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
  IF _role::text NOT IN ('coordinator', 'manager', 'director', 'executive_director') THEN
    RAISE EXCEPTION 'Clinic assignments must be coordinator, manager, director or executive_director';
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
