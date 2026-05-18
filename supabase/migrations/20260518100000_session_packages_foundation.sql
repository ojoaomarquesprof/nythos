-- ============================================================
-- Migration: session_packages_foundation
-- Purpose:
--   Add the database foundation for session packages without UI,
--   Asaas integration, or partial-payment ledgers.
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

CREATE INDEX IF NOT EXISTS idx_session_packages_user_id
  ON public.session_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_session_packages_patient_id
  ON public.session_packages(patient_id);
CREATE INDEX IF NOT EXISTS idx_session_packages_status
  ON public.session_packages(status);
CREATE INDEX IF NOT EXISTS idx_session_packages_payment_status
  ON public.session_packages(payment_status);
CREATE INDEX IF NOT EXISTS idx_session_packages_expires_at
  ON public.session_packages(expires_at);

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "Users can insert relevant session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "Users can update relevant session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "Therapists can delete own session_packages" ON public.session_packages;

CREATE POLICY "Users can view relevant session_packages"
  ON public.session_packages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
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
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = session_packages.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = session_packages.patient_id
        AND patients.user_id = session_packages.user_id
    )
    AND (
      session_packages.guardian_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.patient_guardians
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
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = session_packages.user_id
    )
  )
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = session_packages.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = session_packages.patient_id
        AND patients.user_id = session_packages.user_id
    )
    AND (
      session_packages.guardian_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.patient_guardians
        WHERE patient_guardians.id = session_packages.guardian_id
          AND patient_guardians.patient_id = session_packages.patient_id
      )
    )
  );

CREATE POLICY "Therapists can delete own session_packages"
  ON public.session_packages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS billing_mode TEXT,
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL;

UPDATE public.sessions
SET billing_mode = CASE
  WHEN session_price = 0 THEN 'free'
  ELSE 'single'
END
WHERE billing_mode IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN billing_mode SET DEFAULT 'single',
  ALTER COLUMN billing_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sessions'::regclass
      AND conname = 'sessions_billing_mode_check'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_billing_mode_check
      CHECK (billing_mode IN ('single', 'free', 'package'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sessions'::regclass
      AND conname = 'sessions_package_billing_check'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_package_billing_check
      CHECK (
        (billing_mode = 'package' AND package_id IS NOT NULL)
        OR (billing_mode <> 'package' AND package_id IS NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sessions_billing_mode
  ON public.sessions(billing_mode);
CREATE INDEX IF NOT EXISTS idx_sessions_package_id
  ON public.sessions(package_id);

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

ALTER TABLE public.cash_flow
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL;

UPDATE public.cash_flow cf
SET patient_id = s.patient_id
FROM public.sessions s
WHERE cf.session_id = s.id
  AND cf.patient_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cash_flow'::regclass
      AND conname = 'cash_flow_package_billing_check'
  ) THEN
    ALTER TABLE public.cash_flow
      ADD CONSTRAINT cash_flow_package_billing_check
      CHECK (
        package_id IS NULL
        OR (
          type = 'income'
          AND category = 'package'
          AND session_id IS NULL
          AND patient_id IS NOT NULL
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_cash_flow_patient_id
  ON public.cash_flow(patient_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_package_id
  ON public.cash_flow(package_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cash_flow
    WHERE session_id IS NOT NULL
    GROUP BY session_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_cash_flow_session_id' USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_session_id_uidx
  ON public.cash_flow(session_id)
  WHERE session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_package_id_uidx
  ON public.cash_flow(package_id)
  WHERE package_id IS NOT NULL
    AND category = 'package'
    AND type = 'income';

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

CREATE INDEX IF NOT EXISTS idx_session_package_usages_package_id
  ON public.session_package_usages(package_id);
CREATE INDEX IF NOT EXISTS idx_session_package_usages_status
  ON public.session_package_usages(status);
CREATE INDEX IF NOT EXISTS idx_session_package_usages_used_at
  ON public.session_package_usages(used_at);
CREATE UNIQUE INDEX IF NOT EXISTS session_package_usages_session_id_uidx
  ON public.session_package_usages(session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.session_package_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant session_package_usages" ON public.session_package_usages;
DROP POLICY IF EXISTS "Users can insert relevant session_package_usages" ON public.session_package_usages;
DROP POLICY IF EXISTS "Users can update relevant session_package_usages" ON public.session_package_usages;
DROP POLICY IF EXISTS "Therapists can delete own session_package_usages" ON public.session_package_usages;

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

DROP TRIGGER IF EXISTS update_session_packages_updated_at ON public.session_packages;
CREATE TRIGGER update_session_packages_updated_at
  BEFORE UPDATE ON public.session_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.handle_session_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_patient_name TEXT;
  v_guardian_id UUID;
  v_billing_mode TEXT;
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

REVOKE EXECUTE ON FUNCTION public.validate_session_package_link() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_session_package_usage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_session_completed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_session_completed() TO service_role;
