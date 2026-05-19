-- ============================================================
-- Migration: harden_critical_audit_logs
-- Purpose:
--   Reuse audit_logs for critical audit events without storing
--   raw clinical payloads or sensitive document/token data.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  actor_role TEXT,
  entity_type TEXT,
  entity_id UUID,
  patient_id UUID,
  session_id UUID,
  package_id UUID,
  cash_flow_id UUID,
  document_id UUID,
  metadata JSONB,
  ip_hash TEXT,
  user_agent_hash TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS patient_id UUID,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS package_id UUID,
  ADD COLUMN IF NOT EXISTS cash_flow_id UUID,
  ADD COLUMN IF NOT EXISTS document_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS user_agent_hash TEXT;

ALTER TABLE public.audit_logs
  ALTER COLUMN table_name DROP NOT NULL,
  ALTER COLUMN record_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_id
  ON public.audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Legacy trigger rows may contain raw patient/session/task payloads. Keep the
-- event row, but remove raw JSON that can include clinical notes or access data.
UPDATE public.audit_logs
SET
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object('legacy_raw_payload_removed', TRUE),
  old_data = NULL,
  new_data = NULL
WHERE old_data IS NOT NULL
   OR new_data IS NOT NULL;

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

DROP POLICY IF EXISTS "Audit logs are read-only for system" ON public.audit_logs;
CREATE POLICY "Audit logs are read-only for system"
  ON public.audit_logs FOR SELECT
  USING (FALSE);

CREATE OR REPLACE FUNCTION public.handle_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_new JSONB := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_old JSONB := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_row JSONB := COALESCE(v_new, v_old);
  v_entity_id UUID := NULL;
  v_patient_id UUID := NULL;
  v_session_id UUID := NULL;
  v_metadata JSONB := '{}'::jsonb;
BEGIN
  IF v_row ? 'id' AND NULLIF(v_row->>'id', '') IS NOT NULL THEN
    v_entity_id := (v_row->>'id')::UUID;
  END IF;

  IF TG_TABLE_NAME = 'patients' THEN
    v_patient_id := v_entity_id;
    v_metadata := jsonb_build_object(
      'old_status', v_old->>'status',
      'new_status', v_new->>'status',
      'has_auth_user', COALESCE(v_new ? 'auth_user_id', v_old ? 'auth_user_id', FALSE)
    );
  ELSIF TG_TABLE_NAME = 'sessions' THEN
    v_session_id := v_entity_id;
    IF v_row ? 'patient_id' AND NULLIF(v_row->>'patient_id', '') IS NOT NULL THEN
      v_patient_id := (v_row->>'patient_id')::UUID;
    END IF;
    v_metadata := jsonb_build_object(
      'old_status', v_old->>'status',
      'new_status', v_new->>'status',
      'billing_mode', v_row->>'billing_mode',
      'has_evolution', NULLIF(COALESCE(v_new->>'session_notes_encrypted', v_old->>'session_notes_encrypted'), '') IS NOT NULL
    );
  ELSIF TG_TABLE_NAME = 'patient_tasks' THEN
    IF v_row ? 'patient_id' AND NULLIF(v_row->>'patient_id', '') IS NOT NULL THEN
      v_patient_id := (v_row->>'patient_id')::UUID;
    END IF;
    v_metadata := jsonb_build_object(
      'old_status', v_old->>'status',
      'new_status', v_new->>'status',
      'old_task_type', v_old->>'task_type',
      'new_task_type', v_new->>'task_type'
    );
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    entity_type,
    entity_id,
    patient_id,
    session_id,
    metadata
  )
  VALUES (
    auth.uid(),
    lower(TG_OP) || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_entity_id,
    TG_TABLE_NAME,
    v_entity_id,
    v_patient_id,
    v_session_id,
    v_metadata
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_audit_log() FROM PUBLIC, anon, authenticated;
