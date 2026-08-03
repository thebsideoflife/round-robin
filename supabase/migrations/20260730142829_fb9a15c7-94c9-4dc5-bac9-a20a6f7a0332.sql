-- ---------- Profiles ----------
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(user_id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_profile ON auth.users;
CREATE TRIGGER on_auth_user_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();
REVOKE EXECUTE ON FUNCTION public.handle_new_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_profile() TO service_role;

CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins and supervisors read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.user_id
  ));

-- ---------- Clinic metadata columns ----------
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS provider_count integer NOT NULL DEFAULT 0;

-- RPC: current user's full name + role list + profile, in one call for the store
CREATE OR REPLACE FUNCTION public.get_me()
RETURNS TABLE (user_id uuid, email text, full_name text, title text, roles public.app_role[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email, p.full_name, p.title,
    COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::public.app_role[])
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE u.id = auth.uid()
  GROUP BY u.id, u.email, p.full_name, p.title;
$$;
REVOKE EXECUTE ON FUNCTION public.get_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_me() TO authenticated;