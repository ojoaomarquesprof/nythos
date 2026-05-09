-- ============================================================
-- NYTHOS — Schema SQL Completo para Supabase
-- SaaS para Psicólogos: Gestão Clínica e Financeira
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FUNÇÕES AUXILIARES: Criptografia de Dados Sensíveis (Supabase Vault)
-- ============================================================
-- NOTA DE DESIGN — Política de Segurança:
--   As duas funções adotam estratégias deliberadamente diferentes:
--
--   • encrypt_sensitive_text → FAIL-SECURE (aborta a transação)
--     Se a chave não estiver disponível no Vault ou a criptografia falhar,
--     lança RAISE EXCEPTION abortando o INSERT/UPDATE. Isso garante que
--     dados de saúde NUNCA sejam persistidos em texto puro no banco,
--     em conformidade com a LGPD e o sigilo médico (CFP/CFM).
--
--   • decrypt_sensitive_text → GRACEFUL DEGRADATION (não crasha o frontend)
--     Se a chave não estiver disponível, retorna marcadores identificáveis
--     ('[ERRO_VAULT: ...]') em vez de lançar exceção, permitindo que o
--     frontend exiba um aviso contextual sem quebrar a tela inteira.
--
--   Para configurar a chave no Vault, execute supabase/seed_vault.sql.
-- ============================================================

-- Função para criptografar texto sensível usando Supabase Vault
-- POLÍTICA: FAIL-SECURE — aborta a transação se a criptografia não puder ser garantida.
CREATE OR REPLACE FUNCTION public.encrypt_sensitive_text(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_secret_key TEXT;
  v_secret_key_bytes BYTEA;
BEGIN
  IF plain_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Buscar a chave de criptografia no Supabase Vault
  BEGIN
    SELECT decrypted_secret INTO v_secret_key
    FROM vault.decrypted_secrets
    WHERE name = 'nythos_encryption_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault inacessível (extensão não ativada, permissão negada, etc.)
    -- Abortar: não é seguro persistir dados de saúde sem criptografia.
    RAISE EXCEPTION 'SECURITY_FAULT: Não foi possível criptografar o prontuário. Operação abortada por segurança. (Causa: Vault inacessível)'
      USING ERRCODE = 'P0001';
  END;

  -- Chave ausente ou vazia — abortar por segurança
  IF v_secret_key IS NULL OR v_secret_key = '' THEN
    RAISE EXCEPTION 'SECURITY_FAULT: Não foi possível criptografar o prontuário. Operação abortada por segurança. (Causa: nythos_encryption_key não configurada no Vault)'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_secret_key_bytes := decode(v_secret_key, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SECURITY_FAULT: Nao foi possivel criptografar o prontuario. Operacao abortada por seguranca. (Causa: nythos_encryption_key nao e base64 valida)'
      USING ERRCODE = 'P0001';
  END;

  IF octet_length(v_secret_key_bytes) <> 32 THEN
    RAISE EXCEPTION 'SECURITY_FAULT: Nao foi possivel criptografar o prontuario. Operacao abortada por seguranca. (Causa: nythos_encryption_key deve decodificar para 32 bytes)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tentar criptografar; abortar em caso de falha de runtime
  BEGIN
    RETURN 'ENC::' || encode(
      extensions.encrypt(
        convert_to(plain_text, 'UTF8'),
        v_secret_key_bytes,
        'aes'
      ),
      'base64'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Chave inválida, padding incorreto ou erro de runtime — abortar
    RAISE EXCEPTION 'SECURITY_FAULT: Não foi possível criptografar o prontuário. Operação abortada por segurança. (Causa: falha no algoritmo AES — verifique a chave no Vault)'
      USING ERRCODE = 'P0001';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- Função para descriptografar texto sensível usando Supabase Vault
CREATE OR REPLACE FUNCTION public.decrypt_sensitive_text(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_secret_key TEXT;
  v_secret_key_bytes BYTEA;
BEGIN
  -- Nulo ou texto sem prefixo de criptografia → devolve como está
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Texto armazenado como plano (Vault não estava configurado na escrita)
  IF starts_with(encrypted_text, 'PLAIN::') THEN
    RETURN substring(encrypted_text FROM 8);
  END IF;

  -- Texto sem nenhum prefixo reconhecido → devolve como está (dados legados)
  IF NOT starts_with(encrypted_text, 'ENC::') THEN
    RETURN encrypted_text;
  END IF;

  -- Bloqueio para Secretárias (Sigilo de Prontuário)
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'secretary' THEN
    RETURN '[CONTEÚDO PROTEGIDO - ACESSO RESTRITO]';
  END IF;

  -- Buscar a chave de criptografia no Supabase Vault
  BEGIN
    SELECT decrypted_secret INTO v_secret_key
    FROM vault.decrypted_secrets
    WHERE name = 'nythos_encryption_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault inacessível → sinaliza ao frontend sem exceção fatal
    RETURN '[ERRO_VAULT: chave de criptografia indisponível]';
  END;

  -- Chave não encontrada no Vault
  IF v_secret_key IS NULL OR v_secret_key = '' THEN
    RETURN '[ERRO_VAULT: chave de criptografia não configurada]';
  END IF;

  BEGIN
    v_secret_key_bytes := decode(v_secret_key, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RETURN '[ERRO_VAULT: chave de criptografia nao e base64 valida]';
  END;

  IF octet_length(v_secret_key_bytes) <> 32 THEN
    RETURN '[ERRO_VAULT: chave de criptografia deve decodificar para 32 bytes]';
  END IF;

  -- Tentar descriptografar; em caso de falha, sinalizar ao frontend
  BEGIN
    RETURN convert_from(
      extensions.decrypt(
        decode(substring(encrypted_text FROM 6), 'base64'),
        v_secret_key_bytes,
        'aes'
      ),
      'UTF8'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Padding inválido, chave incorreta ou dado corrompido
    RETURN '[ERRO_VAULT: falha ao descriptografar — verifique a chave]';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Legacy compatibility wrappers for older databases that had
-- encrypt/decrypt helpers receiving a frontend-provided secret_key.
-- The secret_key argument is intentionally ignored: clinical crypto now
-- always uses nythos_encryption_key from Supabase Vault.
DROP FUNCTION IF EXISTS public.encrypt_sensitive_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.decrypt_sensitive_text(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_text(plain_text TEXT, secret_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.encrypt_sensitive_text(plain_text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_text(encrypted_text TEXT, secret_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.decrypt_sensitive_text(encrypted_text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- TABELA: profiles (extensão de auth.users)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  crp TEXT,  -- Registro profissional (Conselho Regional de Psicologia)
  phone TEXT,
  avatar_url TEXT,
  clinic_name TEXT,
  session_duration_default INTEGER DEFAULT 50,  -- minutos
  session_price_default DECIMAL(10,2) DEFAULT 150.00,
  push_subscription JSONB,  -- Web Push subscription object
  biometric_credential_id TEXT,  -- WebAuthn credential ID
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  role TEXT DEFAULT 'therapist' CHECK (role IN ('therapist', 'secretary', 'admin')),
  employer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- TABELA: patients (Pacientes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  address TEXT,
  notes_encrypted TEXT,  -- Notas gerais criptografadas
  diagnosis_encrypted TEXT,  -- Diagnóstico criptografado
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  session_price DECIMAL(10,2),  -- Preço customizado (override do default)
  insurance_provider TEXT,
  insurance_number TEXT,
  access_token UUID DEFAULT uuid_generate_v4(),  -- Token para área do paciente
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_user_id ON public.patients(user_id);
CREATE INDEX idx_patients_status ON public.patients(status);
CREATE INDEX idx_patients_access_token ON public.patients(access_token);
CREATE INDEX IF NOT EXISTS idx_patients_auth_user_id ON public.patients(auth_user_id);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant patients"
  ON public.patients FOR SELECT
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = patients.user_id)
  );

CREATE POLICY "Users can insert relevant patients"
  ON public.patients FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = patients.user_id)
  );

CREATE POLICY "Users can update relevant patients"
  ON public.patients FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = patients.user_id)
  );

CREATE POLICY "Therapists can delete own patients"
  ON public.patients FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TABELA: patient_guardians (Responsáveis / Guardiões)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_guardians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  phone TEXT,
  relationship TEXT CHECK (relationship IN ('mother', 'father', 'grandparent', 'other')),
  is_financial_responsible BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guardians_patient_id ON public.patient_guardians(patient_id);

ALTER TABLE public.patient_guardians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists can view own patient_guardians"
  ON public.patient_guardians FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_guardians.patient_id
      AND patients.user_id = auth.uid()
    )
  );

CREATE POLICY "Therapists can insert own patient_guardians"
  ON public.patient_guardians FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_guardians.patient_id
      AND patients.user_id = auth.uid()
    )
  );

CREATE POLICY "Therapists can update own patient_guardians"
  ON public.patient_guardians FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_guardians.patient_id
      AND patients.user_id = auth.uid()
    )
  );

CREATE POLICY "Therapists can delete own patient_guardians"
  ON public.patient_guardians FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_guardians.patient_id
      AND patients.user_id = auth.uid()
    )
  );

-- ============================================================
-- TABELA: sessions (Sessões / Agenda)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'missed', 'cancelled')),
  session_type TEXT DEFAULT 'individual' CHECK (session_type IN ('individual', 'couple', 'group', 'online', 'initial_assessment')),
  session_notes_encrypted TEXT,  -- Notas de evolução criptografadas
  session_price DECIMAL(10,2),  -- Preço desta sessão específica
  location TEXT DEFAULT 'office',
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,  -- iCal RRULE format
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_patient_id ON public.sessions(patient_id);
CREATE INDEX idx_sessions_scheduled_at ON public.sessions(scheduled_at);
CREATE INDEX idx_sessions_status ON public.sessions(status);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant sessions"
  ON public.sessions FOR SELECT
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = sessions.user_id)
  );

CREATE POLICY "Users can insert relevant sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = sessions.user_id)
  );

CREATE POLICY "Users can update relevant sessions"
  ON public.sessions FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = sessions.user_id)
  );

CREATE POLICY "Therapists can delete own sessions"
  ON public.sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TABELA: cash_flow (Fluxo de Caixa)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cash_flow (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'session' CHECK (category IN (
    'session', 'package', 'other_income',
    'rent', 'supplies', 'marketing', 'education', 'software', 'taxes', 'other_expense'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_method TEXT CHECK (payment_method IN ('cash', 'pix', 'credit_card', 'debit_card', 'bank_transfer', 'other')),
  notes TEXT,
  guardian_id UUID REFERENCES public.patient_guardians(id) ON DELETE SET NULL, -- Responsável financeiro
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cash_flow_user_id ON public.cash_flow(user_id);
CREATE INDEX idx_cash_flow_session_id ON public.cash_flow(session_id);
CREATE INDEX idx_cash_flow_type ON public.cash_flow(type);
CREATE INDEX idx_cash_flow_status ON public.cash_flow(status);
CREATE INDEX idx_cash_flow_created_at ON public.cash_flow(created_at);

ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant cash_flow"
  ON public.cash_flow FOR SELECT
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = cash_flow.user_id)
  );

CREATE POLICY "Users can insert relevant cash_flow"
  ON public.cash_flow FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = cash_flow.user_id)
  );

CREATE POLICY "Users can update relevant cash_flow"
  ON public.cash_flow FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND employer_id = cash_flow.user_id)
  );

CREATE POLICY "Therapists can delete own cash_flow"
  ON public.cash_flow FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TABELA: patient_tasks (Tarefas Terapêuticas)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'homework', 'reading', 'exercise', 'reflection', 'behavior_tracking')),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  completed_at TIMESTAMPTZ,
  therapist_notes TEXT,
  patient_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patient_tasks_user_id ON public.patient_tasks(user_id);
CREATE INDEX idx_patient_tasks_patient_id ON public.patient_tasks(patient_id);
CREATE INDEX idx_patient_tasks_status ON public.patient_tasks(status);

ALTER TABLE public.patient_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals can view relevant patient_tasks"
  ON public.patient_tasks FOR SELECT
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

CREATE POLICY "Professionals can insert relevant patient_tasks"
  ON public.patient_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

CREATE POLICY "Professionals can update relevant patient_tasks"
  ON public.patient_tasks FOR UPDATE
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  )
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

CREATE POLICY "Professionals can delete relevant patient_tasks"
  ON public.patient_tasks FOR DELETE
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

-- ============================================================
-- TABELA: emotion_diary (Diário de Emoções — Área do Paciente)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.emotion_diary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  emotion TEXT NOT NULL CHECK (emotion IN (
    'happy', 'sad', 'anxious', 'angry', 'fearful', 'surprised',
    'disgusted', 'calm', 'confused', 'hopeful', 'grateful',
    'lonely', 'frustrated', 'overwhelmed', 'content', 'other'
  )),
  intensity INTEGER NOT NULL CHECK (intensity >= 1 AND intensity <= 10),
  notes TEXT,
  triggers TEXT,  -- O que causou a emoção
  coping_strategy TEXT,  -- Estratégia de enfrentamento usada
  context TEXT CHECK (context IN ('morning', 'afternoon', 'evening', 'night', 'work', 'home', 'social', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emotion_diary_patient_id ON public.emotion_diary(patient_id);
CREATE INDEX idx_emotion_diary_created_at ON public.emotion_diary(created_at);

ALTER TABLE public.emotion_diary ENABLE ROW LEVEL SECURITY;

-- Pacientes podem ver e criar entradas via access_token (gerenciado pela app)
-- Terapeutas podem ver diários de seus pacientes
CREATE POLICY "Therapists can view their patients emotion diary"
  ON public.emotion_diary FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = emotion_diary.patient_id
      AND patients.user_id = auth.uid()
    )
  );

-- Inserção via função RPC (sem auth direto do paciente por enquanto)
CREATE POLICY "Allow insert via service role"
  ON public.emotion_diary FOR INSERT
  TO service_role
  WITH CHECK (true);  -- Controlado via RPC/service role

-- ============================================================
-- TRIGGER: Criar profile automaticamente ao criar usuário
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Pacientes são provisionados via /api/patients/create (auth.admin.createUser)
  -- e têm seu registro em public.patients, não em public.profiles.
  -- Ignorar para evitar poluição na tabela de terapeutas.
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

-- Remover trigger se já existir para evitar duplicação
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: Criar entrada financeira ao marcar sessão como "completed"
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_session_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_patient_name TEXT;
  v_guardian_id UUID;
BEGIN
  -- Só executa quando status muda para 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Determinar preço: sessão > paciente > profile default
    SELECT COALESCE(
      NEW.session_price,
      p.session_price,
      pr.session_price_default
    ), p.full_name
    INTO v_price, v_patient_name
    FROM public.patients p
    JOIN public.profiles pr ON pr.id = NEW.user_id
    WHERE p.id = NEW.patient_id;

    -- Buscar responsável financeiro
    SELECT id INTO v_guardian_id
    FROM public.patient_guardians
    WHERE patient_id = NEW.patient_id
    AND is_financial_responsible = true
    LIMIT 1;

    -- Criar entrada financeira pendente
    INSERT INTO public.cash_flow (user_id, session_id, type, amount, description, category, status, due_date, guardian_id)
    VALUES (
      NEW.user_id,
      NEW.id,
      'income',
      COALESCE(v_price, 150.00),
      'Sessão - ' || COALESCE(v_patient_name, 'Paciente'),
      'session',
      'pending',
      CURRENT_DATE,
      v_guardian_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_session_completed ON public.sessions;

CREATE TRIGGER on_session_completed
  AFTER UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_session_completed();

-- Trigger para INSERT também (caso crie sessão já como completed)
DROP TRIGGER IF EXISTS on_session_created_completed ON public.sessions;

CREATE TRIGGER on_session_created_completed
  AFTER INSERT ON public.sessions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.handle_session_completed();

-- ============================================================
-- FUNÇÃO: Atualizar updated_at automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de updated_at em todas as tabelas
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_cash_flow_updated_at
  BEFORE UPDATE ON public.cash_flow
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_patient_tasks_updated_at
  BEFORE UPDATE ON public.patient_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_patient_guardians_updated_at
  BEFORE UPDATE ON public.patient_guardians
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- VIEWS: Visões úteis para o Dashboard
-- ============================================================

-- View de resumo mensal financeiro
CREATE OR REPLACE VIEW public.monthly_financial_summary AS
SELECT
  user_id,
  DATE_TRUNC('month', created_at) AS month,
  SUM(CASE WHEN type = 'income' AND status = 'confirmed' THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN type = 'expense' AND status = 'confirmed' THEN amount ELSE 0 END) AS total_expenses,
  SUM(CASE WHEN type = 'income' AND status = 'confirmed' THEN amount ELSE 0 END) -
  SUM(CASE WHEN type = 'expense' AND status = 'confirmed' THEN amount ELSE 0 END) AS net_profit,
  COUNT(CASE WHEN type = 'income' AND status = 'pending' THEN 1 END) AS pending_payments
FROM public.cash_flow
GROUP BY user_id, DATE_TRUNC('month', created_at);

-- ============================================================
-- TABELA: audit_logs (Logs de Auditoria)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Ninguém via API pública pode inserir, alterar ou deletar logs.
-- Apenas service_role ou lógica de admin futura terá acesso de leitura.
CREATE POLICY "Audit logs are read-only for system"
  ON public.audit_logs FOR SELECT
  USING (false); -- Bloqueia SELECT via API pública por padrão.

-- Função trigger para Auditoria
CREATE OR REPLACE FUNCTION public.handle_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger nas tabelas solicitadas
DROP TRIGGER IF EXISTS audit_patients ON public.patients;
CREATE TRIGGER audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

DROP TRIGGER IF EXISTS audit_sessions ON public.sessions;
CREATE TRIGGER audit_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

DROP TRIGGER IF EXISTS audit_patient_tasks ON public.patient_tasks;
CREATE TRIGGER audit_patient_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

-- ============================================================
-- TABELAS CLINICAS OPCIONAIS: prontuario ampliado
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  protocol_name TEXT NOT NULL,
  score TEXT,
  status TEXT DEFAULT 'in_progress',
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_evaluations_user_id
  ON public.patient_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_patient_evaluations_patient_id
  ON public.patient_evaluations(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_evaluations_evaluation_date
  ON public.patient_evaluations(evaluation_date);

DROP TRIGGER IF EXISTS update_patient_evaluations_updated_at ON public.patient_evaluations;
CREATE TRIGGER update_patient_evaluations_updated_at
  BEFORE UPDATE ON public.patient_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant patient_evaluations" ON public.patient_evaluations;
CREATE POLICY "Professionals can manage relevant patient_evaluations"
  ON public.patient_evaluations FOR ALL
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_evaluations.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_evaluations.patient_id
        AND patients.user_id = patient_evaluations.user_id
    )
  )
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_evaluations.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = patient_evaluations.patient_id
        AND patients.user_id = patient_evaluations.user_id
    )
  );

CREATE TABLE IF NOT EXISTS public.abc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  occurrence_date DATE NOT NULL DEFAULT CURRENT_DATE,
  antecedent TEXT NOT NULL,
  behavior TEXT NOT NULL,
  consequence TEXT NOT NULL,
  intensity INTEGER,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abc_records_user_id
  ON public.abc_records(user_id);
CREATE INDEX IF NOT EXISTS idx_abc_records_patient_id
  ON public.abc_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_abc_records_session_id
  ON public.abc_records(session_id);
CREATE INDEX IF NOT EXISTS idx_abc_records_occurrence_date
  ON public.abc_records(occurrence_date);

DROP TRIGGER IF EXISTS update_abc_records_updated_at ON public.abc_records;
CREATE TRIGGER update_abc_records_updated_at
  BEFORE UPDATE ON public.abc_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.abc_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant abc_records" ON public.abc_records;
CREATE POLICY "Professionals can manage relevant abc_records"
  ON public.abc_records FOR ALL
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = abc_records.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = abc_records.patient_id
        AND patients.user_id = abc_records.user_id
    )
  )
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = abc_records.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = abc_records.patient_id
        AND patients.user_id = abc_records.user_id
    )
  );

CREATE TABLE IF NOT EXISTS public.care_network (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_network_user_id
  ON public.care_network(user_id);
CREATE INDEX IF NOT EXISTS idx_care_network_patient_id
  ON public.care_network(patient_id);

ALTER TABLE public.care_network ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant care_network" ON public.care_network;
CREATE POLICY "Professionals can manage relevant care_network"
  ON public.care_network FOR ALL
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = care_network.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = care_network.patient_id
        AND patients.user_id = care_network.user_id
    )
  )
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = care_network.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = care_network.patient_id
        AND patients.user_id = care_network.user_id
    )
  );

CREATE TABLE IF NOT EXISTS public.patient_neuro_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  support_level TEXT,
  sensory_profile JSONB DEFAULT '{}'::jsonb,
  diagnosis_details TEXT,
  protocols_used TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_neuro_profiles_patient_id
  ON public.patient_neuro_profiles(patient_id);

DROP TRIGGER IF EXISTS update_patient_neuro_profiles_updated_at ON public.patient_neuro_profiles;
CREATE TRIGGER update_patient_neuro_profiles_updated_at
  BEFORE UPDATE ON public.patient_neuro_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_neuro_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant patient_neuro_profiles" ON public.patient_neuro_profiles;
CREATE POLICY "Professionals can manage relevant patient_neuro_profiles"
  ON public.patient_neuro_profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_neuro_profiles.patient_id
        AND (
          patients.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = patients.user_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_neuro_profiles.patient_id
        AND (
          patients.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = patients.user_id
          )
        )
    )
  );

-- ============================================================
-- ENFORCEMENT: Criptografia de dados clinicos sensiveis
-- Vault prerequisite: run supabase/seed_vault.sql before clinical writes.
-- Public anamnesis submission intentionally fails closed if the Vault key
-- is missing.
-- ============================================================

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_text(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_secret_key TEXT;
  v_secret_key_bytes BYTEA;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Block non-clinical team members before plaintext legacy fallback.
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'secretary' THEN
    RETURN '[CONTEUDO PROTEGIDO - ACESSO RESTRITO]';
  END IF;

  IF starts_with(encrypted_text, 'PLAIN::') THEN
    RETURN substring(encrypted_text FROM 8);
  END IF;

  IF NOT starts_with(encrypted_text, 'ENC::') THEN
    RETURN encrypted_text;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret_key
    FROM vault.decrypted_secrets
    WHERE name = 'nythos_encryption_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN '[ERRO_VAULT: chave de criptografia indisponivel]';
  END;

  IF v_secret_key IS NULL OR v_secret_key = '' THEN
    RETURN '[ERRO_VAULT: chave de criptografia nao configurada]';
  END IF;

  BEGIN
    v_secret_key_bytes := decode(v_secret_key, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RETURN '[ERRO_VAULT: chave de criptografia nao e base64 valida]';
  END;

  IF octet_length(v_secret_key_bytes) <> 32 THEN
    RETURN '[ERRO_VAULT: chave de criptografia deve decodificar para 32 bytes]';
  END IF;

  BEGIN
    RETURN convert_from(
      extensions.decrypt(
        decode(substring(encrypted_text FROM 6), 'base64'),
        v_secret_key_bytes,
        'aes'
      ),
      'UTF8'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN '[ERRO_VAULT: falha ao descriptografar - verifique a chave]';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_db_encrypted_text(value TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN value IS NOT NULL
    AND value ~ '^ENC::[A-Za-z0-9+/]+={0,2}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_text_if_needed(value TEXT)
RETURNS TEXT AS $$
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.is_db_encrypted_text(value) THEN
    RETURN value;
  END IF;

  RETURN public.encrypt_sensitive_text(value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_jsonb_if_needed(value JSONB)
RETURNS JSONB AS $$
DECLARE
  v_text TEXT;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  IF value = '{}'::jsonb OR value = '[]'::jsonb THEN
    RETURN value;
  END IF;

  IF jsonb_typeof(value) = 'string' THEN
    v_text := value #>> '{}';
    IF public.is_db_encrypted_text(v_text) THEN
      RETURN value;
    END IF;
  END IF;

  RETURN to_jsonb(public.encrypt_sensitive_text(value::TEXT));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_jsonb_if_needed(value JSONB)
RETURNS JSONB AS $$
DECLARE
  v_text TEXT;
  v_plain TEXT;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'secretary' THEN
    RETURN to_jsonb('[CONTEUDO PROTEGIDO - ACESSO RESTRITO]'::TEXT);
  END IF;

  IF jsonb_typeof(value) <> 'string' THEN
    RETURN value;
  END IF;

  v_text := value #>> '{}';

  IF NOT public.is_db_encrypted_text(v_text) AND NOT starts_with(v_text, 'PLAIN::') THEN
    RETURN value;
  END IF;

  v_plain := public.decrypt_sensitive_text(v_text);

  BEGIN
    RETURN v_plain::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN to_jsonb(v_plain);
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.current_professional_can_read_patient(p_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles pr
          WHERE pr.id = auth.uid()
            AND pr.employer_id = p.user_id
        )
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.current_professional_can_write_clinical_patient(p_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.patients p
    LEFT JOIN public.profiles caller ON caller.id = auth.uid()
    WHERE p.id = p_patient_id
      AND (
        p.user_id = auth.uid()
        OR (
          caller.employer_id = p.user_id
          AND COALESCE(caller.role, '') <> 'secretary'
        )
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.encrypt_patients_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
    NEW.diagnosis_encrypted := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes_encrypted IS DISTINCT FROM OLD.notes_encrypted THEN
      NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
    END IF;

    IF NEW.diagnosis_encrypted IS DISTINCT FROM OLD.diagnosis_encrypted THEN
      NEW.diagnosis_encrypted := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patients_clinical_fields ON public.patients;
CREATE TRIGGER encrypt_patients_clinical_fields
  BEFORE INSERT OR UPDATE OF notes_encrypted, diagnosis_encrypted ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patients_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_sessions_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.session_notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.session_notes_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.session_notes_encrypted IS DISTINCT FROM OLD.session_notes_encrypted THEN
      NEW.session_notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.session_notes_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_sessions_clinical_fields ON public.sessions;
CREATE TRIGGER encrypt_sessions_clinical_fields
  BEFORE INSERT OR UPDATE OF session_notes_encrypted ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_sessions_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_evaluations_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.score := public.encrypt_sensitive_text_if_needed(NEW.score);
    NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.score IS DISTINCT FROM OLD.score THEN
      NEW.score := public.encrypt_sensitive_text_if_needed(NEW.score);
    END IF;

    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_evaluations_clinical_fields ON public.patient_evaluations;
CREATE TRIGGER encrypt_patient_evaluations_clinical_fields
  BEFORE INSERT OR UPDATE OF score, notes ON public.patient_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_evaluations_clinical_fields();

COMMENT ON COLUMN public.patient_evaluations.score IS
  'Clinical score/result text is encrypted. TODO: if future SQL calculations, ordering, or charts need numeric scores, split into score_value (non-sensitive) and score_notes (sensitive encrypted).';

CREATE OR REPLACE FUNCTION public.encrypt_abc_records_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.antecedent := public.encrypt_sensitive_text_if_needed(NEW.antecedent);
    NEW.behavior := public.encrypt_sensitive_text_if_needed(NEW.behavior);
    NEW.consequence := public.encrypt_sensitive_text_if_needed(NEW.consequence);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.antecedent IS DISTINCT FROM OLD.antecedent THEN
      NEW.antecedent := public.encrypt_sensitive_text_if_needed(NEW.antecedent);
    END IF;

    IF NEW.behavior IS DISTINCT FROM OLD.behavior THEN
      NEW.behavior := public.encrypt_sensitive_text_if_needed(NEW.behavior);
    END IF;

    IF NEW.consequence IS DISTINCT FROM OLD.consequence THEN
      NEW.consequence := public.encrypt_sensitive_text_if_needed(NEW.consequence);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_abc_records_clinical_fields ON public.abc_records;
CREATE TRIGGER encrypt_abc_records_clinical_fields
  BEFORE INSERT OR UPDATE OF antecedent, behavior, consequence ON public.abc_records
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_abc_records_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_neuro_profiles_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sensory_profile := public.encrypt_sensitive_jsonb_if_needed(NEW.sensory_profile);
    NEW.diagnosis_details := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_details);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.sensory_profile IS DISTINCT FROM OLD.sensory_profile THEN
      NEW.sensory_profile := public.encrypt_sensitive_jsonb_if_needed(NEW.sensory_profile);
    END IF;

    IF NEW.diagnosis_details IS DISTINCT FROM OLD.diagnosis_details THEN
      NEW.diagnosis_details := public.encrypt_sensitive_text_if_needed(NEW.diagnosis_details);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_neuro_profiles_clinical_fields ON public.patient_neuro_profiles;
CREATE TRIGGER encrypt_patient_neuro_profiles_clinical_fields
  BEFORE INSERT OR UPDATE OF sensory_profile, diagnosis_details ON public.patient_neuro_profiles
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_neuro_profiles_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_anamnesis_responses_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.responses := public.encrypt_sensitive_jsonb_if_needed(NEW.responses);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.responses IS DISTINCT FROM OLD.responses THEN
      NEW.responses := public.encrypt_sensitive_jsonb_if_needed(NEW.responses);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_anamnesis_responses_clinical_fields ON public.anamnesis_responses;
CREATE TRIGGER encrypt_anamnesis_responses_clinical_fields
  BEFORE INSERT OR UPDATE OF responses ON public.anamnesis_responses
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_anamnesis_responses_clinical_fields();

CREATE OR REPLACE FUNCTION public.get_patient_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(p)
    || jsonb_build_object(
      'notes_encrypted', public.decrypt_sensitive_text(p.notes_encrypted),
      'diagnosis_encrypted', public.decrypt_sensitive_text(p.diagnosis_encrypted)
    )
  INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id;

  RETURN v_patient;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_sessions_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sessions JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(s)
        || jsonb_build_object(
          'session_notes_encrypted',
          public.decrypt_sensitive_text(s.session_notes_encrypted)
        )
      ORDER BY s.scheduled_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM public.sessions s
  WHERE s.patient_id = p_patient_id;

  RETURN v_sessions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_evaluations_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_evaluations JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pe)
        || jsonb_build_object(
          'score', public.decrypt_sensitive_text(pe.score),
          'notes', public.decrypt_sensitive_text(pe.notes)
        )
      ORDER BY pe.evaluation_date DESC, pe.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_evaluations
  FROM public.patient_evaluations pe
  WHERE pe.patient_id = p_patient_id;

  RETURN v_evaluations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_abc_records_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_records JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ar)
        || jsonb_build_object(
          'antecedent', public.decrypt_sensitive_text(ar.antecedent),
          'behavior', public.decrypt_sensitive_text(ar.behavior),
          'consequence', public.decrypt_sensitive_text(ar.consequence)
        )
      ORDER BY ar.occurrence_date DESC, ar.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_records
  FROM public.abc_records ar
  WHERE ar.patient_id = p_patient_id;

  RETURN v_records;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_neuro_profile_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_profile JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(pnp)
    || jsonb_build_object(
      'sensory_profile', public.decrypt_sensitive_jsonb_if_needed(pnp.sensory_profile),
      'diagnosis_details', public.decrypt_sensitive_text(pnp.diagnosis_details)
    )
  INTO v_profile
  FROM public.patient_neuro_profiles pnp
  WHERE pnp.patient_id = p_patient_id
  ORDER BY pnp.created_at DESC
  LIMIT 1;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_anamnesis_responses_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_responses JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ar)
        || jsonb_build_object(
          'responses', public.decrypt_sensitive_jsonb_if_needed(ar.responses),
          'anamnesis_templates', to_jsonb(at)
        )
      ORDER BY ar.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_responses
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.patient_id = p_patient_id;

  RETURN v_responses;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.append_patient_clinical_note(
  p_patient_id UUID,
  p_note TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_existing TEXT;
  v_updated TEXT;
  v_patient JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'empty_note' USING ERRCODE = '22023';
  END IF;

  SELECT public.decrypt_sensitive_text(p.notes_encrypted)
  INTO v_existing
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF starts_with(COALESCE(v_existing, ''), '[ERRO_VAULT:') THEN
    RAISE EXCEPTION 'SECURITY_FAULT: existing note could not be decrypted; aborting append'
      USING ERRCODE = 'P0001';
  END IF;

  v_updated :=
    '[' || to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY, HH24:MI:SS') || ']' ||
    E'\n' || btrim(p_note) ||
    CASE
      WHEN COALESCE(v_existing, '') = '' THEN ''
      ELSE E'\n\n---\n\n' || v_existing
    END;

  UPDATE public.patients
  SET notes_encrypted = v_updated
  WHERE id = p_patient_id;

  SELECT public.get_patient_decrypted(p_patient_id) INTO v_patient;
  RETURN v_patient;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.update_session_evolution_secure(
  p_session_id UUID,
  p_notes TEXT,
  p_mood_happy_sad INTEGER,
  p_mood_anxious_calm INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
  v_session JSONB;
BEGIN
  SELECT patient_id INTO v_patient_id
  FROM public.sessions
  WHERE id = p_session_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sessions
  SET
    status = 'completed',
    session_notes_encrypted = jsonb_build_object(
      'notes', COALESCE(p_notes, ''),
      'mood_happy_sad', p_mood_happy_sad,
      'mood_anxious_calm', p_mood_anxious_calm,
      'updated_at', NOW()
    )::TEXT
  WHERE id = p_session_id;

  SELECT to_jsonb(s)
    || jsonb_build_object(
      'session_notes_encrypted',
      public.decrypt_sensitive_text(s.session_notes_encrypted)
    )
  INTO v_session
  FROM public.sessions s
  WHERE s.id = p_session_id;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_evaluation_secure(
  p_patient_id UUID,
  p_protocol_name TEXT,
  p_evaluation_date DATE,
  p_score TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'completed',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_evaluation_id UUID;
  v_evaluation JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = p_patient_id;

  INSERT INTO public.patient_evaluations (
    user_id,
    patient_id,
    protocol_name,
    evaluation_date,
    score,
    status,
    notes
  )
  VALUES (
    v_owner_id,
    p_patient_id,
    p_protocol_name,
    COALESCE(p_evaluation_date, CURRENT_DATE),
    p_score,
    COALESCE(p_status, 'completed'),
    p_notes
  )
  RETURNING id INTO v_evaluation_id;

  SELECT to_jsonb(pe)
    || jsonb_build_object(
      'score', public.decrypt_sensitive_text(pe.score),
      'notes', public.decrypt_sensitive_text(pe.notes)
    )
  INTO v_evaluation
  FROM public.patient_evaluations pe
  WHERE pe.id = v_evaluation_id;

  RETURN v_evaluation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_abc_record_secure(
  p_patient_id UUID,
  p_occurrence_date DATE,
  p_antecedent TEXT,
  p_behavior TEXT,
  p_consequence TEXT,
  p_intensity INTEGER DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT NULL,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_record_id UUID;
  v_record JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = p_patient_id;

  INSERT INTO public.abc_records (
    user_id,
    patient_id,
    session_id,
    occurrence_date,
    antecedent,
    behavior,
    consequence,
    intensity,
    duration_minutes
  )
  VALUES (
    v_owner_id,
    p_patient_id,
    p_session_id,
    COALESCE(p_occurrence_date, CURRENT_DATE),
    p_antecedent,
    p_behavior,
    p_consequence,
    p_intensity,
    p_duration_minutes
  )
  RETURNING id INTO v_record_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object(
      'antecedent', public.decrypt_sensitive_text(ar.antecedent),
      'behavior', public.decrypt_sensitive_text(ar.behavior),
      'consequence', public.decrypt_sensitive_text(ar.consequence)
    )
  INTO v_record
  FROM public.abc_records ar
  WHERE ar.id = v_record_id;

  RETURN v_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_manual_anamnesis_response_secure(
  p_patient_id UUID,
  p_template_id UUID,
  p_responses JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_response_id UUID;
  v_response JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'object' THEN
    RAISE EXCEPTION 'invalid_responses' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.anamnesis_responses (
    template_id,
    patient_id,
    status,
    responses,
    completed_at
  )
  VALUES (
    p_template_id,
    p_patient_id,
    'completed',
    p_responses,
    NOW()
  )
  RETURNING id INTO v_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object(
      'responses', public.decrypt_sensitive_jsonb_if_needed(ar.responses)
    )
  INTO v_response
  FROM public.anamnesis_responses ar
  WHERE ar.id = v_response_id;

  RETURN v_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_anamnesis_request_secure(
  p_patient_id UUID,
  p_template_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_response_id UUID;
  v_response JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.patients
  WHERE id = p_patient_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.anamnesis_templates at
    WHERE at.id = p_template_id
      AND at.user_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'template_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.anamnesis_responses (
    template_id,
    patient_id,
    status,
    responses
  )
  VALUES (
    p_template_id,
    p_patient_id,
    'pending',
    '{}'::jsonb
  )
  RETURNING id INTO v_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object('anamnesis_templates', to_jsonb(at))
  INTO v_response
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.id = v_response_id;

  RETURN v_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_sessions_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_evaluations_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_abc_records_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_neuro_profile_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_anamnesis_responses_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_patient_clinical_note(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_session_evolution_secure(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_evaluation_secure(UUID, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_abc_record_secure(UUID, DATE, TEXT, TEXT, TEXT, INTEGER, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_anamnesis_response_secure(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_anamnesis_request_secure(UUID, UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_db_encrypted_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text_if_needed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_jsonb_if_needed(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_jsonb_if_needed(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_professional_can_read_patient(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_professional_can_write_clinical_patient(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patients_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sessions_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_evaluations_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_abc_records_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_neuro_profiles_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_anamnesis_responses_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_db_encrypted_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_text_if_needed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_jsonb_if_needed(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_jsonb_if_needed(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_professional_can_read_patient(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_professional_can_write_clinical_patient(UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_patient_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_sessions_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_evaluations_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_abc_records_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_neuro_profile_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_anamnesis_responses_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_patient_clinical_note(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_evolution_secure(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_evaluation_secure(UUID, TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_abc_record_secure(UUID, DATE, TEXT, TEXT, TEXT, INTEGER, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_anamnesis_response_secure(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_anamnesis_request_secure(UUID, UUID) TO authenticated;

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
