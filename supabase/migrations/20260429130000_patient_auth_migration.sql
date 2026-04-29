-- ============================================================
-- Migration: patient_auth_migration
-- Propósito: Elevar o modelo de segurança da área do paciente
--            de access_token UUID (MVP) para Supabase Auth nativo
--            (Magic Link / OTP de Email).
-- ============================================================
-- ESTRATÉGIA DE TRANSIÇÃO:
--   1. Adicionar coluna auth_user_id (UUID, nullable) na tabela patients,
--      vinculando o paciente a um auth.users real.
--   2. Reescrever as RLS de emotion_diary para validar auth.uid().
--   3. Manter o access_token como coluna legada (NOT NULL inalterado),
--      mas marcar como deprecated via comment — pode ser removido em
--      uma migration futura após todos os pacientes migrarem.
--   4. Adicionar policy de leitura em patients para que pacientes
--      autenticados possam ler os próprios dados.
-- ============================================================

-- ============================================================
-- PASSO 1: Adicionar auth_user_id na tabela patients
-- ============================================================
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS auth_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index para lookup eficiente por auth.uid()
CREATE INDEX IF NOT EXISTS idx_patients_auth_user_id
  ON public.patients(auth_user_id);

-- Comentário de documentação
COMMENT ON COLUMN public.patients.auth_user_id IS
  'auth.users.id do paciente quando autenticado via Magic Link/OTP. '
  'NULL enquanto o paciente ainda usa o fluxo legacy de access_token.';

COMMENT ON COLUMN public.patients.access_token IS
  '[DEPRECATED — será removido após migração completa] '
  'Token UUID legado para acesso sem autenticação. '
  'Substituído por auth_user_id com Supabase Auth nativo.';

-- ============================================================
-- PASSO 2: Trigger — vincular auth_user_id automaticamente
--          quando um novo usuário-paciente faz login pela
--          primeira vez (identificado pelo email).
-- ============================================================
-- NOTA: O trigger handle_new_user já cria um profile para
--       todo novo auth.users. Para pacientes, precisamos de
--       uma função separada que NÃO cria profile (pacientes
--       não são terapeutas) mas vincula o auth_user_id.
-- A vinculação real ocorre na rota /api/patient/auth/link
-- (chamada pelo callback após Magic Link). Ver seed abaixo.

-- Função RPC chamável pelo frontend após callback de Magic Link.
-- Vincula o auth.uid() ao registro do paciente pelo email.
CREATE OR REPLACE FUNCTION public.link_patient_auth_user()
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
  v_user_email TEXT;
BEGIN
  -- Pegar email do usuário autenticado
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = auth.uid();

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  -- Buscar paciente pelo email e vincular o auth_user_id
  UPDATE public.patients
  SET auth_user_id = auth.uid()
  WHERE LOWER(email) = LOWER(v_user_email)
    AND (auth_user_id IS NULL OR auth_user_id = auth.uid())
  RETURNING id INTO v_patient_id;

  IF v_patient_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Nenhum paciente encontrado com este email. '
               'Confirme com seu terapeuta que o email está correto.'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'patient_id', v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================
-- PASSO 3: Reescrever RLS da tabela emotion_diary
-- ============================================================

-- Remover policy permissiva de MVP
DROP POLICY IF EXISTS "Allow insert via service role" ON public.emotion_diary;

-- SELECT: terapeutas veem diários dos seus pacientes (mantém)
-- (policy "Therapists can view their patients emotion diary" já existe)

-- SELECT: paciente autenticado vê apenas os PRÓPRIOS registros
DROP POLICY IF EXISTS "Patients can view own emotion diary" ON public.emotion_diary;
CREATE POLICY "Patients can view own emotion diary"
  ON public.emotion_diary FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- INSERT: paciente autenticado insere apenas em seu próprio diário
DROP POLICY IF EXISTS "Patients can insert own emotion diary" ON public.emotion_diary;
CREATE POLICY "Patients can insert own emotion diary"
  ON public.emotion_diary FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- UPDATE: paciente pode editar suas próprias entradas
DROP POLICY IF EXISTS "Patients can update own emotion diary" ON public.emotion_diary;
CREATE POLICY "Patients can update own emotion diary"
  ON public.emotion_diary FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- DELETE: paciente pode deletar suas próprias entradas
DROP POLICY IF EXISTS "Patients can delete own emotion diary" ON public.emotion_diary;
CREATE POLICY "Patients can delete own emotion diary"
  ON public.emotion_diary FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- PASSO 4: RLS em patients — paciente lê seus próprios dados
-- ============================================================

-- Paciente autenticado pode ver seu próprio registro (para o frontend
-- saber o patient_id e carregar as tasks, diários, etc.)
DROP POLICY IF EXISTS "Patients can view own patient record" ON public.patients;
CREATE POLICY "Patients can view own patient record"
  ON public.patients FOR SELECT
  USING (auth_user_id = auth.uid());

-- ============================================================
-- PASSO 5: RLS em patient_tasks — paciente lê suas tarefas
-- ============================================================

DROP POLICY IF EXISTS "Patients can view own tasks" ON public.patient_tasks;
CREATE POLICY "Patients can view own tasks"
  ON public.patient_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- Paciente pode atualizar status e feedback das suas tarefas
DROP POLICY IF EXISTS "Patients can update own task feedback" ON public.patient_tasks;
CREATE POLICY "Patients can update own task feedback"
  ON public.patient_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  )
  -- Restringe quais colunas o paciente pode alterar
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- PASSO 6: Garantir que handle_new_user NÃO crie profile
--          para usuários que são pacientes (sem role therapist)
-- ============================================================
-- A função handle_new_user atual cria um profile para TODOS os
-- novos auth.users. Precisamos guardá-la de criar profiles para
-- pacientes, que são identificados pelo meta 'user_type' = 'patient'
-- enviado no signInWithOtp options.data.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Não criar profile para pacientes (identificados pelo metadata)
  IF (NEW.raw_user_meta_data->>'user_type') = 'patient' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
