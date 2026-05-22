-- ============================================================
-- Migration: persist_profile_billing_document_from_signup
-- Purpose:
--   Keep CPF/CNPJ provided during owner signup in public.profiles.cpf
--   so platform checkout can reuse it without sending users back to
--   profile settings.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Patients are provisioned via /api/patients/create and use public.patients,
  -- not public.profiles.
  IF (NEW.raw_user_meta_data->>'user_type') = 'patient' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    email,
    crp,
    cpf
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    NEW.email,
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'crp', '')), ''),
    NULLIF(REGEXP_REPLACE(COALESCE(NEW.raw_user_meta_data->>'cpf', ''), '[^0-9]', '', 'g'), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    crp = COALESCE(public.profiles.crp, EXCLUDED.crp),
    cpf = COALESCE(public.profiles.cpf, EXCLUDED.cpf);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

UPDATE public.profiles p
SET
  cpf = NULLIF(REGEXP_REPLACE(COALESCE(u.raw_user_meta_data->>'cpf', ''), '[^0-9]', '', 'g'), ''),
  crp = COALESCE(p.crp, NULLIF(BTRIM(COALESCE(u.raw_user_meta_data->>'crp', '')), ''))
FROM auth.users u
WHERE p.id = u.id
  AND p.cpf IS NULL
  AND NULLIF(REGEXP_REPLACE(COALESCE(u.raw_user_meta_data->>'cpf', ''), '[^0-9]', '', 'g'), '') IS NOT NULL;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
