-- ============================================================
-- Phase 1 + 2: Auth, roles, org, PX tables, rounding, unified tasks
-- ============================================================

-- ---------- Roles ----------
CREATE TYPE public.app_role AS ENUM ('admin', 'cao', 'executive_director', 'director', 'manager');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- Invitations & approval queue ----------
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  role public.app_role NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX invitations_pending_email_uniq ON public.invitations(email) WHERE status = 'pending';
CREATE INDEX invitations_email_idx ON public.invitations(email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage invitations" ON public.invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pending_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email citext NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  requested_via text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_users TO authenticated;
GRANT ALL ON public.pending_users TO service_role;
ALTER TABLE public.pending_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pending users" ON public.pending_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users see own pending row" ON public.pending_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.current_user_has_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_access() TO authenticated, service_role;

-- Trigger: new auth user -> assign role from invite, bootstrap first admin, or queue for approval
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.invitations%ROWTYPE;
  v_any_role boolean;
BEGIN
  SELECT * INTO v_invite FROM public.invitations
   WHERE email = NEW.email::citext AND status = 'pending' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, v_invite.role)
      ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.invitations SET status='accepted', accepted_at=now(), accepted_user_id=NEW.id WHERE id = v_invite.id;
    RETURN NEW;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_roles) INTO v_any_role;
  IF NOT v_any_role THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
    RETURN NEW;
  END IF;
  INSERT INTO public.pending_users(user_id, email, requested_via)
    VALUES (NEW.id, NEW.email::citext, COALESCE(NEW.raw_app_meta_data->>'provider', 'email'))
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO service_role;

-- ---------- Teams & supervisor hierarchy ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  director_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executive_director_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_team_members_team ON public.team_members(team_id);
CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_teams_director ON public.teams(director_id);
CREATE INDEX idx_teams_exec ON public.teams(executive_director_id);

CREATE TRIGGER trg_teams_touch BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_supervisor_of(_supervisor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams t JOIN public.team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = _target AND (t.director_id = _supervisor OR t.executive_director_id = _supervisor)
  ) OR EXISTS (
    SELECT 1 FROM public.teams t_target JOIN public.team_members tm ON tm.team_id = t_target.id
     JOIN public.teams t_dir ON t_dir.director_id = t_target.director_id
     WHERE tm.user_id = _target AND t_dir.executive_director_id = _supervisor
  ) OR EXISTS (
    SELECT 1 FROM public.teams t WHERE t.director_id = _target AND t.executive_director_id = _supervisor
  );
$$;
CREATE OR REPLACE FUNCTION public.can_access_user_data(_viewer uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer = _target OR public.has_role(_viewer, 'admin') OR public.is_supervisor_of(_viewer, _target);
$$;
REVOKE EXECUTE ON FUNCTION public.is_supervisor_of(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_user_data(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_user_data(uuid, uuid) TO authenticated;

CREATE POLICY "Admins manage teams" ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members and supervisors read teams" ON public.teams FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR director_id = auth.uid() OR executive_director_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = teams.id AND tm.user_id = auth.uid()));
CREATE POLICY "Admins manage team_members" ON public.team_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members and supervisors read team_members" ON public.team_members FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND (t.director_id = auth.uid() OR t.executive_director_id = auth.uid())));

-- ---------- Clinics & assignments ----------
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialty text,
  location text,
  staff_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clinics_touch BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.clinic_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role IN ('manager','director','executive_director')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_assignments TO authenticated;
GRANT ALL ON public.clinic_assignments TO service_role;
ALTER TABLE public.clinic_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clinic_assignments_clinic ON public.clinic_assignments(clinic_id);
CREATE INDEX idx_clinic_assignments_user ON public.clinic_assignments(user_id);

CREATE OR REPLACE FUNCTION public.can_access_clinic(_viewer uuid, _clinic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_viewer, 'admin') OR public.has_role(_viewer, 'cao')
    OR EXISTS (
      SELECT 1 FROM public.clinic_assignments ca
       WHERE ca.clinic_id = _clinic_id
         AND (ca.user_id = _viewer OR public.is_supervisor_of(_viewer, ca.user_id))
    );
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_clinic(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_clinic(uuid, uuid) TO authenticated;

CREATE POLICY "Admins manage clinics" ON public.clinics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Assigned users read clinics" ON public.clinics FOR SELECT TO authenticated
  USING (public.can_access_clinic(auth.uid(), clinics.id));
CREATE POLICY "Admins manage clinic_assignments" ON public.clinic_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Assigned users read clinic_assignments" ON public.clinic_assignments FOR SELECT TO authenticated
  USING (public.can_access_clinic(auth.uid(), clinic_id) OR user_id = auth.uid());

-- ---------- PX report tables (clinic-scoped) ----------
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  site_name text NOT NULL DEFAULT 'Untitled Site',
  facility_name text,
  service_line text,
  time_frame text,
  overall_top_box numeric,
  overall_percentile integer,
  n integer,
  trends jsonb,
  raw_extraction jsonb,
  exec_summary text,
  insights jsonb,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_reports_touch BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "Clinic-access reports" ON public.reports FOR ALL TO authenticated
  USING (public.can_access_clinic(auth.uid(), clinic_id) OR public.can_access_user_data(auth.uid(), user_id))
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.report_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  name text NOT NULL, n integer, top_box numeric, percentile integer
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_sections TO authenticated;
GRANT ALL ON public.report_sections TO service_role;
ALTER TABLE public.report_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access report_sections" ON public.report_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND public.can_access_clinic(auth.uid(), r.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.user_id = auth.uid()));

CREATE TABLE public.report_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  name text NOT NULL, n integer, top_box numeric, percentile integer, tier text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_providers TO authenticated;
GRANT ALL ON public.report_providers TO service_role;
ALTER TABLE public.report_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access report_providers" ON public.report_providers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND public.can_access_clinic(auth.uid(), r.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.user_id = auth.uid()));

CREATE TABLE public.report_priority_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  rank integer, question text NOT NULL, percentile integer, correlation numeric
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_priority_index TO authenticated;
GRANT ALL ON public.report_priority_index TO service_role;
ALTER TABLE public.report_priority_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access report_priority_index" ON public.report_priority_index FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND public.can_access_clinic(auth.uid(), r.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.user_id = auth.uid()));

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  rank integer, title text NOT NULL, opp_type text NOT NULL, reason text,
  target_metric text, current_value numeric, target_value numeric, goal text,
  drivers jsonb, timeline_30 text, timeline_60 text, timeline_90 text, owner_role text, actions jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access opportunities" ON public.opportunities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND public.can_access_clinic(auth.uid(), r.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.user_id = auth.uid()));

CREATE TABLE public.coaching_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.report_providers(id) ON DELETE CASCADE,
  provider_name text NOT NULL, gap_summary text, shadow_recommendation text, scripts jsonb, checkpoints jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_plans TO authenticated;
GRANT ALL ON public.coaching_plans TO service_role;
ALTER TABLE public.coaching_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access coaching_plans" ON public.coaching_plans FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND public.can_access_clinic(auth.uid(), r.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.user_id = auth.uid()));

-- ---------- Rounding tables ----------
CREATE TABLE public.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  summary text,
  ai_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rounds TO authenticated;
GRANT ALL ON public.rounds TO service_role;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_rounds_touch BEFORE UPDATE ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "Clinic-access rounds" ON public.rounds FOR ALL TO authenticated
  USING (public.can_access_clinic(auth.uid(), clinic_id))
  WITH CHECK (public.can_access_clinic(auth.uid(), clinic_id));

CREATE TABLE public.round_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  theme text NOT NULL, severity text NOT NULL DEFAULT 'moderate' CHECK (severity IN ('low','moderate','high','critical')),
  finding_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_findings TO authenticated;
GRANT ALL ON public.round_findings TO service_role;
ALTER TABLE public.round_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access round_findings" ON public.round_findings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.can_access_clinic(auth.uid(), r.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.can_access_clinic(auth.uid(), r.clinic_id)));

CREATE TABLE public.round_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  win_text text NOT NULL, recognized_person text, category text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_wins TO authenticated;
GRANT ALL ON public.round_wins TO service_role;
ALTER TABLE public.round_wins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access round_wins" ON public.round_wins FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.can_access_clinic(auth.uid(), r.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.can_access_clinic(auth.uid(), r.clinic_id)));

-- ---------- Unified tasks (action-item pipeline) ----------
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('px_opportunity','round_finding','manual')),
  source_id uuid,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  theme text,
  owner_role text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','pending_validation','closed','reopened')),
  escalation_level text NOT NULL DEFAULT 'manager' CHECK (escalation_level IN ('manager','director','executive')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "Clinic-access tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.can_access_clinic(auth.uid(), clinic_id))
  WITH CHECK (public.can_access_clinic(auth.uid(), clinic_id));

CREATE TABLE public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('status_change','escalation','close','reopen','created')),
  from_status text, to_status text, from_level text, to_level text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_events TO authenticated;
GRANT ALL ON public.task_events TO service_role;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic-access task_events" ON public.task_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.can_access_clinic(auth.uid(), t.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.can_access_clinic(auth.uid(), t.clinic_id)));

-- ---------- Indexes ----------
CREATE INDEX idx_reports_user ON public.reports(user_id, created_at DESC);
CREATE INDEX idx_reports_clinic ON public.reports(clinic_id);
CREATE INDEX idx_sections_report ON public.report_sections(report_id);
CREATE INDEX idx_providers_report ON public.report_providers(report_id);
CREATE INDEX idx_priority_index_report ON public.report_priority_index(report_id);
CREATE INDEX idx_opportunities_report ON public.opportunities(report_id, rank);
CREATE INDEX idx_coaching_report ON public.coaching_plans(report_id);
CREATE INDEX idx_rounds_clinic ON public.rounds(clinic_id, round_date DESC);
CREATE INDEX idx_rounds_leader ON public.rounds(leader_id);
CREATE INDEX idx_findings_round ON public.round_findings(round_id);
CREATE INDEX idx_wins_round ON public.round_wins(round_id);
CREATE INDEX idx_tasks_clinic ON public.tasks(clinic_id, status);
CREATE INDEX idx_tasks_escalation ON public.tasks(escalation_level, status);
CREATE INDEX idx_tasks_owner ON public.tasks(owner_id, status);
CREATE INDEX idx_tasks_theme ON public.tasks(theme);
CREATE INDEX idx_task_events_task ON public.task_events(task_id, created_at);