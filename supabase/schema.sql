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
CREATE OR REPLACE FUNCTION encrypt_sensitive_text(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_secret_key TEXT;
BEGIN
  IF plain_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Buscar a chave de criptografia no Supabase Vault
  BEGIN
    SELECT secret INTO v_secret_key
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

  -- Tentar criptografar; abortar em caso de falha de runtime
  BEGIN
    RETURN 'ENC::' || encode(
      encrypt(
        convert_to(plain_text, 'UTF8'),
        convert_to(v_secret_key, 'UTF8'),
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
CREATE OR REPLACE FUNCTION decrypt_sensitive_text(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_secret_key TEXT;
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
    SELECT secret INTO v_secret_key
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

  -- Tentar descriptografar; em caso de falha, sinalizar ao frontend
  BEGIN
    RETURN convert_from(
      decrypt(
        decode(substring(encrypted_text FROM 6), 'base64'),
        convert_to(v_secret_key, 'UTF8'),
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_user_id ON public.patients(user_id);
CREATE INDEX idx_patients_status ON public.patients(status);
CREATE INDEX idx_patients_access_token ON public.patients(access_token);

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

CREATE POLICY "Therapists can view own patient_tasks"
  ON public.patient_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can insert own patient_tasks"
  ON public.patient_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Therapists can update own patient_tasks"
  ON public.patient_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can delete own patient_tasks"
  ON public.patient_tasks FOR DELETE
  USING (auth.uid() = user_id);

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
-- FIM DO SCHEMA
-- ============================================================
