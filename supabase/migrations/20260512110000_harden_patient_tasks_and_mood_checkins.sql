-- ============================================================
-- Migration: harden_patient_tasks_and_mood_checkins
-- Purpose:
--   Reuse existing patient_tasks for therapeutic tasks with encrypted
--   sensitive fields, and add structured mood/symptom check-ins.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.patient_tasks
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_patient_tasks_responded_at
  ON public.patient_tasks(responded_at);

CREATE OR REPLACE FUNCTION public.encrypt_patient_tasks_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.description := public.encrypt_sensitive_text_if_needed(NEW.description);
    NEW.therapist_notes := public.encrypt_sensitive_text_if_needed(NEW.therapist_notes);
    NEW.patient_feedback := public.encrypt_sensitive_text_if_needed(NEW.patient_feedback);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.description := public.encrypt_sensitive_text_if_needed(NEW.description);
    END IF;

    IF NEW.therapist_notes IS DISTINCT FROM OLD.therapist_notes THEN
      NEW.therapist_notes := public.encrypt_sensitive_text_if_needed(NEW.therapist_notes);
    END IF;

    IF NEW.patient_feedback IS DISTINCT FROM OLD.patient_feedback THEN
      NEW.patient_feedback := public.encrypt_sensitive_text_if_needed(NEW.patient_feedback);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_tasks_clinical_fields ON public.patient_tasks;
CREATE TRIGGER encrypt_patient_tasks_clinical_fields
  BEFORE INSERT OR UPDATE OF description, therapist_notes, patient_feedback
  ON public.patient_tasks
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_tasks_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_emotion_diary_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    NEW.triggers := public.encrypt_sensitive_text_if_needed(NEW.triggers);
    NEW.coping_strategy := public.encrypt_sensitive_text_if_needed(NEW.coping_strategy);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    END IF;

    IF NEW.triggers IS DISTINCT FROM OLD.triggers THEN
      NEW.triggers := public.encrypt_sensitive_text_if_needed(NEW.triggers);
    END IF;

    IF NEW.coping_strategy IS DISTINCT FROM OLD.coping_strategy THEN
      NEW.coping_strategy := public.encrypt_sensitive_text_if_needed(NEW.coping_strategy);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_emotion_diary_clinical_fields ON public.emotion_diary;
CREATE TRIGGER encrypt_emotion_diary_clinical_fields
  BEFORE INSERT OR UPDATE OF notes, triggers, coping_strategy
  ON public.emotion_diary
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_emotion_diary_clinical_fields();

CREATE TABLE IF NOT EXISTS public.patient_mood_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
  anxiety_score INTEGER CHECK (anxiety_score BETWEEN 1 AND 5),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  energy_score INTEGER CHECK (energy_score BETWEEN 1 AND 5),
  notes_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_mood_checkins_patient_id
  ON public.patient_mood_checkins(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_mood_checkins_therapist_id
  ON public.patient_mood_checkins(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_mood_checkins_created_at
  ON public.patient_mood_checkins(created_at);

ALTER TABLE public.patient_mood_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_mood_checkins" ON public.patient_mood_checkins;
CREATE POLICY "Professionals can read relevant patient_mood_checkins"
  ON public.patient_mood_checkins FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_mood_checkins" ON public.patient_mood_checkins;
CREATE POLICY "Professionals can write relevant patient_mood_checkins"
  ON public.patient_mood_checkins FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_mood_checkins.patient_id
        AND p.user_id = patient_mood_checkins.therapist_id
    )
  );

CREATE OR REPLACE FUNCTION public.encrypt_patient_mood_checkins_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes_encrypted IS DISTINCT FROM OLD.notes_encrypted THEN
      NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_mood_checkins_clinical_fields ON public.patient_mood_checkins;
CREATE TRIGGER encrypt_patient_mood_checkins_clinical_fields
  BEFORE INSERT OR UPDATE OF notes_encrypted
  ON public.patient_mood_checkins
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_mood_checkins_clinical_fields();

CREATE OR REPLACE FUNCTION public.get_patient_tasks_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_tasks JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pt)
        || jsonb_build_object(
          'description', public.decrypt_sensitive_text(pt.description),
          'therapist_notes', public.decrypt_sensitive_text(pt.therapist_notes),
          'patient_feedback', public.decrypt_sensitive_text(pt.patient_feedback)
        )
      ORDER BY pt.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_tasks
  FROM public.patient_tasks pt
  WHERE pt.patient_id = p_patient_id;

  RETURN v_tasks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_emotion_diary_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_entries JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ed)
        || jsonb_build_object(
          'notes', public.decrypt_sensitive_text(ed.notes),
          'triggers', public.decrypt_sensitive_text(ed.triggers),
          'coping_strategy', public.decrypt_sensitive_text(ed.coping_strategy)
        )
      ORDER BY ed.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_entries
  FROM public.emotion_diary ed
  WHERE ed.patient_id = p_patient_id;

  RETURN v_entries;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_mood_checkins_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_checkins JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pm)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(pm.notes_encrypted))
      ORDER BY pm.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_checkins
  FROM public.patient_mood_checkins pm
  WHERE pm.patient_id = p_patient_id;

  RETURN v_checkins;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_mood_checkin_secure(
  p_patient_id UUID,
  p_mood_score INTEGER DEFAULT NULL,
  p_anxiety_score INTEGER DEFAULT NULL,
  p_sleep_quality INTEGER DEFAULT NULL,
  p_energy_score INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_checkin_id UUID;
  v_checkin JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_mood_score IS NOT NULL AND (p_mood_score < 1 OR p_mood_score > 5) THEN
    RAISE EXCEPTION 'invalid_mood_score' USING ERRCODE = '22023';
  END IF;
  IF p_anxiety_score IS NOT NULL AND (p_anxiety_score < 1 OR p_anxiety_score > 5) THEN
    RAISE EXCEPTION 'invalid_anxiety_score' USING ERRCODE = '22023';
  END IF;
  IF p_sleep_quality IS NOT NULL AND (p_sleep_quality < 1 OR p_sleep_quality > 5) THEN
    RAISE EXCEPTION 'invalid_sleep_quality' USING ERRCODE = '22023';
  END IF;
  IF p_energy_score IS NOT NULL AND (p_energy_score < 1 OR p_energy_score > 5) THEN
    RAISE EXCEPTION 'invalid_energy_score' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_mood_checkins (
    patient_id,
    therapist_id,
    mood_score,
    anxiety_score,
    sleep_quality,
    energy_score,
    notes_encrypted
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    p_mood_score,
    p_anxiety_score,
    p_sleep_quality,
    p_energy_score,
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_checkin_id;

  SELECT to_jsonb(pm)
    || jsonb_build_object('notes', public.decrypt_sensitive_text(pm.notes_encrypted))
  INTO v_checkin
  FROM public.patient_mood_checkins pm
  WHERE pm.id = v_checkin_id;

  RETURN v_checkin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_portal_tasks_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_tasks JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pt)
        || jsonb_build_object(
          'description', public.decrypt_sensitive_text(pt.description),
          'therapist_notes', NULL,
          'patient_feedback', public.decrypt_sensitive_text(pt.patient_feedback)
        )
      ORDER BY pt.due_date ASC NULLS LAST, pt.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_tasks
  FROM public.patient_tasks pt
  WHERE pt.patient_id = p_patient_id
    AND pt.status <> 'cancelled';

  RETURN v_tasks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_portal_mood_checkins_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_checkins JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pm)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(pm.notes_encrypted))
      ORDER BY pm.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_checkins
  FROM public.patient_mood_checkins pm
  WHERE pm.patient_id = p_patient_id
  LIMIT 10;

  RETURN v_checkins;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_portal_emotion_diary_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_entries JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ed)
        || jsonb_build_object(
          'notes', public.decrypt_sensitive_text(ed.notes),
          'triggers', public.decrypt_sensitive_text(ed.triggers),
          'coping_strategy', public.decrypt_sensitive_text(ed.coping_strategy)
        )
      ORDER BY ed.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_entries
  FROM public.emotion_diary ed
  WHERE ed.patient_id = p_patient_id
  LIMIT 5;

  RETURN v_entries;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_tasks_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_emotion_diary_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_mood_checkins_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_mood_checkin_secure(UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_portal_tasks_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_portal_emotion_diary_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_portal_mood_checkins_decrypted(UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_patient_tasks_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_emotion_diary_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_mood_checkins_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_patient_tasks_decrypted(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_emotion_diary_decrypted(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_mood_checkins_decrypted(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_patient_mood_checkin_secure(UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_portal_tasks_decrypted(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_portal_emotion_diary_decrypted(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_portal_mood_checkins_decrypted(UUID) TO service_role;
