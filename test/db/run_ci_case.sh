#!/usr/bin/env bash
set -euo pipefail

case_name="${1:?db CI case name is required}"

bash test/db/verify_no_schema_cardinality_hardcoding.sh

apply_standard_migrations() {
  psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
  for migration in supabase/migrations/*.sql; do
    echo "Applying ${migration}"
    psql -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
  done
}

apply_pg17_migrations_without_birth_authority() {
  psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
  for migration in supabase/migrations/*.sql; do
    if [[ "${migration}" == *'/0860_birth_profile_create_runtime_authority.sql' ]]; then
      echo "Skipping ${migration}; managed-principal parity is verified by the dedicated birth-profile case"
      continue
    fi
    echo "Applying ${migration}"
    psql -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
  done
}

# Bound the R2 replay to the applied repository frontier 1510 plus both
# known timestamped migrations. All 1520..1720 are Production HOLD.
# No remote-only 20261008090417 SQL is fetched or executed.
apply_pg17_migrations_through_seyeon_production_frontier() {
  psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
  local migration basename version
  local timestamped_count=0
  for migration in supabase/migrations/*.sql; do
    basename="${migration##*/}"
    version="${basename%%_*}"
    if [[ "${version}" =~ ^[0-9]{4}$ ]]; then
      if (( 10#${version} > 1510 )); then continue; fi
    elif [[ "${version}" =~ ^[0-9]{14}$ ]]; then
      case "${basename}" in
        20261007150457_guest_promotion_auth_fk_validation.sql|20261008043000_seyeon_manifest_acl_restore.sql)
          timestamped_count=$(( timestamped_count + 1 ))
          ;;
        *) echo "HOLD_R2_UNREVIEWED_TIMESTAMPED_MIGRATION" >&2; return 1 ;;
      esac
    else
      echo "HOLD_R2_UNREVIEWED_MIGRATION_NAME" >&2; return 1
    fi
    if [[ "${basename}" == '0860_birth_profile_create_runtime_authority.sql' ]]; then
      echo "Skipping managed-principal 0860 in isolated PG17 (dedicated owner test)"
      continue
    fi
    echo "Applying ${migration}"
    psql -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
  done
  test "${timestamped_count}" -eq 2
}

verify_pg17() {
  version_num="$(psql -Atqc "show server_version_num")"
  test "${version_num}" -ge 170000
  test "${version_num}" -lt 180000
}

catalog_snapshot() {
  bash test/db/catalog_snapshot.sh
}

case "$case_name" in
  guest-promotion-auth-fk)
    version_num="$(psql -Atqc "show server_version_num")"
    if [[ "$version_num" -ge 160000 ]]; then
      # Match the existing PG17 fixture: birth owner transfer has its own
      # managed-principal case and is unrelated to Guest promotion.
      apply_pg17_migrations_without_birth_authority
    else
      apply_standard_migrations
    fi
    psql -v ON_ERROR_STOP=1 -f test/db/guest_promotion_auth_fk_authority.sql
    bash test/db/guest_promotion_concurrency.sh
    if [[ "$version_num" -lt 160000 ]]; then catalog_snapshot; fi
    ;;
  active-default-content-release)
    apply_standard_migrations
    bash test/db/active_default_content_release_query.sh
    catalog_snapshot
    ;;
  birth-profile-production-read-authority)
    apply_standard_migrations
    bash test/db/birth_profile_read_runtime_authority.sh
    ;;
  character-saju-runtime-components)
    apply_standard_migrations
    bash test/db/character_saju_runtime_components_query.sh
    catalog_snapshot
    ;;
  chat-thread-runtime-binding)
    apply_standard_migrations
    bash test/db/chat_thread_runtime_binding_query.sh
    catalog_snapshot
    ;;
  commerce-entitlement-projection-recompute)
    apply_standard_migrations
    psql -1 -v ON_ERROR_STOP=1 -f test/db/entitlement_projection_recompute.sql
    psql -1 -v ON_ERROR_STOP=1 -f test/db/entitlement_effect_apply_v1.sql
    psql -1 -v ON_ERROR_STOP=1 -f test/db/verified_receipt_capability_fulfillment_batch_v1.sql
    psql -1 -v ON_ERROR_STOP=1 -f test/db/verified_receipt_capability_fulfillment_batch_hardening.sql
    psql -1 -v ON_ERROR_STOP=1 -f test/db/commerce_entitlement_mutation_surface.sql
    psql -1 -v ON_ERROR_STOP=1 -f test/db/commerce_payment_source_authority.sql
    psql -1 -v ON_ERROR_STOP=1 -f test/db/commerce_trigger_security_hardening.sql
    bash test/db/entitlement_projection_recompute_concurrency.sh
    ;;
  commerce-payment-attempt-authority)
    apply_standard_migrations
    bash test/db/commerce_payment_attempt_authority.sh
    catalog_snapshot
    ;;
  commerce-payment-attempt-handoff-context)
    apply_standard_migrations
    bash test/db/commerce_payment_attempt_handoff_context.sh
    catalog_snapshot
    ;;
  commerce-payment-verification-context)
    apply_standard_migrations
    bash test/db/commerce_payment_verification_context.sh
    catalog_snapshot
    ;;
  commerce-provider-payment-verification-context)
    apply_standard_migrations
    bash test/db/commerce_provider_payment_verification_context.sh
    catalog_snapshot
    ;;
  commerce-verified-payment-evidence-persistence)
    apply_standard_migrations
    bash test/db/commerce_verified_payment_evidence_persistence.sh
    bash test/db/commerce_verified_payment_replay_timestamp.sh
    catalog_snapshot
    ;;
  effective-entitlements-v2)
    apply_standard_migrations
    bash test/db/effective_entitlements_v2_query.sh
    catalog_snapshot
    ;;
  entitlement-lifecycle-history-v1)
    apply_standard_migrations
    bash test/db/entitlement_lifecycle_history_v1_query.sh
    catalog_snapshot
    ;;
  entitlement-restore-v1)
    apply_standard_migrations
    psql -v ON_ERROR_STOP=1 -f test/db/entitlement_restore_v1.sql
    catalog_snapshot
    ;;
  episode-progress-bundle)
    apply_standard_migrations
    bash test/db/episode_progress_bundle_query.sh
    catalog_snapshot
    ;;
  device-installation-registration-runtime)
    apply_standard_migrations
    bash test/db/device_installation_registration_runtime_authority.sh
    ;;
  guest-bootstrap-runtime)
    apply_standard_migrations
    bash test/db/guest_bootstrap_runtime_authority.sh
    bash test/db/guest_bootstrap_current_query.sh
    catalog_snapshot
    ;;
  outbox-success-completion)
    apply_standard_migrations
    bash test/db/outbox_success_completion_concurrency.sh
    catalog_snapshot
    ;;
  purchase-intent-create)
    apply_standard_migrations
    psql -v ON_ERROR_STOP=1 -f test/db/commerce_product_capability_authority.sql
    psql -v ON_ERROR_STOP=1 -f test/db/paid_general_natal_product_candidate.sql
    psql -v ON_ERROR_STOP=1 -f test/db/standard_love_relationship_reader_authority.sql
    bash test/db/purchase_intent_create_concurrency.sh
    bash test/db/purchase_intent_create_v2_concurrency.sh
    bash test/db/purchase_intent_capability_pin_v3.sh
    bash test/db/purchase_intent_runtime_snapshot_v3.sh
    bash test/db/purchase_intent_charge_amount_safe_integer.sh
    catalog_snapshot
    ;;
  purchase-intent-history-v2)
    apply_standard_migrations
    bash test/db/purchase_intent_history_v2_query.sh
    catalog_snapshot
    ;;
  reading-history)
    apply_standard_migrations
    psql -1 -v ON_ERROR_STOP=1 -f test/db/reading_history_authority_query.sql
    ;;
  standard-reading-artifact-reread)
    apply_standard_migrations
    bash test/db/standard_reading_artifact_reread.sh
    catalog_snapshot
    ;;
  official-standard-reading-reader-interpretation)
    apply_standard_migrations
    bash test/db/official_standard_reading_reader_interpretation.sh
    catalog_snapshot
    ;;
  official-reader-provider-revoke-race)
    apply_standard_migrations
    bash test/db/official_reader_provider_effect_revoke_race_preflight.sh
    ;;
  records-production-read-authority)
    apply_standard_migrations
    bash test/db/records_read_runtime_authority.sh
    ;;
  reader-memory-tenant-boundary)
    apply_standard_migrations
    psql -v ON_ERROR_STOP=1 -f test/db/reader_memory_tenant_boundary_v1.sql
    bash test/db/seyeon_atomic_memory_grant_race_v1.sh
    ;;
  runtime-function-api-role-acl)
    apply_standard_migrations
    bash test/db/runtime_function_api_role_acl.sh
    ;;
  self-birth-profile-current)
    apply_standard_migrations
    bash test/db/self_birth_profile_current_query.sh
    ;;
  birth-profile-create-runtime-authority)
    verify_pg17
    apply_pg17_migrations_without_birth_authority
    psql -v ON_ERROR_STOP=1 <<'SQL'
create role myeongha_migration_principal_test
  login
  nosuperuser
  nocreatedb
  createrole
  inherit
  noreplication
  nobypassrls
  password 'myeongha-migration-principal-test';

alter schema public owner to myeongha_migration_principal_test;
alter table public.subjects owner to myeongha_migration_principal_test;
alter table public.birth_profiles owner to myeongha_migration_principal_test;
alter table public.birth_profile_revisions owner to myeongha_migration_principal_test;
alter function public.current_myeongha_subject_id()
  owner to myeongha_migration_principal_test;
alter function public.assert_myeongha_subject_context_v1(uuid)
  owner to myeongha_migration_principal_test;
alter function public.cmd_create_birth_profile_v1(
  uuid, uuid, uuid, text, text, date, time, boolean, boolean, text, text
) owner to myeongha_migration_principal_test;
SQL
    PGUSER=myeongha_migration_principal_test       PGPASSWORD=myeongha-migration-principal-test       psql -v ON_ERROR_STOP=1 -f supabase/migrations/0860_birth_profile_create_runtime_authority.sql >/dev/null
    membership_count="$(psql -Atqc "
      select count(*)
      from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles owner_role on owner_role.oid = m.roleid
      where owner_role.rolname = 'myeongha_birth_profile_create_owner';
    ")"
    expected_admin_count="$(psql -Atqc "
      select count(*)
      from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles owner_role on owner_role.oid = m.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = m.member
      join pg_catalog.pg_roles grantor_role on grantor_role.oid = m.grantor
      where owner_role.rolname = 'myeongha_birth_profile_create_owner'
        and member_role.rolname = 'myeongha_migration_principal_test'
        and m.admin_option
        and not m.inherit_option
        and not m.set_option
        and grantor_role.rolsuper;
    ")"
    test "$membership_count" = '1'
    test "$expected_admin_count" = '1'
    test "$(psql -Atqc "select has_schema_privilege('myeongha_birth_profile_create_owner', 'public', 'USAGE');")" = 't'
    test "$(psql -Atqc "select has_schema_privilege('myeongha_birth_profile_create_owner', 'public', 'CREATE');")" = 'f'
    bash test/db/birth_profile_create_runtime_authority.sh
    ;;
  content-release-lifecycle)
    verify_pg17
    apply_pg17_migrations_without_birth_authority
    bash test/db/content_release_lifecycle_authority.sh
    ;;
  seyeon-r2-pending-migrations)
    verify_pg17
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_without_birth_authority
    psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_pending_catalog.sql
    ;;
  seyeon-r2-cross-env-catalog)
    verify_pg17
    apply_pg17_migrations_through_seyeon_production_frontier
    local_shape="$(mktemp)"
    local_digest="$(mktemp)"
    local_acl="$(mktemp)"
    local_acl_transient="$(mktemp)"
    local_acl_rollback="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-r2-rpc-catalog-readonly.sql > "$local_shape"
    node scripts/operations/verify-seyeon-r2-rpc-catalog.mjs "$local_shape" > /dev/null
    psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-r2-rpc-set-fingerprint-readonly.sql > "$local_digest"
    node scripts/operations/verify-seyeon-r2-rpc-set-fingerprint.mjs "$local_digest" \
      scripts/operations/seyeon-r2-production-rpc-set-fingerprint-20261013.json
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f scripts/operations/seyeon-r2-acl-grants-canonical-readonly.sql > "$local_acl"
    node scripts/operations/verify-seyeon-r2-acl-grants.mjs "$local_acl" \
      scripts/operations/seyeon-r2-production-acl-grants-20261013.json
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f scripts/operations/seyeon-r2-assert-helper-acl-readonly.sql
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f test/db/seyeon_r2_creator_default_acl_synthetic.sql
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f test/db/seyeon_r2_helper_grant_transient.sql > "$local_acl_transient"
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f scripts/operations/seyeon-r2-acl-grants-canonical-readonly.sql > "$local_acl_rollback"
    node scripts/operations/verify-seyeon-r2-helper-grant-causality.mjs \
      "$local_acl" "$local_acl_transient" "$local_acl_rollback" \
      scripts/operations/seyeon-r2-production-acl-grants-20261013.json
    local_effective="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f test/db/seyeon_r2_effective_helper_grant_transient.sql > "$local_effective"
    node scripts/operations/verify-seyeon-r2-effective-helper.mjs "$local_effective"
    local_manifest="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f scripts/operations/seyeon-r2-g-manifest-rpc-readonly.sql > "$local_manifest"
    node scripts/operations/verify-seyeon-r2-g-lineage.mjs \
      "$local_manifest" \
      scripts/operations/seyeon-r2-g-production-manifest-20261014.json \
      scripts/operations/seyeon-r2-g-production-remote-20261014.json
    local_h_1520="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520"' EXIT
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1520_transaction.sql > "$local_h_1520"
    node scripts/operations/verify-seyeon-r2-h-1520.mjs "$local_h_1520"
    local_h_1530="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1530_transaction.sql > "$local_h_1530"
    node scripts/operations/verify-seyeon-r2-h-1530.mjs "$local_h_1530"
    local_h_1540="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1540_transaction.sql > "$local_h_1540"
    node scripts/operations/verify-seyeon-r2-h-1540.mjs "$local_h_1540"
    ;;
  seyeon-r2-rpc-catalog)
    verify_pg17
    apply_pg17_migrations_without_birth_authority
    snapshot="$(mktemp)"
    trap 'rm -f -- "$snapshot"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -f scripts/operations/seyeon-r2-rpc-catalog-readonly.sql > "$snapshot"
    node scripts/operations/verify-seyeon-r2-rpc-catalog.mjs "$snapshot"
    node scripts/operations/verify-seyeon-r2-rpc-catalog.mjs "$snapshot" "$snapshot"
    ;;
  member-character-thread-open)
    verify_pg17
    apply_pg17_migrations_without_birth_authority
    bash test/db/member_character_thread_open_concurrency.sh
    ;;
  saju-staging-operator-admission)
    psql -v ON_ERROR_STOP=1 -f test/db/fixtures/saju_staging_operator_admission_schema_8c2b2d1.sql >/dev/null
    bash test/db/saju_staging_operator_admission_authority.sh
    ;;
  saju-staging-operator-admission-v2)
    psql -v ON_ERROR_STOP=1 -f test/db/fixtures/saju_staging_operator_admission_schema_8c2b2d302.sql >/dev/null
    bash test/db/saju_staging_operator_admission_v2_authority.sh
    ;;
  *)
    echo "Unknown DB CI case: $case_name" >&2
    exit 2
    ;;
esac
