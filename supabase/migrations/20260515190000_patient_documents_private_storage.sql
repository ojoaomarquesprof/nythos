-- ============================================================
-- Migration: patient_documents_private_storage
-- Purpose:
--   Create a private Supabase Storage bucket for patient documents
--   and expose only short-lived, authorized access through app code.
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'patient-documents',
  'patient-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

REVOKE SELECT (storage_path) ON public.patient_documents FROM anon, authenticated;

DROP POLICY IF EXISTS "Professionals can read private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can read private patient document objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_read_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Professionals can upload private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can upload private patient document objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Professionals can update private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can update private patient document objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Professionals can delete private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can delete private patient document objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

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
      (to_jsonb(pd) - 'storage_path')
        || jsonb_build_object(
          'description', public.decrypt_sensitive_text(pd.description_encrypted),
          'has_file', pd.storage_path IS NOT NULL
        )
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

REVOKE ALL ON FUNCTION public.get_patient_documents_decrypted(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_documents_decrypted(UUID) TO authenticated;
