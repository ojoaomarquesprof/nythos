-- ============================================================
-- Migration: patient_access_token
-- Propósito: Adicionar coluna access_token na tabela patients
--            para suportar o novo modelo de autenticação via
--            Link Inteligente (WhatsApp) + Data de Nascimento.
--
-- Neste modelo, o paciente NÃO usa mais supabase.auth.
-- O acesso é feito via /p/[token] → verificação de DOB → cookie HMAC.
-- As Server Actions usam createAdminClient() (service_role) que já
-- bypassa o RLS. Portanto, não precisamos de novas policies.
--
-- Esta migration apenas adiciona a coluna access_token e popula
-- registros existentes com UUIDs gerados automaticamente.
-- ============================================================

-- 1. Adicionar coluna access_token (UUID único por paciente)
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS access_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- 2. Preencher pacientes existentes que ainda não têm token
UPDATE public.patients
  SET access_token = gen_random_uuid()
  WHERE access_token IS NULL;

-- 3. Tornar o campo NOT NULL após o backfill
ALTER TABLE public.patients
  ALTER COLUMN access_token SET NOT NULL;

-- 4. Índice para lookup rápido via token (usado em /p/[token])
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_access_token
  ON public.patients(access_token);

COMMENT ON COLUMN public.patients.access_token IS
  'Token de acesso único gerado automaticamente. '
  'Usado no link de WhatsApp: /p/[access_token]. '
  'O paciente valida a identidade informando a Data de Nascimento. '
  'Diferente do auth_user_id (Supabase Auth), este token nunca expira '
  'e pode ser regenerado pelo terapeuta se necessário.';
