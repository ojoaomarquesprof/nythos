-- ============================================================
-- Migration: complete_sessions_billing_idempotent
-- Purpose:
--   Track session completion time and make completed-session
--   financial generation safe, idempotent, and zero-aware.
-- ============================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

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
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' THEN
      RETURN NEW;
    END IF;
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
    NEW.id,
    'income',
    v_price,
    'Sessão realizada - ' || COALESCE(v_patient_name, 'Paciente'),
    'session',
    'pending',
    (NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date,
    v_guardian_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.set_session_completed_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_session_completed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_completed_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_session_completed() TO service_role;
