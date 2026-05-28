-- ============================================================
-- Migration: brand_storage_bucket
-- Purpose:
--   Create/update the public brand bucket used by profile images.
--
-- Storage object policies for this bucket are documented in:
-- docs/SUPABASE_STORAGE_BRAND_POLICIES.md
--
-- Some Supabase projects do not allow creating/dropping policies on
-- storage.objects from the SQL Editor role, so this migration intentionally
-- avoids ALTER TABLE, DROP POLICY and CREATE POLICY on storage.objects.
-- Recommended write policy expression: name LIKE auth.uid()::text || '/%'
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'brand',
  'brand',
  true,
  15728640,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
