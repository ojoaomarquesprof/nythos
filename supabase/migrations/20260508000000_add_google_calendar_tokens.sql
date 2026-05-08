-- ============================================================
-- Nythos — Google Calendar Integration
-- Adiciona colunas para armazenar tokens OAuth do Google na tabela profiles.
-- Tokens são sensíveis e só acessíveis pelo próprio usuário (via RLS).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_access_token  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_token_expiry  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_calendar_id   TEXT DEFAULT 'primary';

-- Política: apenas o próprio usuário pode ler/escrever seus tokens
-- (As políticas gerais de profiles já cobrem isso via auth.uid() = id,
--  mas deixamos um comentário explícito para fins de auditoria.)

COMMENT ON COLUMN public.profiles.google_access_token  IS 'Token de acesso OAuth 2.0 do Google Calendar (curta duração). Armazenado em texto puro — use colunas vault para produção se necessário.';
COMMENT ON COLUMN public.profiles.google_refresh_token IS 'Token de refresh OAuth 2.0 do Google (longa duração). Permite renovação automática do access_token.';
COMMENT ON COLUMN public.profiles.google_token_expiry  IS 'Timestamp de expiração do access_token atual.';
COMMENT ON COLUMN public.profiles.google_calendar_id   IS 'ID da agenda do Google a ser sincronizada (default: "primary").';

-- Add google_event_id to sessions to track which sessions came from Google Calendar
-- and prevent duplicate imports on subsequent syncs.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS google_event_id TEXT DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_google_event_id_idx
  ON public.sessions (user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

COMMENT ON COLUMN public.sessions.google_event_id IS 'Google Calendar event ID. Used to prevent duplicate imports during calendar sync.';
