-- ============================================================
-- Remove everything demo_data.sql created.
--
-- Targets only rows tied to the @rnr-demo.org accounts and the clinics the
-- seed owns. Your own account, roles and any real data are untouched.
-- ============================================================

DO $clear$
DECLARE
  v_dom text := 'rnr-demo.org';
  v_users uuid[];
  v_clinics uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_users
    FROM auth.users WHERE email LIKE '%@' || v_dom;

  SELECT COALESCE(array_agg(DISTINCT clinic_id), ARRAY[]::uuid[]) INTO v_clinics
    FROM public.clinic_assignments WHERE user_id = ANY(v_users);

  DELETE FROM public.tasks             WHERE clinic_id = ANY(v_clinics);
  DELETE FROM public.round_wins        WHERE round_id IN (SELECT id FROM public.rounds WHERE clinic_id = ANY(v_clinics));
  DELETE FROM public.round_findings    WHERE round_id IN (SELECT id FROM public.rounds WHERE clinic_id = ANY(v_clinics));
  DELETE FROM public.rounds            WHERE clinic_id = ANY(v_clinics);

  DELETE FROM public.coaching_plans        WHERE report_id IN (SELECT id FROM public.reports WHERE clinic_id = ANY(v_clinics));
  DELETE FROM public.opportunities         WHERE report_id IN (SELECT id FROM public.reports WHERE clinic_id = ANY(v_clinics));
  DELETE FROM public.report_priority_index WHERE report_id IN (SELECT id FROM public.reports WHERE clinic_id = ANY(v_clinics));
  DELETE FROM public.report_providers      WHERE report_id IN (SELECT id FROM public.reports WHERE clinic_id = ANY(v_clinics));
  DELETE FROM public.report_sections       WHERE report_id IN (SELECT id FROM public.reports WHERE clinic_id = ANY(v_clinics));
  DELETE FROM public.reports               WHERE clinic_id = ANY(v_clinics);

  DELETE FROM public.clinic_assignments WHERE clinic_id = ANY(v_clinics);
  DELETE FROM public.team_members       WHERE user_id = ANY(v_users);
  DELETE FROM public.teams              WHERE director_id = ANY(v_users) OR executive_director_id = ANY(v_users);
  DELETE FROM public.clinics            WHERE id = ANY(v_clinics);

  DELETE FROM public.user_roles    WHERE user_id = ANY(v_users);
  DELETE FROM public.pending_users WHERE user_id = ANY(v_users);
  DELETE FROM public.profiles      WHERE user_id = ANY(v_users);
  DELETE FROM auth.identities      WHERE user_id = ANY(v_users);
  DELETE FROM auth.users           WHERE id = ANY(v_users);

  RAISE NOTICE 'Removed % demo accounts and % clinics.',
    array_length(v_users, 1), array_length(v_clinics, 1);
END
$clear$;
