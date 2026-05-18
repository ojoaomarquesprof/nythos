-- ============================================================
-- Migration: consume_session_package_credit_on_completion
-- Purpose:
--   Consume one package credit when a package session is completed,
--   safely and idempotently, without creating session cash_flow.
-- ============================================================

DROP INDEX IF EXISTS public.session_package_usages_session_id_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS session_package_usages_active_session_id_uidx
  ON public.session_package_usages(session_id)
  WHERE session_id IS NOT NULL
    AND status = 'active';

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
    'Sessao realizada - ' || COALESCE(v_patient_name, 'Paciente'),
    'session',
    'pending',
    (NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date,
    v_guardian_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_session_completed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_session_completed() TO service_role;
