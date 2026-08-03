-- ---------- Structured rounding columns ----------
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS individual text,
  ADD COLUMN IF NOT EXISTS individual_role text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS answers jsonb,
  ADD COLUMN IF NOT EXISTS themes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS safety_flag boolean NOT NULL DEFAULT false;

-- ---------- Task safety flag ----------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS safety_related boolean NOT NULL DEFAULT false;

-- ---------- Tighten profile read policy ----------
DROP POLICY IF EXISTS "Admins and supervisors read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;

CREATE POLICY "Users upsert own profile" ON public.profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Scope read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cao')
    OR EXISTS (
      SELECT 1 FROM public.clinic_assignments mine
      WHERE mine.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.clinic_assignments theirs
          WHERE theirs.user_id = profiles.user_id AND theirs.clinic_id = mine.clinic_id
        )
    )
  );