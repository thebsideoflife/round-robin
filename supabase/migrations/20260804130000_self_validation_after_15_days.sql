-- ============================================================
-- Self-confirmation after a waiting period.
--
-- Blocking self-confirmation outright would strand items at single-manager
-- clinics where nobody else realistically inspects the work. Fifteen days is
-- long enough that a genuine second pair of eyes has had a chance, and short
-- enough that the list doesn't silt up.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_task(
  _task_id uuid,
  _confirmed boolean,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_closed_by uuid;
  v_closed_at timestamptz;
  v_wait_days constant integer := 15;
  v_days_waiting integer;
BEGIN
  SELECT closed_by, closed_at INTO v_closed_by, v_closed_at
    FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such action item'; END IF;

  IF _confirmed THEN
    IF v_closed_by IS NOT NULL AND v_closed_by = auth.uid() THEN
      v_days_waiting := GREATEST(0, EXTRACT(DAY FROM (now() - COALESCE(v_closed_at, now())))::int);
      IF v_days_waiting < v_wait_days THEN
        RAISE EXCEPTION
          'You closed this. Someone else can confirm it now, or you can confirm it yourself in % more day(s).',
          v_wait_days - v_days_waiting;
      END IF;
    END IF;

    UPDATE public.tasks
       SET status = 'closed', validated_by = auth.uid(), validated_at = now()
     WHERE id = _task_id;

    INSERT INTO public.task_events (task_id, actor_id, event_type, from_status, to_status, note)
    VALUES (
      _task_id, auth.uid(), 'validated', 'pending_validation', 'closed',
      CASE
        WHEN v_closed_by = auth.uid()
          THEN COALESCE(_note || ' ', '') || '(self-confirmed after ' || v_days_waiting || ' days)'
        ELSE _note
      END
    );
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
