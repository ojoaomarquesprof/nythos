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
  google_access_token TEXT DEFAULT NULL,
  google_refresh_token TEXT DEFAULT NULL,
  google_token_expiry TIMESTAMPTZ DEFAULT NULL,
  google_calendar_id TEXT DEFAULT 'primary',
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

COMMENT ON COLUMN public.profiles.google_access_token IS
  'Encrypted Google OAuth access token. Decrypt only server-side immediately before Google API calls.';
COMMENT ON COLUMN public.profiles.google_refresh_token IS
  'Encrypted Google OAuth refresh token. Decrypt only server-side immediately before token refresh.';
COMMENT ON COLUMN public.profiles.google_token_expiry IS
  'Timestamp when the current Google access token expires. Not encrypted.';
COMMENT ON COLUMN public.profiles.google_calendar_id IS
  'Google Calendar ID used for sync. Not sensitive; defaults to primary.';

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
-- TABELA: session_packages (Pacotes de Sessões)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.session_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  guardian_id UUID REFERENCES public.patient_guardians(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  unit_amount NUMERIC(10,2) NOT NULL CHECK (unit_amount >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial', 'cancelled')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE,
  allow_use_before_payment BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT session_packages_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT session_packages_valid_dates CHECK (expires_at IS NULL OR expires_at >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_session_packages_user_id ON public.session_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_session_packages_patient_id ON public.session_packages(patient_id);
CREATE INDEX IF NOT EXISTS idx_session_packages_status ON public.session_packages(status);
CREATE INDEX IF NOT EXISTS idx_session_packages_payment_status ON public.session_packages(payment_status);
CREATE INDEX IF NOT EXISTS idx_session_packages_expires_at ON public.session_packages(expires_at);

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant session_packages"
  ON public.session_packages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = session_packages.user_id
    )
  );

CREATE POLICY "Users can insert relevant session_packages"
  ON public.session_packages FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = session_packages.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = session_packages.patient_id
        AND patients.user_id = session_packages.user_id
    )
    AND (
      session_packages.guardian_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.patient_guardians
        WHERE patient_guardians.id = session_packages.guardian_id
          AND patient_guardians.patient_id = session_packages.patient_id
      )
    )
  );

CREATE POLICY "Users can update relevant session_packages"
  ON public.session_packages FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = session_packages.user_id
    )
  )
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = session_packages.user_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.patients
      WHERE patients.id = session_packages.patient_id
        AND patients.user_id = session_packages.user_id
    )
    AND (
      session_packages.guardian_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.patient_guardians
        WHERE patient_guardians.id = session_packages.guardian_id
          AND patient_guardians.patient_id = session_packages.patient_id
      )
    )
  );

CREATE POLICY "Therapists can delete own session_packages"
  ON public.session_packages FOR DELETE
  TO authenticated
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
  completed_at TIMESTAMPTZ,
  session_type TEXT DEFAULT 'individual' CHECK (session_type IN ('individual', 'couple', 'group', 'online', 'initial_assessment')),
  session_notes_encrypted TEXT,  -- Notas de evolução criptografadas
  session_price DECIMAL(10,2),  -- Preço desta sessão específica
  location TEXT DEFAULT 'office',
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,  -- iCal RRULE format
  reminder_sent BOOLEAN DEFAULT FALSE,
  billing_mode TEXT NOT NULL DEFAULT 'single' CHECK (billing_mode IN ('single', 'free', 'package')),
  package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sessions_package_billing_check CHECK (
    (billing_mode = 'package' AND package_id IS NOT NULL)
    OR (billing_mode <> 'package' AND package_id IS NULL)
  )
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_patient_id ON public.sessions(patient_id);
CREATE INDEX idx_sessions_scheduled_at ON public.sessions(scheduled_at);
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_billing_mode ON public.sessions(billing_mode);
CREATE INDEX IF NOT EXISTS idx_sessions_package_id ON public.sessions(package_id);

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
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT cash_flow_package_billing_check CHECK (
    package_id IS NULL
    OR (
      type = 'income'
      AND category = 'package'
      AND session_id IS NULL
      AND patient_id IS NOT NULL
    )
  )
);

CREATE INDEX idx_cash_flow_user_id ON public.cash_flow(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_patient_id ON public.cash_flow(patient_id);
CREATE INDEX idx_cash_flow_session_id ON public.cash_flow(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_package_id ON public.cash_flow(package_id);
CREATE INDEX idx_cash_flow_type ON public.cash_flow(type);
CREATE INDEX idx_cash_flow_status ON public.cash_flow(status);
CREATE INDEX idx_cash_flow_created_at ON public.cash_flow(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_session_id_uidx
  ON public.cash_flow(session_id)
  WHERE session_id IS NOT NULL
    AND status <> 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_package_id_uidx ON public.cash_flow(package_id)
  WHERE package_id IS NOT NULL AND category = 'package' AND type = 'income';

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
-- TABELA: session_package_usages (Ledger de Consumo de Pacotes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.session_package_usages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.session_packages(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed', 'kept')),
  usage_type TEXT NOT NULL DEFAULT 'completed_session' CHECK (usage_type IN ('completed_session', 'no_show', 'manual_adjustment')),
  used_at TIMESTAMPTZ DEFAULT NOW(),
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_package_usages_package_id ON public.session_package_usages(package_id);
CREATE INDEX IF NOT EXISTS idx_session_package_usages_status ON public.session_package_usages(status);
CREATE INDEX IF NOT EXISTS idx_session_package_usages_used_at ON public.session_package_usages(used_at);
CREATE UNIQUE INDEX IF NOT EXISTS session_package_usages_active_session_id_uidx
  ON public.session_package_usages(session_id)
  WHERE session_id IS NOT NULL
    AND status = 'active';

ALTER TABLE public.session_package_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant session_package_usages"
  ON public.session_package_usages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_packages sp
      WHERE sp.id = session_package_usages.package_id
        AND (
          auth.uid() = sp.user_id
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = sp.user_id
          )
        )
    )
  );

CREATE POLICY "Users can insert relevant session_package_usages"
  ON public.session_package_usages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.session_packages sp
      WHERE sp.id = session_package_usages.package_id
        AND (
          auth.uid() = sp.user_id
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = sp.user_id
          )
        )
        AND (
          session_package_usages.session_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.sessions s
            WHERE s.id = session_package_usages.session_id
              AND s.user_id = sp.user_id
              AND s.patient_id = sp.patient_id
              AND s.package_id = sp.id
              AND s.billing_mode = 'package'
          )
        )
    )
  );

CREATE POLICY "Users can update relevant session_package_usages"
  ON public.session_package_usages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_packages sp
      WHERE sp.id = session_package_usages.package_id
        AND (
          auth.uid() = sp.user_id
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = sp.user_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.session_packages sp
      WHERE sp.id = session_package_usages.package_id
        AND (
          auth.uid() = sp.user_id
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = sp.user_id
          )
        )
        AND (
          session_package_usages.session_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.sessions s
            WHERE s.id = session_package_usages.session_id
              AND s.user_id = sp.user_id
              AND s.patient_id = sp.patient_id
              AND s.package_id = sp.id
              AND s.billing_mode = 'package'
          )
        )
    )
  );

CREATE POLICY "Therapists can delete own session_package_usages"
  ON public.session_package_usages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_packages sp
      WHERE sp.id = session_package_usages.package_id
        AND auth.uid() = sp.user_id
    )
  );

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

CREATE OR REPLACE FUNCTION public.validate_session_package_link()
RETURNS TRIGGER AS $$
DECLARE
  v_package_user_id UUID;
  v_package_patient_id UUID;
BEGIN
  IF NEW.package_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id, patient_id
  INTO v_package_user_id, v_package_patient_id
  FROM public.session_packages
  WHERE id = NEW.package_id;

  IF v_package_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_package_user_id <> NEW.user_id OR v_package_patient_id <> NEW.patient_id THEN
    RAISE EXCEPTION 'invalid_session_package_link' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS validate_session_package_link ON public.sessions;
CREATE TRIGGER validate_session_package_link
  BEFORE INSERT OR UPDATE OF user_id, patient_id, package_id, billing_mode ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_session_package_link();

CREATE OR REPLACE FUNCTION public.validate_session_package_usage()
RETURNS TRIGGER AS $$
DECLARE
  v_package_user_id UUID;
  v_package_patient_id UUID;
  v_session_user_id UUID;
  v_session_patient_id UUID;
  v_session_package_id UUID;
  v_session_billing_mode TEXT;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id, patient_id
  INTO v_package_user_id, v_package_patient_id
  FROM public.session_packages
  WHERE id = NEW.package_id;

  SELECT user_id, patient_id, package_id, billing_mode
  INTO v_session_user_id, v_session_patient_id, v_session_package_id, v_session_billing_mode
  FROM public.sessions
  WHERE id = NEW.session_id;

  IF v_session_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_session_user_id <> v_package_user_id
    OR v_session_patient_id <> v_package_patient_id
    OR v_session_package_id IS DISTINCT FROM NEW.package_id
    OR v_session_billing_mode <> 'package'
  THEN
    RAISE EXCEPTION 'invalid_session_package_usage' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS validate_session_package_usage ON public.session_package_usages;
CREATE TRIGGER validate_session_package_usage
  BEFORE INSERT OR UPDATE OF package_id, session_id ON public.session_package_usages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_session_package_usage();

CREATE OR REPLACE FUNCTION public.set_session_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS set_session_completed_at ON public.sessions;
CREATE TRIGGER set_session_completed_at
  BEFORE INSERT OR UPDATE OF status, completed_at ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_session_completed_at();

CREATE OR REPLACE FUNCTION public.handle_session_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_patient_name TEXT;
  v_guardian_id UUID;
  v_billing_mode TEXT;
  v_package public.session_packages%ROWTYPE;
  v_used_sessions INTEGER := 0;
  v_scheduled_date DATE;
  v_actor_id UUID := auth.uid();
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' THEN
      RETURN NEW;
    END IF;
  END IF;

  v_billing_mode := COALESCE(
    NULLIF(NEW.billing_mode, ''),
    CASE WHEN NEW.package_id IS NOT NULL THEN 'package' ELSE 'single' END
  );

  IF v_billing_mode = 'package' THEN
    IF NEW.package_id IS NULL THEN
      RAISE EXCEPTION 'package_session_missing_package' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.session_package_usages spu
      WHERE spu.session_id = NEW.id
        AND spu.status = 'active'
    ) THEN
      RETURN NEW;
    END IF;

    SELECT sp.*
    INTO v_package
    FROM public.session_packages sp
    WHERE sp.id = NEW.package_id
    FOR UPDATE;

    IF v_package.id IS NULL THEN
      RAISE EXCEPTION 'package_not_found' USING ERRCODE = '02000';
    END IF;

    IF v_package.user_id <> NEW.user_id
      OR v_package.patient_id <> NEW.patient_id
    THEN
      RAISE EXCEPTION 'invalid_session_package_link' USING ERRCODE = '23514';
    END IF;

    IF v_package.status <> 'active' THEN
      RAISE EXCEPTION 'package_not_active' USING ERRCODE = '22023';
    END IF;

    v_scheduled_date := (NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_package.expires_at IS NOT NULL
      AND v_package.expires_at < v_scheduled_date
    THEN
      RAISE EXCEPTION 'package_expired' USING ERRCODE = '22023';
    END IF;

    IF v_package.payment_status <> 'paid'
      AND v_package.allow_use_before_payment = false
    THEN
      RAISE EXCEPTION 'package_payment_blocked' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_used_sessions
    FROM public.session_package_usages spu
    WHERE spu.package_id = NEW.package_id
      AND spu.status = 'active';

    IF v_used_sessions >= v_package.total_sessions THEN
      RAISE EXCEPTION 'package_without_balance' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.session_package_usages (
      package_id,
      session_id,
      status,
      usage_type,
      used_at,
      used_by
    )
    VALUES (
      NEW.package_id,
      NEW.id,
      'active',
      'completed_session',
      NOW(),
      v_actor_id
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
  END IF;

  IF v_billing_mode <> 'single' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_flow cf
    WHERE cf.session_id = NEW.id
      AND cf.status <> 'cancelled'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(NEW.session_price, p.session_price, pr.session_price_default, 0),
    p.full_name
  INTO v_price, v_patient_name
  FROM public.patients p
  LEFT JOIN public.profiles pr ON pr.id = NEW.user_id
  WHERE p.id = NEW.patient_id;

  IF COALESCE(v_price, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_guardian_id
  FROM public.patient_guardians
  WHERE patient_id = NEW.patient_id
    AND is_financial_responsible = true
  LIMIT 1;

  INSERT INTO public.cash_flow (
    user_id,
    patient_id,
    session_id,
    type,
    amount,
    description,
    category,
    status,
    due_date,
    guardian_id
  )
  VALUES (
    NEW.user_id,
    NEW.patient_id,
    NEW.id,
    'income',
    v_price,
    'Sessão realizada - ' || COALESCE(v_patient_name, 'Paciente'),
    'session',
    'pending',
    (NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date,
    v_guardian_id
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

CREATE TRIGGER update_session_packages_updated_at
  BEFORE UPDATE ON public.session_packages
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

CREATE OR REPLACE FUNCTION public.encrypt_google_token_if_needed(p_token TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.encrypt_sensitive_text_if_needed(p_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.decrypt_google_token_if_needed(p_token TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.decrypt_sensitive_text(p_token);
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

CREATE OR REPLACE FUNCTION public.get_schedule_sessions_with_evolution_status(
  p_therapist_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_employer_id UUID;
  v_sessions JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_therapist_id IS NULL
    OR p_starts_at IS NULL
    OR p_ends_at IS NULL
    OR p_ends_at <= p_starts_at
  THEN
    RAISE EXCEPTION 'invalid_schedule_range' USING ERRCODE = '22023';
  END IF;

  SELECT employer_id
  INTO v_actor_employer_id
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_therapist_id <> v_actor_id
    AND COALESCE(v_actor_employer_id, '00000000-0000-0000-0000-000000000000'::UUID) <> p_therapist_id
  THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      (to_jsonb(s) - 'session_notes_encrypted')
        || jsonb_build_object(
          'session_notes_encrypted', NULL,
          'has_session_evolution', NULLIF(s.session_notes_encrypted, '') IS NOT NULL,
          'billing_status', cf.status,
          'billing_amount', cf.amount,
          'financial_entry_id', cf.id,
          'patient',
            CASE
              WHEN p.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'email', p.email,
                'phone', p.phone,
                'session_price', p.session_price,
                'status', p.status
              )
            END
        )
      ORDER BY s.scheduled_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM public.sessions s
  LEFT JOIN LATERAL (
    SELECT id, status, amount
    FROM public.cash_flow
    WHERE session_id = s.id
    ORDER BY created_at DESC
    LIMIT 1
  ) cf ON TRUE
  LEFT JOIN public.patients p
    ON p.id = s.patient_id
   AND p.user_id = s.user_id
  WHERE s.user_id = p_therapist_id
    AND s.status <> 'cancelled'
    AND s.scheduled_at >= p_starts_at
    AND s.scheduled_at < p_ends_at;

  RETURN v_sessions;
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
          public.decrypt_sensitive_text(s.session_notes_encrypted),
          'has_session_evolution',
          NULLIF(s.session_notes_encrypted, '') IS NOT NULL
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
  v_session_status TEXT;
  v_session JSONB;
BEGIN
  SELECT s.patient_id, s.status
  INTO v_patient_id, v_session_status
  FROM public.sessions s
  INNER JOIN public.patients p
    ON p.id = s.patient_id
   AND p.user_id = s.user_id
  WHERE s.id = p_session_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_session_status <> 'completed' THEN
    RAISE EXCEPTION 'session_not_completed' USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_notes IS NULL OR btrim(p_notes) = '' THEN
    RAISE EXCEPTION 'empty_note' USING ERRCODE = '22023';
  END IF;

  IF p_mood_happy_sad IS NULL
    OR p_mood_happy_sad < 1
    OR p_mood_happy_sad > 10
    OR p_mood_anxious_calm IS NULL
    OR p_mood_anxious_calm < 1
    OR p_mood_anxious_calm > 10
  THEN
    RAISE EXCEPTION 'invalid_mood_score' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sessions
  SET
    session_notes_encrypted = jsonb_build_object(
      'note_type', 'session_evolution',
      'session_id', p_session_id,
      'notes', btrim(p_notes),
      'mood_happy_sad', p_mood_happy_sad,
      'mood_anxious_calm', p_mood_anxious_calm,
      'updated_at', NOW()
    )::TEXT
  WHERE id = p_session_id;

  SELECT to_jsonb(s)
    || jsonb_build_object(
      'session_notes_encrypted',
      public.decrypt_sensitive_text(s.session_notes_encrypted),
      'has_session_evolution',
      NULLIF(s.session_notes_encrypted, '') IS NOT NULL
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

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS access_token_issued_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_token_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_token_last_used_at TIMESTAMPTZ;

UPDATE public.patients
SET access_token_issued_at = COALESCE(access_token_issued_at, created_at, NOW())
WHERE access_token_issued_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_access_token_active
  ON public.patients(access_token)
  WHERE access_token_revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_access_token_expires_at
  ON public.patients(access_token_expires_at)
  WHERE access_token_expires_at IS NOT NULL
    AND access_token_revoked_at IS NULL;

ALTER TABLE public.anamnesis_responses
  ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS public_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_last_used_at TIMESTAMPTZ;

UPDATE public.anamnesis_responses
SET public_token = gen_random_uuid()
WHERE public_token IS NULL;

ALTER TABLE public.anamnesis_responses
  ALTER COLUMN public_token SET NOT NULL;

UPDATE public.anamnesis_responses
SET public_expires_at = GREATEST(
    COALESCE(created_at, NOW()) + INTERVAL '30 days',
    NOW() + INTERVAL '7 days'
  )
WHERE status = 'pending'
  AND public_expires_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnesis_responses_public_token
  ON public.anamnesis_responses(public_token);

CREATE INDEX IF NOT EXISTS idx_anamnesis_responses_public_token_active
  ON public.anamnesis_responses(public_token)
  WHERE public_revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_anamnesis_responses_public_expires_at
  ON public.anamnesis_responses(public_expires_at)
  WHERE status = 'pending'
    AND public_revoked_at IS NULL
    AND public_expires_at IS NOT NULL;

COMMENT ON COLUMN public.patients.access_token IS
  'Opaque token used in /p/[access_token]. Can be regenerated or revoked without changing patient auth_user_id.';
COMMENT ON COLUMN public.patients.access_token_issued_at IS
  'Timestamp when the current patient access token became valid. Used to invalidate older cookies after regeneration.';
COMMENT ON COLUMN public.patients.access_token_expires_at IS
  'Optional expiration timestamp for the current patient access token. NULL keeps the link active until revoked/regenerated.';
COMMENT ON COLUMN public.patients.access_token_revoked_at IS
  'When set, the current patient access token and any older cookies must be rejected.';
COMMENT ON COLUMN public.patients.access_token_last_used_at IS
  'Last successful token-based login for /p/[token].';
COMMENT ON COLUMN public.anamnesis_responses.public_token IS
  'Opaque token used in public anamnesis links. Never expose predictable IDs in public URLs.';
COMMENT ON COLUMN public.anamnesis_responses.public_expires_at IS
  'Expiration timestamp for pending public anamnesis links. Completed responses become read-only instead of re-usable.';
COMMENT ON COLUMN public.anamnesis_responses.public_revoked_at IS
  'When set, the public anamnesis link must be rejected.';
COMMENT ON COLUMN public.anamnesis_responses.public_last_used_at IS
  'Last successful public link access or submission attempt that reached a valid record.';

CREATE OR REPLACE FUNCTION public.revoke_patient_access_link_secure(p_patient_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
  SET
    access_token_revoked_at = NOW(),
    updated_at = NOW()
  WHERE id = p_patient_id;

  RETURN public.get_patient_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.regenerate_patient_access_link_secure(p_patient_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
  SET
    access_token = gen_random_uuid(),
    access_token_issued_at = NOW(),
    access_token_expires_at = NULL,
    access_token_revoked_at = NULL,
    access_token_last_used_at = NULL,
    updated_at = NOW()
  WHERE id = p_patient_id;

  RETURN public.get_patient_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_public_anamnesis_response(p_public_token UUID)
RETURNS JSONB AS $$
DECLARE
  v_response public.anamnesis_responses%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT *
  INTO v_response
  FROM public.anamnesis_responses
  WHERE public_token = p_public_token
  LIMIT 1;

  IF v_response.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_response.public_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'revoked');
  END IF;

  IF v_response.status = 'pending'
     AND v_response.public_expires_at IS NOT NULL
     AND v_response.public_expires_at <= NOW() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  UPDATE public.anamnesis_responses
  SET public_last_used_at = NOW()
  WHERE id = v_response.id;

  SELECT jsonb_build_object(
    'response_id', ar.id,
    'status', ar.status,
    'expires_at', ar.public_expires_at,
    'revoked_at', ar.public_revoked_at,
    'template',
      CASE
        WHEN ar.status = 'pending' THEN jsonb_build_object(
          'id', at.id,
          'title', at.title,
          'description', at.description,
          'fields', at.fields
        )
        ELSE jsonb_build_object(
          'id', at.id,
          'title', at.title,
          'description', at.description
        )
      END,
    'profile', jsonb_build_object(
      'full_name', pr.full_name,
      'clinic_name', pr.clinic_name,
      'clinic_logo_url', pr.clinic_logo_url
    )
  )
  INTO v_result
  FROM public.anamnesis_responses ar
  JOIN public.anamnesis_templates at ON at.id = ar.template_id
  LEFT JOIN public.profiles pr ON pr.id = at.user_id
  WHERE ar.id = v_response.id
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'not_found'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.submit_public_anamnesis_response(
  p_public_token UUID,
  p_responses JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_response public.anamnesis_responses%ROWTYPE;
  v_response_id UUID;
BEGIN
  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  SELECT *
  INTO v_response
  FROM public.anamnesis_responses
  WHERE public_token = p_public_token
  LIMIT 1;

  IF v_response.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_response.public_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'revoked');
  END IF;

  IF v_response.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_completed');
  END IF;

  IF v_response.public_expires_at IS NOT NULL AND v_response.public_expires_at <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  UPDATE public.anamnesis_responses
  SET
    responses = p_responses,
    status = 'completed',
    completed_at = NOW(),
    public_last_used_at = NOW()
  WHERE id = v_response.id
    AND status = 'pending'
  RETURNING id INTO v_response_id;

  IF v_response_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found_or_already_completed');
  END IF;

  RETURN jsonb_build_object('success', true, 'response_id', v_response_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.revoke_public_anamnesis_link_secure(p_response_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
  v_result JSONB;
BEGIN
  SELECT patient_id INTO v_patient_id
  FROM public.anamnesis_responses
  WHERE id = p_response_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_read_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.anamnesis_responses
  SET public_revoked_at = NOW()
  WHERE id = p_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object('anamnesis_templates', to_jsonb(at))
  INTO v_result
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.id = p_response_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.regenerate_public_anamnesis_link_secure(p_response_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
  v_status TEXT;
  v_result JSONB;
BEGIN
  SELECT patient_id, status
  INTO v_patient_id, v_status
  FROM public.anamnesis_responses
  WHERE id = p_response_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_read_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'response_not_pending' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.anamnesis_responses
  SET
    public_token = gen_random_uuid(),
    public_expires_at = NOW() + INTERVAL '30 days',
    public_revoked_at = NULL,
    public_last_used_at = NULL
  WHERE id = p_response_id;

  SELECT to_jsonb(ar)
    || jsonb_build_object('anamnesis_templates', to_jsonb(at))
  INTO v_result
  FROM public.anamnesis_responses ar
  LEFT JOIN public.anamnesis_templates at ON at.id = ar.template_id
  WHERE ar.id = p_response_id;

  RETURN v_result;
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
    responses,
    public_expires_at
  )
  VALUES (
    p_template_id,
    p_patient_id,
    'pending',
    '{}'::jsonb,
    NOW() + INTERVAL '30 days'
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

CREATE OR REPLACE FUNCTION public.encrypt_profiles_google_calendar_tokens()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.google_access_token := public.encrypt_google_token_if_needed(NEW.google_access_token);
    NEW.google_refresh_token := public.encrypt_google_token_if_needed(NEW.google_refresh_token);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.google_access_token IS DISTINCT FROM OLD.google_access_token THEN
      NEW.google_access_token := public.encrypt_google_token_if_needed(NEW.google_access_token);
    END IF;

    IF NEW.google_refresh_token IS DISTINCT FROM OLD.google_refresh_token THEN
      NEW.google_refresh_token := public.encrypt_google_token_if_needed(NEW.google_refresh_token);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS encrypt_profiles_google_calendar_tokens ON public.profiles;
CREATE TRIGGER encrypt_profiles_google_calendar_tokens
  BEFORE INSERT OR UPDATE OF google_access_token, google_refresh_token ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_profiles_google_calendar_tokens();

CREATE OR REPLACE FUNCTION public.backfill_google_calendar_tokens_encryption()
RETURNS TABLE(updated_profiles BIGINT) AS $$
DECLARE
  v_updated BIGINT;
BEGIN
  UPDATE public.profiles
  SET
    google_access_token = public.encrypt_google_token_if_needed(google_access_token),
    google_refresh_token = public.encrypt_google_token_if_needed(google_refresh_token)
  WHERE (
      google_access_token IS NOT NULL
      AND NOT public.is_db_encrypted_text(google_access_token)
    )
    OR (
      google_refresh_token IS NOT NULL
      AND NOT public.is_db_encrypted_text(google_refresh_token)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  updated_profiles := v_updated;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_schedule_sessions_with_evolution_status(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
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
REVOKE ALL ON FUNCTION public.get_public_anamnesis_response(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_anamnesis_response(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_patient_access_link_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerate_patient_access_link_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_public_anamnesis_link_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerate_public_anamnesis_link_secure(UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_db_encrypted_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive_text_if_needed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_google_token_if_needed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_google_token_if_needed(TEXT) FROM PUBLIC, anon, authenticated;
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
REVOKE EXECUTE ON FUNCTION public.encrypt_profiles_google_calendar_tokens() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_google_calendar_tokens_encryption() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_db_encrypted_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_text_if_needed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_google_token_if_needed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_google_token_if_needed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_jsonb_if_needed(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_jsonb_if_needed(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_professional_can_read_patient(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_professional_can_write_clinical_patient(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_google_calendar_tokens_encryption() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_patient_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedule_sessions_with_evolution_status(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
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
GRANT EXECUTE ON FUNCTION public.get_public_anamnesis_response(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_anamnesis_response(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_patient_access_link_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_patient_access_link_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_public_anamnesis_link_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_public_anamnesis_link_secure(UUID) TO authenticated;

-- ============================================================
-- Patient treatment plans and goals
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  main_goal_encrypted TEXT NOT NULL,
  current_focus_encrypted TEXT NOT NULL,
  strategies_encrypted TEXT,
  review_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_treatment_plans_status_check
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT patient_treatment_plans_main_goal_not_blank
    CHECK (btrim(main_goal_encrypted) <> ''),
  CONSTRAINT patient_treatment_plans_current_focus_not_blank
    CHECK (btrim(current_focus_encrypted) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_treatment_plans_patient_id
  ON public.patient_treatment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_plans_therapist_id
  ON public.patient_treatment_plans(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_plans_status
  ON public.patient_treatment_plans(status);

CREATE TABLE IF NOT EXISTS public.patient_treatment_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id UUID NOT NULL REFERENCES public.patient_treatment_plans(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_encrypted TEXT NOT NULL,
  description_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  target_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_treatment_goals_status_check
    CHECK (status IN ('active', 'in_progress', 'completed', 'paused')),
  CONSTRAINT patient_treatment_goals_title_not_blank
    CHECK (btrim(title_encrypted) <> '')
);

CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_plan_id
  ON public.patient_treatment_goals(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_patient_id
  ON public.patient_treatment_goals(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_therapist_id
  ON public.patient_treatment_goals(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatment_goals_status
  ON public.patient_treatment_goals(status);

DROP TRIGGER IF EXISTS update_patient_treatment_plans_updated_at ON public.patient_treatment_plans;
CREATE TRIGGER update_patient_treatment_plans_updated_at
  BEFORE UPDATE ON public.patient_treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_patient_treatment_goals_updated_at ON public.patient_treatment_goals;
CREATE TRIGGER update_patient_treatment_goals_updated_at
  BEFORE UPDATE ON public.patient_treatment_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_treatment_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_treatment_plans" ON public.patient_treatment_plans;
CREATE POLICY "Professionals can read relevant patient_treatment_plans"
  ON public.patient_treatment_plans FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_treatment_plans" ON public.patient_treatment_plans;
CREATE POLICY "Professionals can write relevant patient_treatment_plans"
  ON public.patient_treatment_plans FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_treatment_plans.patient_id
        AND p.user_id = patient_treatment_plans.therapist_id
    )
  );

DROP POLICY IF EXISTS "Professionals can read relevant patient_treatment_goals" ON public.patient_treatment_goals;
CREATE POLICY "Professionals can read relevant patient_treatment_goals"
  ON public.patient_treatment_goals FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_treatment_goals" ON public.patient_treatment_goals;
CREATE POLICY "Professionals can write relevant patient_treatment_goals"
  ON public.patient_treatment_goals FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patient_treatment_plans tp
      WHERE tp.id = patient_treatment_goals.treatment_plan_id
        AND tp.patient_id = patient_treatment_goals.patient_id
        AND tp.therapist_id = patient_treatment_goals.therapist_id
    )
  );

CREATE OR REPLACE FUNCTION public.encrypt_patient_treatment_plans_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.main_goal_encrypted := public.encrypt_sensitive_text_if_needed(NEW.main_goal_encrypted);
    NEW.current_focus_encrypted := public.encrypt_sensitive_text_if_needed(NEW.current_focus_encrypted);
    NEW.strategies_encrypted := public.encrypt_sensitive_text_if_needed(NEW.strategies_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.main_goal_encrypted IS DISTINCT FROM OLD.main_goal_encrypted THEN
      NEW.main_goal_encrypted := public.encrypt_sensitive_text_if_needed(NEW.main_goal_encrypted);
    END IF;

    IF NEW.current_focus_encrypted IS DISTINCT FROM OLD.current_focus_encrypted THEN
      NEW.current_focus_encrypted := public.encrypt_sensitive_text_if_needed(NEW.current_focus_encrypted);
    END IF;

    IF NEW.strategies_encrypted IS DISTINCT FROM OLD.strategies_encrypted THEN
      NEW.strategies_encrypted := public.encrypt_sensitive_text_if_needed(NEW.strategies_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_treatment_plans_clinical_fields ON public.patient_treatment_plans;
CREATE TRIGGER encrypt_patient_treatment_plans_clinical_fields
  BEFORE INSERT OR UPDATE OF main_goal_encrypted, current_focus_encrypted, strategies_encrypted
  ON public.patient_treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_treatment_plans_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_treatment_goals_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.title_encrypted := public.encrypt_sensitive_text_if_needed(NEW.title_encrypted);
    NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.title_encrypted IS DISTINCT FROM OLD.title_encrypted THEN
      NEW.title_encrypted := public.encrypt_sensitive_text_if_needed(NEW.title_encrypted);
    END IF;

    IF NEW.description_encrypted IS DISTINCT FROM OLD.description_encrypted THEN
      NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_treatment_goals_clinical_fields ON public.patient_treatment_goals;
CREATE TRIGGER encrypt_patient_treatment_goals_clinical_fields
  BEFORE INSERT OR UPDATE OF title_encrypted, description_encrypted
  ON public.patient_treatment_goals
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_treatment_goals_clinical_fields();

CREATE OR REPLACE FUNCTION public.get_patient_treatment_plan_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_plan JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(tp)
    || jsonb_build_object(
      'main_goal', public.decrypt_sensitive_text(tp.main_goal_encrypted),
      'current_focus', public.decrypt_sensitive_text(tp.current_focus_encrypted),
      'strategies', public.decrypt_sensitive_text(tp.strategies_encrypted),
      'goals', COALESCE(
        (
          SELECT jsonb_agg(
            to_jsonb(tg)
              || jsonb_build_object(
                'title', public.decrypt_sensitive_text(tg.title_encrypted),
                'description', public.decrypt_sensitive_text(tg.description_encrypted)
              )
            ORDER BY
              CASE tg.status
                WHEN 'completed' THEN 2
                WHEN 'paused' THEN 1
                ELSE 0
              END,
              tg.created_at ASC
          )
          FROM public.patient_treatment_goals tg
          WHERE tg.treatment_plan_id = tp.id
        ),
        '[]'::jsonb
      )
    )
  INTO v_plan
  FROM public.patient_treatment_plans tp
  WHERE tp.patient_id = p_patient_id
  LIMIT 1;

  RETURN v_plan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.upsert_patient_treatment_plan_secure(
  p_patient_id UUID,
  p_main_goal TEXT,
  p_current_focus TEXT,
  p_strategies TEXT DEFAULT NULL,
  p_review_date DATE DEFAULT NULL,
  p_status TEXT DEFAULT 'active'
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_main_goal IS NULL OR btrim(p_main_goal) = '' THEN
    RAISE EXCEPTION 'invalid_main_goal' USING ERRCODE = '22023';
  END IF;

  IF p_current_focus IS NULL OR btrim(p_current_focus) = '' THEN
    RAISE EXCEPTION 'invalid_current_focus' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'active') NOT IN ('active', 'paused', 'completed', 'archived') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_treatment_plans (
    patient_id,
    therapist_id,
    main_goal_encrypted,
    current_focus_encrypted,
    strategies_encrypted,
    review_date,
    status
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    btrim(p_main_goal),
    btrim(p_current_focus),
    NULLIF(btrim(COALESCE(p_strategies, '')), ''),
    p_review_date,
    COALESCE(p_status, 'active')
  )
  ON CONFLICT (patient_id) DO UPDATE
  SET
    therapist_id = EXCLUDED.therapist_id,
    main_goal_encrypted = EXCLUDED.main_goal_encrypted,
    current_focus_encrypted = EXCLUDED.current_focus_encrypted,
    strategies_encrypted = EXCLUDED.strategies_encrypted,
    review_date = EXCLUDED.review_date,
    status = EXCLUDED.status;

  RETURN public.get_patient_treatment_plan_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_treatment_goal_secure(
  p_patient_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_target_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_plan_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_goal_title' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'active') NOT IN ('active', 'in_progress', 'completed', 'paused') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  SELECT tp.id INTO v_plan_id
  FROM public.patient_treatment_plans tp
  WHERE tp.patient_id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'treatment_plan_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_treatment_goals (
    treatment_plan_id,
    patient_id,
    therapist_id,
    title_encrypted,
    description_encrypted,
    status,
    target_date,
    completed_at
  )
  VALUES (
    v_plan_id,
    p_patient_id,
    v_owner_id,
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    COALESCE(p_status, 'active'),
    p_target_date,
    CASE WHEN COALESCE(p_status, 'active') = 'completed' THEN NOW() ELSE NULL END
  );

  RETURN public.get_patient_treatment_plan_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.update_patient_treatment_goal_secure(
  p_goal_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_target_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT tg.patient_id INTO v_patient_id
  FROM public.patient_treatment_goals tg
  WHERE tg.id = p_goal_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'goal_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_goal_title' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'active') NOT IN ('active', 'in_progress', 'completed', 'paused') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_treatment_goals
  SET
    title_encrypted = btrim(p_title),
    description_encrypted = NULLIF(btrim(COALESCE(p_description, '')), ''),
    status = COALESCE(p_status, 'active'),
    target_date = p_target_date,
    completed_at = CASE
      WHEN COALESCE(p_status, 'active') = 'completed'
        THEN COALESCE(completed_at, NOW())
      ELSE NULL
    END
  WHERE id = p_goal_id;

  RETURN public.get_patient_treatment_plan_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_treatment_plan_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_patient_treatment_plan_secure(UUID, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_patient_treatment_plans_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_treatment_goals_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_patient_treatment_plan_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_patient_treatment_plan_secure(UUID, TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patient_treatment_goal_secure(UUID, TEXT, TEXT, TEXT, DATE) TO authenticated;

-- ============================================================
-- Patient therapeutic tasks hardening and mood check-ins
-- ============================================================

ALTER TABLE public.patient_tasks
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_patient_tasks_responded_at
  ON public.patient_tasks(responded_at);

CREATE OR REPLACE FUNCTION public.encrypt_patient_tasks_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.description := public.encrypt_sensitive_text_if_needed(NEW.description);
    NEW.therapist_notes := public.encrypt_sensitive_text_if_needed(NEW.therapist_notes);
    NEW.patient_feedback := public.encrypt_sensitive_text_if_needed(NEW.patient_feedback);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.description := public.encrypt_sensitive_text_if_needed(NEW.description);
    END IF;

    IF NEW.therapist_notes IS DISTINCT FROM OLD.therapist_notes THEN
      NEW.therapist_notes := public.encrypt_sensitive_text_if_needed(NEW.therapist_notes);
    END IF;

    IF NEW.patient_feedback IS DISTINCT FROM OLD.patient_feedback THEN
      NEW.patient_feedback := public.encrypt_sensitive_text_if_needed(NEW.patient_feedback);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_tasks_clinical_fields ON public.patient_tasks;
CREATE TRIGGER encrypt_patient_tasks_clinical_fields
  BEFORE INSERT OR UPDATE OF description, therapist_notes, patient_feedback
  ON public.patient_tasks
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_tasks_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_emotion_diary_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    NEW.triggers := public.encrypt_sensitive_text_if_needed(NEW.triggers);
    NEW.coping_strategy := public.encrypt_sensitive_text_if_needed(NEW.coping_strategy);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    END IF;

    IF NEW.triggers IS DISTINCT FROM OLD.triggers THEN
      NEW.triggers := public.encrypt_sensitive_text_if_needed(NEW.triggers);
    END IF;

    IF NEW.coping_strategy IS DISTINCT FROM OLD.coping_strategy THEN
      NEW.coping_strategy := public.encrypt_sensitive_text_if_needed(NEW.coping_strategy);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_emotion_diary_clinical_fields ON public.emotion_diary;
CREATE TRIGGER encrypt_emotion_diary_clinical_fields
  BEFORE INSERT OR UPDATE OF notes, triggers, coping_strategy
  ON public.emotion_diary
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_emotion_diary_clinical_fields();

CREATE TABLE IF NOT EXISTS public.patient_mood_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
  anxiety_score INTEGER CHECK (anxiety_score BETWEEN 1 AND 5),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  energy_score INTEGER CHECK (energy_score BETWEEN 1 AND 5),
  notes_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_mood_checkins_patient_id
  ON public.patient_mood_checkins(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_mood_checkins_therapist_id
  ON public.patient_mood_checkins(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_mood_checkins_created_at
  ON public.patient_mood_checkins(created_at);

ALTER TABLE public.patient_mood_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_mood_checkins" ON public.patient_mood_checkins;
CREATE POLICY "Professionals can read relevant patient_mood_checkins"
  ON public.patient_mood_checkins FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_mood_checkins" ON public.patient_mood_checkins;
CREATE POLICY "Professionals can write relevant patient_mood_checkins"
  ON public.patient_mood_checkins FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_mood_checkins.patient_id
        AND p.user_id = patient_mood_checkins.therapist_id
    )
  );

CREATE OR REPLACE FUNCTION public.encrypt_patient_mood_checkins_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes_encrypted IS DISTINCT FROM OLD.notes_encrypted THEN
      NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_mood_checkins_clinical_fields ON public.patient_mood_checkins;
CREATE TRIGGER encrypt_patient_mood_checkins_clinical_fields
  BEFORE INSERT OR UPDATE OF notes_encrypted
  ON public.patient_mood_checkins
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_mood_checkins_clinical_fields();

CREATE OR REPLACE FUNCTION public.get_patient_tasks_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_tasks JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pt)
        || jsonb_build_object(
          'description', public.decrypt_sensitive_text(pt.description),
          'therapist_notes', public.decrypt_sensitive_text(pt.therapist_notes),
          'patient_feedback', public.decrypt_sensitive_text(pt.patient_feedback)
        )
      ORDER BY pt.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_tasks
  FROM public.patient_tasks pt
  WHERE pt.patient_id = p_patient_id;

  RETURN v_tasks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_emotion_diary_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_entries JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ed)
        || jsonb_build_object(
          'notes', public.decrypt_sensitive_text(ed.notes),
          'triggers', public.decrypt_sensitive_text(ed.triggers),
          'coping_strategy', public.decrypt_sensitive_text(ed.coping_strategy)
        )
      ORDER BY ed.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_entries
  FROM public.emotion_diary ed
  WHERE ed.patient_id = p_patient_id;

  RETURN v_entries;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_mood_checkins_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_checkins JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pm)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(pm.notes_encrypted))
      ORDER BY pm.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_checkins
  FROM public.patient_mood_checkins pm
  WHERE pm.patient_id = p_patient_id;

  RETURN v_checkins;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_mood_checkin_secure(
  p_patient_id UUID,
  p_mood_score INTEGER DEFAULT NULL,
  p_anxiety_score INTEGER DEFAULT NULL,
  p_sleep_quality INTEGER DEFAULT NULL,
  p_energy_score INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_checkin_id UUID;
  v_checkin JSONB;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_mood_score IS NOT NULL AND (p_mood_score < 1 OR p_mood_score > 5) THEN
    RAISE EXCEPTION 'invalid_mood_score' USING ERRCODE = '22023';
  END IF;
  IF p_anxiety_score IS NOT NULL AND (p_anxiety_score < 1 OR p_anxiety_score > 5) THEN
    RAISE EXCEPTION 'invalid_anxiety_score' USING ERRCODE = '22023';
  END IF;
  IF p_sleep_quality IS NOT NULL AND (p_sleep_quality < 1 OR p_sleep_quality > 5) THEN
    RAISE EXCEPTION 'invalid_sleep_quality' USING ERRCODE = '22023';
  END IF;
  IF p_energy_score IS NOT NULL AND (p_energy_score < 1 OR p_energy_score > 5) THEN
    RAISE EXCEPTION 'invalid_energy_score' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_mood_checkins (
    patient_id, therapist_id, mood_score, anxiety_score, sleep_quality, energy_score, notes_encrypted
  )
  VALUES (
    p_patient_id, v_owner_id, p_mood_score, p_anxiety_score, p_sleep_quality, p_energy_score,
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_checkin_id;

  SELECT to_jsonb(pm)
    || jsonb_build_object('notes', public.decrypt_sensitive_text(pm.notes_encrypted))
  INTO v_checkin
  FROM public.patient_mood_checkins pm
  WHERE pm.id = v_checkin_id;

  RETURN v_checkin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_portal_tasks_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_tasks JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pt)
        || jsonb_build_object(
          'description', public.decrypt_sensitive_text(pt.description),
          'therapist_notes', NULL,
          'patient_feedback', public.decrypt_sensitive_text(pt.patient_feedback)
        )
      ORDER BY pt.due_date ASC NULLS LAST, pt.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_tasks
  FROM public.patient_tasks pt
  WHERE pt.patient_id = p_patient_id
    AND pt.status <> 'cancelled';

  RETURN v_tasks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_portal_emotion_diary_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_entries JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(ed)
        || jsonb_build_object(
          'notes', public.decrypt_sensitive_text(ed.notes),
          'triggers', public.decrypt_sensitive_text(ed.triggers),
          'coping_strategy', public.decrypt_sensitive_text(ed.coping_strategy)
        )
      ORDER BY ed.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_entries
  FROM public.emotion_diary ed
  WHERE ed.patient_id = p_patient_id
  LIMIT 5;

  RETURN v_entries;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_portal_mood_checkins_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_checkins JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pm)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(pm.notes_encrypted))
      ORDER BY pm.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_checkins
  FROM public.patient_mood_checkins pm
  WHERE pm.patient_id = p_patient_id
  LIMIT 10;

  RETURN v_checkins;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_tasks_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_emotion_diary_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_mood_checkins_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_mood_checkin_secure(UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_portal_tasks_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_portal_emotion_diary_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_portal_mood_checkins_decrypted(UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_patient_tasks_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_emotion_diary_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_mood_checkins_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_patient_tasks_decrypted(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_emotion_diary_decrypted(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_mood_checkins_decrypted(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_patient_mood_checkin_secure(UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_portal_tasks_decrypted(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_portal_emotion_diary_decrypted(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_portal_mood_checkins_decrypted(UUID) TO service_role;



-- ============================================================
-- Migration: patient_support_consents_documents
-- Purpose:
--   Organize support contacts, consent records and patient document
--   metadata with encrypted sensitive notes and narrow RPC access.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.care_network
  ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS relationship TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS organization TEXT,
  ADD COLUMN IF NOT EXISTS can_contact BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_date DATE,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.care_network
  DROP CONSTRAINT IF EXISTS care_network_contact_type_check;
ALTER TABLE public.care_network
  ADD CONSTRAINT care_network_contact_type_check
  CHECK (
    contact_type IS NULL OR contact_type IN (
      'legal_guardian',
      'financial_guardian',
      'emergency',
      'psychiatrist',
      'speech_therapist',
      'occupational_therapist',
      'doctor',
      'school',
      'teacher',
      'caregiver',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS idx_care_network_contact_type
  ON public.care_network(contact_type);
CREATE INDEX IF NOT EXISTS idx_care_network_active
  ON public.care_network(patient_id, is_active);

DROP TRIGGER IF EXISTS update_care_network_updated_at ON public.care_network;
CREATE TRIGGER update_care_network_updated_at
  BEFORE UPDATE ON public.care_network
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.patient_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  description_encrypted TEXT,
  storage_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  document_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_documents_category_check
    CHECK (category IN ('consent', 'report', 'assessment', 'certificate', 'referral', 'school_document', 'receipt', 'image', 'other')),
  CONSTRAINT patient_documents_title_not_blank
    CHECK (btrim(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_id
  ON public.patient_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_therapist_id
  ON public.patient_documents(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_category
  ON public.patient_documents(category);
CREATE INDEX IF NOT EXISTS idx_patient_documents_created_at
  ON public.patient_documents(created_at);

DROP TRIGGER IF EXISTS update_patient_documents_updated_at ON public.patient_documents;
CREATE TRIGGER update_patient_documents_updated_at
  BEFORE UPDATE ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_documents" ON public.patient_documents;
CREATE POLICY "Professionals can read relevant patient_documents"
  ON public.patient_documents FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_documents" ON public.patient_documents;
CREATE POLICY "Professionals can write relevant patient_documents"
  ON public.patient_documents FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_documents.patient_id
        AND p.user_id = patient_documents.therapist_id
    )
  );

CREATE TABLE IF NOT EXISTS public.patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'pending',
  signed_at DATE,
  expires_at DATE,
  related_person_name TEXT,
  document_file_id UUID REFERENCES public.patient_documents(id) ON DELETE SET NULL,
  version TEXT,
  notes_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_consents_type_check
    CHECK (consent_type IN ('general_consent', 'online_care', 'legal_guardian', 'school_contact', 'multidisciplinary_contact', 'patient_portal', 'third_party_sharing', 'other')),
  CONSTRAINT patient_consents_status_check
    CHECK (status IN ('pending', 'signed', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_patient_consents_patient_id
  ON public.patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_therapist_id
  ON public.patient_consents(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_type
  ON public.patient_consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_patient_consents_status
  ON public.patient_consents(status);

DROP TRIGGER IF EXISTS update_patient_consents_updated_at ON public.patient_consents;
CREATE TRIGGER update_patient_consents_updated_at
  BEFORE UPDATE ON public.patient_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can read relevant patient_consents" ON public.patient_consents;
CREATE POLICY "Professionals can read relevant patient_consents"
  ON public.patient_consents FOR SELECT
  TO authenticated
  USING (public.current_professional_can_read_patient(patient_id));

DROP POLICY IF EXISTS "Professionals can write relevant patient_consents" ON public.patient_consents;
CREATE POLICY "Professionals can write relevant patient_consents"
  ON public.patient_consents FOR ALL
  TO authenticated
  USING (public.current_professional_can_write_clinical_patient(patient_id))
  WITH CHECK (
    public.current_professional_can_write_clinical_patient(patient_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_consents.patient_id
        AND p.user_id = patient_consents.therapist_id
    )
  );

CREATE OR REPLACE FUNCTION public.encrypt_care_network_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      NEW.notes := public.encrypt_sensitive_text_if_needed(NEW.notes);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_care_network_clinical_fields ON public.care_network;
CREATE TRIGGER encrypt_care_network_clinical_fields
  BEFORE INSERT OR UPDATE OF notes
  ON public.care_network
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_care_network_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_documents_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.description_encrypted IS DISTINCT FROM OLD.description_encrypted THEN
      NEW.description_encrypted := public.encrypt_sensitive_text_if_needed(NEW.description_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_documents_clinical_fields ON public.patient_documents;
CREATE TRIGGER encrypt_patient_documents_clinical_fields
  BEFORE INSERT OR UPDATE OF description_encrypted
  ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_documents_clinical_fields();

CREATE OR REPLACE FUNCTION public.encrypt_patient_consents_clinical_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.notes_encrypted IS DISTINCT FROM OLD.notes_encrypted THEN
      NEW.notes_encrypted := public.encrypt_sensitive_text_if_needed(NEW.notes_encrypted);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encrypt_patient_consents_clinical_fields ON public.patient_consents;
CREATE TRIGGER encrypt_patient_consents_clinical_fields
  BEFORE INSERT OR UPDATE OF notes_encrypted
  ON public.patient_consents
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_patient_consents_clinical_fields();

CREATE OR REPLACE FUNCTION public.get_patient_care_network_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_contacts JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(cn)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(cn.notes))
      ORDER BY cn.is_primary DESC, cn.is_active DESC, cn.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_contacts
  FROM public.care_network cn
  WHERE cn.patient_id = p_patient_id;

  RETURN v_contacts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_support_contact_secure(
  p_patient_id UUID,
  p_name TEXT,
  p_contact_type TEXT DEFAULT 'other',
  p_relationship TEXT DEFAULT NULL,
  p_specialty TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_organization TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_can_contact BOOLEAN DEFAULT false,
  p_consent_date DATE DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_contact_type, 'other') NOT IN (
    'legal_guardian', 'financial_guardian', 'emergency', 'psychiatrist',
    'speech_therapist', 'occupational_therapist', 'doctor', 'school',
    'teacher', 'caregiver', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_contact_type' USING ERRCODE = '22023';
  END IF;

  IF p_email IS NOT NULL AND btrim(p_email) <> ''
     AND btrim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.care_network (
    patient_id,
    user_id,
    name,
    specialty,
    contact_type,
    relationship,
    phone,
    email,
    organization,
    notes,
    can_contact,
    consent_date,
    is_primary,
    is_active
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    btrim(p_name),
    COALESCE(NULLIF(btrim(COALESCE(p_specialty, '')), ''), COALESCE(p_contact_type, 'other')),
    COALESCE(p_contact_type, 'other'),
    NULLIF(btrim(COALESCE(p_relationship, '')), ''),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email, ''))), ''),
    NULLIF(btrim(COALESCE(p_organization, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    COALESCE(p_can_contact, false),
    p_consent_date,
    COALESCE(p_is_primary, false),
    COALESCE(p_is_active, true)
  );

  RETURN public.get_patient_care_network_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.delete_patient_support_contact_secure(p_contact_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT cn.patient_id INTO v_patient_id
  FROM public.care_network cn
  WHERE cn.id = p_contact_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.care_network
  WHERE id = p_contact_id;

  RETURN public.get_patient_care_network_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_consents_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_consents JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pc)
        || jsonb_build_object('notes', public.decrypt_sensitive_text(pc.notes_encrypted))
      ORDER BY pc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_consents
  FROM public.patient_consents pc
  WHERE pc.patient_id = p_patient_id;

  RETURN v_consents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_consent_secure(
  p_patient_id UUID,
  p_consent_type TEXT,
  p_status TEXT DEFAULT 'pending',
  p_signed_at DATE DEFAULT NULL,
  p_expires_at DATE DEFAULT NULL,
  p_related_person_name TEXT DEFAULT NULL,
  p_document_file_id UUID DEFAULT NULL,
  p_version TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_consent_type, 'other') NOT IN ('general_consent', 'online_care', 'legal_guardian', 'school_contact', 'multidisciplinary_contact', 'patient_portal', 'third_party_sharing', 'other') THEN
    RAISE EXCEPTION 'invalid_consent_type' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_status, 'pending') NOT IN ('pending', 'signed', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_consents (
    patient_id,
    therapist_id,
    consent_type,
    status,
    signed_at,
    expires_at,
    related_person_name,
    document_file_id,
    version,
    notes_encrypted
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    COALESCE(p_consent_type, 'other'),
    COALESCE(p_status, 'pending'),
    p_signed_at,
    p_expires_at,
    NULLIF(btrim(COALESCE(p_related_person_name, '')), ''),
    p_document_file_id,
    NULLIF(btrim(COALESCE(p_version, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  );

  RETURN public.get_patient_consents_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.delete_patient_consent_secure(p_consent_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT pc.patient_id INTO v_patient_id
  FROM public.patient_consents pc
  WHERE pc.id = p_consent_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'consent_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.patient_consents
  WHERE id = p_consent_id;

  RETURN public.get_patient_consents_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_documents_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_documents JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(pd)
        || jsonb_build_object('description', public.decrypt_sensitive_text(pd.description_encrypted))
      ORDER BY pd.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_documents
  FROM public.patient_documents pd
  WHERE pd.patient_id = p_patient_id;

  RETURN v_documents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.create_patient_document_secure(
  p_patient_id UUID,
  p_category TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_storage_path TEXT DEFAULT NULL,
  p_file_name TEXT DEFAULT NULL,
  p_mime_type TEXT DEFAULT NULL,
  p_size_bytes BIGINT DEFAULT NULL,
  p_document_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.current_professional_can_write_clinical_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_category, 'other') NOT IN ('consent', 'report', 'assessment', 'certificate', 'referral', 'school_document', 'receipt', 'image', 'other') THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.patient_documents (
    patient_id,
    therapist_id,
    category,
    title,
    description_encrypted,
    storage_path,
    file_name,
    mime_type,
    size_bytes,
    document_date
  )
  VALUES (
    p_patient_id,
    v_owner_id,
    COALESCE(p_category, 'other'),
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_storage_path, '')), ''),
    NULLIF(btrim(COALESCE(p_file_name, '')), ''),
    NULLIF(btrim(COALESCE(p_mime_type, '')), ''),
    p_size_bytes,
    p_document_date
  );

  RETURN public.get_patient_documents_decrypted(p_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.delete_patient_document_secure(p_document_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT pd.patient_id INTO v_patient_id
  FROM public.patient_documents pd
  WHERE pd.id = p_document_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_write_clinical_patient(v_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.patient_documents
  WHERE id = p_document_id;

  RETURN public.get_patient_documents_decrypted(v_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_care_network_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_support_contact_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DATE, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_patient_support_contact_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_consents_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_consent_secure(UUID, TEXT, TEXT, DATE, DATE, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_patient_consent_secure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_patient_documents_decrypted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_patient_document_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_patient_document_secure(UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.encrypt_care_network_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_documents_clinical_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_consents_clinical_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_patient_care_network_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_support_contact_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DATE, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_patient_support_contact_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_consents_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_consent_secure(UUID, TEXT, TEXT, DATE, DATE, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_patient_consent_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_documents_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_document_secure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_patient_document_secure(UUID) TO authenticated;

-- ============================================================
-- Migration: patient_documents_private_storage
-- Purpose:
--   Create a private Supabase Storage bucket for patient documents
--   and expose only short-lived, authorized access through app code.
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'patient-documents',
  'patient-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

REVOKE SELECT (storage_path) ON public.patient_documents FROM anon, authenticated;

DROP POLICY IF EXISTS "Professionals can read private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can read private patient document objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_read_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Professionals can upload private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can upload private patient document objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Professionals can update private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can update private patient document objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Professionals can delete private patient document objects" ON storage.objects;
CREATE POLICY "Professionals can delete private patient document objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1] = 'patients'
        AND COALESCE((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_professional_can_write_clinical_patient(((storage.foldername(name))[2])::uuid)
      ELSE false
    END
  );

CREATE OR REPLACE FUNCTION public.get_patient_documents_decrypted(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_documents JSONB;
BEGIN
  IF NOT public.current_professional_can_read_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      (to_jsonb(pd) - 'storage_path')
        || jsonb_build_object(
          'description', public.decrypt_sensitive_text(pd.description_encrypted),
          'has_file', pd.storage_path IS NOT NULL
        )
      ORDER BY pd.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_documents
  FROM public.patient_documents pd
  WHERE pd.patient_id = p_patient_id;

  RETURN v_documents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_patient_documents_decrypted(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_documents_decrypted(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_professional_can_manage_financial_patient(p_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.patients p
    JOIN public.profiles caller ON caller.id = auth.uid()
    WHERE p.id = p_patient_id
      AND COALESCE(caller.role, 'therapist') IN ('therapist', 'admin', 'secretary')
      AND (
        p.user_id = caller.id
        OR caller.employer_id = p.user_id
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.sync_session_package_payment_status_from_cash_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_status TEXT;
BEGIN
  IF NEW.package_id IS NULL
    OR NEW.category <> 'package'
    OR NEW.type <> 'income'
  THEN
    RETURN NEW;
  END IF;

  v_payment_status := CASE NEW.status
    WHEN 'confirmed' THEN 'paid'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END;

  UPDATE public.session_packages
  SET payment_status = v_payment_status
  WHERE id = NEW.package_id
    AND payment_status IS DISTINCT FROM v_payment_status;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS sync_session_package_payment_status_from_cash_flow ON public.cash_flow;
CREATE TRIGGER sync_session_package_payment_status_from_cash_flow
  AFTER INSERT OR UPDATE OF status, package_id, category, type ON public.cash_flow
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_session_package_payment_status_from_cash_flow();

CREATE OR REPLACE FUNCTION public.create_session_package_with_billing(
  p_patient_id UUID,
  p_name TEXT,
  p_total_sessions INTEGER,
  p_total_amount NUMERIC,
  p_start_date DATE DEFAULT NULL,
  p_expires_at DATE DEFAULT NULL,
  p_guardian_id UUID DEFAULT NULL,
  p_allow_use_before_payment BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_owner_id UUID;
  v_patient_name TEXT;
  v_start_date DATE := COALESCE(p_start_date, CURRENT_DATE);
  v_unit_amount NUMERIC(10,2);
  v_package public.session_packages%ROWTYPE;
  v_cash_flow_id UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_professional_can_manage_financial_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_package_name' USING ERRCODE = '22023';
  END IF;

  IF p_total_sessions IS NULL OR p_total_sessions <= 0 THEN
    RAISE EXCEPTION 'invalid_total_sessions' USING ERRCODE = '22023';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_total_amount' USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at < v_start_date THEN
    RAISE EXCEPTION 'invalid_package_dates' USING ERRCODE = '22023';
  END IF;

  SELECT p.user_id, p.full_name
  INTO v_owner_id, v_patient_name
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '02000';
  END IF;

  IF p_guardian_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.patient_guardians pg
      WHERE pg.id = p_guardian_id
        AND pg.patient_id = p_patient_id
    )
  THEN
    RAISE EXCEPTION 'invalid_guardian' USING ERRCODE = '22023';
  END IF;

  v_unit_amount := ROUND(p_total_amount / p_total_sessions, 2);

  INSERT INTO public.session_packages (
    user_id,
    patient_id,
    guardian_id,
    name,
    total_sessions,
    total_amount,
    unit_amount,
    status,
    payment_status,
    start_date,
    expires_at,
    allow_use_before_payment,
    created_by
  )
  VALUES (
    v_owner_id,
    p_patient_id,
    p_guardian_id,
    btrim(p_name),
    p_total_sessions,
    p_total_amount,
    v_unit_amount,
    'active',
    'pending',
    v_start_date,
    p_expires_at,
    COALESCE(p_allow_use_before_payment, TRUE),
    v_actor_id
  )
  RETURNING * INTO v_package;

  INSERT INTO public.cash_flow (
    user_id,
    patient_id,
    package_id,
    session_id,
    type,
    amount,
    description,
    category,
    status,
    due_date,
    guardian_id
  )
  VALUES (
    v_owner_id,
    p_patient_id,
    v_package.id,
    NULL,
    'income',
    p_total_amount,
    'Pacote de sessoes - ' || COALESCE(v_patient_name, 'Paciente'),
    'package',
    'pending',
    v_start_date,
    p_guardian_id
  )
  RETURNING id INTO v_cash_flow_id;

  RETURN jsonb_build_object(
    'id', v_package.id,
    'user_id', v_package.user_id,
    'patient_id', v_package.patient_id,
    'guardian_id', v_package.guardian_id,
    'name', v_package.name,
    'total_sessions', v_package.total_sessions,
    'used_sessions', 0,
    'remaining_sessions', v_package.total_sessions,
    'total_amount', v_package.total_amount,
    'unit_amount', v_package.unit_amount,
    'status', v_package.status,
    'payment_status', v_package.payment_status,
    'start_date', v_package.start_date,
    'expires_at', v_package.expires_at,
    'allow_use_before_payment', v_package.allow_use_before_payment,
    'cash_flow_id', v_cash_flow_id,
    'cash_flow_status', 'pending',
    'cash_flow_due_date', v_start_date,
    'cash_flow_paid_at', NULL,
    'amount_paid', 0,
    'amount_pending', v_package.total_amount,
    'created_by', v_package.created_by,
    'created_at', v_package.created_at,
    'updated_at', v_package.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_patient_session_packages(p_patient_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_packages JSONB;
BEGIN
  IF NOT public.current_professional_can_manage_financial_patient(p_patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sp.id,
        'user_id', sp.user_id,
        'patient_id', sp.patient_id,
        'guardian_id', sp.guardian_id,
        'name', sp.name,
        'total_sessions', sp.total_sessions,
        'used_sessions', usage_totals.used_sessions,
        'remaining_sessions', GREATEST(sp.total_sessions - usage_totals.used_sessions, 0),
        'total_amount', sp.total_amount,
        'unit_amount', sp.unit_amount,
        'status', sp.status,
        'payment_status', sp.payment_status,
        'start_date', sp.start_date,
        'expires_at', sp.expires_at,
        'allow_use_before_payment', sp.allow_use_before_payment,
        'cash_flow_id', cf.id,
        'cash_flow_status', cf.status,
        'cash_flow_due_date', cf.due_date,
        'cash_flow_paid_at', cf.paid_at,
        'amount_paid', CASE WHEN cf.status = 'confirmed' THEN cf.amount ELSE 0 END,
        'amount_pending', CASE WHEN cf.status = 'pending' THEN cf.amount ELSE 0 END,
        'created_by', sp.created_by,
        'created_at', sp.created_at,
        'updated_at', sp.updated_at
      )
      ORDER BY
        CASE sp.status
          WHEN 'active' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'completed' THEN 3
          ELSE 4
        END,
        sp.start_date DESC,
        sp.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_packages
  FROM public.session_packages sp
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS used_sessions
    FROM public.session_package_usages spu
    WHERE spu.package_id = sp.id
      AND spu.status = 'active'
  ) usage_totals ON TRUE
  LEFT JOIN LATERAL (
    SELECT id, status, amount, due_date, paid_at
    FROM public.cash_flow
    WHERE package_id = sp.id
      AND category = 'package'
      AND type = 'income'
    ORDER BY created_at ASC
    LIMIT 1
  ) cf ON TRUE
  WHERE sp.patient_id = p_patient_id;

  RETURN v_packages;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.update_session_package_secure(
  p_package_id UUID,
  p_patch JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_package public.session_packages%ROWTYPE;
  v_updated public.session_packages%ROWTYPE;
  v_used_sessions INTEGER := 0;
  v_new_name TEXT;
  v_new_total_sessions INTEGER;
  v_new_total_amount NUMERIC(10,2);
  v_new_unit_amount NUMERIC(10,2);
  v_new_expires_at DATE;
  v_new_allow_use_before_payment BOOLEAN;
  v_new_guardian_id UUID;
  v_amount_changed BOOLEAN := FALSE;
  v_guardian_changed BOOLEAN := FALSE;
  v_cash_flow_id UUID;
  v_cash_flow_status TEXT;
  v_cash_flow_amount NUMERIC(10,2);
  v_cash_flow_due_date DATE;
  v_cash_flow_paid_at TIMESTAMPTZ;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid_package_patch' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS keys(key)
    WHERE keys.key NOT IN (
      'name',
      'total_sessions',
      'total_amount',
      'expires_at',
      'allow_use_before_payment',
      'guardian_id'
    )
  ) THEN
    RAISE EXCEPTION 'invalid_package_patch_keys' USING ERRCODE = '22023';
  END IF;

  SELECT sp.*
  INTO v_package
  FROM public.session_packages sp
  WHERE sp.id = p_package_id
  FOR UPDATE;

  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'package_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_manage_financial_patient(v_package.patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_used_sessions
  FROM public.session_package_usages
  WHERE package_id = p_package_id
    AND status = 'active';

  v_new_name := v_package.name;
  v_new_total_sessions := v_package.total_sessions;
  v_new_total_amount := v_package.total_amount;
  v_new_expires_at := v_package.expires_at;
  v_new_allow_use_before_payment := v_package.allow_use_before_payment;
  v_new_guardian_id := v_package.guardian_id;

  IF p_patch ? 'name' THEN
    v_new_name := NULLIF(btrim(p_patch->>'name'), '');
    IF v_new_name IS NULL THEN
      RAISE EXCEPTION 'invalid_package_name' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_patch ? 'total_sessions' THEN
    IF jsonb_typeof(p_patch->'total_sessions') <> 'number' THEN
      RAISE EXCEPTION 'invalid_total_sessions' USING ERRCODE = '22023';
    END IF;
    v_new_total_sessions := (p_patch->>'total_sessions')::INTEGER;
    IF v_new_total_sessions <= 0 THEN
      RAISE EXCEPTION 'invalid_total_sessions' USING ERRCODE = '22023';
    END IF;
    IF v_new_total_sessions < v_used_sessions THEN
      RAISE EXCEPTION 'total_sessions_below_usage' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_patch ? 'total_amount' THEN
    IF jsonb_typeof(p_patch->'total_amount') <> 'number' THEN
      RAISE EXCEPTION 'invalid_total_amount' USING ERRCODE = '22023';
    END IF;
    v_new_total_amount := (p_patch->>'total_amount')::NUMERIC;
    IF v_new_total_amount <= 0 THEN
      RAISE EXCEPTION 'invalid_total_amount' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_patch ? 'expires_at' THEN
    IF p_patch->'expires_at' = 'null'::jsonb THEN
      v_new_expires_at := NULL;
    ELSE
      v_new_expires_at := (p_patch->>'expires_at')::DATE;
    END IF;
  END IF;

  IF v_new_expires_at IS NOT NULL AND v_new_expires_at < v_package.start_date THEN
    RAISE EXCEPTION 'invalid_package_dates' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'allow_use_before_payment' THEN
    IF jsonb_typeof(p_patch->'allow_use_before_payment') <> 'boolean' THEN
      RAISE EXCEPTION 'invalid_allow_use_before_payment' USING ERRCODE = '22023';
    END IF;
    v_new_allow_use_before_payment := (p_patch->>'allow_use_before_payment')::BOOLEAN;
  END IF;

  IF p_patch ? 'guardian_id' THEN
    IF p_patch->'guardian_id' = 'null'::jsonb THEN
      v_new_guardian_id := NULL;
    ELSE
      v_new_guardian_id := (p_patch->>'guardian_id')::UUID;
    END IF;
  END IF;

  IF v_new_guardian_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.patient_guardians pg
      WHERE pg.id = v_new_guardian_id
        AND pg.patient_id = v_package.patient_id
    )
  THEN
    RAISE EXCEPTION 'invalid_guardian' USING ERRCODE = '22023';
  END IF;

  v_amount_changed := v_new_total_amount IS DISTINCT FROM v_package.total_amount;
  v_guardian_changed := v_new_guardian_id IS DISTINCT FROM v_package.guardian_id;
  v_new_unit_amount := ROUND(v_new_total_amount / v_new_total_sessions, 2);

  SELECT cf.id, cf.status
  INTO v_cash_flow_id, v_cash_flow_status
  FROM public.cash_flow cf
  WHERE cf.package_id = p_package_id
    AND cf.category = 'package'
    AND cf.type = 'income'
  ORDER BY cf.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_amount_changed THEN
    IF v_cash_flow_id IS NULL THEN
      RAISE EXCEPTION 'package_billing_not_found' USING ERRCODE = '02000';
    END IF;

    IF v_cash_flow_status <> 'pending' OR v_package.payment_status <> 'pending' THEN
      RAISE EXCEPTION 'package_billing_locked' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.session_packages
  SET
    name = v_new_name,
    total_sessions = v_new_total_sessions,
    total_amount = v_new_total_amount,
    unit_amount = v_new_unit_amount,
    expires_at = v_new_expires_at,
    allow_use_before_payment = v_new_allow_use_before_payment,
    guardian_id = v_new_guardian_id
  WHERE id = p_package_id
  RETURNING * INTO v_updated;

  IF v_cash_flow_id IS NOT NULL
    AND v_cash_flow_status = 'pending'
    AND (v_amount_changed OR v_guardian_changed)
  THEN
    UPDATE public.cash_flow
    SET
      amount = v_new_total_amount,
      guardian_id = v_new_guardian_id
    WHERE id = v_cash_flow_id;
  END IF;

  SELECT cf.id, cf.status, cf.amount, cf.due_date, cf.paid_at
  INTO v_cash_flow_id, v_cash_flow_status, v_cash_flow_amount, v_cash_flow_due_date, v_cash_flow_paid_at
  FROM public.cash_flow cf
  WHERE cf.package_id = p_package_id
    AND cf.category = 'package'
    AND cf.type = 'income'
  ORDER BY cf.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'id', v_updated.id,
    'user_id', v_updated.user_id,
    'patient_id', v_updated.patient_id,
    'guardian_id', v_updated.guardian_id,
    'name', v_updated.name,
    'total_sessions', v_updated.total_sessions,
    'used_sessions', v_used_sessions,
    'remaining_sessions', GREATEST(v_updated.total_sessions - v_used_sessions, 0),
    'total_amount', v_updated.total_amount,
    'unit_amount', v_updated.unit_amount,
    'status', v_updated.status,
    'payment_status', v_updated.payment_status,
    'start_date', v_updated.start_date,
    'expires_at', v_updated.expires_at,
    'allow_use_before_payment', v_updated.allow_use_before_payment,
    'cash_flow_id', v_cash_flow_id,
    'cash_flow_status', v_cash_flow_status,
    'cash_flow_due_date', v_cash_flow_due_date,
    'cash_flow_paid_at', v_cash_flow_paid_at,
    'amount_paid', CASE WHEN v_cash_flow_status = 'confirmed' THEN v_cash_flow_amount ELSE 0 END,
    'amount_pending', CASE WHEN v_cash_flow_status = 'pending' THEN v_cash_flow_amount ELSE 0 END,
    'created_by', v_updated.created_by,
    'created_at', v_updated.created_at,
    'updated_at', v_updated.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.set_session_package_status_secure(
  p_package_id UUID,
  p_status TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_package public.session_packages%ROWTYPE;
  v_updated public.session_packages%ROWTYPE;
  v_used_sessions INTEGER := 0;
  v_cash_flow_id UUID;
  v_cash_flow_status TEXT;
  v_cash_flow_amount NUMERIC(10,2);
  v_cash_flow_due_date DATE;
  v_cash_flow_paid_at TIMESTAMPTZ;
  v_warning TEXT := NULL;
BEGIN
  IF p_status NOT IN ('active', 'paused', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_package_status' USING ERRCODE = '22023';
  END IF;

  SELECT sp.*
  INTO v_package
  FROM public.session_packages sp
  WHERE sp.id = p_package_id
  FOR UPDATE;

  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'package_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.current_professional_can_manage_financial_patient(v_package.patient_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_package.status = 'cancelled' AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'cancelled_package_cannot_reactivate' USING ERRCODE = '22023';
  END IF;

  SELECT cf.id, cf.status
  INTO v_cash_flow_id, v_cash_flow_status
  FROM public.cash_flow cf
  WHERE cf.package_id = p_package_id
    AND cf.category = 'package'
    AND cf.type = 'income'
  ORDER BY cf.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF p_status = 'cancelled' THEN
    IF v_cash_flow_id IS NULL THEN
      v_warning := 'package_billing_not_found';
    ELSIF v_cash_flow_status = 'pending' THEN
      UPDATE public.cash_flow
      SET status = 'cancelled'
      WHERE id = v_cash_flow_id;
    ELSIF v_cash_flow_status = 'confirmed' THEN
      v_warning := 'package_billing_already_confirmed';
    END IF;
  END IF;

  UPDATE public.session_packages
  SET
    status = p_status,
    payment_status = CASE
      WHEN p_status = 'cancelled' AND v_cash_flow_status = 'pending' THEN 'cancelled'
      ELSE payment_status
    END
  WHERE id = p_package_id
  RETURNING * INTO v_updated;

  SELECT COUNT(*)::INTEGER
  INTO v_used_sessions
  FROM public.session_package_usages
  WHERE package_id = p_package_id
    AND status = 'active';

  SELECT cf.id, cf.status, cf.amount, cf.due_date, cf.paid_at
  INTO v_cash_flow_id, v_cash_flow_status, v_cash_flow_amount, v_cash_flow_due_date, v_cash_flow_paid_at
  FROM public.cash_flow cf
  WHERE cf.package_id = p_package_id
    AND cf.category = 'package'
    AND cf.type = 'income'
  ORDER BY cf.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'id', v_updated.id,
    'user_id', v_updated.user_id,
    'patient_id', v_updated.patient_id,
    'guardian_id', v_updated.guardian_id,
    'name', v_updated.name,
    'total_sessions', v_updated.total_sessions,
    'used_sessions', v_used_sessions,
    'remaining_sessions', GREATEST(v_updated.total_sessions - v_used_sessions, 0),
    'total_amount', v_updated.total_amount,
    'unit_amount', v_updated.unit_amount,
    'status', v_updated.status,
    'payment_status', v_updated.payment_status,
    'start_date', v_updated.start_date,
    'expires_at', v_updated.expires_at,
    'allow_use_before_payment', v_updated.allow_use_before_payment,
    'cash_flow_id', v_cash_flow_id,
    'cash_flow_status', v_cash_flow_status,
    'cash_flow_due_date', v_cash_flow_due_date,
    'cash_flow_paid_at', v_cash_flow_paid_at,
    'amount_paid', CASE WHEN v_cash_flow_status = 'confirmed' THEN v_cash_flow_amount ELSE 0 END,
    'amount_pending', CASE WHEN v_cash_flow_status = 'pending' THEN v_cash_flow_amount ELSE 0 END,
    'warning', v_warning,
    'created_by', v_updated.created_by,
    'created_at', v_updated.created_at,
    'updated_at', v_updated.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.reverse_completed_session_secure(
  p_session_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_actor_employer_id UUID;
  v_session public.sessions%ROWTYPE;
  v_billing_mode TEXT;
  v_cash_flow public.cash_flow%ROWTYPE;
  v_usage public.session_package_usages%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_cash_flow_cancelled BOOLEAN := FALSE;
  v_package_credit_reversed BOOLEAN := FALSE;
  v_had_evolution BOOLEAN := FALSE;
  v_warning TEXT := NULL;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT pr.role, pr.employer_id
  INTO v_actor_role, v_actor_employer_id
  FROM public.profiles pr
  WHERE pr.id = v_actor_id;

  IF COALESCE(v_actor_role, '') NOT IN ('therapist', 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_session.user_id <> v_actor_id
    AND v_session.user_id IS DISTINCT FROM v_actor_employer_id
  THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'completed' THEN
    RAISE EXCEPTION 'session_not_completed' USING ERRCODE = '22023';
  END IF;

  v_billing_mode := COALESCE(
    NULLIF(v_session.billing_mode, ''),
    CASE WHEN v_session.package_id IS NOT NULL THEN 'package' ELSE 'single' END
  );
  v_had_evolution := NULLIF(v_session.session_notes_encrypted, '') IS NOT NULL;

  IF v_billing_mode = 'single' THEN
    SELECT cf.*
    INTO v_cash_flow
    FROM public.cash_flow cf
    WHERE cf.session_id = v_session.id
    ORDER BY cf.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_cash_flow.id IS NOT NULL THEN
      IF v_cash_flow.status = 'confirmed' THEN
        RAISE EXCEPTION 'session_billing_confirmed' USING ERRCODE = '22023';
      ELSIF v_cash_flow.status = 'pending' THEN
        UPDATE public.cash_flow
        SET status = 'cancelled'
        WHERE id = v_cash_flow.id;

        v_cash_flow_cancelled := TRUE;
      END IF;
    END IF;
  ELSIF v_billing_mode = 'package' THEN
    SELECT spu.*
    INTO v_usage
    FROM public.session_package_usages spu
    WHERE spu.session_id = v_session.id
      AND spu.status = 'active'
    ORDER BY spu.used_at DESC NULLS LAST, spu.created_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF v_usage.id IS NULL THEN
      v_warning := 'package_usage_not_found';
    ELSE
      UPDATE public.session_package_usages
      SET
        status = 'reversed',
        reversed_at = NOW(),
        reversed_by = v_actor_id,
        reversal_reason = LEFT(COALESCE(v_reason, 'Reversao da realizacao da sessao'), 500)
      WHERE id = v_usage.id
        AND status = 'active';

      v_package_credit_reversed := TRUE;
    END IF;
  END IF;

  UPDATE public.sessions
  SET
    status = 'scheduled',
    completed_at = NULL
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'patient_id', v_session.patient_id,
    'status', 'scheduled',
    'billing_mode', v_billing_mode,
    'cash_flow_cancelled', v_cash_flow_cancelled,
    'package_credit_reversed', v_package_credit_reversed,
    'had_evolution', v_had_evolution,
    'warning', v_warning
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_professional_can_manage_financial_patient(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_session_package_payment_status_from_cash_flow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_session_package_with_billing(UUID, TEXT, INTEGER, NUMERIC, DATE, DATE, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_patient_session_packages(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_session_package_secure(UUID, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_session_package_status_secure(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_completed_session_secure(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_professional_can_manage_financial_patient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_package_with_billing(UUID, TEXT, INTEGER, NUMERIC, DATE, DATE, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_session_packages(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_package_secure(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_package_status_secure(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_completed_session_secure(UUID, TEXT) TO authenticated;

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
