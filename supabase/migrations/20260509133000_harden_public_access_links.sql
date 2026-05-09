-- ============================================================
-- Nythos - Harden public access links
-- Adds expiry, revocation, rotation, and last-used tracking for:
--   - /p/[token] patient access links
--   - public anamnesis links
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Patient access links
-- ============================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS access_token_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_token_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_token_last_used_at TIMESTAMPTZ;

UPDATE public.patients
SET access_token_issued_at = COALESCE(access_token_issued_at, created_at, NOW())
WHERE access_token_issued_at IS NULL;

ALTER TABLE public.patients
  ALTER COLUMN access_token_issued_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_patients_access_token_active
  ON public.patients(access_token)
  WHERE access_token_revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_access_token_expires_at
  ON public.patients(access_token_expires_at)
  WHERE access_token_expires_at IS NOT NULL
    AND access_token_revoked_at IS NULL;

COMMENT ON COLUMN public.patients.access_token IS
  'Opaque token used in /p/[access_token]. Can be regenerated or revoked without changing patient auth_user_id.';
COMMENT ON COLUMN public.patients.access_token_issued_at IS
  'Timestamp when the current patient access token became valid. Used to invalidate older cookies after regeneration.';
COMMENT ON COLUMN public.patients.access_token_expires_at IS
  'Optional expiration timestamp for the current patient access token. NULL keeps the link active until revoked/regenerated.';
COMMENT ON COLUMN public.patients.access_token_revoked_at IS
  'When set, the current patient access token and any older cookies must be rejected.';
COMMENT ON COLUMN public.patients.access_token_last_used_at IS
  'Last successful token-based login for /p/[token].';

CREATE OR REPLACE FUNCTION public.revoke_patient_access_link_secure(p_patient_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
  SET
    access_token_revoked_at = NOW(),
    updated_at = NOW()
  WHERE id = p_patient_id;

  RETURN public.get_patient_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.regenerate_patient_access_link_secure(p_patient_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
  SET
    access_token = gen_random_uuid(),
    access_token_issued_at = NOW(),
    access_token_expires_at = NULL,
    access_token_revoked_at = NULL,
    access_token_last_used_at = NULL,
    updated_at = NOW()
  WHERE id = p_patient_id;

  RETURN public.get_patient_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================
-- Public anamnesis links
-- ============================================================

ALTER TABLE public.anamnesis_responses
  ADD COLUMN IF NOT EXISTS public_token UUID,
  ADD COLUMN IF NOT EXISTS public_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_last_used_at TIMESTAMPTZ;

UPDATE public.anamnesis_responses
SET public_token = gen_random_uuid()
WHERE public_token IS NULL;

ALTER TABLE public.anamnesis_responses
  ALTER COLUMN public_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_token SET NOT NULL;

-- Backward compatibility for legacy pending links:
-- keep existing links alive for at least 7 days after this migration,
-- while converging new/public pending links to a 30-day validity window.
UPDATE public.anamnesis_responses
SET public_expires_at = GREATEST(
    COALESCE(created_at, NOW()) + INTERVAL '30 days',
    NOW() + INTERVAL '7 days'
  )
WHERE status = 'pending'
  AND public_expires_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnesis_responses_public_token
  ON public.anamnesis_responses(public_token);

CREATE INDEX IF NOT EXISTS idx_anamnesis_responses_public_token_active
  ON public.anamnesis_responses(public_token)
  WHERE public_revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_anamnesis_responses_public_expires_at
  ON public.anamnesis_responses(public_expires_at)
  WHERE status = 'pending'
    AND public_revoked_at IS NULL
    AND public_expires_at IS NOT NULL;

COMMENT ON COLUMN public.anamnesis_responses.public_token IS
  'Opaque token used in public anamnesis links. Never expose predictable IDs in public URLs.';
COMMENT ON COLUMN public.anamnesis_responses.public_expires_at IS
  'Expiration timestamp for pending public anamnesis links. Completed responses become read-only instead of re-usable.';
COMMENT ON COLUMN public.anamnesis_responses.public_revoked_at IS
  'When set, the public anamnesis link must be rejected.';
COMMENT ON COLUMN public.anamnesis_responses.public_last_used_at IS
  'Last successful public link access or submission attempt that reached a valid record.';

CREATE OR REPLACE FUNCTION public.get_public_anamnesis_response(p_public_token UUID)
RETURNS JSONB AS $$
DECLARE
  v_response public.anamnesis_responses%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT *
  INTO v_response
  FROM public.anamnesis_responses
  WHERE public_token = p_public_token
  LIMIT 1;

  IF v_response.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_response.public_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'revoked');
  END IF;

  IF v_response.status = 'pending'
     AND v_response.public_expires_at IS NOT NULL
     AND v_response.public_expires_at <= NOW() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  UPDATE public.anamnesis_responses
  SET public_last_used_at = NOW()
  WHERE id = v_response.id;

  SELECT jsonb_build_object(
    'response_id', ar.id,
    'status', ar.status,
    'expires_at', ar.public_expires_at,
    'revoked_at', ar.public_revoked_at,
    'template',
      CASE
        WHEN ar.status = 'pending' THEN jsonb_build_object(
          'id', at.id,
          'title', at.title,
          'description', at.description,
          'fields', at.fields
        )
        ELSE jsonb_build_object(
          'id', at.id,
          'title', at.title,
          'description', at.description
        )
      END,
    'profile', jsonb_build_object(
      'full_name', pr.full_name,
      'clinic_name', pr.clinic_name,
      'clinic_logo_url', pr.clinic_logo_url
    )
  )
  INTO v_result
  FROM public.anamnesis_responses ar
  JOIN public.anamnesis_templates at ON at.id = ar.template_id
  LEFT JOIN public.profiles pr ON pr.id = at.user_id
  WHERE ar.id = v_response.id
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'not_found'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.submit_public_anamnesis_response(
  p_public_token UUID,
  p_responses JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_response public.anamnesis_responses%ROWTYPE;
  v_response_id UUID;
BEGIN
  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  SELECT *
  INTO v_response
  FROM public.anamnesis_responses
  WHERE public_token = p_public_token
  LIMIT 1;

  IF v_response.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_response.public_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'revoked');
  END IF;

  IF v_response.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_completed');
  END IF;

  IF v_response.public_expires_at IS NOT NULL AND v_response.public_expires_at <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  UPDATE public.anamnesis_responses
  SET
    responses = p_responses,
    status = 'completed',
    completed_at = NOW(),
    public_last_used_at = NOW()
  WHERE id = v_response.id
    AND status = 'pending'
  RETURNING id INTO v_response_id;

  IF v_response_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found_or_already_completed');
  END IF;

  RETURN jsonb_build_object('success', true, 'response_id', v_response_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.revoke_public_anamnesis_link_secure(p_response_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
  v_result JSONB;
BEGIN
  SELECT patient_id INTO v_patient_id
  FROM public.anamnesis_responses
  WHERE id = p_response_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_read_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.anamnesis_responses
  SET public_revoked_at = NOW()
  WHERE id = p_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object('anamnesis_templates', to_jsonb(at))
  INTO v_result
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.id = p_response_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.regenerate_public_anamnesis_link_secure(p_response_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
  v_status TEXT;
  v_result JSONB;
BEGIN
  SELECT patient_id, status
  INTO v_patient_id, v_status
  FROM public.anamnesis_responses
  WHERE id = p_response_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_read_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'response_not_pending' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.anamnesis_responses
  SET
    public_token = gen_random_uuid(),
    public_expires_at = NOW() + INTERVAL '30 days',
    public_revoked_at = NULL,
    public_last_used_at = NULL
  WHERE id = p_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object('anamnesis_templates', to_jsonb(at))
  INTO v_result
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.id = p_response_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_anamnesis_request_secure(
  p_patient_id UUID,
  p_template_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_response_id UUID;
  v_response JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = p_patient_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.anamnesis_templates at
    WHERE at.id = p_template_id
      AND at.user_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'template_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.anamnesis_responses (
    template_id,
    patient_id,
    status,
    responses,
    public_expires_at
  )
  VALUES (
    p_template_id,
    p_patient_id,
    'pending',
    '{}'::jsonb,
    NOW() + INTERVAL '30 days'
  )
  RETURNING id INTO v_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object('anamnesis_templates', to_jsonb(at))
  INTO v_response
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.id = v_response_id;

  RETURN v_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_public_anamnesis_response(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_anamnesis_response(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_patient_access_link_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerate_patient_access_link_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_public_anamnesis_link_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerate_public_anamnesis_link_secure(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_anamnesis_response(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_anamnesis_response(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_patient_access_link_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_patient_access_link_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_public_anamnesis_link_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_public_anamnesis_link_secure(UUID) TO authenticated;
