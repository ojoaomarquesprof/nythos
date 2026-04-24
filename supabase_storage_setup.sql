-- ==============================================================================
-- Nythos: Configuração do Supabase Storage para Fotos e Logos
-- Execute no SQL Editor do Supabase
-- ==============================================================================

-- 1. Adicionar nova coluna de logo à tabela profiles (se ainda não existir)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS clinic_logo_url TEXT;

-- 2. Criar o bucket de armazenamento 'brand' (se ainda não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'brand', 
  'brand', 
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Remover políticas antigas (caso existam) para recriar limpas
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own brand assets" ON storage.objects;

-- 4. Habilitar RLS no storage.objects (geralmente já está habilitado)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 5. Política: qualquer um pode LER arquivos do bucket 'brand' (público)
CREATE POLICY "brand_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand');

-- 6. Política: usuários autenticados podem INSERIR arquivos no bucket 'brand'
CREATE POLICY "brand_authenticated_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand');

-- 7. Política: usuários autenticados podem ATUALIZAR arquivos no bucket 'brand'
CREATE POLICY "brand_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'brand')
WITH CHECK (bucket_id = 'brand');

-- 8. Política: usuários autenticados podem DELETAR arquivos no bucket 'brand'
CREATE POLICY "brand_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'brand');
