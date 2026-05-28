-- ==============================================================================
-- Nythos: Supabase Storage setup for profile brand assets
-- Prefer applying the migration in:
-- supabase/migrations/20260527183000_brand_storage_bucket_policies.sql
--
-- Storage object policies are documented in:
-- docs/SUPABASE_STORAGE_BRAND_POLICIES.md
-- Recommended write policy expression: name LIKE auth.uid()::text || '/%'
-- ==============================================================================

-- Create/update the public bucket used by professional photo, clinic logo and
-- signature images. The app stores objects as: <auth.uid()>/<file-name>.
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
