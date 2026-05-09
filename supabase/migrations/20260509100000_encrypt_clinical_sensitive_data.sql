-- ============================================================
-- Migration: encrypt_clinical_sensitive_data
-- Purpose:
--   Enforce Vault-backed encryption for clinical text before it is
--   persisted, and expose narrow RPCs that decrypt only after an
--   authenticated professional authorization check.
--
-- Vault prerequisite:
--   Run supabase/seed_vault.sql before using these clinical writes in
--   dev/staging/production. Public anamnesis submission intentionally
--   fails closed if the Vault key is missing.
--
-- Legacy data note:
--   Existing plaintext is not rewritten automatically here. Re-encrypting
--   old clinical data safely requires confirming the Vault key first and
--   running a controlled backfill. See scripts/verify-clinical-encryption.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_text(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_secret_key TEXT;
  v_secret_key_bytes BYTEA;
BEGIN
  IF plain_text IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret_key
    FROM vault.decrypted_secrets
    WHERE name = 'nythos_encryption_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SECURITY_FAULT: cannot encrypt clinical data because Vault is unavailable'
      USING ERRCODE = 'P0001';
  END;

  IF v_secret_key IS NULL OR v_secret_key = '' THEN
    RAISE EXCEPTION 'SECURITY_FAULT: cannot encrypt clinical data because nythos_encryption_key is not configured'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_secret_key_bytes := decode(v_secret_key, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SECURITY_FAULT: cannot encrypt clinical data because nythos_encryption_key is not valid base64'
      USING ERRCODE = 'P0001';
  END;

  IF octet_length(v_secret_key_bytes) <> 32 THEN
    RAISE EXCEPTION 'SECURITY_FAULT: cannot encrypt clinical data because nythos_encryption_key must decode to 32 bytes'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    RETURN 'ENC::' || encode(
      extensions.encrypt(
        convert_to(plain_text, 'UTF8'),
        v_secret_key_bytes,
        'aes'
      ),
      'base64'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SECURITY_FAULT: cannot encrypt clinical data; check the Vault key'
      USING ERRCODE = 'P0001';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_text(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_secret_key TEXT;
  v_secret_key_bytes BYTEA;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Block non-clinical team members before plaintext legacy fallback.
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'secretary' THEN
    RETURN '[CONTEUDO PROTEGIDO - ACESSO RESTRITO]';
  END IF;

  IF starts_with(encrypted_text, 'PLAIN::') THEN
    RETURN substring(encrypted_text FROM 8);
  END IF;

  IF NOT starts_with(encrypted_text, 'ENC::') THEN
    RETURN encrypted_text;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret_key
    FROM vault.decrypted_secrets
    WHERE name = 'nythos_encryption_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN '[ERRO_VAULT: chave de criptografia indisponivel]';
  END;

  IF v_secret_key IS NULL OR v_secret_key = '' THEN
    RETURN '[ERRO_VAULT: chave de criptografia nao configurada]';
  END IF;

  BEGIN
    v_secret_key_bytes := decode(v_secret_key, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RETURN '[ERRO_VAULT: chave de criptografia nao e base64 valida]';
  END;

  IF octet_length(v_secret_key_bytes) <> 32 THEN
    RETURN '[ERRO_VAULT: chave de criptografia deve decodificar para 32 bytes]';
  END IF;

  BEGIN
    RETURN convert_from(
      extensions.decrypt(
        decode(substring(encrypted_text FROM 6), 'base64'),
        v_secret_key_bytes,
        'aes'
      ),
      'UTF8'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN '[ERRO_VAULT: falha ao descriptografar - verifique a chave]';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Legacy compatibility wrappers for older databases that had
-- encrypt/decrypt helpers receiving a frontend-provided secret_key.
-- The secret_key argument is intentionally ignored: clinical crypto now
-- always uses nythos_encryption_key from Supabase Vault.
DROP FUNCTION IF EXISTS public.encrypt_sensitive_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.decrypt_sensitive_text(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_text(plain_text TEXT, secret_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.encrypt_sensitive_text(plain_text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_text(encrypted_text TEXT, secret_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.decrypt_sensitive_text(encrypted_text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Idempotent encryption helpers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_db_encrypted_text(value TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN value IS NOT NULL
    AND value ~ '^ENC::[A-Za-z0-9+/]+={0,2}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_text_if_needed(value TEXT)
RETURNS TEXT AS $$
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.is_db_encrypted_text(value) THEN
    RETURN value;
  END IF;

  RETURN public.encrypt_sensitive_text(value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_jsonb_if_needed(value JSONB)
RETURNS JSONB AS $$
DECLARE
  v_text TEXT;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  -- Empty containers do not carry clinical content and stay queryable.
  IF value = '{}'::jsonb OR value = '[]'::jsonb THEN
    RETURN value;
  END IF;

  IF jsonb_typeof(value) = 'string' THEN
    v_text := value #>> '{}';
    IF public.is_db_encrypted_text(v_text) THEN
      RETURN value;
    END IF;
  END IF;

  RETURN to_jsonb(public.encrypt_sensitive_text(value::TEXT));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_jsonb_if_needed(value JSONB)
RETURNS JSONB AS $$
DECLARE
  v_text TEXT;
  v_plain TEXT;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'secretary' THEN
    RETURN to_jsonb('[CONTEUDO PROTEGIDO - ACESSO RESTRITO]'::TEXT);
  END IF;

  IF jsonb_typeof(value) <> 'string' THEN
    RETURN value;
  END IF;

  v_text := value #>> '{}';

  IF NOT public.is_db_encrypted_text(v_text) AND NOT starts_with(v_text, 'PLAIN::') THEN
    RETURN value;
  END IF;

  v_plain := public.decrypt_sensitive_text(v_text);

  BEGIN
    RETURN v_plain::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN to_jsonb(v_plain);
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------
-- Authorization helpers for SECURITY DEFINER RPCs
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_professional_can_read_patient(p_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles pr
          WHERE pr.id = auth.uid()
            AND pr.employer_id = p.user_id
        )
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.current_professional_can_write_clinical_patient(p_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.patients p
    LEFT JOIN public.profiles caller ON caller.id = auth.uid()
    WHERE p.id = p_patient_id
      AND (
        p.user_id = auth.uid()
        OR (
          caller.employer_id = p.user_id
          AND COALESCE(caller.role, '') <> 'secretary'
        )
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ------------------------------------------------------------
-- BEFORE triggers: fail closed on plaintext clinical writes
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.encrypt_patients_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
    NEW.diagnosis_encrypted := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes_encrypted IS DISTINCT FROM OLD.notes_encrypted THEN
      NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
    END IF;

    IF NEW.diagnosis_encrypted IS DISTINCT FROM OLD.diagnosis_encrypted THEN
      NEW.diagnosis_encrypted := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patients_clinical_fields ON public.patients;
CREATE TRIGGER encrypt_patients_clinical_fields
  BEFORE INSERT OR UPDATE OF notes_encrypted, diagnosis_encrypted ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patients_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_sessions_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.session_notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.session_notes_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.session_notes_encrypted IS DISTINCT FROM OLD.session_notes_encrypted THEN
      NEW.session_notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.session_notes_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_sessions_clinical_fields ON public.sessions;
CREATE TRIGGER encrypt_sessions_clinical_fields
  BEFORE INSERT OR UPDATE OF session_notes_encrypted ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_sessions_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_evaluations_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.score := public.encrypt_sensitive_text_if_needed(NEW.score);
    NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.score IS DISTINCT FROM OLD.score THEN
      NEW.score := public.encrypt_sensitive_text_if_needed(NEW.score);
    END IF;

    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_evaluations_clinical_fields ON public.patient_evaluations;
CREATE TRIGGER encrypt_patient_evaluations_clinical_fields
  BEFORE INSERT OR UPDATE OF score, notes ON public.patient_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_evaluations_clinical_fields();

COMMENT ON COLUMN public.patient_evaluations.score IS
  'Clinical score/result text is encrypted. TODO: if future SQL calculations, ordering, or charts need numeric scores, split into score_value (non-sensitive) and score_notes (sensitive encrypted).';

CREATE OR REPLACE FUNCTION public.encrypt_abc_records_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.antecedent := public.encrypt_sensitive_text_if_needed(NEW.antecedent);
    NEW.behavior := public.encrypt_sensitive_text_if_needed(NEW.behavior);
    NEW.consequence := public.encrypt_sensitive_text_if_needed(NEW.consequence);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.antecedent IS DISTINCT FROM OLD.antecedent THEN
      NEW.antecedent := public.encrypt_sensitive_text_if_needed(NEW.antecedent);
    END IF;

    IF NEW.behavior IS DISTINCT FROM OLD.behavior THEN
      NEW.behavior := public.encrypt_sensitive_text_if_needed(NEW.behavior);
    END IF;

    IF NEW.consequence IS DISTINCT FROM OLD.consequence THEN
      NEW.consequence := public.encrypt_sensitive_text_if_needed(NEW.consequence);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_abc_records_clinical_fields ON public.abc_records;
CREATE TRIGGER encrypt_abc_records_clinical_fields
  BEFORE INSERT OR UPDATE OF antecedent, behavior, consequence ON public.abc_records
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_abc_records_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_neuro_profiles_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sensory_profile := public.encrypt_sensitive_jsonb_if_needed(NEW.sensory_profile);
    NEW.diagnosis_details := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_details);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.sensory_profile IS DISTINCT FROM OLD.sensory_profile THEN
      NEW.sensory_profile := public.encrypt_sensitive_jsonb_if_needed(NEW.sensory_profile);
    END IF;

    IF NEW.diagnosis_details IS DISTINCT FROM OLD.diagnosis_details THEN
      NEW.diagnosis_details := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_details);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_neuro_profiles_clinical_fields ON public.patient_neuro_profiles;
CREATE TRIGGER encrypt_patient_neuro_profiles_clinical_fields
  BEFORE INSERT OR UPDATE OF sensory_profile, diagnosis_details ON public.patient_neuro_profiles
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_neuro_profiles_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_anamnesis_responses_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.responses := public.encrypt_sensitive_jsonb_if_needed(NEW.responses);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.responses IS DISTINCT FROM OLD.responses THEN
      NEW.responses := public.encrypt_sensitive_jsonb_if_needed(NEW.responses);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_anamnesis_responses_clinical_fields ON public.anamnesis_responses;
CREATE TRIGGER encrypt_anamnesis_responses_clinical_fields
  BEFORE INSERT OR UPDATE OF responses ON public.anamnesis_responses
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_anamnesis_responses_clinical_fields();

-- ------------------------------------------------------------
-- Read RPCs: decrypt after authorization
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_patient_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(p)
    || jsonb_build_object(
      'notes_encrypted', public.decrypt_sensitive_text(p.notes_encrypted),
      'diagnosis_encrypted', public.decrypt_sensitive_text(p.diagnosis_encrypted)
    )
  INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id;

  RETURN v_patient;
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
          public.decrypt_sensitive_text(s.session_notes_encrypted)
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

CREATE OR REPLACE FUNCTION public.get_patient_evaluations_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_evaluations JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pe)
        || jsonb_build_object(
          'score', public.decrypt_sensitive_text(pe.score),
          'notes', public.decrypt_sensitive_text(pe.notes)
        )
      ORDER BY pe.evaluation_date DESC, pe.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_evaluations
  FROM public.patient_evaluations pe
  WHERE pe.patient_id = p_patient_id;

  RETURN v_evaluations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_abc_records_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_records JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ar)
        || jsonb_build_object(
          'antecedent', public.decrypt_sensitive_text(ar.antecedent),
          'behavior', public.decrypt_sensitive_text(ar.behavior),
          'consequence', public.decrypt_sensitive_text(ar.consequence)
        )
      ORDER BY ar.occurrence_date DESC, ar.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_records
  FROM public.abc_records ar
  WHERE ar.patient_id = p_patient_id;

  RETURN v_records;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_neuro_profile_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_profile JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(pnp)
    || jsonb_build_object(
      'sensory_profile', public.decrypt_sensitive_jsonb_if_needed(pnp.sensory_profile),
      'diagnosis_details', public.decrypt_sensitive_text(pnp.diagnosis_details)
    )
  INTO v_profile
  FROM public.patient_neuro_profiles pnp
  WHERE pnp.patient_id = p_patient_id
  ORDER BY pnp.created_at DESC
  LIMIT 1;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_anamnesis_responses_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_responses JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ar)
        || jsonb_build_object(
          'responses', public.decrypt_sensitive_jsonb_if_needed(ar.responses),
          'anamnesis_templates', to_jsonb(at)
        )
      ORDER BY ar.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_responses
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.patient_id = p_patient_id;

  RETURN v_responses;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------
-- Write RPCs: frontend sends plaintext only to server-side RPCs
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.append_patient_clinical_note(
  p_patient_id UUID,
  p_note TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_existing TEXT;
  v_updated TEXT;
  v_patient JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'empty_note' USING ERRCODE = '22023';
  END IF;

  SELECT public.decrypt_sensitive_text(p.notes_encrypted)
  INTO v_existing
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF starts_with(COALESCE(v_existing, ''), '[ERRO_VAULT:') THEN
    RAISE EXCEPTION 'SECURITY_FAULT: existing note could not be decrypted; aborting append'
      USING ERRCODE = 'P0001';
  END IF;

  v_updated :=
    '[' || to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY, HH24:MI:SS') || ']' ||
    E'\n' || btrim(p_note) ||
    CASE
      WHEN COALESCE(v_existing, '') = '' THEN ''
      ELSE E'\n\n---\n\n' || v_existing
    END;

  UPDATE public.patients
  SET notes_encrypted = v_updated
  WHERE id = p_patient_id;

  SELECT public.get_patient_decrypted(p_patient_id) INTO v_patient;
  RETURN v_patient;
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
  v_session JSONB;
BEGIN
  SELECT patient_id INTO v_patient_id
  FROM public.sessions
  WHERE id = p_session_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sessions
  SET
    status = 'completed',
    session_notes_encrypted = jsonb_build_object(
      'notes', COALESCE(p_notes, ''),
      'mood_happy_sad', p_mood_happy_sad,
      'mood_anxious_calm', p_mood_anxious_calm,
      'updated_at', NOW()
    )::TEXT
  WHERE id = p_session_id;

  SELECT to_jsonb(s)
    || jsonb_build_object(
      'session_notes_encrypted',
      public.decrypt_sensitive_text(s.session_notes_encrypted)
    )
  INTO v_session
  FROM public.sessions s
  WHERE s.id = p_session_id;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_evaluation_secure(
  p_patient_id UUID,
  p_protocol_name TEXT,
  p_evaluation_date DATE,
  p_score TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'completed',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_evaluation_id UUID;
  v_evaluation JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = p_patient_id;

  INSERT INTO public.patient_evaluations (
    user_id,
    patient_id,
    protocol_name,
    evaluation_date,
    score,
    status,
    notes
  )
  VALUES (
    v_owner_id,
    p_patient_id,
    p_protocol_name,
    COALESCE(p_evaluation_date, CURRENT_DATE),
    p_score,
    COALESCE(p_status, 'completed'),
    p_notes
  )
  RETURNING id INTO v_evaluation_id;

  SELECT to_jsonb(pe)
    || jsonb_build_object(
      'score', public.decrypt_sensitive_text(pe.score),
      'notes', public.decrypt_sensitive_text(pe.notes)
    )
  INTO v_evaluation
  FROM public.patient_evaluations pe
  WHERE pe.id = v_evaluation_id;

  RETURN v_evaluation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_abc_record_secure(
  p_patient_id UUID,
  p_occurrence_date DATE,
  p_antecedent TEXT,
  p_behavior TEXT,
  p_consequence TEXT,
  p_intensity INTEGER DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT NULL,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_record_id UUID;
  v_record JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = p_patient_id;

  INSERT INTO public.abc_records (
    user_id,
    patient_id,
    session_id,
    occurrence_date,
    antecedent,
    behavior,
    consequence,
    intensity,
    duration_minutes
  )
  VALUES (
    v_owner_id,
    p_patient_id,
    p_session_id,
    COALESCE(p_occurrence_date, CURRENT_DATE),
    p_antecedent,
    p_behavior,
    p_consequence,
    p_intensity,
    p_duration_minutes
  )
  RETURNING id INTO v_record_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object(
      'antecedent', public.decrypt_sensitive_text(ar.antecedent),
      'behavior', public.decrypt_sensitive_text(ar.behavior),
      'consequence', public.decrypt_sensitive_text(ar.consequence)
    )
  INTO v_record
  FROM public.abc_records ar
  WHERE ar.id = v_record_id;

  RETURN v_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_manual_anamnesis_response_secure(
  p_patient_id UUID,
  p_template_id UUID,
  p_responses JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_response_id UUID;
  v_response JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'object' THEN
    RAISE EXCEPTION 'invalid_responses' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.anamnesis_responses (
    template_id,
    patient_id,
    status,
    responses,
    completed_at
  )
  VALUES (
    p_template_id,
    p_patient_id,
    'completed',
    p_responses,
    NOW()
  )
  RETURNING id INTO v_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object(
      'responses', public.decrypt_sensitive_jsonb_if_needed(ar.responses)
    )
  INTO v_response
  FROM public.anamnesis_responses ar
  WHERE ar.id = v_response_id;

  RETURN v_response;
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
    responses
  )
  VALUES (
    p_template_id,
    p_patient_id,
    'pending',
    '{}'::jsonb
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

REVOKE ALL ON FUNCTION public.get_patient_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_sessions_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_evaluations_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_abc_records_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_neuro_profile_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_anamnesis_responses_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_patient_clinical_note(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_session_evolution_secure(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_evaluation_secure(UUID, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_abc_record_secure(UUID, DATE, TEXT, TEXT, TEXT, INTEGER, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_anamnesis_response_secure(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_anamnesis_request_secure(UUID, UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_db_encrypted_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text_if_needed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_jsonb_if_needed(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_jsonb_if_needed(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_professional_can_read_patient(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_professional_can_write_clinical_patient(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patients_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sessions_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_evaluations_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_abc_records_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_neuro_profiles_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_anamnesis_responses_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_db_encrypted_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_text_if_needed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_jsonb_if_needed(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_jsonb_if_needed(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_professional_can_read_patient(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_professional_can_write_clinical_patient(UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_patient_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_sessions_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_evaluations_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_abc_records_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_neuro_profile_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_anamnesis_responses_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_patient_clinical_note(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_evolution_secure(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_evaluation_secure(UUID, TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_abc_record_secure(UUID, DATE, TEXT, TEXT, TEXT, INTEGER, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_anamnesis_response_secure(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_anamnesis_request_secure(UUID, UUID) TO authenticated;
