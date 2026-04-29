-- ============================================================
-- Migration: create system_settings
-- Propósito: Armazenar configurações globais da plataforma Nythos
--            de forma dinâmica, sem exigir re-deploy da aplicação.
-- ============================================================

-- Tabela de configurações globais da plataforma
CREATE TABLE IF NOT EXISTS public.system_settings (
  key   TEXT PRIMARY KEY,          -- identificador único da configuração (ex: 'trial_duration_hours')
  value TEXT NOT NULL,             -- valor armazenado como TEXT; a aplicação faz o cast necessário
  description TEXT,                -- documentação legível do propósito da configuração
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Seed: valores padrão das configurações
-- ============================================================
INSERT INTO public.system_settings (key, value, description)
VALUES
  (
    'trial_duration_hours',
    '168',
    'Duração do período de trial gratuito em horas. Padrão: 168h = 7 dias.'
  )
ON CONFLICT (key) DO NOTHING;  -- idempotente: não sobrescreve alterações feitas via admin

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado pode ler as configurações
-- (necessário para o hook use-subscription.ts funcionar no client)
CREATE POLICY "Authenticated users can read system_settings"
  ON public.system_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Escrita: bloqueada para todos via API pública
-- Apenas service_role (migrations, scripts de admin) pode escrever.
-- Não criamos policies de INSERT/UPDATE/DELETE: o comportamento padrão
-- com RLS habilitado é negar tudo que não esteja explicitamente permitido.

-- ============================================================
-- Trigger: manter updated_at sincronizado
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_settings_updated_at();

-- ============================================================
-- Comentário de coluna para documentação no Supabase Studio
-- ============================================================
COMMENT ON TABLE public.system_settings IS
  'Configurações globais da plataforma Nythos. Escrita restrita ao service_role. Leitura permitida a usuários autenticados.';

COMMENT ON COLUMN public.system_settings.key IS
  'Chave única da configuração (snake_case). Ex: trial_duration_hours.';

COMMENT ON COLUMN public.system_settings.value IS
  'Valor da configuração em formato TEXT. A aplicação realiza o cast para o tipo correto (number, boolean, etc.).';
