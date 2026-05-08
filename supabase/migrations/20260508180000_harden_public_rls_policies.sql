-- ============================================================
-- Migration: harden_public_rls_policies
-- Purpose:
--   Close broad/public RLS policies for anamnesis, subscriptions,
--   patient tasks, and optional clinical tables.
-- ============================================================

-- ============================================================
-- Public anamnesis links
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.anamnesis_responses
  ADD COLUMN IF NOT EXISTS public_token UUID;

UPDATE public.anamnesis_responses
SET public_token = gen_random_uuid()
WHERE public_token IS NULL;

ALTER TABLE public.anamnesis_responses
  ALTER COLUMN public_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_token SET NOT NULL;

ALTER TABLE public.anamnesis_responses
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnesis_responses_public_token
  ON public.anamnesis_responses(public_token);

COMMENT ON COLUMN public.anamnesis_responses.public_token IS
  'Opaque token used in public anamnesis links. Do not expose primary keys in public URLs.';

-- Remove broad public table access. Public form access now goes through
-- SECURITY DEFINER RPCs scoped by public_token.
DROP POLICY IF EXISTS "Public can view template structure" ON public.anamnesis_templates;
DROP POLICY IF EXISTS "Public can insert responses" ON public.anamnesis_responses;
DROP POLICY IF EXISTS "Public can view pending response" ON public.anamnesis_responses;
DROP POLICY IF EXISTS "Public can update pending response" ON public.anamnesis_responses;
DROP POLICY IF EXISTS "Therapists can view responses to their templates" ON public.anamnesis_responses;
DROP POLICY IF EXISTS "Therapists can manage responses to their templates" ON public.anamnesis_responses;
DROP POLICY IF EXISTS "Therapists can create response requests" ON public.anamnesis_responses;

DROP POLICY IF EXISTS "Therapists can view own anamnesis_templates" ON public.anamnesis_templates;
DROP POLICY IF EXISTS "Therapists can insert own anamnesis_templates" ON public.anamnesis_templates;
DROP POLICY IF EXISTS "Therapists can update own anamnesis_templates" ON public.anamnesis_templates;
DROP POLICY IF EXISTS "Therapists can delete own anamnesis_templates" ON public.anamnesis_templates;

CREATE POLICY "Professionals can view relevant anamnesis_templates"
  ON public.anamnesis_templates FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = anamnesis_templates.user_id
    )
  );

CREATE POLICY "Professionals can insert relevant anamnesis_templates"
  ON public.anamnesis_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = anamnesis_templates.user_id
    )
  );

CREATE POLICY "Professionals can update relevant anamnesis_templates"
  ON public.anamnesis_templates FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = anamnesis_templates.user_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = anamnesis_templates.user_id
    )
  );

CREATE POLICY "Professionals can delete relevant anamnesis_templates"
  ON public.anamnesis_templates FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.employer_id = anamnesis_templates.user_id
    )
  );

CREATE POLICY "Professionals can manage relevant anamnesis_responses"
  ON public.anamnesis_responses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anamnesis_templates
      JOIN public.patients
        ON patients.id = anamnesis_responses.patient_id
      WHERE anamnesis_templates.id = anamnesis_responses.template_id
        AND patients.user_id = anamnesis_templates.user_id
        AND (
          anamnesis_templates.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = anamnesis_templates.user_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.anamnesis_templates
      JOIN public.patients
        ON patients.id = anamnesis_responses.patient_id
      WHERE anamnesis_templates.id = anamnesis_responses.template_id
        AND patients.user_id = anamnesis_templates.user_id
        AND (
          anamnesis_templates.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = anamnesis_templates.user_id
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_public_anamnesis_response(p_public_token UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'response_id', ar.id,
    'status', ar.status,
    'template',
      CASE
        WHEN ar.status = 'pending' THEN jsonb_build_object(
          'id', at.id,
          'title', at.title,
          'description', at.description,
          'fields', at.fields
        )
        ELSE jsonb_build_object(
          'id', at.id,
          'title', at.title,
          'description', at.description
        )
      END,
    'profile', jsonb_build_object(
      'full_name', pr.full_name,
      'clinic_name', pr.clinic_name,
      'clinic_logo_url', pr.clinic_logo_url
    )
  )
  INTO v_result
  FROM public.anamnesis_responses ar
  JOIN public.anamnesis_templates at ON at.id = ar.template_id
  LEFT JOIN public.profiles pr ON pr.id = at.user_id
  WHERE ar.public_token = p_public_token
    AND ar.status IN ('pending', 'completed')
  LIMIT 1;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.submit_public_anamnesis_response(
  p_public_token UUID,
  p_responses JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_response_id UUID;
BEGIN
  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  UPDATE public.anamnesis_responses
  SET
    responses = p_responses,
    status = 'completed',
    completed_at = NOW()
  WHERE public_token = p_public_token
    AND status = 'pending'
  RETURNING id INTO v_response_id;

  IF v_response_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found_or_already_completed');
  END IF;

  RETURN jsonb_build_object('success', true, 'response_id', v_response_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_public_anamnesis_response(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_anamnesis_response(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_anamnesis_response(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_anamnesis_response(UUID, JSONB) TO anon, authenticated;

-- ============================================================
-- Subscriptions
-- ============================================================

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Patient tasks
-- ============================================================

DROP POLICY IF EXISTS "Therapists can view own patient_tasks" ON public.patient_tasks;
DROP POLICY IF EXISTS "Therapists can insert own patient_tasks" ON public.patient_tasks;
DROP POLICY IF EXISTS "Therapists can update own patient_tasks" ON public.patient_tasks;
DROP POLICY IF EXISTS "Therapists can delete own patient_tasks" ON public.patient_tasks;
DROP POLICY IF EXISTS "Patients can view own tasks" ON public.patient_tasks;
DROP POLICY IF EXISTS "Patients can update own task feedback" ON public.patient_tasks;

CREATE POLICY "Professionals can view relevant patient_tasks"
  ON public.patient_tasks FOR SELECT
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

CREATE POLICY "Professionals can insert relevant patient_tasks"
  ON public.patient_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

CREATE POLICY "Professionals can update relevant patient_tasks"
  ON public.patient_tasks FOR UPDATE
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  )
  WITH CHECK (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

CREATE POLICY "Professionals can delete relevant patient_tasks"
  ON public.patient_tasks FOR DELETE
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.employer_id = patient_tasks.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.user_id = patient_tasks.user_id
    )
  );

CREATE POLICY "Patients can view own tasks"
  ON public.patient_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Patients can update own task feedback"
  ON public.patient_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = patient_tasks.patient_id
        AND patients.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- Optional clinical tables present in the live schema
-- ============================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.patient_evaluations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.patient_evaluations ENABLE ROW LEVEL SECURITY';
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'patient_evaluations'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.patient_evaluations', pol.policyname);
    END LOOP;

    EXECUTE $policy$
      CREATE POLICY "Professionals can manage relevant patient_evaluations"
      ON public.patient_evaluations FOR ALL
      TO authenticated
      USING (
        (
          auth.uid() = user_id
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = patient_evaluations.user_id
          )
        )
        AND EXISTS (
          SELECT 1 FROM public.patients
          WHERE patients.id = patient_evaluations.patient_id
            AND patients.user_id = patient_evaluations.user_id
        )
      )
      WITH CHECK (
        (
          auth.uid() = user_id
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = patient_evaluations.user_id
          )
        )
        AND EXISTS (
          SELECT 1 FROM public.patients
          WHERE patients.id = patient_evaluations.patient_id
            AND patients.user_id = patient_evaluations.user_id
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.abc_records') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.abc_records ENABLE ROW LEVEL SECURITY';
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'abc_records'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.abc_records', pol.policyname);
    END LOOP;

    EXECUTE $policy$
      CREATE POLICY "Professionals can manage relevant abc_records"
      ON public.abc_records FOR ALL
      TO authenticated
      USING (
        (
          auth.uid() = user_id
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = abc_records.user_id
          )
        )
        AND EXISTS (
          SELECT 1 FROM public.patients
          WHERE patients.id = abc_records.patient_id
            AND patients.user_id = abc_records.user_id
        )
      )
      WITH CHECK (
        (
          auth.uid() = user_id
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = abc_records.user_id
          )
        )
        AND EXISTS (
          SELECT 1 FROM public.patients
          WHERE patients.id = abc_records.patient_id
            AND patients.user_id = abc_records.user_id
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.care_network') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.care_network ENABLE ROW LEVEL SECURITY';
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'care_network'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.care_network', pol.policyname);
    END LOOP;

    EXECUTE $policy$
      CREATE POLICY "Professionals can manage relevant care_network"
      ON public.care_network FOR ALL
      TO authenticated
      USING (
        (
          auth.uid() = user_id
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = care_network.user_id
          )
        )
        AND EXISTS (
          SELECT 1 FROM public.patients
          WHERE patients.id = care_network.patient_id
            AND patients.user_id = care_network.user_id
        )
      )
      WITH CHECK (
        (
          auth.uid() = user_id
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.employer_id = care_network.user_id
          )
        )
        AND EXISTS (
          SELECT 1 FROM public.patients
          WHERE patients.id = care_network.patient_id
            AND patients.user_id = care_network.user_id
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.patient_neuro_profiles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.patient_neuro_profiles ENABLE ROW LEVEL SECURITY';
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'patient_neuro_profiles'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.patient_neuro_profiles', pol.policyname);
    END LOOP;

    EXECUTE $policy$
      CREATE POLICY "Professionals can manage relevant patient_neuro_profiles"
      ON public.patient_neuro_profiles FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patients
          WHERE patients.id = patient_neuro_profiles.patient_id
            AND (
              patients.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.employer_id = patients.user_id
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.patients
          WHERE patients.id = patient_neuro_profiles.patient_id
            AND (
              patients.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.employer_id = patients.user_id
              )
            )
        )
      )
    $policy$;
  END IF;
END $$;
