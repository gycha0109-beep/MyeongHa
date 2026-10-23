-- Synthetic PostgreSQL 17 ONLY, runs after all forward SQL is replayed in disposable CI DB.
-- Watchtower-Track: ops
-- Catalog presence / ACL evidence; does NOT establish remote 104KB bundle parity
-- and is NOT a deployment authorization.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '15s';
DO $seyeon_r2_pending$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname IN (
    'internal_finalize_account_deletion_db_v1',
    'cmd_commit_character_face_governed_reading_artifact_v1',
    'cmd_record_seyeon_ai_call_cost_v1',
    'cmd_start_seyeon_ai_call_v1',
    'qry_seyeon_ai_model_cost_v1',
    'cmd_governed_start_seyeon_ai_call_v1',
    'cmd_governed_settle_seyeon_ai_call_v1',
    'guard_seyeon_ai_governor_rate_card_v1',
    'seyeon_ai_settle_internal_v1',
    'seyeon_ai_start_internal_v1',
    'cmd_mark_seyeon_chat_context_ready_pinned_v1',
    'seyeon_ai_lock_active_subject_for_cost_v1',
    'qry_member_single_character_thread_locator_v1',
    'begin_seyeon_governed_guest_subject_context_v1',
    'cmd_settle_seyeon_ai_call_detached_v1',
    'pin_seyeon_governed_reservation_receipt_v1',
    'cmd_store_seyeon_provider_receipt_v1',
    'qry_standard_reading_product_scope_v1'
  );
  IF n <> 18 THEN
    RAISE EXCEPTION 'HOLD_R2_PG17_FUNCTION_PROOFS_EXPECTED_18';
  END IF;

  SELECT count(*) INTO n
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind='r' AND c.relname IN (
    'character_reading_artifacts',
    'saju_source_proof_nonce_claims',
    'seyeon_ai_call_cost_events',
    'seyeon_ai_governor_model_policies_v1',
    'seyeon_ai_governor_daily_budgets_v1',
    'seyeon_ai_provider_receipt_queue_v1'
  )
  AND c.relrowsecurity
  AND NOT pg_catalog.has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE');
  IF n <> 6 THEN
    RAISE EXCEPTION 'HOLD_R2_PG17_TABLE_RLS_OR_BROWSER_ACL_EXPECTED_6';
  END IF;

  SELECT count(*) INTO n
  FROM pg_catalog.pg_roles r
  WHERE r.rolname IN (
    'myeongha_seyeon_cost_meter_owner',
    'myeongha_seyeon_governed_executor',
    'myeongha_seyeon_settlement_worker'
  ) AND NOT r.rolcanlogin AND NOT r.rolbypassrls;
  IF n <> 3 THEN
    RAISE EXCEPTION 'HOLD_R2_PG17_SERVER_OWNER_ROLES_EXPECTED_3';
  END IF;
END
$seyeon_r2_pending$;
SELECT 'PASS_R2_PG17_21_MIGRATION_PROOFS_ONLY_NOT_PRODUCTION_APPROVAL' AS status;
ROLLBACK;
