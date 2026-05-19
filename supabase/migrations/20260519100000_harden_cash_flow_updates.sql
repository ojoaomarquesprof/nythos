-- ============================================================
-- Migration: harden_cash_flow_updates
-- Purpose:
--   Protect financial cash_flow rows from unsafe direct updates
--   while preserving legitimate manual payment/cancellation flows.
-- ============================================================

DROP POLICY IF EXISTS "Users can update relevant cash_flow" ON public.cash_flow;
CREATE POLICY "Users can update relevant cash_flow"
  ON public.cash_flow FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = cash_flow.user_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = cash_flow.user_id
    )
  );

DROP POLICY IF EXISTS "Therapists can delete own cash_flow" ON public.cash_flow;

CREATE OR REPLACE FUNCTION public.validate_cash_flow_update()
RETURNS TRIGGER AS $$
DECLARE
  v_immutable_changes TEXT[] := ARRAY[]::TEXT[];
  v_is_privileged_context BOOLEAN := current_user NOT IN ('authenticated', 'anon');
  v_is_allowed_pending_package_adjustment BOOLEAN := FALSE;
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    v_immutable_changes := array_append(v_immutable_changes, 'user_id');
  END IF;

  IF OLD.session_id IS DISTINCT FROM NEW.session_id THEN
    v_immutable_changes := array_append(v_immutable_changes, 'session_id');
  END IF;

  IF OLD.package_id IS DISTINCT FROM NEW.package_id THEN
    v_immutable_changes := array_append(v_immutable_changes, 'package_id');
  END IF;

  IF OLD.patient_id IS DISTINCT FROM NEW.patient_id THEN
    v_immutable_changes := array_append(v_immutable_changes, 'patient_id');
  END IF;

  IF OLD.type IS DISTINCT FROM NEW.type THEN
    v_immutable_changes := array_append(v_immutable_changes, 'type');
  END IF;

  IF OLD.category IS DISTINCT FROM NEW.category THEN
    v_immutable_changes := array_append(v_immutable_changes, 'category');
  END IF;

  IF OLD.amount IS DISTINCT FROM NEW.amount THEN
    v_immutable_changes := array_append(v_immutable_changes, 'amount');
  END IF;

  IF OLD.guardian_id IS DISTINCT FROM NEW.guardian_id THEN
    v_immutable_changes := array_append(v_immutable_changes, 'guardian_id');
  END IF;

  v_is_allowed_pending_package_adjustment :=
    array_length(v_immutable_changes, 1) IS NOT NULL
    AND v_immutable_changes <@ ARRAY['amount', 'guardian_id']::TEXT[]
    AND v_is_privileged_context
    AND OLD.status = 'pending'
    AND NEW.status = 'pending'
    AND OLD.type = 'income'
    AND OLD.category = 'package'
    AND OLD.package_id IS NOT NULL
    AND OLD.session_id IS NULL
    AND OLD.patient_id IS NOT NULL;

  IF array_length(v_immutable_changes, 1) IS NOT NULL
    AND NOT v_is_allowed_pending_package_adjustment
  THEN
    RAISE EXCEPTION 'cash_flow_immutable_field_change' USING ERRCODE = '23514';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled') THEN
      IF NEW.status = 'confirmed' AND NEW.paid_at IS NULL THEN
        RAISE EXCEPTION 'cash_flow_paid_at_required' USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'cash_flow_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS validate_cash_flow_update ON public.cash_flow;
CREATE TRIGGER validate_cash_flow_update
  BEFORE UPDATE ON public.cash_flow
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_cash_flow_update();

REVOKE EXECUTE ON FUNCTION public.validate_cash_flow_update() FROM PUBLIC, anon, authenticated;
