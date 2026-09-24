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
bash test/db/chat_receive_concurrency.sh
bash test/db/chat_attempt_commit_concurrency.sh
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
bash test/db/account_deletion_start_rls_catalog_guard.sh
bash test/db/public_trigger_function_security_catalog_guard.sh
bash test/db/account_deletion_finalization_preflight.sh
bash test/db/account_deletion_db_finalizer.sh
bash test/db/account_deletion_worker_completion.sh
bash test/db/account_deletion_worker_execution_identity.sh
bash test/db/account_deletion_finalizer_catalog_guard.sh

run_isolated_case myeongha_privacy_reconciliation_replay_test bash test/db/privacy_reconciliation_replay.sh

bash test/db/guest_promotion_concurrency.sh
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
