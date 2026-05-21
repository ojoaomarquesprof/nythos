-- ============================================================
-- Migration: simplify_saas_commercial_plans
-- Purpose:
--   Align commercial plan seeds with Trial + Nythos PRO + Nythos Clinic.
--   This does not create customers, subscriptions, checkout sessions, or
--   payment provider calls.
-- ============================================================

INSERT INTO public.subscription_plans (
  id,
  name,
  description,
  monthly_price,
  yearly_price,
  limits,
  features,
  provider,
  provider_price_id,
  is_active,
  sort_order
)
VALUES
  (
    'free',
    'Trial gratuito',
    'Teste gratis por 14 dias com os recursos principais do Nythos PRO liberados.',
    0,
    NULL,
    jsonb_build_object(
      'max_active_patients', 100,
      'max_team_members', 1,
      'max_documents', 500,
      'max_storage_mb', 10240,
      'google_calendar_enabled', TRUE,
      'patient_portal_enabled', TRUE,
      'packages_enabled', TRUE,
      'receipts_enabled', TRUE,
      'audit_log_enabled', TRUE,
      'advanced_reports_enabled', FALSE
    ),
    '["trial_14_dias","agenda","prontuario","financeiro","pacotes","portal_paciente","documentos","google_calendar","recibos","audit_log","relatorios_basicos"]'::jsonb,
    NULL,
    NULL,
    TRUE,
    10
  ),
  (
    'professional',
    'Nythos PRO',
    'Tudo que o psicologo precisa para organizar agenda, prontuario, financeiro e relacionamento com pacientes em uma rotina mais clara.',
    89,
    899,
    jsonb_build_object(
      'max_active_patients', 100,
      'max_team_members', 1,
      'max_documents', 500,
      'max_storage_mb', 10240,
      'google_calendar_enabled', TRUE,
      'patient_portal_enabled', TRUE,
      'packages_enabled', TRUE,
      'receipts_enabled', TRUE,
      'audit_log_enabled', TRUE,
      'advanced_reports_enabled', FALSE
    ),
    '["agenda","prontuario","financeiro","pacotes","portal_paciente","documentos","google_calendar","recibos","audit_log","relatorios_basicos"]'::jsonb,
    NULL,
    NULL,
    TRUE,
    20
  ),
  (
    'clinic',
    'Nythos Clinic',
    'Para clinicas, equipes e operacoes com maior volume.',
    NULL,
    NULL,
    jsonb_build_object(
      'max_active_patients', NULL,
      'max_team_members', NULL,
      'max_documents', NULL,
      'max_storage_mb', NULL,
      'google_calendar_enabled', TRUE,
      'patient_portal_enabled', TRUE,
      'packages_enabled', TRUE,
      'receipts_enabled', TRUE,
      'audit_log_enabled', TRUE,
      'advanced_reports_enabled', TRUE
    ),
    '["acima_de_100_pacientes","equipe_personalizada","armazenamento_maior","agenda","prontuario","financeiro","pacotes","portal_paciente","documentos","google_calendar","recibos","audit_log"]'::jsonb,
    NULL,
    NULL,
    TRUE,
    30
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  yearly_price = EXCLUDED.yearly_price,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  provider = EXCLUDED.provider,
  provider_price_id = EXCLUDED.provider_price_id,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
