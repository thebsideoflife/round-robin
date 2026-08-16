-- ============================================================
-- Phase 1a — foundation for centralized departments, open assignment,
-- and configurable escalation.
--
-- Why departments land now rather than in phase 2: ownership and escalation
-- are clinic-only today. If a Scheduling or Call Center team will ever own an
-- action item, that has to exist in the model before escalation is rewritten,
-- or it gets rewritten twice. This adds the structure and the routing target;
-- department rounding and their own dashboards come later.
-- ============================================================

-- ---------- 1. Departments ----------
-- Centralized service teams that sit alongside clinics rather than inside the
-- clinic hierarchy: Scheduling for all of Primary Care, a Call Center covering
-- Cardiology, and so on. Scope is by service line, which is how the business
-- actually organizes them.
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('scheduling','call_center','patient_access','referrals','other')),
  -- NULL service_line means the department covers everything.
  service_line text,
  division text,
  dep_code text,
  cost_center text,
  -- Some departments round; some only receive escalations.
  does_round boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_service_line ON public.departments(service_line);
CREATE INDEX IF NOT EXISTS idx_departments_dep_code ON public.departments(dep_code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_departments_touch ON public.departments;
CREATE TRIGGER trg_departments_touch BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 2. Who runs a department ----------
CREATE TABLE IF NOT EXISTS public.department_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL
    CHECK (role IN ('manager','director','executive_director')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_dept_assign_dept ON public.department_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_assign_user ON public.department_assignments(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_assignments TO authenticated;
GRANT ALL ON public.department_assignments TO service_role;
ALTER TABLE public.department_assignments ENABLE ROW LEVEL SECURITY;

-- ---------- 3. Which clinics a department serves ----------
-- Derivable from service_line, but an explicit table handles the exceptions
-- that always exist in practice.
CREATE TABLE IF NOT EXISTS public.clinic_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, department_id)
);
CREATE INDEX IF NOT EXISTS idx_clinic_dept_clinic ON public.clinic_departments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_dept_dept ON public.clinic_departments(department_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_departments TO authenticated;
GRANT ALL ON public.clinic_departments TO service_role;
ALTER TABLE public.clinic_departments ENABLE ROW LEVEL SECURITY;

-- ---------- 4. Tasks gain a department and an assignment note ----------
-- A task keeps its clinic — that's where the issue was raised and who feels it
-- — and optionally gains a department that owns the fix. Both see it, which is
-- what the monthly operations meeting needs.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_note text,
  -- Set when the owner marks it done; cleared when someone else confirms.
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tasks_department ON public.tasks(department_id);

-- ---------- 5. Escalation settings, per division ----------
-- Replaces the hardcoded 45/100-day thresholds. A row with NULL division is
-- the system default; a division row overrides it for that division only.
CREATE TABLE IF NOT EXISTS public.escalation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division text UNIQUE,
  director_days integer NOT NULL DEFAULT 45,
  executive_days integer NOT NULL DEFAULT 100,
  safety_director_days integer NOT NULL DEFAULT 21,
  safety_executive_days integer NOT NULL DEFAULT 60,
  -- Same theme open this many times at one clinic -> Director.
  repeat_same_clinic integer NOT NULL DEFAULT 3,
  -- Same theme open across this many clinics -> Director.
  spread_clinics integer NOT NULL DEFAULT 3,
  -- Across this many clinics -> Executive, treated as an enterprise pattern.
  enterprise_clinics integer NOT NULL DEFAULT 6,
  -- Themes that should never auto-escalate, e.g. ones handled elsewhere.
  excluded_themes text[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.escalation_settings TO authenticated;
GRANT ALL ON public.escalation_settings TO service_role;
ALTER TABLE public.escalation_settings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_esc_settings_touch ON public.escalation_settings;
CREATE TRIGGER trg_esc_settings_touch BEFORE UPDATE ON public.escalation_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.escalation_settings (division) VALUES (NULL)
  ON CONFLICT DO NOTHING;

-- ---------- 6. Row-level security ----------
-- Departments are reference data: anyone signed in may read them, admins
-- manage them. Nothing sensitive lives here.
DROP POLICY IF EXISTS "Signed-in users read departments" ON public.departments;
CREATE POLICY "Signed-in users read departments" ON public.departments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Signed-in users read department assignments" ON public.department_assignments;
CREATE POLICY "Signed-in users read department assignments" ON public.department_assignments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage department assignments" ON public.department_assignments;
CREATE POLICY "Admins manage department assignments" ON public.department_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Signed-in users read clinic departments" ON public.clinic_departments;
CREATE POLICY "Signed-in users read clinic departments" ON public.clinic_departments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage clinic departments" ON public.clinic_departments;
CREATE POLICY "Admins manage clinic departments" ON public.clinic_departments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Signed-in users read escalation settings" ON public.escalation_settings;
CREATE POLICY "Signed-in users read escalation settings" ON public.escalation_settings
  FOR SELECT TO authenticated USING (true);

-- ---------- 7. Department members can see the tasks routed to them ----------
-- A Call Center manager needs their escalated items even though they hold no
-- clinic assignment. This widens the existing clinic-based task policy.
DROP POLICY IF EXISTS "Department members access their tasks" ON public.tasks;
CREATE POLICY "Department members access their tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (
    department_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.department_assignments da
       WHERE da.department_id = tasks.department_id
         AND (da.user_id = auth.uid() OR public.is_supervisor_of(auth.uid(), da.user_id))
    )
  )
  WITH CHECK (
    department_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.department_assignments da
       WHERE da.department_id = tasks.department_id AND da.user_id = auth.uid()
    )
  );

-- ---------- 7b. Department members can read the history too ----------
-- The existing task_events policy is clinic-based. Someone who owns a task
-- through a department but holds no clinic assignment would otherwise see the
-- item with no history behind it.
DROP POLICY IF EXISTS "Department members access task events" ON public.task_events;
CREATE POLICY "Department members access task events" ON public.task_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
        JOIN public.department_assignments da ON da.department_id = t.department_id
       WHERE t.id = task_events.task_id
         AND (da.user_id = auth.uid() OR public.is_supervisor_of(auth.uid(), da.user_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
        JOIN public.department_assignments da ON da.department_id = t.department_id
       WHERE t.id = task_events.task_id AND da.user_id = auth.uid()
    )
  );

-- ---------- 8. Editing escalation settings ----------
-- Executive Directors tune their own division; admins and the CAO can edit
-- anything, including the system default.
CREATE OR REPLACE FUNCTION public.set_escalation_settings(
  _division text,
  _director_days integer,
  _executive_days integer,
  _safety_director_days integer,
  _safety_executive_days integer,
  _repeat_same_clinic integer,
  _spread_clinics integer,
  _enterprise_clinics integer,
  _excluded_themes text[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cao');
  v_is_exec boolean := public.has_role(auth.uid(), 'executive_director');
BEGIN
  IF NOT (v_is_admin OR v_is_exec) THEN
    RAISE EXCEPTION 'Only Executive Directors and above can change escalation rules';
  END IF;

  -- An Executive Director may only touch a division they actually run.
  IF NOT v_is_admin THEN
    IF _division IS NULL THEN
      RAISE EXCEPTION 'Only an administrator can change the system default';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.clinic_assignments ca
        JOIN public.clinics c ON c.id = ca.clinic_id
       WHERE ca.user_id = auth.uid()
         AND ca.role = 'executive_director'
         AND c.division = _division
    ) THEN
      RAISE EXCEPTION 'You do not run the % division', _division;
    END IF;
  END IF;

  IF _director_days < 1 OR _executive_days <= _director_days THEN
    RAISE EXCEPTION 'Executive threshold must be greater than the director threshold';
  END IF;

  INSERT INTO public.escalation_settings AS es (
    division, director_days, executive_days, safety_director_days, safety_executive_days,
    repeat_same_clinic, spread_clinics, enterprise_clinics, excluded_themes, updated_by
  ) VALUES (
    _division, _director_days, _executive_days, _safety_director_days, _safety_executive_days,
    _repeat_same_clinic, _spread_clinics, _enterprise_clinics,
    COALESCE(_excluded_themes, '{}'), auth.uid()
  )
  ON CONFLICT (division) DO UPDATE SET
    director_days = EXCLUDED.director_days,
    executive_days = EXCLUDED.executive_days,
    safety_director_days = EXCLUDED.safety_director_days,
    safety_executive_days = EXCLUDED.safety_executive_days,
    repeat_same_clinic = EXCLUDED.repeat_same_clinic,
    spread_clinics = EXCLUDED.spread_clinics,
    enterprise_clinics = EXCLUDED.enterprise_clinics,
    excluded_themes = EXCLUDED.excluded_themes,
    updated_by = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_escalation_settings(text,integer,integer,integer,integer,integer,integer,integer,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_escalation_settings(text,integer,integer,integer,integer,integer,integer,integer,text[]) TO authenticated;

-- ---------- 9. Validation workflow ----------
-- task_events.event_type is CHECK-constrained. "validated" is a genuinely new
-- kind of event, so the constraint is widened rather than overloading "close".
ALTER TABLE public.task_events DROP CONSTRAINT IF EXISTS task_events_event_type_check;
ALTER TABLE public.task_events ADD CONSTRAINT task_events_event_type_check
  CHECK (event_type IN ('status_change','escalation','close','reopen','created','validated','assigned'));

-- The owner may mark their own work done, but it stays visible as
-- "pending validation" until somebody else confirms it. Confirmation can
-- happen any time, not only during a round.
CREATE OR REPLACE FUNCTION public.close_task(_task_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from text;
BEGIN
  SELECT status INTO v_from FROM public.tasks WHERE id = _task_id;
  IF v_from IS NULL THEN RAISE EXCEPTION 'No such action item'; END IF;

  UPDATE public.tasks
     SET status = 'pending_validation',
         closed_by = auth.uid(),
         closed_at = now()
   WHERE id = _task_id;

  INSERT INTO public.task_events (task_id, actor_id, event_type, from_status, to_status, note)
  VALUES (_task_id, auth.uid(), 'close', v_from, 'pending_validation', _note);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.close_task(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_task(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_task(_task_id uuid, _confirmed boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_closed_by uuid;
BEGIN
  SELECT closed_by INTO v_closed_by FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such action item'; END IF;

  IF _confirmed THEN
    -- Self-validation defeats the point of the step, so it is refused.
    IF v_closed_by IS NOT NULL AND v_closed_by = auth.uid() THEN
      RAISE EXCEPTION 'Someone other than the person who closed it needs to confirm';
    END IF;
    UPDATE public.tasks
       SET status = 'closed', validated_by = auth.uid(), validated_at = now()
     WHERE id = _task_id;
    INSERT INTO public.task_events (task_id, actor_id, event_type, from_status, to_status, note)
    VALUES (_task_id, auth.uid(), 'validated', 'pending_validation', 'closed', _note);
  ELSE
    UPDATE public.tasks
       SET status = 'reopened', closed_at = NULL, closed_by = NULL,
           validated_by = NULL, validated_at = NULL
     WHERE id = _task_id;
    INSERT INTO public.task_events (task_id, actor_id, event_type, from_status, to_status, note)
    VALUES (_task_id, auth.uid(), 'reopen', 'pending_validation', 'reopened', _note);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_task(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_task(uuid, boolean, text) TO authenticated;
