-- ============================================================
-- MIGRATION: RLS Estrito para Isolamento de Tenant (Admins, Clínicas e Pacientes)
-- DESCRIÇÃO: Implementa a camada de segurança no banco de dados usando JWT Metadata.
-- ============================================================

-- 1. Habilitar RLS explicitamente na tabela principal
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas antigas (para evitar conflitos)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins have full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Professionals can read own and team profiles" ON public.profiles;
DROP POLICY IF EXISTS "Professionals can update own and team profiles" ON public.profiles;
DROP POLICY IF EXISTS "Patients can read own profile ONLY" ON public.profiles;
DROP POLICY IF EXISTS "Patients can update own profile ONLY" ON public.profiles;

-- ============================================================
-- POLÍTICAS PARA ADMINS
-- ============================================================
-- Admins têm acesso TOTAL (ALL) a todos os perfis.
-- A validação ocorre diretamente na leitura do JWT para máxima performance (Edge/Database sem joins).
CREATE POLICY "Admins have full access to profiles"
ON public.profiles
FOR ALL
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- ============================================================
-- POLÍTICAS PARA CLÍNICAS / PROFISSIONAIS
-- ============================================================
-- Clínicas/Profissionais podem ver e atualizar apenas seu próprio perfil 
-- ou os perfis de membros da equipe (onde employer_id = auth.uid()).
CREATE POLICY "Professionals can read own and team profiles"
ON public.profiles
FOR SELECT
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_type', auth.jwt() -> 'app_metadata' ->> 'user_type', '') != 'patient'
  AND (id = auth.uid() OR employer_id = auth.uid())
);

CREATE POLICY "Professionals can update own and team profiles"
ON public.profiles
FOR UPDATE
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_type', auth.jwt() -> 'app_metadata' ->> 'user_type', '') != 'patient'
  AND (id = auth.uid() OR employer_id = auth.uid())
)
WITH CHECK (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_type', auth.jwt() -> 'app_metadata' ->> 'user_type', '') != 'patient'
  AND (id = auth.uid() OR employer_id = auth.uid())
);

-- Apenas para garantir que novos profissionais possam ser inseridos (se não for via trigger)
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (
  id = auth.uid()
);

-- ============================================================
-- POLÍTICAS PARA PACIENTES
-- ============================================================
-- O paciente só pode ler ou alterar se o ID for exatamente o dele.
-- Bloqueio estrito para não vazar informações entre diferentes pacientes.
CREATE POLICY "Patients can read own profile ONLY"
ON public.profiles
FOR SELECT
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_type', auth.jwt() -> 'app_metadata' ->> 'user_type', '') = 'patient'
  AND id = auth.uid()
);

CREATE POLICY "Patients can update own profile ONLY"
ON public.profiles
FOR UPDATE
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_type', auth.jwt() -> 'app_metadata' ->> 'user_type', '') = 'patient'
  AND id = auth.uid()
)
WITH CHECK (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_type', auth.jwt() -> 'app_metadata' ->> 'user_type', '') = 'patient'
  AND id = auth.uid()
);
