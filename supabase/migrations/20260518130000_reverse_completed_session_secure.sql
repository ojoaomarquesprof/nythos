-- ============================================================
-- Migration: reverse_completed_session_secure
-- Purpose:
--   Safely undo a completed session without deleting financial
--   or package usage history.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reverse_completed_session_secure(
  p_session_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_actor_employer_id UUID;
  v_session public.sessions%ROWTYPE;
  v_billing_mode TEXT;
  v_cash_flow public.cash_flow%ROWTYPE;
  v_usage public.session_package_usages%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_cash_flow_cancelled BOOLEAN := FALSE;
  v_package_credit_reversed BOOLEAN := FALSE;
  v_had_evolution BOOLEAN := FALSE;
  v_warning TEXT := NULL;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT pr.role, pr.employer_id
  INTO v_actor_role, v_actor_employer_id
  FROM public.profiles pr
  WHERE pr.id = v_actor_id;

  IF COALESCE(v_actor_role, '') NOT IN ('therapist', 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_session.user_id <> v_actor_id
    AND v_session.user_id IS DISTINCT FROM v_actor_employer_id
  THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'completed' THEN
    RAISE EXCEPTION 'session_not_completed' USING ERRCODE = '22023';
  END IF;

  v_billing_mode := COALESCE(
    NULLIF(v_session.billing_mode, ''),
    CASE WHEN v_session.package_id IS NOT NULL THEN 'package' ELSE 'single' END
  );
  v_had_evolution := NULLIF(v_session.session_notes_encrypted, '') IS NOT NULL;

  IF v_billing_mode = 'single' THEN
    SELECT cf.*
    INTO v_cash_flow
    FROM public.cash_flow cf
    WHERE cf.session_id = v_session.id
    ORDER BY cf.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_cash_flow.id IS NOT NULL THEN
      IF v_cash_flow.status = 'confirmed' THEN
        RAISE EXCEPTION 'session_billing_confirmed' USING ERRCODE = '22023';
      ELSIF v_cash_flow.status = 'pending' THEN
        UPDATE public.cash_flow
        SET status = 'cancelled'
        WHERE id = v_cash_flow.id;

        v_cash_flow_cancelled := TRUE;
      END IF;
    END IF;
  ELSIF v_billing_mode = 'package' THEN
    SELECT spu.*
    INTO v_usage
    FROM public.session_package_usages spu
    WHERE spu.session_id = v_session.id
      AND spu.status = 'active'
    ORDER BY spu.used_at DESC NULLS LAST, spu.created_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF v_usage.id IS NULL THEN
      v_warning := 'package_usage_not_found';
    ELSE
      UPDATE public.session_package_usages
      SET
        status = 'reversed',
        reversed_at = NOW(),
        reversed_by = v_actor_id,
        reversal_reason = LEFT(COALESCE(v_reason, 'Reversao da realizacao da sessao'), 500)
      WHERE id = v_usage.id
        AND status = 'active';

      v_package_credit_reversed := TRUE;
    END IF;
  END IF;

  UPDATE public.sessions
  SET
    status = 'scheduled',
    completed_at = NULL
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'patient_id', v_session.patient_id,
    'status', 'scheduled',
    'billing_mode', v_billing_mode,
    'cash_flow_cancelled', v_cash_flow_cancelled,
    'package_credit_reversed', v_package_credit_reversed,
    'had_evolution', v_had_evolution,
    'warning', v_warning
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.reverse_completed_session_secure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_completed_session_secure(UUID, TEXT) TO authenticated;
