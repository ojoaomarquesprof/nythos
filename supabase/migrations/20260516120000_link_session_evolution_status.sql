-- ============================================================
-- Migration: link_session_evolution_status
-- Purpose:
--   Keep session evolutions linked to their session, expose only
--   an evolution-status flag to schedule UI, and prevent evolution
--   writes from completing/billing sessions implicitly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_schedule_sessions_with_evolution_status(
  p_therapist_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_employer_id UUID;
  v_sessions JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_therapist_id IS NULL
    OR p_starts_at IS NULL
    OR p_ends_at IS NULL
    OR p_ends_at <= p_starts_at
  THEN
    RAISE EXCEPTION 'invalid_schedule_range' USING ERRCODE = '22023';
  END IF;

  SELECT employer_id
  INTO v_actor_employer_id
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_therapist_id <> v_actor_id
    AND COALESCE(v_actor_employer_id, '00000000-0000-0000-0000-000000000000'::UUID) <> p_therapist_id
  THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      (to_jsonb(s) - 'session_notes_encrypted')
        || jsonb_build_object(
          'session_notes_encrypted', NULL,
          'has_session_evolution', NULLIF(s.session_notes_encrypted, '') IS NOT NULL,
          'patient',
            CASE
              WHEN p.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'email', p.email,
                'phone', p.phone,
                'session_price', p.session_price,
                'status', p.status
              )
            END
        )
      ORDER BY s.scheduled_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM public.sessions s
  LEFT JOIN public.patients p
    ON p.id = s.patient_id
   AND p.user_id = s.user_id
  WHERE s.user_id = p_therapist_id
    AND s.status <> 'cancelled'
    AND s.scheduled_at >= p_starts_at
    AND s.scheduled_at < p_ends_at;

  RETURN v_sessions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_sessions_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sessions JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(s)
        || jsonb_build_object(
          'session_notes_encrypted',
          public.decrypt_sensitive_text(s.session_notes_encrypted),
          'has_session_evolution',
          NULLIF(s.session_notes_encrypted, '') IS NOT NULL
        )
      ORDER BY s.scheduled_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM public.sessions s
  WHERE s.patient_id = p_patient_id;

  RETURN v_sessions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.update_session_evolution_secure(
  p_session_id UUID,
  p_notes TEXT,
  p_mood_happy_sad INTEGER,
  p_mood_anxious_calm INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
  v_session_status TEXT;
  v_session JSONB;
BEGIN
  SELECT s.patient_id, s.status
  INTO v_patient_id, v_session_status
  FROM public.sessions s
  INNER JOIN public.patients p
    ON p.id = s.patient_id
   AND p.user_id = s.user_id
  WHERE s.id = p_session_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_session_status <> 'completed' THEN
    RAISE EXCEPTION 'session_not_completed' USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_notes IS NULL OR btrim(p_notes) = '' THEN
    RAISE EXCEPTION 'empty_note' USING ERRCODE = '22023';
  END IF;

  IF p_mood_happy_sad IS NULL
    OR p_mood_happy_sad < 1
    OR p_mood_happy_sad > 10
    OR p_mood_anxious_calm IS NULL
    OR p_mood_anxious_calm < 1
    OR p_mood_anxious_calm > 10
  THEN
    RAISE EXCEPTION 'invalid_mood_score' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sessions
  SET
    session_notes_encrypted = jsonb_build_object(
      'note_type', 'session_evolution',
      'session_id', p_session_id,
      'notes', btrim(p_notes),
      'mood_happy_sad', p_mood_happy_sad,
      'mood_anxious_calm', p_mood_anxious_calm,
      'updated_at', NOW()
    )::TEXT
  WHERE id = p_session_id;

  SELECT to_jsonb(s)
    || jsonb_build_object(
      'session_notes_encrypted',
      public.decrypt_sensitive_text(s.session_notes_encrypted),
      'has_session_evolution',
      NULLIF(s.session_notes_encrypted, '') IS NOT NULL
    )
  INTO v_session
  FROM public.sessions s
  WHERE s.id = p_session_id;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_schedule_sessions_with_evolution_status(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_sessions_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_session_evolution_secure(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_schedule_sessions_with_evolution_status(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_sessions_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_evolution_secure(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
