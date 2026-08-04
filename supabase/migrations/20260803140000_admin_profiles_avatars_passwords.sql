-- ============================================================
-- Admin portal: display names, avatars, passwords.
--
-- All of it works WITHOUT a service-role key, because the web tier doesn't
-- have one. Each operation is a SECURITY DEFINER function that does its own
-- has_role(auth.uid(), 'admin') check, so authorization lives in the database.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- 1. Avatars ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152,
        ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif'];

-- Files are stored as avatars/<user_id>/<filename>, so the first path segment
-- is the owner. That's what these policies key off.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users manage their own avatar" ON storage.objects;
CREATE POLICY "Users manage their own avatar" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ---------- 2. Admin edits someone's profile ----------
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  _user_id uuid,
  _full_name text DEFAULT NULL,
  _title text DEFAULT NULL,
  _avatar_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR auth.uid() = _user_id) THEN
    RAISE EXCEPTION 'Only administrators can edit another person''s profile';
  END IF;

  INSERT INTO public.profiles (user_id, full_name, title, avatar_url)
  VALUES (_user_id, COALESCE(_full_name, ''), COALESCE(_title, ''), _avatar_url)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name  = COALESCE(_full_name,  public.profiles.full_name),
        title      = COALESCE(_title,      public.profiles.title),
        -- '' clears the avatar; NULL leaves it alone.
        avatar_url = CASE
                       WHEN _avatar_url IS NULL THEN public.profiles.avatar_url
                       WHEN _avatar_url = ''    THEN NULL
                       ELSE _avatar_url
                     END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text) TO authenticated;

-- ---------- 3. Admin sets a temporary password ----------
-- Writes a bcrypt hash directly and flags the account so the app forces a
-- change at next sign-in (the _authenticated gate already honours this).
CREATE OR REPLACE FUNCTION public.admin_set_password(_user_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can set passwords';
  END IF;
  IF length(_password) < 10 THEN
    RAISE EXCEPTION 'Temporary password must be at least 10 characters';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf')),
         updated_at = now(),
         raw_user_meta_data =
           COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"must_reset_password": true}'::jsonb
   WHERE id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such user';
  END IF;

  -- Force existing sessions to end, so a handover can't leave the old holder
  -- signed in on another device.
  DELETE FROM auth.sessions WHERE user_id = _user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = _user_id::text;

  INSERT INTO public.audit_log (actor_id, action, table_name, record_id, detail)
  VALUES (auth.uid(), 'update', 'auth.users', _user_id,
          jsonb_build_object('event', 'admin_set_password'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_password(uuid, text) TO authenticated;

-- ---------- 4. Surface avatar_url through the directory ----------
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid, email text, full_name text, title text, avatar_url text,
  roles public.app_role[], is_pending boolean,
  created_at timestamptz, last_sign_in_at timestamptz, clinic_ids uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    u.id, u.email::text, COALESCE(p.full_name, ''), COALESCE(p.title, ''), p.avatar_url,
    COALESCE((SELECT array_agg(ur.role ORDER BY ur.role)
                FROM public.user_roles ur WHERE ur.user_id = u.id),
             ARRAY[]::public.app_role[]),
    EXISTS (SELECT 1 FROM public.pending_users pu WHERE pu.user_id = u.id),
    u.created_at, u.last_sign_in_at,
    COALESCE((SELECT array_agg(DISTINCT ca.clinic_id)
                FROM public.clinic_assignments ca WHERE ca.user_id = u.id),
             ARRAY[]::uuid[])
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY u.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- ---------- 5. Include the avatar in the app's scope read ----------
-- get_me already returns the profile; nothing to change there, but the store
-- maps profiles directly, so the column is picked up automatically.
