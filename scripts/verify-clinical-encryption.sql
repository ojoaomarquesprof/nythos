-- ============================================================
-- Nythos clinical encryption verification
-- ============================================================
-- Run in Supabase SQL Editor after applying migrations and seeding Vault.
--
-- 1) Inventory possible legacy plaintext values. Counts should not grow
--    after new writes. Existing counts need a controlled backfill.
-- 2) Optional smoke test: replace the UUID placeholders at the bottom,
--    run the transaction, confirm stored_value starts with ENC::, then
--    keep the ROLLBACK.
-- ============================================================

WITH findings AS (
  SELECT 'patients.notes_encrypted' AS field, count(*) AS possible_plaintext
  FROM public.patients
  WHERE notes_encrypted IS NOT NULL
    AND notes_encrypted <> ''
    AND NOT public.is_db_encrypted_text(notes_encrypted)

  UNION ALL
  SELECT 'patients.diagnosis_encrypted', count(*)
  FROM public.patients
  WHERE diagnosis_encrypted IS NOT NULL
    AND diagnosis_encrypted <> ''
    AND NOT public.is_db_encrypted_text(diagnosis_encrypted)

  UNION ALL
  SELECT 'sessions.session_notes_encrypted', count(*)
  FROM public.sessions
  WHERE session_notes_encrypted IS NOT NULL
    AND session_notes_encrypted <> ''
    AND NOT public.is_db_encrypted_text(session_notes_encrypted)

  UNION ALL
  SELECT 'patient_evaluations.score', count(*)
  FROM public.patient_evaluations
  WHERE score IS NOT NULL
    AND score <> ''
    AND NOT public.is_db_encrypted_text(score)

  UNION ALL
  SELECT 'patient_evaluations.notes', count(*)
  FROM public.patient_evaluations
  WHERE notes IS NOT NULL
    AND notes <> ''
    AND NOT public.is_db_encrypted_text(notes)

  UNION ALL
  SELECT 'abc_records.antecedent', count(*)
  FROM public.abc_records
  WHERE antecedent IS NOT NULL
    AND antecedent <> ''
    AND NOT public.is_db_encrypted_text(antecedent)

  UNION ALL
  SELECT 'abc_records.behavior', count(*)
  FROM public.abc_records
  WHERE behavior IS NOT NULL
    AND behavior <> ''
    AND NOT public.is_db_encrypted_text(behavior)

  UNION ALL
  SELECT 'abc_records.consequence', count(*)
  FROM public.abc_records
  WHERE consequence IS NOT NULL
    AND consequence <> ''
    AND NOT public.is_db_encrypted_text(consequence)

  UNION ALL
  SELECT 'patient_neuro_profiles.diagnosis_details', count(*)
  FROM public.patient_neuro_profiles
  WHERE diagnosis_details IS NOT NULL
    AND diagnosis_details <> ''
    AND NOT public.is_db_encrypted_text(diagnosis_details)

  UNION ALL
  SELECT 'patient_neuro_profiles.sensory_profile', count(*)
  FROM public.patient_neuro_profiles
  WHERE sensory_profile IS NOT NULL
    AND sensory_profile <> '{}'::jsonb
    AND (
      jsonb_typeof(sensory_profile) <> 'string'
      OR NOT public.is_db_encrypted_text(sensory_profile #>> '{}')
    )

  UNION ALL
  SELECT 'anamnesis_responses.responses', count(*)
  FROM public.anamnesis_responses
  WHERE responses IS NOT NULL
    AND responses <> '{}'::jsonb
    AND (
      jsonb_typeof(responses) <> 'string'
      OR NOT public.is_db_encrypted_text(responses #>> '{}')
    )
)
SELECT *
FROM findings
ORDER BY field;

-- Optional smoke test for a patient note. Replace the UUID and run as an
-- authenticated therapist session in SQL Editor if available.
--
-- BEGIN;
-- SELECT public.append_patient_clinical_note(
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   'SMOKE_TEST_CLINICAL_ENCRYPTION_DO_NOT_COMMIT'
-- );
-- SELECT
--   notes_encrypted AS stored_value,
--   public.is_db_encrypted_text(notes_encrypted) AS stored_as_encrypted
-- FROM public.patients
-- WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
-- ROLLBACK;
