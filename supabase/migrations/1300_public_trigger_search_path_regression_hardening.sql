-- Re-harden public trigger functions whose explicit search_path regressed.
--
-- Several functions hardened by migration 0990 were later replaced, which reset
-- function-level configuration. Keep SECURITY INVOKER semantics and current ACLs;
-- this migration changes only each function's explicit execution search_path.
--
-- The final catalog assertion is generic: every public trigger function must carry
-- an explicit search_path and remain SECURITY INVOKER unless a future separately
-- reviewed exception changes this invariant.

alter function public.tr_birth_revision_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_chat_turn_attempt_progression_guard()
  set search_path = pg_catalog, public;

alter function public.tr_episode_progress_event_account_deletion_guard_v1()
  set search_path = pg_catalog, public;

alter function public.tr_reading_grounding_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_reading_ref_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_reading_request_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_terminal_reading_execution_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_validate_data_deletion_job_identity()
  set search_path = pg_catalog, public;

DO $$
DECLARE
  v_missing_search_path text;
  v_security_definer text;
BEGIN
  SELECT pg_catalog.string_agg(
           p.oid::pg_catalog.regprocedure::text,
           ', ' ORDER BY p.oid::pg_catalog.regprocedure::text
         )
    INTO v_missing_search_path
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg LIKE 'search_path=%'
    );

  IF v_missing_search_path IS NOT NULL THEN
    RAISE EXCEPTION
      'public trigger functions missing explicit search_path: %',
      v_missing_search_path;
  END IF;

  SELECT pg_catalog.string_agg(
           p.oid::pg_catalog.regprocedure::text,
           ', ' ORDER BY p.oid::pg_catalog.regprocedure::text
         )
    INTO v_security_definer
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    AND p.prosecdef;

  IF v_security_definer IS NOT NULL THEN
    RAISE EXCEPTION
      'public trigger functions unexpectedly SECURITY DEFINER: %',
      v_security_definer;
  END IF;
END
$$;
