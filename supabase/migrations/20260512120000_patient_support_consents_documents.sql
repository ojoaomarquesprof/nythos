-- ============================================================
-- Migration: patient_support_consents_documents
-- Purpose:
--   Organize support contacts, consent records and patient document
--   metadata with encrypted sensitive notes and narrow RPC access.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.care_network
  ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS relationship TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS organization TEXT,
  ADD COLUMN IF NOT EXISTS can_contact BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_date DATE,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.care_network
  DROP CONSTRAINT IF EXISTS care_network_contact_type_check;
ALTER TABLE public.care_network
  ADD CONSTRAINT care_network_contact_type_check
  CHECK (
    contact_type IS NULL OR contact_type IN (
      'legal_guardian',
      'financial_guardian',
      'emergency',
      'psychiatrist',
      'speech_therapist',
      'occupational_therapist',
      'doctor',
      'school',
      'teacher',
      'caregiver',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS idx_care_network_contact_type
  ON public.care_network(contact_type);
CREATE INDEX IF NOT EXISTS idx_care_network_active
  ON public.care_network(patient_id, is_active);

DROP TRIGGER IF EXISTS update_care_network_updated_at ON public.care_network;
CREATE TRIGGER update_care_network_updated_at
  BEFORE UPDATE ON public.care_network
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.patient_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  description_encrypted TEXT,
  storage_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  document_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_documents_category_check
    CHECK (category IN ('consent', 'report', 'assessment', 'certificate', 'referral', 'school_document', 'receipt', 'image', 'other')),
  CONSTRAINT patient_documents_title_not_blank
    CHECK (btrim(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_id
  ON public.patient_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_therapist_id
  ON public.patient_documents(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_category
  ON public.patient_documents(category);
CREATE INDEX IF NOT EXISTS idx_patient_documents_created_at
  ON public.patient_documents(created_at);

DROP TRIGGER IF EXISTS update_patient_documents_updated_at ON public.patient_documents;
CREATE TRIGGER update_patient_documents_updated_at
  BEFORE UPDATE ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_documents" ON public.patient_documents;
CREATE POLICY "Professionals can read relevant patient_documents"
  ON public.patient_documents FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_documents" ON public.patient_documents;
CREATE POLICY "Professionals can write relevant patient_documents"
  ON public.patient_documents FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_documents.patient_id
        AND p.user_id = patient_documents.therapist_id
    )
  );

CREATE TABLE IF NOT EXISTS public.patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'pending',
  signed_at DATE,
  expires_at DATE,
  related_person_name TEXT,
  document_file_id UUID REFERENCES public.patient_documents(id) ON DELETE SET NULL,
  version TEXT,
  notes_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_consents_type_check
    CHECK (consent_type IN ('general_consent', 'online_care', 'legal_guardian', 'school_contact', 'multidisciplinary_contact', 'patient_portal', 'third_party_sharing', 'other')),
  CONSTRAINT patient_consents_status_check
    CHECK (status IN ('pending', 'signed', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_patient_consents_patient_id
  ON public.patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_therapist_id
  ON public.patient_consents(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_type
  ON public.patient_consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_patient_consents_status
  ON public.patient_consents(status);

DROP TRIGGER IF EXISTS update_patient_consents_updated_at ON public.patient_consents;
CREATE TRIGGER update_patient_consents_updated_at
  BEFORE UPDATE ON public.patient_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_consents" ON public.patient_consents;
CREATE POLICY "Professionals can read relevant patient_consents"
  ON public.patient_consents FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_consents" ON public.patient_consents;
CREATE POLICY "Professionals can write relevant patient_consents"
  ON public.patient_consents FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_consents.patient_id
        AND p.user_id = patient_consents.therapist_id
    )
  );

CREATE OR REPLACE FUNCTION public.encrypt_care_network_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_care_network_clinical_fields ON public.care_network;
CREATE TRIGGER encrypt_care_network_clinical_fields
  BEFORE INSERT OR UPDATE OF notes
  ON public.care_network
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_care_network_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_documents_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.description_encrypted IS DISTINCT FROM OLD.description_encrypted THEN
      NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_documents_clinical_fields ON public.patient_documents;
CREATE TRIGGER encrypt_patient_documents_clinical_fields
  BEFORE INSERT OR UPDATE OF description_encrypted
  ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_documents_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_consents_clinical_fields()
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

DROP TRIGGER IF EXISTS encrypt_patient_consents_clinical_fields ON public.patient_consents;
CREATE TRIGGER encrypt_patient_consents_clinical_fields
  BEFORE INSERT OR UPDATE OF notes_encrypted
  ON public.patient_consents
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_consents_clinical_fields();

CREATE OR REPLACE FUNCTION public.get_patient_care_network_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_contacts JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(cn)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(cn.notes))
      ORDER BY cn.is_primary DESC, cn.is_active DESC, cn.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_contacts
  FROM public.care_network cn
  WHERE cn.patient_id = p_patient_id;

  RETURN v_contacts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_support_contact_secure(
  p_patient_id UUID,
  p_name TEXT,
  p_contact_type TEXT DEFAULT 'other',
  p_relationship TEXT DEFAULT NULL,
  p_specialty TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_organization TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_can_contact BOOLEAN DEFAULT false,
  p_consent_date DATE DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_contact_type, 'other') NOT IN (
    'legal_guardian', 'financial_guardian', 'emergency', 'psychiatrist',
    'speech_therapist', 'occupational_therapist', 'doctor', 'school',
    'teacher', 'caregiver', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_contact_type' USING ERRCODE = '22023';
  END IF;

  IF p_email IS NOT NULL AND btrim(p_email) <> ''
     AND btrim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.care_network (
    patient_id,
    user_id,
    name,
    specialty,
    contact_type,
    relationship,
    phone,
    email,
    organization,
    notes,
    can_contact,
    consent_date,
    is_primary,
    is_active
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    btrim(p_name),
    COALESCE(NULLIF(btrim(COALESCE(p_specialty, '')), ''), COALESCE(p_contact_type, 'other')),
    COALESCE(p_contact_type, 'other'),
    NULLIF(btrim(COALESCE(p_relationship, '')), ''),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email, ''))), ''),
    NULLIF(btrim(COALESCE(p_organization, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    COALESCE(p_can_contact, false),
    p_consent_date,
    COALESCE(p_is_primary, false),
    COALESCE(p_is_active, true)
  );

  RETURN public.get_patient_care_network_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.delete_patient_support_contact_secure(p_contact_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT cn.patient_id INTO v_patient_id
  FROM public.care_network cn
  WHERE cn.id = p_contact_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.care_network
  WHERE id = p_contact_id;

  RETURN public.get_patient_care_network_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_consents_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_consents JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pc)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(pc.notes_encrypted))
      ORDER BY pc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_consents
  FROM public.patient_consents pc
  WHERE pc.patient_id = p_patient_id;

  RETURN v_consents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_consent_secure(
  p_patient_id UUID,
  p_consent_type TEXT,
  p_status TEXT DEFAULT 'pending',
  p_signed_at DATE DEFAULT NULL,
  p_expires_at DATE DEFAULT NULL,
  p_related_person_name TEXT DEFAULT NULL,
  p_document_file_id UUID DEFAULT NULL,
  p_version TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_consent_type, 'other') NOT IN ('general_consent', 'online_care', 'legal_guardian', 'school_contact', 'multidisciplinary_contact', 'patient_portal', 'third_party_sharing', 'other') THEN
    RAISE EXCEPTION 'invalid_consent_type' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'pending') NOT IN ('pending', 'signed', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_consents (
    patient_id,
    therapist_id,
    consent_type,
    status,
    signed_at,
    expires_at,
    related_person_name,
    document_file_id,
    version,
    notes_encrypted
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    COALESCE(p_consent_type, 'other'),
    COALESCE(p_status, 'pending'),
    p_signed_at,
    p_expires_at,
    NULLIF(btrim(COALESCE(p_related_person_name, '')), ''),
    p_document_file_id,
    NULLIF(btrim(COALESCE(p_version, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  );

  RETURN public.get_patient_consents_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.delete_patient_consent_secure(p_consent_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT pc.patient_id INTO v_patient_id
  FROM public.patient_consents pc
  WHERE pc.id = p_consent_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'consent_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.patient_consents
  WHERE id = p_consent_id;

  RETURN public.get_patient_consents_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_documents_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_documents JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pd)
        || jsonb_build_object('description', public.decrypt_sensitive_text(pd.description_encrypted))
      ORDER BY pd.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_documents
  FROM public.patient_documents pd
  WHERE pd.patient_id = p_patient_id;

  RETURN v_documents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_document_secure(
  p_patient_id UUID,
  p_category TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_storage_path TEXT DEFAULT NULL,
  p_file_name TEXT DEFAULT NULL,
  p_mime_type TEXT DEFAULT NULL,
  p_size_bytes BIGINT DEFAULT NULL,
  p_document_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_category, 'other') NOT IN ('consent', 'report', 'assessment', 'certificate', 'referral', 'school_document', 'receipt', 'image', 'other') THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_documents (
    patient_id,
    therapist_id,
    category,
    title,
    description_encrypted,
    storage_path,
    file_name,
    mime_type,
    size_bytes,
    document_date
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    COALESCE(p_category, 'other'),
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_storage_path, '')), ''),
    NULLIF(btrim(COALESCE(p_file_name, '')), ''),
    NULLIF(btrim(COALESCE(p_mime_type, '')), ''),
    p_size_bytes,
    p_document_date
  );

  RETURN public.get_patient_documents_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.delete_patient_document_secure(p_document_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT pd.patient_id INTO v_patient_id
  FROM public.patient_documents pd
  WHERE pd.id = p_document_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.patient_documents
  WHERE id = p_document_id;

  RETURN public.get_patient_documents_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_care_network_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_support_contact_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DATE, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_patient_support_contact_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_consents_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_consent_secure(UUID, TEXT, TEXT, DATE, DATE, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_patient_consent_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_documents_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_document_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_patient_document_secure(UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_care_network_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_documents_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_consents_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_patient_care_network_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_support_contact_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DATE, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_patient_support_contact_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_consents_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_consent_secure(UUID, TEXT, TEXT, DATE, DATE, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_patient_consent_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_documents_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_document_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_patient_document_secure(UUID) TO authenticated;
