#!/usr/bin/env bash
set -euo pipefail

source test/db/staged_commerce_migration_policy.sh

apply_migrations() {
  local db="$1"
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
  for migration in supabase/migrations/*.sql; do
    if skip_staged_portone_migration_from_historical_fixture "$migration"; then continue; fi
    echo "Applying ${migration} to ${db}"
    PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done
}

isolated_template_db="myeongha_authority_core_template"
isolated_template_ready=0

# Optional, read-only CI profiling. Bash SECONDS avoids launching a timer
# process or changing any PostgreSQL test invocation.
authority_profile_started_seconds=$SECONDS
authority_profile_previous_seconds=$SECONDS
authority_profile_previous_stage=''
authority_profile_stage() {
  [[ "${MYEONGHA_AUTHORITY_PROFILE:-0}" == '1' ]] || return 0
  local now=$SECONDS
  if [[ -n "$authority_profile_previous_stage" ]]; then
    printf 'AUTHORITY_CORE_STAGE stage=%s duration_seconds=%d total_seconds=%d\n' \
      "$authority_profile_previous_stage" \
      "$((now - authority_profile_previous_seconds))" \
      "$((now - authority_profile_started_seconds))"
  fi
  authority_profile_previous_seconds=$now
  authority_profile_previous_stage="$1"
}

cleanup_isolated_template() {
  dropdb --if-exists "$isolated_template_db" >/dev/null 2>&1 || true
}
trap cleanup_isolated_template EXIT

# EPOCHREALTIME is a Bash builtin: profiling adds no process, SQL, or test waits.
# Arithmetic uses microseconds internally; logged millisecond deltas are integers.
authority_profile_duration_ms() {
  local start="${1/./}" end="${2/./}"
  printf -v "$3" '%d' "$(((10#$end - 10#$start) / 1000))"
}

ensure_isolated_template() {
  # Run in the parent shell and reuse this result for every cloned case.
  # The original implementation re-queried pg_database for each subshell.
  if [[ "$isolated_template_ready" == '1' ]]; then
    return 0
  fi
  if psql -Atqc "select 1 from pg_database where datname = '${isolated_template_db}'" | grep -qx '1'; then
    isolated_template_ready=1
    if [[ "${MYEONGHA_AUTHORITY_PROFILE:-0}" == '1' ]]; then
      printf 'AUTHORITY_CORE_TEMPLATE source=existing create_ms=0 migrate_ms=0\n'
    fi
    return 0
  fi

  local create_started='' create_finished='' migrate_finished=''
  local create_ms=0 migrate_ms=0
  if [[ "${MYEONGHA_AUTHORITY_PROFILE:-0}" == '1' ]]; then
    create_started=$EPOCHREALTIME
  fi
  createdb "$isolated_template_db"
  if [[ "${MYEONGHA_AUTHORITY_PROFILE:-0}" == '1' ]]; then
    create_finished=$EPOCHREALTIME
  fi
  apply_migrations "$isolated_template_db"
  if [[ "${MYEONGHA_AUTHORITY_PROFILE:-0}" == '1' ]]; then
    migrate_finished=$EPOCHREALTIME
    authority_profile_duration_ms "$create_started" "$create_finished" create_ms
    authority_profile_duration_ms "$create_finished" "$migrate_finished" migrate_ms
    printf 'AUTHORITY_CORE_TEMPLATE source=created create_ms=%d migrate_ms=%d\n' "$create_ms" "$migrate_ms"
  fi
  isolated_template_ready=1
}

authority_profile_case_index=0
run_isolated_case() {
  local db="$1"
  shift
  ensure_isolated_template
  authority_profile_case_index=$((authority_profile_case_index + 1))
  local profile_index=$authority_profile_case_index
  local started_seconds=$SECONDS
  (
    set -euo pipefail
    local profile="${MYEONGHA_AUTHORITY_PROFILE:-0}"
    local pre_drop_started='' clone_started='' command_started='' command_finished=''
    local pre_drop_ms=0 clone_ms=0 command_ms=0
    if [[ "$profile" == '1' ]]; then pre_drop_started=$EPOCHREALTIME; fi
    dropdb --if-exists "$db" >/dev/null 2>&1 || true
    if [[ "$profile" == '1' ]]; then clone_started=$EPOCHREALTIME; fi
    createdb --template="$isolated_template_db" "$db"
    if [[ "$profile" == '1' ]]; then command_started=$EPOCHREALTIME; fi
    cleanup_isolated_case() {
      local cleanup_started='' cleanup_finished='' cleanup_ms=0
      if [[ "$profile" == '1' ]]; then cleanup_started=$EPOCHREALTIME; fi
      dropdb --if-exists "$db" >/dev/null 2>&1 || true
      # Failed cases still clean up, but never emit a complete success-phase record.
      if [[ "$profile" == '1' && -n "$command_finished" ]]; then
        cleanup_finished=$EPOCHREALTIME
        authority_profile_duration_ms "$cleanup_started" "$cleanup_finished" cleanup_ms
        printf 'AUTHORITY_CORE_PHASE db=%s pre_drop_ms=%d clone_ms=%d command_ms=%d cleanup_ms=%d index=%d\n' \
          "$db" "$pre_drop_ms" "$clone_ms" "$command_ms" "$cleanup_ms" "$profile_index"
      fi
    }
    trap cleanup_isolated_case EXIT
    PGDATABASE="$db" "$@"
    if [[ "$profile" == '1' ]]; then
      command_finished=$EPOCHREALTIME
      authority_profile_duration_ms "$pre_drop_started" "$clone_started" pre_drop_ms
      authority_profile_duration_ms "$clone_started" "$command_started" clone_ms
      authority_profile_duration_ms "$command_started" "$command_finished" command_ms
    fi
  )
  if [[ "${MYEONGHA_AUTHORITY_PROFILE:-0}" == '1' ]]; then
    printf 'AUTHORITY_CORE_CASE db=%s duration_seconds=%d index=%d\n' "$db" "$((SECONDS - started_seconds))" "$profile_index"
  fi
}

authority_profile_stage 'baseline-and-early-guards'

bash test/db/verify_no_schema_cardinality_hardcoding.sh
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
# Rehearse the unmerged #1985 R1 positive SourceSet/Edge and zero/positive XOR
# exclusively on an isolated PostgreSQL clone. Never apply candidate DDL to main.
authority_profile_stage 'seyeon-r1-positive-pin-isolated'
run_isolated_case myeongha_seyeon_positive_pin_candidate_test bash test/db/seyeon_r1_disposable_positive_source_xor.sh
# R2: exact Original Grant revoke/Commit two independent PG sessions and
# actual v2/core + both Outbox atomicity, in a NEW disposable cloned database.
authority_profile_stage 'seyeon-r2-actual-v2-isolated'
run_isolated_case myeongha_seyeon_positive_pin_candidate_test bash test/db/seyeon_r2_disposable_actual_v2_revoke_race.sh
# Payment track: keep the new, not-yet-approved credit ledger schema isolated.
# Never include it in Production migrations or modify the DB's Privacy graph.
run_isolated_case myeongha_commerce_credit_candidate_test bash test/db/candidates/chat_credit_private_ledger_v1.sh
authority_profile_stage 'seyeon-governor-and-cost-races'
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
authority_profile_stage 'character-and-record-concurrency'
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
# R17 candidate SQL is NOT in supabase/migrations. Install it only inside an
# isolated disposable clone, run restricted Member ACL checks, then destroy DB.
run_isolated_case myeongha_seyeon_private_revoke_r17_test bash test/db/seyeon_private_memory_grant_revoke_v1.sh
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
authority_profile_stage 'reader-and-grant-races'
run_isolated_case myeongha_standard_reader_runtime_test bash test/db/standard_reading_reader_runtime_query.sh
run_isolated_case myeongha_reader_product_scope_app_test bash test/db/standard_reader_product_policy_real_postgres.sh
run_isolated_case myeongha_standard_reading_unit_binding_test bash test/db/standard_reading_unit_binding.sh
run_isolated_case myeongha_standard_reading_artifact_reread_test bash test/db/standard_reading_artifact_reread.sh
run_isolated_case myeongha_official_standard_reader_interpretation_test bash test/db/official_standard_reading_reader_interpretation.sh
run_isolated_case myeongha_reader_thread_locator_test bash test/db/official_reader_thread_locator_query.sh
run_isolated_case myeongha_reader_first_thread_bundle_rollback_test bash test/db/official_reader_first_thread_bundle_rollback.sh
run_isolated_case myeongha_reader_first_thread_app_test bash test/db/official_reader_first_thread_typescript_postgres.sh
run_isolated_case myeongha_reader_grant_lock_race_preflight_test bash test/db/official_reader_grant_row_lock_race_preflight.sh
run_isolated_case myeongha_reader_new_grant_insert_phantom_preflight_test bash test/db/official_reader_new_grant_insert_phantom_preflight.sh
run_isolated_case myeongha_reader_provider_effect_revoke_race_preflight_test bash test/db/official_reader_provider_effect_revoke_race_preflight.sh
run_isolated_case myeongha_portone_v2_exact_reader_effect_synthetic_test bash test/db/commerce_portone_v2_exact_reader_effect_synthetic_v1.sh
run_isolated_case myeongha_reader_birth_scope_lock_candidate_preflight_test bash test/db/official_reader_birth_scope_lock_candidate_preflight.sh
authority_profile_stage 'remaining-authority-and-catalog'
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
authority_profile_stage 'complete'
