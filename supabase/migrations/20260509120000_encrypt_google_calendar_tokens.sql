-- ============================================================
-- Nythos - Encrypt Google Calendar OAuth tokens at rest
-- Stores Google access/refresh tokens encrypted via the existing
-- Supabase Vault-backed sensitive text helpers.
-- ============================================================

CREATE OR REPLACE FUNCTION public.encrypt_google_token_if_needed(p_token TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.encrypt_sensitive_text_if_needed(p_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.decrypt_google_token_if_needed(p_token TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.decrypt_sensitive_text(p_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.encrypt_profiles_google_calendar_tokens()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.google_access_token := public.encrypt_google_token_if_needed(NEW.google_access_token);
    NEW.google_refresh_token := public.encrypt_google_token_if_needed(NEW.google_refresh_token);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.google_access_token IS DISTINCT FROM OLD.google_access_token THEN
      NEW.google_access_token := public.encrypt_google_token_if_needed(NEW.google_access_token);
    END IF;

    IF NEW.google_refresh_token IS DISTINCT FROM OLD.google_refresh_token THEN
      NEW.google_refresh_token := public.encrypt_google_token_if_needed(NEW.google_refresh_token);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS encrypt_profiles_google_calendar_tokens ON public.profiles;
CREATE TRIGGER encrypt_profiles_google_calendar_tokens
  BEFORE INSERT OR UPDATE OF google_access_token, google_refresh_token ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_profiles_google_calendar_tokens();

-- Controlled backfill for legacy plaintext tokens. Run with service_role after
-- confirming nythos_encryption_key is configured in Supabase Vault:
--
--   SELECT * FROM public.backfill_google_calendar_tokens_encryption();
--
-- Existing plaintext tokens remain readable by decrypt_google_token_if_needed
-- until this function is run.
CREATE OR REPLACE FUNCTION public.backfill_google_calendar_tokens_encryption()
RETURNS TABLE(updated_profiles BIGINT) AS $$
DECLARE
  v_updated BIGINT;
BEGIN
  UPDATE public.profiles
  SET
    google_access_token = public.encrypt_google_token_if_needed(google_access_token),
    google_refresh_token = public.encrypt_google_token_if_needed(google_refresh_token)
  WHERE (
      google_access_token IS NOT NULL
      AND NOT public.is_db_encrypted_text(google_access_token)
    )
    OR (
      google_refresh_token IS NOT NULL
      AND NOT public.is_db_encrypted_text(google_refresh_token)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  updated_profiles := v_updated;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON COLUMN public.profiles.google_access_token IS
  'Encrypted Google OAuth access token. Decrypt only server-side immediately before Google API calls.';
COMMENT ON COLUMN public.profiles.google_refresh_token IS
  'Encrypted Google OAuth refresh token. Decrypt only server-side immediately before token refresh.';
COMMENT ON COLUMN public.profiles.google_token_expiry IS
  'Timestamp when the current Google access token expires. Not encrypted.';
COMMENT ON COLUMN public.profiles.google_calendar_id IS
  'Google Calendar ID used for sync. Not sensitive; defaults to primary.';

REVOKE EXECUTE ON FUNCTION public.encrypt_google_token_if_needed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_google_token_if_needed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_profiles_google_calendar_tokens() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_google_calendar_tokens_encryption() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.encrypt_google_token_if_needed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_google_token_if_needed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_google_calendar_tokens_encryption() TO service_role;
