-- ============================================================
-- Round & Resolve — demo data, as plain SQL.
--
-- HOW TO RUN
--   1. Change v_admin_email below to your own login email.
--   2. Paste the whole file into the Supabase / the previous host SQL editor.
--   3. Run. Takes a few seconds. Safe to run more than once — it is
--      idempotent and re-running refreshes the data in place.
--
-- WHY THIS EXISTS
--   The in-app "Load demo data" button needs a service-role key to create
--   auth users. the previous host did not issue one. The SQL editor already runs
--   with the privileges required, so this does the same job with no key.
--
-- WHAT YOU GET
--   21 people (3 executive directors, 5 directors, 13 managers), 13 clinics
--   across 3 divisions and 8 regions, ~50 rounding conversations with themes
--   and wins, ~75 action items aged so the 45- and 100-day escalation rules
--   actually fire, and one complete Press Ganey report with opportunities.
--
--   Demo accounts can sign in: <first>.<last>@rnr-demo.org / DemoRnR!2026
--
-- TO REMOVE IT ALL
--   See supabase/seed/demo_data_clear.sql
-- ============================================================

-- ------------------------------------------------------------
-- Helper: create (or refresh) one demo auth user with a profile and role.
-- Dropped again at the end of this file.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._rr_demo_user(
  _id uuid, _email text, _name text, _title text, _role text, _pw text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $fn$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', _id, 'authenticated', 'authenticated',
    _email, _pw, now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', _name),
    '', '', '', ''
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  -- Identity row is what makes email/password sign-in work. provider_id only
  -- exists on newer GoTrue schemas, so fall back if the column is absent.
  BEGIN
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (md5('rr:identity:' || _email)::uuid, _id, _id::text,
            jsonb_build_object('sub', _id::text, 'email', _email),
            'email', now(), now(), now())
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO auth.identities (id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (md5('rr:identity:' || _email)::uuid, _id,
            jsonb_build_object('sub', _id::text, 'email', _email),
            'email', now(), now(), now())
    ON CONFLICT (id) DO NOTHING;
  END;

  INSERT INTO public.profiles (user_id, full_name, title)
  VALUES (_id, _name, _title)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name, title = EXCLUDED.title;

  DELETE FROM public.user_roles WHERE user_id = _id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_id, _role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.pending_users WHERE user_id = _id;
END;
$fn$;

DO $seed$
DECLARE
  ----------------------------------------------------------------
  -- CHANGE THIS to the email you sign in with.
  ----------------------------------------------------------------
  v_admin_email text := 'jt@graided.app';

  -- bcrypt of 'DemoRnR!2026'. Precomputed so this file needs no pgcrypto.
  v_pw   text := '$2b$10$wQZ9fkZsLoMDBaX1sOThj.cOdnkh7Z4fTJ1bbSkD1gett1/5o3qxu';
  v_dom  text := 'rnr-demo.org';

  v_admin_id  uuid;
  v_uid       uuid;
  v_clinic    uuid;
  v_round     uuid;
  v_report    uuid;
  v_prov      uuid;
  v_team      uuid;
  v_mgr       uuid;
  v_dir       uuid;
  v_ed        uuid;
  i           int;
  j           int;
  k           int;
  n           int;
  v_days      int;
  v_email     text;
  v_name      text;
  v_title     text;
  v_role      text;
  v_theme     text;
  v_status    text;
  v_esc       text;
  v_prio      text;
  v_created   timestamptz;
  v_due       date;
  v_safety    boolean;

  -- clinic: name | specialty | location | region | division | providers | staff | manager first | manager last
  v_clinics text[][] := ARRAY[
    ['Lakeshore Family Medicine','Family Medicine','1200 Lakeshore Dr','Lakeshore','North Ambulatory','8','22','Dana','Whitfield'],
    ['Lakeshore Pediatrics','Pediatrics','1200 Lakeshore Dr, Ste 200','Lakeshore','North Ambulatory','6','18','Tomas','Iglesias'],
    ['Riverbend Internal Medicine','Internal Medicine','44 Riverbend Way','Riverbend','North Ambulatory','11','29','Alice','Nkemdirim'],
    ['Riverbend Cardiology','Cardiology','44 Riverbend Way, Ste 400','Riverbend','North Ambulatory','9','24','Grant','Oyelaran'],
    ['Northgate Orthopedics','Orthopedics','905 Northgate Blvd','Northgate','North Ambulatory','7','26','Bianca','Ferreira'],
    ['Midtown Primary Care','Primary Care','310 Midtown Ave','Midtown','Central Ambulatory','14','35','Owen','Brackett'],
    ['Midtown Dermatology','Dermatology','310 Midtown Ave, Ste 6','Midtown','Central Ambulatory','5','14','Leila','Marchetti'],
    ['University Endocrinology','Endocrinology','2 University Circle','University','Central Ambulatory','6','17','Caleb','Ondieki'],
    ['University Neurology','Neurology','2 University Circle, Ste 3','University','Central Ambulatory','8','21','Renata','Silva'],
    ['Westpark Family Medicine','Family Medicine','780 Westpark Rd','Westpark','Central Ambulatory','10','27','Miles','Donnelly'],
    ['Harbor Women''s Health','Obstetrics & Gynecology','15 Harbor Point','Harbor','South Ambulatory','9','25','Nadia','Haddad'],
    ['Harbor Gastroenterology','Gastroenterology','15 Harbor Point, Ste 8','Harbor','South Ambulatory','6','16','Julian','Vogt'],
    ['Southfield Pulmonology','Pulmonology','60 Southfield Pkwy','Southfield','South Ambulatory','5','15','Ivy','Castellanos']
  ];

  -- director first | last | title | division | ed first | ed last
  v_dirs text[][] := ARRAY[
    ['Jordan','Walsh','Director, Lakeshore & Riverbend','North Ambulatory','Elena','Vasquez'],
    ['Devon','Park','Director, Northgate','North Ambulatory','Elena','Vasquez'],
    ['Sofia','Reyes','Director, Midtown & University','Central Ambulatory','Marcus','Bell'],
    ['Hannah','Kim','Director, Westpark','Central Ambulatory','Marcus','Bell'],
    ['Ravi','Patel','Director, Harbor & Southfield','South Ambulatory','Priya','Nair']
  ];

  v_eds text[][] := ARRAY[
    ['Elena','Vasquez','Executive Director, North Ambulatory'],
    ['Marcus','Bell','Executive Director, Central Ambulatory'],
    ['Priya','Nair','Executive Director, South Ambulatory']
  ];

  -- which director index (1-based into v_dirs) owns each clinic index
  v_clinic_dir int[] := ARRAY[1,1,1,1,2,3,3,3,3,4,5,5,5];

  v_themes text[] := ARRAY['Staffing','Patient Access','Scheduling','Referral Management',
                           'Technology','Facilities','Safety','Supplies','Training','Provider Retention'];

  v_working text[] := ARRAY[
    'The team is covering each other well during the vacancy and morale is holding up.',
    'New rooming checklist has cut door-to-provider time noticeably.',
    'Front office is catching insurance issues before the visit instead of after.',
    'Huddles are actually happening every morning now and people speak up in them.',
    'The float pool coverage last month made a real difference.'];

  v_barriers text[] := ARRAY[
    'We are down a scheduler and referrals are backing up. Patients are waiting eleven days for a callback.',
    'Two MAs left in the same month and we have not backfilled either position.',
    'The in-basket volume is unmanageable for the providers covering panels.',
    'Prior authorizations are taking so long that patients give up and go elsewhere.',
    'Rooms are double-booked most afternoons because the template does not match reality.'];

  v_access text[] := ARRAY[
    'Third next available is out past four weeks for new patients.',
    'Same-day slots get consumed by 8:15am and there is nothing left for urgent calls.',
    'Referral backlog is the main driver — we are not getting people in from the ED.',
    'Template has too many blocks that nobody uses, so real capacity is hidden.',
    'Phone abandonment rate is climbing in the afternoons.'];

  v_workflow text[] := ARRAY[
    'Rooming is inconsistent between pods — every MA does it a little differently.',
    'Check-in is asking for the same information the portal already collected.',
    'Results routing sends everything to the provider even when a nurse could close it.',
    'Med rec is happening at the wrong point in the visit and gets rushed.',
    'Discharge instructions are printed but nobody walks the patient through them.'];

  v_safetyc text[] := ARRAY[
    'Sterilizer service is overdue and we are working around it.',
    'No concerns this cycle.',
    'Near miss last week with a look-alike medication in the fridge.',
    'Exam room three has a broken exam table lock.',
    'No concerns this cycle.'];

  v_support text[] := ARRAY[
    'Approve the scheduler backfill so we can stop rotating people through it.',
    'Help us get IT to prioritise the template rebuild.',
    'We need a decision on whether the Saturday clinic continues.',
    'Cover for training time so people can actually attend.',
    'Nothing specific — just keep the float pool funded.'];

  v_wins text[] := ARRAY[
    'Sarah stayed two hours late to work through the referral backlog and cleared 40 of them.',
    'The team caught a wrong-dose order before it reached the patient.',
    'Front office redesigned the check-in script and complaints dropped noticeably.',
    'Marcus trained three new MAs on his own time and they are all up to speed.',
    'A patient wrote in specifically to thank the nursing team by name.'];
  v_wincat text[] := ARRAY['Recognition','Safety Catch','Process Improvement','Teamwork','Patient Experience'];

  v_tasks text[] := ARRAY[
    'Backfill the vacant scheduler position',
    'Rebuild the clinic template to match actual capacity',
    'Standardise the rooming workflow across pods',
    'Reduce referral turnaround to under 48 hours',
    'Fix results routing so nurses can close normal results',
    'Replace the broken exam table lock in room 3',
    'Schedule overdue sterilizer preventive maintenance',
    'Add afternoon phone coverage to cut abandonment',
    'Run prior-auth training for front office',
    'Review and retire unused template block types',
    'Set up a same-day slot protection rule',
    'Document the morning huddle format and share it',
    'Escalate IT ticket for portal intake duplication',
    'Recruit a second float MA for the region'];

  v_roles_rounded text[] := ARRAY['Provider','Clinical Staff','Front Office Staff'];
  v_names_rounded text[] := ARRAY['Dr. Alicia Moreno','Dr. Peter Hsu','Rachel Adeyemi, RN','Sam Kirchner, MA',
                                  'Dr. Naomi Frost','Terrence Boyd, LPN','Gina Petrov','Dr. Omar Rahimi',
                                  'Cheryl Nakamura, RN','Devin Ashford'];
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve the admin and make sure a role exists BEFORE creating
  --    any users, so the "first user becomes admin" trigger cannot
  --    hand admin to a demo account.
  ----------------------------------------------------------------
  SELECT id INTO v_admin_id FROM auth.users WHERE lower(email) = lower(v_admin_email);
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION
      'No account found for %. Sign up in the app first, then change v_admin_email at the top of this file.',
      v_admin_email;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.pending_users WHERE user_id = v_admin_id;

  PERFORM setseed(0.4242);

  ----------------------------------------------------------------
  -- 1. People. Deterministic ids so re-running updates rather than duplicates.
  ----------------------------------------------------------------
  -- Executive directors
  FOR i IN 1 .. array_length(v_eds, 1) LOOP
    v_name  := v_eds[i][1] || ' ' || v_eds[i][2];
    v_email := lower(v_eds[i][1] || '.' || v_eds[i][2]) || '@' || v_dom;
    v_uid   := md5('rr:user:' || v_email)::uuid;
    PERFORM public._rr_demo_user(v_uid, v_email, v_name, v_eds[i][3], 'executive_director', v_pw);
  END LOOP;

  -- Directors
  FOR i IN 1 .. array_length(v_dirs, 1) LOOP
    v_name  := v_dirs[i][1] || ' ' || v_dirs[i][2];
    v_email := lower(v_dirs[i][1] || '.' || v_dirs[i][2]) || '@' || v_dom;
    v_uid   := md5('rr:user:' || v_email)::uuid;
    PERFORM public._rr_demo_user(v_uid, v_email, v_name, v_dirs[i][3], 'director', v_pw);
  END LOOP;

  -- Managers, one per clinic
  FOR i IN 1 .. array_length(v_clinics, 1) LOOP
    v_name  := v_clinics[i][8] || ' ' || v_clinics[i][9];
    v_email := lower(v_clinics[i][8] || '.' || v_clinics[i][9]) || '@' || v_dom;
    v_uid   := md5('rr:user:' || v_email)::uuid;
    PERFORM public._rr_demo_user(v_uid, v_email, v_name, 'Practice Manager, ' || v_clinics[i][1], 'manager', v_pw);
  END LOOP;

  ----------------------------------------------------------------
  -- 2. Clinics
  ----------------------------------------------------------------
  FOR i IN 1 .. array_length(v_clinics, 1) LOOP
    v_clinic := md5('rr:clinic:' || v_clinics[i][1])::uuid;
    INSERT INTO public.clinics (id, name, specialty, location, region, division, provider_count, staff_count)
    VALUES (v_clinic, v_clinics[i][1], v_clinics[i][2], v_clinics[i][3], v_clinics[i][4], v_clinics[i][5],
            v_clinics[i][6]::int, v_clinics[i][7]::int)
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, specialty = EXCLUDED.specialty, location = EXCLUDED.location,
          region = EXCLUDED.region, division = EXCLUDED.division,
          provider_count = EXCLUDED.provider_count, staff_count = EXCLUDED.staff_count;

    v_mgr := md5('rr:user:' || lower(v_clinics[i][8] || '.' || v_clinics[i][9]) || '@' || v_dom)::uuid;
    j     := v_clinic_dir[i];
    v_dir := md5('rr:user:' || lower(v_dirs[j][1] || '.' || v_dirs[j][2]) || '@' || v_dom)::uuid;
    v_ed  := md5('rr:user:' || lower(v_dirs[j][5] || '.' || v_dirs[j][6]) || '@' || v_dom)::uuid;

    INSERT INTO public.clinic_assignments (clinic_id, user_id, role) VALUES
      (v_clinic, v_mgr, 'manager'),
      (v_clinic, v_dir, 'director'),
      (v_clinic, v_ed,  'executive_director')
    ON CONFLICT (clinic_id, user_id, role) DO NOTHING;
  END LOOP;

  ----------------------------------------------------------------
  -- 3. Teams — these back is_supervisor_of(), which RLS relies on
  ----------------------------------------------------------------
  FOR j IN 1 .. array_length(v_dirs, 1) LOOP
    v_team := md5('rr:team:' || v_dirs[j][1] || v_dirs[j][2])::uuid;
    v_dir  := md5('rr:user:' || lower(v_dirs[j][1] || '.' || v_dirs[j][2]) || '@' || v_dom)::uuid;
    v_ed   := md5('rr:user:' || lower(v_dirs[j][5] || '.' || v_dirs[j][6]) || '@' || v_dom)::uuid;

    INSERT INTO public.teams (id, name, director_id, executive_director_id)
    VALUES (v_team, v_dirs[j][3], v_dir, v_ed)
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, director_id = EXCLUDED.director_id,
          executive_director_id = EXCLUDED.executive_director_id;

    FOR i IN 1 .. array_length(v_clinics, 1) LOOP
      IF v_clinic_dir[i] = j THEN
        v_mgr := md5('rr:user:' || lower(v_clinics[i][8] || '.' || v_clinics[i][9]) || '@' || v_dom)::uuid;
        INSERT INTO public.team_members (team_id, user_id) VALUES (v_team, v_mgr)
          ON CONFLICT (team_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  ----------------------------------------------------------------
  -- 4. Rounds, findings and wins
  ----------------------------------------------------------------
  FOR i IN 1 .. array_length(v_clinics, 1) LOOP
    v_clinic := md5('rr:clinic:' || v_clinics[i][1])::uuid;
    v_mgr    := md5('rr:user:' || lower(v_clinics[i][8] || '.' || v_clinics[i][9]) || '@' || v_dom)::uuid;

    -- 2-5 rounds each; clinic 4 deliberately gets none so a rounding gap shows.
    n := CASE WHEN i = 4 THEN 0 ELSE 2 + (i % 4) END;

    FOR j IN 1 .. n LOOP
      v_round  := md5('rr:round:' || v_clinics[i][1] || ':' || j)::uuid;
      v_days   := 3 + ((i * 7 + j * 11) % 80);
      v_safety := ((i + j) % 6 = 0);

      INSERT INTO public.rounds (id, clinic_id, leader_id, round_date, status, individual, individual_role,
                                 notes, answers, themes, safety_flag, created_at)
      VALUES (
        v_round, v_clinic, v_mgr, (now() - (v_days || ' days')::interval)::date, 'closed',
        v_names_rounded[1 + ((i * 3 + j) % 10)],
        v_roles_rounded[1 + ((i + j) % 3)],
        v_barriers[1 + ((i + j) % 5)],
        jsonb_build_object(
          'workingWell',        v_working[1 + ((i + j) % 5)],
          'barriers',           v_barriers[1 + ((i + j) % 5)],
          'accessChallenges',   v_access[1 + ((i * 2 + j) % 5)],
          'workflowConcerns',   v_workflow[1 + ((i + j * 2) % 5)],
          'safetyConcerns',     v_safetyc[1 + ((i + j) % 5)],
          'leadershipSupport',  v_support[1 + ((i * 3 + j) % 5)],
          'additionalComments', ''),
        ARRAY[v_themes[1 + ((i + j) % 10)], v_themes[1 + ((i * 2 + j) % 10)]],
        v_safety,
        now() - (v_days || ' days')::interval)
      ON CONFLICT (id) DO UPDATE
        SET round_date = EXCLUDED.round_date, answers = EXCLUDED.answers,
            themes = EXCLUDED.themes, safety_flag = EXCLUDED.safety_flag,
            individual = EXCLUDED.individual, notes = EXCLUDED.notes;

      DELETE FROM public.round_findings WHERE round_id = v_round;
      INSERT INTO public.round_findings (round_id, theme, severity, finding_text)
      VALUES (v_round, v_themes[1 + ((i + j) % 10)],
              CASE WHEN v_safety THEN 'high' ELSE 'moderate' END,
              v_barriers[1 + ((i + j) % 5)]);

      -- Roughly every third round produced a win worth repeating.
      IF (i + j) % 3 = 0 THEN
        DELETE FROM public.round_wins WHERE round_id = v_round;
        INSERT INTO public.round_wins (round_id, win_text, recognized_person, category)
        VALUES (v_round, v_wins[1 + ((i + j) % 5)],
                v_names_rounded[1 + ((i + j * 2) % 10)], v_wincat[1 + ((i + j) % 5)]);
      END IF;
    END LOOP;
  END LOOP;

  ----------------------------------------------------------------
  -- 5. Action items — aged so escalation thresholds actually trigger
  ----------------------------------------------------------------
  FOR i IN 1 .. array_length(v_clinics, 1) LOOP
    v_clinic := md5('rr:clinic:' || v_clinics[i][1])::uuid;
    v_mgr    := md5('rr:user:' || lower(v_clinics[i][8] || '.' || v_clinics[i][9]) || '@' || v_dom)::uuid;
    j        := v_clinic_dir[i];
    v_dir    := md5('rr:user:' || lower(v_dirs[j][1] || '.' || v_dirs[j][2]) || '@' || v_dom)::uuid;
    v_ed     := md5('rr:user:' || lower(v_dirs[j][5] || '.' || v_dirs[j][6]) || '@' || v_dom)::uuid;

    n := 4 + (i % 3);
    FOR k IN 1 .. n LOOP
      v_days   := 4 + ((i * 13 + k * 17) % 130);
      v_created := now() - (v_days || ' days')::interval;
      v_theme  := v_themes[1 + ((i + k) % 10)];
      v_safety := ((i * k) % 11 = 0);

      -- Escalation follows age, mirroring src/lib/domain/escalation.ts
      v_esc := CASE WHEN v_days > 100 THEN 'executive'
                    WHEN v_days > 45  THEN 'director'
                    ELSE 'manager' END;
      v_prio := CASE WHEN v_safety THEN 'critical'
                     WHEN v_days > 80 THEN 'high'
                     WHEN (i + k) % 4 = 0 THEN 'high'
                     WHEN (i + k) % 3 = 0 THEN 'low'
                     ELSE 'medium' END;
      v_status := CASE WHEN (i + k) % 5 = 0 THEN 'closed'
                       WHEN (i + k) % 5 = 1 THEN 'in_progress'
                       WHEN (i + k) % 5 = 2 THEN 'pending_validation'
                       WHEN (i + k) % 7 = 0 THEN 'reopened'
                       ELSE 'open' END;
      -- Some deliberately overdue so the Work tab has a real overdue count.
      v_due := (v_created + ((14 + ((i + k) % 30)) || ' days')::interval)::date;

      INSERT INTO public.tasks (id, clinic_id, source, source_id, name, description, theme,
                                owner_id, due_date, status, escalation_level, priority,
                                safety_related, closed_at, created_at)
      VALUES (
        md5('rr:task:' || v_clinics[i][1] || ':' || k)::uuid,
        v_clinic, 'round_finding',
        md5('rr:round:' || v_clinics[i][1] || ':' || (1 + (k % GREATEST(1, 2 + (i % 4)))))::uuid,
        v_tasks[1 + ((i * 3 + k) % 14)],
        v_barriers[1 + ((i + k) % 5)],
        v_theme,
        CASE v_esc WHEN 'executive' THEN v_ed WHEN 'director' THEN v_dir ELSE v_mgr END,
        v_due, v_status, v_esc, v_prio, v_safety,
        CASE WHEN v_status = 'closed' THEN v_created + interval '9 days' ELSE NULL END,
        v_created)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, description = EXCLUDED.description, theme = EXCLUDED.theme,
            owner_id = EXCLUDED.owner_id, due_date = EXCLUDED.due_date, status = EXCLUDED.status,
            escalation_level = EXCLUDED.escalation_level, priority = EXCLUDED.priority,
            safety_related = EXCLUDED.safety_related, closed_at = EXCLUDED.closed_at,
            created_at = EXCLUDED.created_at;
    END LOOP;
  END LOOP;

  ----------------------------------------------------------------
  -- 6. One complete Press Ganey report, on Riverbend Cardiology
  ----------------------------------------------------------------
  v_clinic := md5('rr:clinic:Riverbend Cardiology')::uuid;
  v_report := md5('rr:report:riverbend-cardiology')::uuid;
  v_mgr    := md5('rr:user:grant.oyelaran@' || v_dom)::uuid;

  INSERT INTO public.reports (id, user_id, clinic_id, site_name, facility_name, service_line,
                              time_frame, overall_top_box, overall_percentile, n, status, exec_summary)
  VALUES (v_report, v_mgr, v_clinic, 'Riverbend Cardiology', 'Riverbend Medical Campus', 'Cardiology',
          'Q2 2026', 78.4, 41, 612, 'ready',
          'Overall top box of 78.4% places Riverbend Cardiology at the 41st percentile. Access and ' ||
          'care coordination are the two drivers pulling the composite down; provider communication ' ||
          'scores remain strong and are not the problem. Two providers account for most of the gap.')
  ON CONFLICT (id) DO UPDATE
    SET overall_top_box = EXCLUDED.overall_top_box, overall_percentile = EXCLUDED.overall_percentile,
        status = EXCLUDED.status, exec_summary = EXCLUDED.exec_summary;

  DELETE FROM public.report_sections WHERE report_id = v_report;
  INSERT INTO public.report_sections (report_id, name, n, top_box, percentile) VALUES
    (v_report, 'Access',                 612, 68.2, 19),
    (v_report, 'Care Provider',          612, 88.1, 63),
    (v_report, 'Nurse/Assistant',        598, 84.7, 55),
    (v_report, 'Personal Issues',        604, 79.9, 44),
    (v_report, 'Overall Assessment',     612, 78.4, 41),
    (v_report, 'Care Coordination',      589, 70.3, 22);

  DELETE FROM public.report_providers WHERE report_id = v_report;
  INSERT INTO public.report_providers (report_id, name, n, top_box, percentile, tier) VALUES
    (v_report, 'Dr. Alicia Moreno', 141, 91.3, 79, 'top'),
    (v_report, 'Dr. Peter Hsu',     128, 86.0, 58, 'middle'),
    (v_report, 'Dr. Naomi Frost',   119, 77.4, 38, 'middle'),
    (v_report, 'Dr. Omar Rahimi',   112, 66.1, 14, 'bottom'),
    (v_report, 'Dr. Grace Lindqvist',112, 63.8, 11, 'bottom');

  DELETE FROM public.report_priority_index WHERE report_id = v_report;
  INSERT INTO public.report_priority_index (report_id, rank, question, percentile, correlation) VALUES
    (v_report, 1, 'Ease of scheduling your appointment',            15, 0.71),
    (v_report, 2, 'Wait time at clinic',                            18, 0.66),
    (v_report, 3, 'Staff worked together to care for you',          24, 0.61),
    (v_report, 4, 'Information about delays',                       21, 0.58),
    (v_report, 5, 'Follow-up on test results',                      29, 0.52);

  DELETE FROM public.opportunities WHERE report_id = v_report;
  INSERT INTO public.opportunities (report_id, rank, title, opp_type, reason, target_metric,
                                    current_value, target_value, goal, timeline_30, timeline_60, timeline_90, owner_role)
  VALUES
    (v_report, 1, 'Cut new-patient scheduling lead time', 'access',
     'Ease of scheduling is the top correlated item and sits at the 15th percentile.',
     'Access top box', 68.2, 78.0, 'Move Access to the 40th percentile within two quarters.',
     'Audit the template and retire unused block types.',
     'Protect same-day slots and add afternoon phone coverage.',
     'Re-measure third next available and hold weekly.', 'manager'),
    (v_report, 2, 'Close the loop on test results', 'coordination',
     'Follow-up on results correlates strongly and trails peers by 20 points.',
     'Care Coordination top box', 70.3, 80.0, 'Every result acknowledged within 72 hours.',
     'Map current results routing end to end.',
     'Move normal results to nurse-led closure.',
     'Audit a sample of 50 results for turnaround.', 'manager'),
    (v_report, 3, 'Coach the two lowest-scoring providers', 'provider',
     'Two providers account for most of the composite gap.',
     'Provider top box', 64.9, 78.0, 'Both providers above the 40th percentile.',
     'Shadow both providers for a half day each.',
     'Introduce a communication script and practise it.',
     'Re-pull provider-level scores and review.', 'director');

  DELETE FROM public.coaching_plans WHERE report_id = v_report;
  SELECT id INTO v_prov FROM public.report_providers
   WHERE report_id = v_report AND name = 'Dr. Omar Rahimi' LIMIT 1;
  INSERT INTO public.coaching_plans (report_id, provider_id, provider_name, gap_summary,
                                     shadow_recommendation, scripts, checkpoints)
  VALUES (v_report, v_prov, 'Dr. Omar Rahimi',
          'Sits 25 points below the top performer on explanation clarity while clinical quality metrics are strong.',
          'Shadow Dr. Moreno for one half-day clinic, focusing on how she opens and closes each visit.',
          '["Let me make sure I explained that clearly — what would you tell your family about the plan?", "Before we finish, what is the one thing you are still worried about?"]'::jsonb,
          '["Week 2: shadow session complete", "Week 6: peer observation and feedback", "Week 12: re-pull provider scores"]'::jsonb);

  -- Action items sourced from the PX report so the "From PX" filter is populated
  INSERT INTO public.tasks (id, clinic_id, source, report_id, name, description, theme, owner_id,
                            due_date, status, escalation_level, priority, safety_related, created_at)
  VALUES
    (md5('rr:task:px:1')::uuid, v_clinic, 'px_opportunity', v_report,
     'Cut new-patient scheduling lead time', 'Access sits at the 15th percentile and is the top correlated driver.',
     'Patient Access', v_mgr, (now() + interval '21 days')::date, 'in_progress', 'manager', 'high', false,
     now() - interval '18 days'),
    (md5('rr:task:px:2')::uuid, v_clinic, 'px_opportunity', v_report,
     'Close the loop on test results', 'Results follow-up trails peers by 20 points.',
     'Referral Management', v_mgr, (now() + interval '35 days')::date, 'open', 'manager', 'medium', false,
     now() - interval '18 days'),
    (md5('rr:task:px:3')::uuid, v_clinic, 'px_opportunity', v_report,
     'Coach the two lowest-scoring providers', 'Two providers account for most of the composite gap.',
     'Provider Retention', md5('rr:user:jordan.walsh@' || v_dom)::uuid,
     (now() + interval '60 days')::date, 'open', 'director', 'high', false, now() - interval '18 days')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, status = EXCLUDED.status, due_date = EXCLUDED.due_date;

  ----------------------------------------------------------------
  -- 7. Tidy up
  ----------------------------------------------------------------
  DELETE FROM public.pending_users
   WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@' || v_dom);

  RAISE NOTICE 'Demo data loaded. Sign in as % or use View as to switch roles.', v_admin_email;
END
$seed$;

DROP FUNCTION IF EXISTS public._rr_demo_user(uuid, text, text, text, text, text);
