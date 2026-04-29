-- ============================================================
-- Migration: fix_patient_auth_provisioning
-- Propósito: Corrigir a arquitetura de autenticação de pacientes.
--            Abandona o modelo de vinculação por email no callback
--            (RPC link_patient_auth_user) em favor de provisionamento
--            server-side via auth.admin.createUser na Route Handler
--            /api/patients/create.
-- ============================================================
-- CONTEXTO — Por que este modelo é mais seguro:
--
--  MODELO ANTERIOR (PROBLEMÁTICO):
--    • Paciente não existe em auth.users até o primeiro login.
--    • shouldCreateUser: false falha silenciosamente.
--    • RPC link_patient_auth_user faz match por email — 2 irmãos com
--      o mesmo email da mãe sobrescrevem auth_user_id um do outro.
--
--  MODELO ATUAL (PROVISIONAMENTO SERVER-SIDE):
--    • O terapeuta chama POST /api/patients/create.
--    • A Route Handler usa auth.admin.createUser (service_role) para
--      criar o usuário em auth.users com user_type='patient'.
--    • Se o email JÁ existir em auth.users (ex: mãe com 2 filhos),
--      a rota reutiliza o auth_user_id existente — sem sobrescrita.
--    • auth_user_id é inserido em patients.auth_user_id ANTES do
--      primeiro login. O callback vira trivial (só troca o código).
--    • As RLS de emotion_diary funcionam com patient_id como pivô:
--      um mesmo auth.uid() pode acessar N registros de patients
--      (filhos diferentes), cada um com seu próprio patient_id.
-- ============================================================

-- ============================================================
-- PASSO 1: Remover a RPC de vinculação (abordagem abandonada)
-- ============================================================
DROP FUNCTION IF EXISTS public.link_patient_auth_user();

-- ============================================================
-- PASSO 2: Confirmar que auth_user_id existe em patients
--          (idempotente — já criada na migration anterior)
-- ============================================================
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS auth_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_auth_user_id
  ON public.patients(auth_user_id);

COMMENT ON COLUMN public.patients.auth_user_id IS
  'auth.users.id que tem acesso a este registro de paciente via Magic Link. '
  'Pode ser o próprio paciente adulto OU o responsável legal (mãe, pai). '
  'Múltiplos registros de patients podem compartilhar o mesmo auth_user_id '
  '(ex: mãe com dois filhos em terapia). '
  'Preenchido em INSERT pela Route Handler /api/patients/create usando '
  'auth.admin.createUser — NUNCA pelo frontend diretamente.';

-- ============================================================
-- PASSO 3: RLS emotion_diary — modelo multi-filho
-- ============================================================
-- NOTA SOBRE O PARADOXO MULTI-FILHO:
--   A política usa patient_id (não auth_user_id) como âncora.
--   Isso significa:
--
--   Mãe (auth.uid() = MOM_UUID) tem dois filhos:
--     patients { id: JOAO_UUID, auth_user_id: MOM_UUID }
--     patients { id: MARIA_UUID, auth_user_id: MOM_UUID }
--
--   A mãe pode criar/ler emotion_diary para JOAO_UUID:
--     patient_id = JOAO_UUID → patients.auth_user_id = MOM_UUID ✅
--
--   A mãe pode criar/ler emotion_diary para MARIA_UUID:
--     patient_id = MARIA_UUID → patients.auth_user_id = MOM_UUID ✅
--
--   O terapeuta controla QUAL patient_id o frontend recebe ao logar.
--   A RLS apenas valida que quem está logado TEM o auth_user_id
--   daquele patient. A autorização de qual filho acessar fica no frontend.

DROP POLICY IF EXISTS "Allow insert via service role"        ON public.emotion_diary;
DROP POLICY IF EXISTS "Patients can view own emotion diary"  ON public.emotion_diary;
DROP POLICY IF EXISTS "Patients can insert own emotion diary" ON public.emotion_diary;
DROP POLICY IF EXISTS "Patients can update own emotion diary" ON public.emotion_diary;
DROP POLICY IF EXISTS "Patients can delete own emotion diary" ON public.emotion_diary;

-- SELECT: terapeuta vê diários de seus pacientes
-- (policy existente "Therapists can view their patients emotion diary" mantida)

-- SELECT: paciente / responsável lê apenas os diários dos patients
--         onde é o auth_user_id registrado
CREATE POLICY "Patients can view own emotion diary"
  ON public.emotion_diary FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id    = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- INSERT: paciente / responsável insere somente em patient_ids que possui
CREATE POLICY "Patients can insert own emotion diary"
  ON public.emotion_diary FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id    = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- UPDATE: idem
CREATE POLICY "Patients can update own emotion diary"
  ON public.emotion_diary FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id    = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- DELETE: idem
CREATE POLICY "Patients can delete own emotion diary"
  ON public.emotion_diary FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id    = emotion_diary.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- PASSO 4: RLS patients — paciente / responsável lê seus registros
-- ============================================================
DROP POLICY IF EXISTS "Patients can view own patient record" ON public.patients;

CREATE POLICY "Patients can view own patient record"
  ON public.patients FOR SELECT
  USING (auth_user_id = auth.uid());

-- ============================================================
-- PASSO 5: RLS patient_tasks — paciente lê e atualiza suas tarefas
-- ============================================================
DROP POLICY IF EXISTS "Patients can view own tasks"         ON public.patient_tasks;
DROP POLICY IF EXISTS "Patients can update own task feedback" ON public.patient_tasks;

CREATE POLICY "Patients can view own tasks"
  ON public.patient_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id    = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Patients can update own task feedback"
  ON public.patient_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id    = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id    = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- PASSO 6: handle_new_user — não criar profile para pacientes
-- ============================================================
-- Pacientes são criados via auth.admin.createUser com
-- raw_user_meta_data.user_type = 'patient'. O trigger deve
-- ignorá-los para não poluir a tabela profiles com não-terapeutas.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Ignorar pacientes: eles têm seu próprio registro em public.patients,
  -- não em public.profiles (que é exclusiva de terapeutas e secretárias).
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
