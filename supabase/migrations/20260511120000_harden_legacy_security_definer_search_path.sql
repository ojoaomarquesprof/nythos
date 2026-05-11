-- ============================================================
-- Migration: harden legacy SECURITY DEFINER search_path
-- Purpose: Ensure older SECURITY DEFINER trigger functions cannot resolve
--          attacker-controlled objects through an unsafe search_path.
-- ============================================================

DO $$
DECLARE
  v_function_name TEXT;
  v_function_oid OID;
BEGIN
  FOREACH v_function_name IN ARRAY ARRAY[
    'handle_new_user',
    'handle_session_completed',
    'handle_audit_log'
  ]
  LOOP
    SELECT p.oid
      INTO v_function_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_function_name
      AND p.pronargs = 0
    LIMIT 1;

    IF v_function_oid IS NOT NULL THEN
      EXECUTE format(
        'ALTER FUNCTION %s SET search_path = public, pg_temp',
        v_function_oid::regprocedure
      );
    END IF;
  END LOOP;
END;
$$;
