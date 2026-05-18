-- ============================================================
-- Migration: session_package_management_rpcs
-- Purpose:
--   Add secure RPCs for creating and managing session packages,
--   including the principal pending cash_flow entry.
-- ============================================================

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

REVOKE EXECUTE ON FUNCTION public.current_professional_can_manage_financial_patient(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_session_package_payment_status_from_cash_flow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_session_package_with_billing(UUID, TEXT, INTEGER, NUMERIC, DATE, DATE, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_patient_session_packages(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_session_package_secure(UUID, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_session_package_status_secure(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_professional_can_manage_financial_patient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_package_with_billing(UUID, TEXT, INTEGER, NUMERIC, DATE, DATE, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_session_packages(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_package_secure(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_package_status_secure(UUID, TEXT) TO authenticated;
