# Supabase Storage policies for the `brand` bucket

The app stores professional photos, clinic logos and signatures in the public
Storage bucket `brand`.

Primary uploads now go through the server-side endpoint:

```text
POST /api/brand-assets/upload
```

The browser sends only `file` and `field`. The endpoint validates the
authenticated user, allowlists the field, validates MIME type and size, builds
the Storage path from the server-side `auth.uid`, uploads with the server-only
admin client, generates a public URL and updates the logged-in user's
`profiles` row. The service role key is never exposed to the frontend.

Object paths follow this pattern:

```text
<user-id>/<field>-<timestamp>.<ext>
```

Example:

```text
00000000-0000-0000-0000-000000000000/avatar_url-1710000000000.png
```

The bucket itself is created by:

```text
supabase/migrations/20260527183000_brand_storage_bucket_policies.sql
```

The bucket must stay public because the app uses `getPublicUrl`. Its upload
limit is 15MB (`15728640` bytes), and accepted MIME types remain restricted to:

```text
image/jpeg
image/png
image/gif
image/webp
```

That migration intentionally only creates/updates `storage.buckets`. Some
Supabase SQL Editor roles cannot alter policies on `storage.objects` and return:

```text
ERROR: 42501: must be owner of table objects
```

Create the object policies through the Supabase Dashboard instead if you want
browser-side writes as defense in depth or for future direct-upload flows. The
current production upload path does not depend on browser `INSERT` into
`storage.objects`; it uses the authorized server endpoint above.

## Dashboard setup

Open:

```text
Supabase Dashboard -> Storage -> Policies -> brand -> New policy
```

If you configure Dashboard policies for this bucket, create these four
policies.

The policies do not change for the 15MB limit. They continue to restrict writes
to the authenticated user's own folder.

For write policies, use `name LIKE auth.uid()::text || '/%'` instead of
`storage.foldername(name)`. This keeps the same folder-level protection while
matching the exact object path format used by the app.

## 1. Public read

Operation:

```text
SELECT
```

Target roles:

```text
anon, authenticated
```

Policy expression:

```sql
bucket_id = 'brand'
```

Why: the app uses `getPublicUrl`, so brand images must be publicly readable.

## 2. Authenticated insert in own folder

Operation:

```text
INSERT
```

Target role:

```text
authenticated
```

WITH CHECK expression:

```sql
bucket_id = 'brand'
AND name LIKE auth.uid()::text || '/%'
```

Why: an authenticated user can upload only to the first path segment matching
their own user id.

## 3. Authenticated update in own folder

Operation:

```text
UPDATE
```

Target role:

```text
authenticated
```

USING expression:

```sql
bucket_id = 'brand'
AND name LIKE auth.uid()::text || '/%'
```

WITH CHECK expression:

```sql
bucket_id = 'brand'
AND name LIKE auth.uid()::text || '/%'
```

Why: `upload(..., { upsert: true })` may need update permission for an existing
object, but only inside the user's own folder.

## 4. Authenticated delete in own folder

Operation:

```text
DELETE
```

Target role:

```text
authenticated
```

USING expression:

```sql
bucket_id = 'brand'
AND name LIKE auth.uid()::text || '/%'
```

Why: if cleanup/removal is added later, users can only remove their own brand
assets.

## SQL opcional, apenas se seu projeto permitir criar policy em storage.objects

Use this only in environments where the executing role owns or can manage
`storage.objects` policies. If the SQL Editor returns `must be owner of table
objects`, use the Dashboard setup above.

```sql
DROP POLICY IF EXISTS "brand_public_read" ON storage.objects;
DROP POLICY IF EXISTS "brand_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "brand_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "brand_authenticated_delete" ON storage.objects;

CREATE POLICY "brand_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'brand');

CREATE POLICY "brand_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand'
    AND name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "brand_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'brand'
    AND name LIKE auth.uid()::text || '/%'
  )
  WITH CHECK (
    bucket_id = 'brand'
    AND name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "brand_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand'
    AND name LIKE auth.uid()::text || '/%'
  );
```
