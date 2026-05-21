-- ============================================================
-- Migration: saas_billing_foundation
-- Purpose:
--   Create the SaaS billing foundation for Nythos plans and
--   account subscriptions without activating real checkout.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price NUMERIC,
  yearly_price NUMERIC,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT,
  provider_price_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'free', 'legacy')),
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_started_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_subscriptions_owner_user_id
  ON public.account_subscriptions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_subscriptions_plan_id
  ON public.account_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_account_subscriptions_status
  ON public.account_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_sort
  ON public.subscription_plans(is_active, sort_order);

DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_account_subscriptions_updated_at ON public.account_subscriptions;
CREATE TRIGGER update_account_subscriptions_updated_at
  BEFORE UPDATE ON public.account_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

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
    'Starter',
    'Para experimentar o essencial da rotina clinica.',
    0,
    0,
    jsonb_build_object(
      'max_active_patients', 5,
      'max_team_members', 0,
      'max_documents', 20,
      'max_storage_mb', 250,
      'google_calendar_enabled', FALSE,
      'patient_portal_enabled', FALSE,
      'packages_enabled', FALSE,
      'receipts_enabled', TRUE,
      'audit_log_enabled', TRUE,
      'advanced_reports_enabled', FALSE
    ),
    '["agenda_basica","prontuario_basico","financeiro_simples","recibos","audit_log"]'::jsonb,
    NULL,
    NULL,
    TRUE,
    10
  ),
  (
    'professional',
    'Professional',
    'Para psicologos que querem operar a clinica com clareza.',
    89,
    890,
    jsonb_build_object(
      'max_active_patients', 100,
      'max_team_members', 0,
      'max_documents', 500,
      'max_storage_mb', 10240,
      'google_calendar_enabled', TRUE,
      'patient_portal_enabled', TRUE,
      'packages_enabled', TRUE,
      'receipts_enabled', TRUE,
      'audit_log_enabled', TRUE,
      'advanced_reports_enabled', FALSE
    ),
    '["agenda","prontuario","financeiro","pacotes","portal_paciente","documentos","google_calendar","recibos","audit_log"]'::jsonb,
    NULL,
    NULL,
    TRUE,
    20
  ),
  (
    'clinic',
    'Clinic',
    'Para clinicas pequenas que precisam de equipe e escala.',
    NULL,
    NULL,
    jsonb_build_object(
      'max_active_patients', 500,
      'max_team_members', 10,
      'max_documents', 5000,
      'max_storage_mb', 102400,
      'google_calendar_enabled', TRUE,
      'patient_portal_enabled', TRUE,
      'packages_enabled', TRUE,
      'receipts_enabled', TRUE,
      'audit_log_enabled', TRUE,
      'advanced_reports_enabled', TRUE
    ),
    '["agenda","prontuario","financeiro","pacotes","portal_paciente","documentos","google_calendar","recibos","audit_log","equipe","relatorios_avancados"]'::jsonb,
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

-- Preserve legacy subscription rows without trusting old plan identifiers as
-- canonical SaaS plans. Existing paid/manual grants become Professional.
INSERT INTO public.account_subscriptions (
  owner_user_id,
  plan_id,
  status,
  current_period_started_at,
  current_period_ends_at,
  cancel_at_period_end,
  provider,
  metadata,
  created_at,
  updated_at
)
SELECT
  s.user_id,
  CASE
    WHEN s.plan_id IN ('free', 'professional', 'clinic') THEN s.plan_id
    ELSE 'professional'
  END,
  CASE s.status
    WHEN 'canceled' THEN 'cancelled'
    WHEN 'unpaid' THEN 'past_due'
    WHEN 'active' THEN 'active'
    WHEN 'trialing' THEN 'trialing'
    WHEN 'past_due' THEN 'past_due'
    ELSE 'legacy'
  END,
  s.current_period_start,
  s.current_period_end,
  COALESCE(s.cancel_at_period_end, FALSE),
  CASE WHEN s.plan_id IN ('monthly', 'yearly') THEN 'asaas' ELSE NULL END,
  jsonb_build_object(
    'source', 'legacy_subscriptions',
    'legacy_subscription_id', s.id,
    'legacy_plan_id', s.plan_id,
    'billing_effects_enabled', FALSE
  ),
  COALESCE(s.created_at, NOW()),
  COALESCE(s.updated_at, NOW())
FROM public.subscriptions s
ON CONFLICT (owner_user_id) DO NOTHING;

-- Existing owner accounts without a subscription are treated as legacy so no
-- current therapist loses access during the SaaS billing transition.
INSERT INTO public.account_subscriptions (
  owner_user_id,
  plan_id,
  status,
  metadata
)
SELECT
  p.id,
  'professional',
  'legacy',
  jsonb_build_object(
    'source', 'billing_foundation_backfill',
    'billing_effects_enabled', FALSE
  )
FROM public.profiles p
WHERE COALESCE(p.role, 'therapist') <> 'secretary'
  AND NOT EXISTS (
    SELECT 1
    FROM public.account_subscriptions s
    WHERE s.owner_user_id = p.id
  );

CREATE OR REPLACE FUNCTION public.create_default_account_subscription()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.role, 'therapist') <> 'secretary' THEN
    INSERT INTO public.account_subscriptions (
      owner_user_id,
      plan_id,
      status,
      trial_started_at,
      trial_ends_at,
      metadata
    )
    VALUES (
      NEW.id,
      'professional',
      'trialing',
      NOW(),
      NOW() + INTERVAL '14 days',
      jsonb_build_object(
        'source', 'profile_created',
        'billing_effects_enabled', FALSE
      )
    )
    ON CONFLICT (owner_user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS create_default_account_subscription ON public.profiles;
CREATE TRIGGER create_default_account_subscription
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_account_subscription();

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read active subscription plans" ON public.subscription_plans;
CREATE POLICY "Authenticated users can read active subscription plans"
  ON public.subscription_plans FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Owners and team can read account subscription" ON public.account_subscriptions;
CREATE POLICY "Owners and team can read account subscription"
  ON public.account_subscriptions FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.employer_id = account_subscriptions.owner_user_id
    )
  );

REVOKE ALL ON public.subscription_plans FROM anon, authenticated;
REVOKE ALL ON public.account_subscriptions FROM anon, authenticated;

GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT SELECT (
  id,
  owner_user_id,
  plan_id,
  status,
  trial_started_at,
  trial_ends_at,
  current_period_started_at,
  current_period_ends_at,
  cancel_at_period_end,
  provider,
  created_at,
  updated_at
) ON public.account_subscriptions TO authenticated;

-- Harden the legacy table: code may still read it during transition, but
-- authenticated clients should not write old billing state directly.
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;

REVOKE EXECUTE ON FUNCTION public.create_default_account_subscription() FROM PUBLIC, anon, authenticated;
