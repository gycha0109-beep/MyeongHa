#!/usr/bin/env bash
set -euo pipefail

apply_migrations() {
  local db="$1"
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
  for migration in supabase/migrations/*.sql; do
    echo "Applying ${migration} to ${db}"
    PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done
}

isolated_template_db="myeongha_authority_core_template"

cleanup_isolated_template() {
  dropdb --if-exists "$isolated_template_db" >/dev/null 2>&1 || true
}
trap cleanup_isolated_template EXIT

ensure_isolated_template() {
  if psql -Atqc "select 1 from pg_database where datname = '${isolated_template_db}'" | grep -qx '1'; then
    return
  fi

  createdb "$isolated_template_db"
  apply_migrations "$isolated_template_db"
}

run_isolated_case() {
  local db="$1"
  shift
  (
    set -euo pipefail
    ensure_isolated_template
    dropdb --if-exists "$db" >/dev/null 2>&1 || true
    createdb --template="$isolated_template_db" "$db"
    trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
    PGDATABASE="$db" "$@"
  )
}

bash test/db/verify_no_schema_cardinality_hardcoding.sh
# Every migration/app runtime commit rechecks the recognized paid Reader Writer caller graph.
node scripts/ci/official-reader-writer-call-graph.mjs --self-test
node scripts/ci/official-reader-writer-call-graph.mjs --report
# Exercise the actual 1460..1510 -> 1400..1450 inversion only on a
# disposable local PostgreSQL database in CI. Never use Production credentials.
if [[ "${CI:-}" == 'true' && "${PGHOST:-}" == 'localhost' &&
      "${PGDATABASE:-}" == 'myeongha_test' ]]; then
  bash test/db/relationship_gap_retroactive_backfill_synthetic.sh
fi


psql -v ON_ERROR_STOP=1 -f test/db/authority_core_negative.sql
psql -1 -v ON_ERROR_STOP=1 -f test/db/record_world_negative.sql
psql -1 -v ON_ERROR_STOP=1 -f test/db/reading_ops_negative.sql
psql -1 -v ON_ERROR_STOP=1 -f test/db/story_share_negative.sql
psql -1 -v ON_ERROR_STOP=1 -f test/db/notification_deletion_negative.sql
psql -1 -v ON_ERROR_STOP=1 -f test/db/commerce_negative.sql

bash test/db/account_deletion_policy_catalog_guard.sh
bash test/db/subject_owned_data_graph_catalog_guard.sh
bash test/db/transitive_subject_dependency_graph_catalog_guard.sh
bash test/db/outbox_claim_concurrency.sh
bash test/db/saju_source_proof_nonce_claim_concurrency.sh
run_isolated_case myeongha_saju_custody_challenge_test bash test/db/saju_staging_custody_challenge_authority.sh
run_isolated_case myeongha_saju_so2_registry_test bash test/db/saju_so2_registry_floor_authority.sh
bash test/db/chat_receive_concurrency.sh
bash test/db/chat_attempt_commit_concurrency.sh
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_zero_personal_source_pre_model_pin_v1.sql
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_ai_call_lifecycle_v1.sql
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_ai_governor_atomic_admission_v1.sql
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_ai_governor_atomic_settlement_v1.sql
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_ai_governor_legacy_settlement_guard_v1.sql
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_ai_governor_internal_start_v1.sql
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_ai_governor_role_cutover_preflight_v1.sql
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_governed_execution_role_v1.sql
bash test/db/seyeon_governed_login_boundary_v1.sh
run_isolated_case myeongha_seyeon_d4a_test bash test/db/seyeon_governed_cost_d4a_race.sh
run_isolated_case myeongha_seyeon_d4b_test bash test/db/seyeon_governed_cost_d4b_deletion_race.sh
run_isolated_case myeongha_seyeon_d4b2_test bash test/db/seyeon_governed_cost_d4b2_settle_delete_race.sh
run_isolated_case myeongha_seyeon_d4b3_test bash test/db/seyeon_governed_cost_d4b3_cross_subject_race.sh
run_isolated_case myeongha_seyeon_d4b4_test bash test/db/seyeon_governed_cost_d4b4_settlement_crash_replay.sh
run_isolated_case myeongha_seyeon_d4b5_test bash test/db/seyeon_governed_cost_d4b5_lock_timeout_deadlock.sh
run_isolated_case myeongha_seyeon_d4b6_test bash test/db/seyeon_governed_cost_d4b6_guest_promotion_race.sh
run_isolated_case myeongha_seyeon_d4b7_test bash test/db/seyeon_governed_cost_d4b7_guest_expiry.sh
run_isolated_case myeongha_seyeon_d4b8a_test bash test/db/seyeon_governed_cost_d4b8_guest_promoted_settlement.sh
run_isolated_case myeongha_seyeon_d4b8b_test bash test/db/seyeon_governed_cost_d4b8b_guest_expired_inflight_settlement.sh
run_isolated_case myeongha_seyeon_d4b9_test bash test/db/seyeon_governed_cost_d4b9_detached_expired_guest_settlement.sh
run_isolated_case myeongha_seyeon_d4b10b_test bash test/db/seyeon_governed_cost_d4b10b_reservation_receipt_pin.sh
run_isolated_case myeongha_seyeon_d4b10c1_test bash test/db/seyeon_governed_cost_d4b10c1_provider_receipt_queue.sh
run_isolated_case myeongha_seyeon_d4b10d_test bash test/db/seyeon_governed_cost_d4b10d_multiworker_race.sh
run_isolated_case myeongha_seyeon_d4b10f_test bash test/db/seyeon_detached_worker_preflight_real_roles.sh
run_isolated_case myeongha_seyeon_d4b10g_test bash test/db/seyeon_detached_worker_real_driver_end_to_end.sh
psql -v ON_ERROR_STOP=1 -f test/db/seyeon_ai_legacy_cutover_revoke_simulation_v1.sql
bash test/db/seyeon_legacy_cutover_readonly_preflight_v1.sh
bash test/db/character_face_governed_artifact_commit.sh
bash test/db/chat_retry_abandon_concurrency.sh
bash test/db/birth_profile_create_concurrency.sh

run_isolated_case myeongha_target_person_test bash test/db/target_person_create_concurrency.sh
run_isolated_case myeongha_device_revoke_test bash test/db/device_installation_revoke_concurrency.sh
run_isolated_case myeongha_profile_patch_test bash test/db/profile_patch_concurrency.sh
run_isolated_case myeongha_character_bundle_query_test bash test/db/character_bundle_projection_queries.sh
run_isolated_case myeongha_character_relation_query_test bash test/db/character_bundle_relations_query.sh
run_isolated_case myeongha_content_bundle_manifest_query_test bash test/db/content_bundle_manifest_query.sh
run_isolated_case myeongha_episode_bundle_query_test bash test/db/episode_bundle_projection_queries.sh

bash test/db/birth_revision_append_concurrency.sh

psql -v ON_ERROR_STOP=1 -c "delete from public.saju_domain_runtime where saju_domain in ('general','compatibility','career')"
bash test/db/reading_session_create_concurrency.sh
bash test/db/reading_transport_finalize_concurrency.sh
bash test/db/reading_clarification_concurrency.sh
bash test/db/notification_delivery_attempt_concurrency.sh
bash test/db/account_deletion_start_concurrency.sh
bash test/db/account_deletion_start_runtime_authority.sh
bash test/db/member_auth_rate_limit_authority.sh
bash test/db/account_deletion_start_rls_catalog_guard.sh
bash test/db/public_trigger_function_security_catalog_guard.sh
bash test/db/account_deletion_finalization_preflight.sh
bash test/db/account_deletion_db_finalizer.sh
bash test/db/account_deletion_worker_completion.sh
bash test/db/account_deletion_worker_execution_identity.sh
bash test/db/account_deletion_finalizer_catalog_guard.sh
bash test/db/seyeon_ai_cost_cleanup_authority.sh

run_isolated_case myeongha_privacy_reconciliation_replay_test bash test/db/privacy_reconciliation_replay.sh

bash test/db/guest_promotion_concurrency.sh
psql -v ON_ERROR_STOP=1 -f test/db/guest_promotion_auth_fk_authority.sql
bash test/db/user_resource_revocation_concurrency.sh
bash test/db/character_forget_concurrency.sh
bash test/db/memory_grant_revoke_concurrency.sh
bash test/db/life_fact_grant_revoke_concurrency.sh
bash test/db/guest_bootstrap_concurrency.sh
bash test/db/life_fact_revoke_concurrency.sh
bash test/db/memory_item_revoke_concurrency.sh
bash test/db/character_record_context_query.sh
bash test/db/notification_read_concurrency.sh
bash test/db/notification_stored_ledger_query.sh
bash test/db/notification_delivery_authority_queries.sh
bash test/db/relationship_current_query.sh
bash test/db/character_unlocks_current_query.sh
run_isolated_case myeongha_standard_reader_runtime_test bash test/db/standard_reading_reader_runtime_query.sh
run_isolated_case myeongha_standard_reading_unit_binding_test bash test/db/standard_reading_unit_binding.sh
run_isolated_case myeongha_standard_reading_artifact_reread_test bash test/db/standard_reading_artifact_reread.sh
run_isolated_case myeongha_official_standard_reader_interpretation_test bash test/db/official_standard_reading_reader_interpretation.sh
run_isolated_case myeongha_reader_thread_locator_test bash test/db/official_reader_thread_locator_query.sh
run_isolated_case myeongha_reader_first_thread_bundle_rollback_test bash test/db/official_reader_first_thread_bundle_rollback.sh
run_isolated_case myeongha_reader_first_thread_app_test bash test/db/official_reader_first_thread_typescript_postgres.sh
run_isolated_case myeongha_reader_grant_lock_race_preflight_test bash test/db/official_reader_grant_row_lock_race_preflight.sh
run_isolated_case myeongha_reader_new_grant_insert_phantom_preflight_test bash test/db/official_reader_new_grant_insert_phantom_preflight.sh
run_isolated_case myeongha_reader_provider_effect_revoke_race_preflight_test bash test/db/official_reader_provider_effect_revoke_race_preflight.sh
run_isolated_case myeongha_reader_birth_scope_lock_candidate_preflight_test bash test/db/official_reader_birth_scope_lock_candidate_preflight.sh
# S1: private Official Reader scope advisory lock; not a paid T2 protocol.
run_isolated_case myeongha_reader_scope_lock_private_preflight_test bash test/db/official_reader_scope_lock_private_preflight.sh
# S2 preflight: instrumented synthetic new Grant/Bind and revoke both acquire same scope lock.
run_isolated_case myeongha_reader_scope_lock_s2_instrumented_race_test bash test/db/official_reader_scope_lock_s2_instrumented_race.sh
# S2: provider-event revoke/expire private adapter must lock every bound Reading×Reader scope before original Commerce effect.
run_isolated_case myeongha_reader_provider_revoke_scope_lock_private_test bash test/db/official_reader_provider_revoke_scope_lock_private.sh
# S2 bridge: verified Provider cancellation resolves Subject from DB lineage; no runtime execution grant.
run_isolated_case myeongha_reader_verified_provider_revoke_bridge_private_test bash test/db/official_reader_verified_provider_revoke_bridge_private.sh
# S2: initial Reading has no UUID; lock the server-derived Subject×Product before Grant/Reading creation.
run_isolated_case myeongha_reader_initial_product_scope_lock_private_test bash test/db/official_reader_initial_product_scope_lock_private.sh
# D1: source-owned verified initial/additional purchase L0→L1 scope and real two-session Product-first lock.
run_isolated_case myeongha_reader_unified_scope_entry_private_test bash test/db/official_reader_unified_scope_entry_private.sh
# D1: sorted multi-Product L0 then multi-Reader L1; three independent PostgreSQL sessions in reversed order.
run_isolated_case myeongha_reader_multi_scope_lockset_three_session_test bash test/db/official_reader_multi_scope_lockset_three_session.sh
# D2: private 1090/1220 unified purchase issue/bind, real three-connection contention and source-derived replay.
run_isolated_case myeongha_reader_d2_unified_issue_bind_three_session_test bash test/db/official_reader_d2_unified_issue_bind_three_session.sh
# D3: dormant verified Provider cancellation with bound Reader L0-L1 and unbound initial Grant L0-only; genuine PG waits.
run_isolated_case myeongha_reader_d3_verified_cancel_unified_three_session_test bash test/db/official_reader_d3_verified_cancel_unified_three_session.sh
# D3b PRIVATE complete trusted Provider receipt/Grant impact lock inventory; A/B/C actual L0 waits.
run_isolated_case myeongha_reader_d3b_verified_impact_lockset_three_session_test bash test/db/official_reader_d3b_verified_impact_lockset_three_session.sh
# D3c: original 1080 full-revocation batch, second-Grant CAS induced all-or-nothing rollback.
run_isolated_case myeongha_reader_d3c_verified_cancel_atomic_batch_test bash test/db/official_reader_d3c_verified_cancel_atomic_batch.sh
# D3e2 PRIVATE durable cancellation observations only; no refunds or entitlements.
run_isolated_case myeongha_reader_d3e2_cancel_observation_shadow_two_session_test bash test/db/official_reader_d3e2_cancel_observation_shadow_two_session.sh
# D3e3: signed-only, no-effect durable intake with two-session real PostgreSQL replay/ACL.
run_isolated_case myeongha_reader_d3e3_cancel_inbox_two_session_test bash test/db/official_reader_d3e3_cancel_inbox_two_session.sh
# D3e4 synthetic DB contract: row lock + existing 1860 replay share COMMIT/ROLLBACK.
run_isolated_case myeongha_reader_d3e4_inbox_to_shadow_transaction_test bash test/db/official_reader_d3e4_cancel_inbox_to_shadow_transaction.sh
# D3e5 PRIVATE: SKIP LOCKED, expired lease fencing, backoff/HOLD, 1860 atomic completion.
run_isolated_case myeongha_reader_d3e5_durable_worker_lifecycle_test bash test/db/official_reader_d3e5_cancel_durable_worker_lifecycle.sh
# D3e5 full signed-HTTP→1910→1920 claim→mock GET→1860+completion TS↔PostgreSQL.
run_isolated_case myeongha_reader_d3e5_real_driver_pg_test bash test/db/official_reader_d3e5_real_driver_pg.sh
run_isolated_case myeongha_official_cancel_purchase_match_private_test bash test/db/official_reader_cancel_purchase_match_private.sh
run_isolated_case myeongha_official_reader_reviewed_cancel_bridge_test bash test/db/official_reader_cancel_reviewed_atomic_bridge_private.sh
# Prevent historic direct or SECURITY DEFINER cancellation writers bypassing reviewed entitlement revoke via public/API/Commerce roles.
run_isolated_case myeongha_official_reader_cancel_writer_execution_fence_test bash test/db/official_reader_cancel_legacy_writer_execution_fence.sh
# Guard the SECOND SECURITY DEFINER cancellation bridge and old Receipt/Reader wrappers.
run_isolated_case myeongha_official_reader_additional_writer_fence_test bash test/db/official_reader_private_writer_surface_closure.sh
bash test/db/entitlements_current_query.sh
bash test/db/data_deletion_job_query.sh
bash test/db/notification_preferences_query.sh
bash test/db/life_record_ledger_query.sh
bash test/db/life_fact_active_grants_query.sh
bash test/db/memory_active_grants_query.sh
bash test/db/memory_items_current_query.sh
bash test/db/reading_provenance_stale_query.sh
bash test/db/reading_session_provenance_stale_query.sh
bash test/db/birth_profile_current_revision_query.sh
bash test/db/target_person_current_queries.sh
bash test/db/public_share_query.sh
bash test/db/saju_domain_runtime_query.sh
bash test/db/subject_profile_current_query.sh
bash test/db/chat_thread_stream_query.sh
bash test/db/bounded_collection_read_runtime_authority.sh
bash test/db/subject_merge_job_query.sh
bash test/db/direct_merged_guest_lineage_query.sh
bash test/db/life_fact_supersede_concurrency.sh
bash test/db/catalog_snapshot.sh
