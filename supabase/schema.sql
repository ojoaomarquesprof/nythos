-- ============================================================
-- NYTHOS — Schema SQL Completo para Supabase
-- SaaS para Psicólogos: Gestão Clínica e Financeira
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FUNÇÕES AUXILIARES: Simulação de Criptografia (Dados Sensíveis)
-- ============================================================

-- Função para "criptografar" texto sensível (encode base64 + prefixo)
CREATE OR REPLACE FUNCTION encrypt_sensitive_text(plain_text TEXT, secret_key TEXT DEFAULT 'nythos_health_key_2024')
RETURNS TEXT AS $$
BEGIN
  IF plain_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN 'ENC::' || encode(
    encrypt(
      convert_to(plain_text, 'UTF8'),
      convert_to(secret_key, 'UTF8'),
      'aes'
    ),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para "descriptografar" texto sensível
CREATE OR REPLACE FUNCTION decrypt_sensitive_text(encrypted_text TEXT, secret_key TEXT DEFAULT 'nythos_health_key_2024')
RETURNS TEXT AS $$
BEGIN
  IF encrypted_text IS NULL OR NOT starts_with(encrypted_text, 'ENC::') THEN
    RETURN encrypted_text;
  END IF;
  RETURN convert_from(
    decrypt(
      decode(substring(encrypted_text from 6), 'base64'),
      convert_to(secret_key, 'UTF8'),
      'aes'
    ),
    'UTF8'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE POLICY "Therapists can view own patients"
  ON public.patients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can insert own patients"
  ON public.patients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Therapists can update own patients"
  ON public.patients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can delete own patients"
  ON public.patients FOR DELETE
  USING (auth.uid() = user_id);

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

CREATE POLICY "Therapists can view own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can insert own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Therapists can update own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id);

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cash_flow_user_id ON public.cash_flow(user_id);
CREATE INDEX idx_cash_flow_session_id ON public.cash_flow(session_id);
CREATE INDEX idx_cash_flow_type ON public.cash_flow(type);
CREATE INDEX idx_cash_flow_status ON public.cash_flow(status);
CREATE INDEX idx_cash_flow_created_at ON public.cash_flow(created_at);

ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists can view own cash_flow"
  ON public.cash_flow FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can insert own cash_flow"
  ON public.cash_flow FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Therapists can update own cash_flow"
  ON public.cash_flow FOR UPDATE
  USING (auth.uid() = user_id);

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
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
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

    -- Criar entrada financeira pendente
    INSERT INTO public.cash_flow (user_id, session_id, type, amount, description, category, status, due_date)
    VALUES (
      NEW.user_id,
      NEW.id,
      'income',
      COALESCE(v_price, 150.00),
      'Sessão - ' || COALESCE(v_patient_name, 'Paciente'),
      'session',
      'pending',
      CURRENT_DATE
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
-- FIM DO SCHEMA
-- ============================================================
