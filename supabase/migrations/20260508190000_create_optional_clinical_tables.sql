-- ============================================================
-- Migration: create_optional_clinical_tables
-- Purpose:
--   Make optional clinical tables reproducible from migrations.
--   These tables are used by patient detail cards and appear in the
--   schema dumps/types, but were previously only hardened if already
--   present in the live schema.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Protocols / evaluations
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  protocol_name TEXT NOT NULL,
  score TEXT,
  status TEXT DEFAULT 'in_progress',
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.patient_evaluations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS protocol_name TEXT,
  ADD COLUMN IF NOT EXISTS score TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS evaluation_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_patient_evaluations_user_id
  ON public.patient_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_patient_evaluations_patient_id
  ON public.patient_evaluations(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_evaluations_evaluation_date
  ON public.patient_evaluations(evaluation_date);

DROP TRIGGER IF EXISTS update_patient_evaluations_updated_at ON public.patient_evaluations;
CREATE TRIGGER update_patient_evaluations_updated_at
  BEFORE UPDATE ON public.patient_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant patient_evaluations" ON public.patient_evaluations;
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
  );

-- ============================================================
-- ABC records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.abc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  occurrence_date DATE NOT NULL DEFAULT CURRENT_DATE,
  antecedent TEXT NOT NULL,
  behavior TEXT NOT NULL,
  consequence TEXT NOT NULL,
  intensity INTEGER,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.abc_records
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS antecedent TEXT,
  ADD COLUMN IF NOT EXISTS behavior TEXT,
  ADD COLUMN IF NOT EXISTS consequence TEXT,
  ADD COLUMN IF NOT EXISTS intensity INTEGER,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_abc_records_user_id
  ON public.abc_records(user_id);
CREATE INDEX IF NOT EXISTS idx_abc_records_patient_id
  ON public.abc_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_abc_records_session_id
  ON public.abc_records(session_id);
CREATE INDEX IF NOT EXISTS idx_abc_records_occurrence_date
  ON public.abc_records(occurrence_date);

DROP TRIGGER IF EXISTS update_abc_records_updated_at ON public.abc_records;
CREATE TRIGGER update_abc_records_updated_at
  BEFORE UPDATE ON public.abc_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.abc_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant abc_records" ON public.abc_records;
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
  );

-- ============================================================
-- Care network
-- ============================================================

CREATE TABLE IF NOT EXISTS public.care_network (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.care_network
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS specialty TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_care_network_user_id
  ON public.care_network(user_id);
CREATE INDEX IF NOT EXISTS idx_care_network_patient_id
  ON public.care_network(patient_id);

ALTER TABLE public.care_network ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant care_network" ON public.care_network;
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
  );

-- ============================================================
-- Neuro profile
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_neuro_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  support_level TEXT,
  sensory_profile JSONB DEFAULT '{}'::jsonb,
  diagnosis_details TEXT,
  protocols_used TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.patient_neuro_profiles
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS support_level TEXT,
  ADD COLUMN IF NOT EXISTS sensory_profile JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnosis_details TEXT,
  ADD COLUMN IF NOT EXISTS protocols_used TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_patient_neuro_profiles_patient_id
  ON public.patient_neuro_profiles(patient_id);

DROP TRIGGER IF EXISTS update_patient_neuro_profiles_updated_at ON public.patient_neuro_profiles;
CREATE TRIGGER update_patient_neuro_profiles_updated_at
  BEFORE UPDATE ON public.patient_neuro_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.patient_neuro_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can manage relevant patient_neuro_profiles" ON public.patient_neuro_profiles;
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
  );
