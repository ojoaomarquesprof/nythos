-- ============================================================
-- Migration: create_patient_treatment_plans
-- Purpose:
--   Store therapeutic plans and goals as encrypted clinical data,
--   exposed through narrow RPCs after professional authorization.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.patient_treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  main_goal_encrypted TEXT NOT NULL,
  current_focus_encrypted TEXT NOT NULL,
  strategies_encrypted TEXT,
  review_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_treatment_plans_status_check
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT patient_treatment_plans_main_goal_not_blank
    CHECK (btrim(main_goal_encrypted) <> ''),
  CONSTRAINT patient_treatment_plans_current_focus_not_blank
    CHECK (btrim(current_focus_encrypted) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_treatment_plans_patient_id
  ON public.patient_treatment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_plans_therapist_id
  ON public.patient_treatment_plans(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_plans_status
  ON public.patient_treatment_plans(status);

CREATE TABLE IF NOT EXISTS public.patient_treatment_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id UUID NOT NULL REFERENCES public.patient_treatment_plans(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_encrypted TEXT NOT NULL,
  description_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  target_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_treatment_goals_status_check
    CHECK (status IN ('active', 'in_progress', 'completed', 'paused')),
  CONSTRAINT patient_treatment_goals_title_not_blank
    CHECK (btrim(title_encrypted) <> '')
);

CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_plan_id
  ON public.patient_treatment_goals(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_patient_id
  ON public.patient_treatment_goals(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_therapist_id
  ON public.patient_treatment_goals(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_status
  ON public.patient_treatment_goals(status);

DROP TRIGGER IF EXISTS update_patient_treatment_plans_updated_at ON public.patient_treatment_plans;
CREATE TRIGGER update_patient_treatment_plans_updated_at
  BEFORE UPDATE ON public.patient_treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_patient_treatment_goals_updated_at ON public.patient_treatment_goals;
CREATE TRIGGER update_patient_treatment_goals_updated_at
  BEFORE UPDATE ON public.patient_treatment_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_treatment_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_treatment_plans" ON public.patient_treatment_plans;
CREATE POLICY "Professionals can read relevant patient_treatment_plans"
  ON public.patient_treatment_plans FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_treatment_plans" ON public.patient_treatment_plans;
CREATE POLICY "Professionals can write relevant patient_treatment_plans"
  ON public.patient_treatment_plans FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_treatment_plans.patient_id
        AND p.user_id = patient_treatment_plans.therapist_id
    )
  );

DROP POLICY IF EXISTS "Professionals can read relevant patient_treatment_goals" ON public.patient_treatment_goals;
CREATE POLICY "Professionals can read relevant patient_treatment_goals"
  ON public.patient_treatment_goals FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_treatment_goals" ON public.patient_treatment_goals;
CREATE POLICY "Professionals can write relevant patient_treatment_goals"
  ON public.patient_treatment_goals FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patient_treatment_plans tp
      WHERE tp.id = patient_treatment_goals.treatment_plan_id
        AND tp.patient_id = patient_treatment_goals.patient_id
        AND tp.therapist_id = patient_treatment_goals.therapist_id
    )
  );

CREATE OR REPLACE FUNCTION public.encrypt_patient_treatment_plans_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.main_goal_encrypted := public.encrypt_sensitive_text_if_needed(NEW.main_goal_encrypted);
    NEW.current_focus_encrypted := public.encrypt_sensitive_text_if_needed(NEW.current_focus_encrypted);
    NEW.strategies_encrypted := public.encrypt_sensitive_text_if_needed(NEW.strategies_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.main_goal_encrypted IS DISTINCT FROM OLD.main_goal_encrypted THEN
      NEW.main_goal_encrypted := public.encrypt_sensitive_text_if_needed(NEW.main_goal_encrypted);
    END IF;

    IF NEW.current_focus_encrypted IS DISTINCT FROM OLD.current_focus_encrypted THEN
      NEW.current_focus_encrypted := public.encrypt_sensitive_text_if_needed(NEW.current_focus_encrypted);
    END IF;

    IF NEW.strategies_encrypted IS DISTINCT FROM OLD.strategies_encrypted THEN
      NEW.strategies_encrypted := public.encrypt_sensitive_text_if_needed(NEW.strategies_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_treatment_plans_clinical_fields ON public.patient_treatment_plans;
CREATE TRIGGER encrypt_patient_treatment_plans_clinical_fields
  BEFORE INSERT OR UPDATE OF main_goal_encrypted, current_focus_encrypted, strategies_encrypted
  ON public.patient_treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_treatment_plans_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_treatment_goals_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.title_encrypted := public.encrypt_sensitive_text_if_needed(NEW.title_encrypted);
    NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.title_encrypted IS DISTINCT FROM OLD.title_encrypted THEN
      NEW.title_encrypted := public.encrypt_sensitive_text_if_needed(NEW.title_encrypted);
    END IF;

    IF NEW.description_encrypted IS DISTINCT FROM OLD.description_encrypted THEN
      NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_treatment_goals_clinical_fields ON public.patient_treatment_goals;
CREATE TRIGGER encrypt_patient_treatment_goals_clinical_fields
  BEFORE INSERT OR UPDATE OF title_encrypted, description_encrypted
  ON public.patient_treatment_goals
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_treatment_goals_clinical_fields();

CREATE OR REPLACE FUNCTION public.get_patient_treatment_plan_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_plan JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(tp)
    || jsonb_build_object(
      'main_goal', public.decrypt_sensitive_text(tp.main_goal_encrypted),
      'current_focus', public.decrypt_sensitive_text(tp.current_focus_encrypted),
      'strategies', public.decrypt_sensitive_text(tp.strategies_encrypted),
      'goals', COALESCE(
        (
          SELECT jsonb_agg(
            to_jsonb(tg)
              || jsonb_build_object(
                'title', public.decrypt_sensitive_text(tg.title_encrypted),
                'description', public.decrypt_sensitive_text(tg.description_encrypted)
              )
            ORDER BY
              CASE tg.status
                WHEN 'completed' THEN 2
                WHEN 'paused' THEN 1
                ELSE 0
              END,
              tg.created_at ASC
          )
          FROM public.patient_treatment_goals tg
          WHERE tg.treatment_plan_id = tp.id
        ),
        '[]'::jsonb
      )
    )
  INTO v_plan
  FROM public.patient_treatment_plans tp
  WHERE tp.patient_id = p_patient_id
  LIMIT 1;

  RETURN v_plan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.upsert_patient_treatment_plan_secure(
  p_patient_id UUID,
  p_main_goal TEXT,
  p_current_focus TEXT,
  p_strategies TEXT DEFAULT NULL,
  p_review_date DATE DEFAULT NULL,
  p_status TEXT DEFAULT 'active'
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_main_goal IS NULL OR btrim(p_main_goal) = '' THEN
    RAISE EXCEPTION 'invalid_main_goal' USING ERRCODE = '22023';
  END IF;

  IF p_current_focus IS NULL OR btrim(p_current_focus) = '' THEN
    RAISE EXCEPTION 'invalid_current_focus' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'active') NOT IN ('active', 'paused', 'completed', 'archived') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_treatment_plans (
    patient_id,
    therapist_id,
    main_goal_encrypted,
    current_focus_encrypted,
    strategies_encrypted,
    review_date,
    status
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    btrim(p_main_goal),
    btrim(p_current_focus),
    NULLIF(btrim(COALESCE(p_strategies, '')), ''),
    p_review_date,
    COALESCE(p_status, 'active')
  )
  ON CONFLICT (patient_id) DO UPDATE
  SET
    therapist_id = EXCLUDED.therapist_id,
    main_goal_encrypted = EXCLUDED.main_goal_encrypted,
    current_focus_encrypted = EXCLUDED.current_focus_encrypted,
    strategies_encrypted = EXCLUDED.strategies_encrypted,
    review_date = EXCLUDED.review_date,
    status = EXCLUDED.status;

  RETURN public.get_patient_treatment_plan_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_treatment_goal_secure(
  p_patient_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_target_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_plan_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_goal_title' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'active') NOT IN ('active', 'in_progress', 'completed', 'paused') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  SELECT tp.id INTO v_plan_id
  FROM public.patient_treatment_plans tp
  WHERE tp.patient_id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'treatment_plan_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_treatment_goals (
    treatment_plan_id,
    patient_id,
    therapist_id,
    title_encrypted,
    description_encrypted,
    status,
    target_date,
    completed_at
  )
  VALUES (
    v_plan_id,
    p_patient_id,
    v_owner_id,
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    COALESCE(p_status, 'active'),
    p_target_date,
    CASE WHEN COALESCE(p_status, 'active') = 'completed' THEN NOW() ELSE NULL END
  );

  RETURN public.get_patient_treatment_plan_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.update_patient_treatment_goal_secure(
  p_goal_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_target_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT tg.patient_id INTO v_patient_id
  FROM public.patient_treatment_goals tg
  WHERE tg.id = p_goal_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'goal_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_goal_title' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'active') NOT IN ('active', 'in_progress', 'completed', 'paused') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_treatment_goals
  SET
    title_encrypted = btrim(p_title),
    description_encrypted = NULLIF(btrim(COALESCE(p_description, '')), ''),
    status = COALESCE(p_status, 'active'),
    target_date = p_target_date,
    completed_at = CASE
      WHEN COALESCE(p_status, 'active') = 'completed'
        THEN COALESCE(completed_at, NOW())
      ELSE NULL
    END
  WHERE id = p_goal_id;

  RETURN public.get_patient_treatment_plan_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_treatment_plan_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_patient_treatment_plan_secure(UUID, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_patient_treatment_plans_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_treatment_goals_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_patient_treatment_plan_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_patient_treatment_plan_secure(UUID, TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) TO authenticated;
