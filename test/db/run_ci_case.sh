#!/usr/bin/env bash
set -euo pipefail

case_name="${1:?db CI case name is required}"

bash test/db/verify_no_schema_cardinality_hardcoding.sh

# The same pinned staged-migration guard is shared by all historical fixtures.
source test/db/staged_commerce_migration_policy.sh

apply_standard_migrations() {
  psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
  for migration in supabase/migrations/*.sql; do
    if skip_staged_portone_migration_from_historical_fixture "$migration"; then continue; fi
    echo "Applying ${migration}"
    psql -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
  done
}

apply_pg17_migrations_without_birth_authority() {
  psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
  for migration in supabase/migrations/*.sql; do
    if skip_staged_portone_migration_from_historical_fixture "$migration"; then continue; fi
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
        20261018190000_seyeon_locked_first_zero_source_reveal_v1.sql|20261024134543_saju_abuse_admission_runtime_authority.sql|20261024134610_saju_abuse_admission_production_policy_v1.sql|20261024135504_saju_abuse_admission_cleanup_worker_authority.sql|20261024141330_saju_abuse_admission_policy_approval_clock_v2.sql|20261026025332_seyeon_chat_helper_service_role_least_privilege.sql|20261026100200_portone_chat_credit_catalog_staged_v1.sql|20261026110300_owner_admin_credit_testing_v1.sql|20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql|20261027125500_chat_credit_delivered_ack_private_v1.sql|20261027163500_commerce_owner_sandbox_credit_checkout_v1.sql|20261027185000_owner_kcp_sandbox_private_prepare_v1.sql|20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql|20261027054525_digital_reading_checkout_notice_evidence_v1.sql|20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql)
          # Post-frontier security migration is known but must NEVER be replayed
          # into the historical 1510 R2 catalog/restore authority fixture.
          # Reject a same-named modified migration instead of silently skipping.
          # The stock postgres:17.6 Docker image is intentionally minimal and
          # need not include git. Compute the exact canonical Git blob SHA-1
          # with coreutils if git is missing. Windows CRLF checkout is allowed
          # ONLY when LF normalization produces the unchanged pinned SQL blob.
          local reviewed_blob_sha1 hold_reason='HOLD_R2_POST_FRONTIER_SQL_FINGERPRINT_DRIFT'
          case "$basename" in
            20261018190000_seyeon_locked_first_zero_source_reveal_v1.sql)
              reviewed_blob_sha1='3fbe7322cb3f11484a3e0a42bdc0598879b3d1d8'
              hold_reason='HOLD_R2_ZERO_REVEAL_SQL_FINGERPRINT_DRIFT'
              ;;
            20261026025332_seyeon_chat_helper_service_role_least_privilege.sql)
              reviewed_blob_sha1='c051a1dde2b3a260cdde5efafdcf1583c79d608d'
              hold_reason='HOLD_R2_CHAT_HELPER_ACL_SQL_FINGERPRINT_DRIFT'
              ;;
          esac
          case "$basename" in
            20261024134543_saju_abuse_admission_runtime_authority.sql) reviewed_blob_sha1='4be88ed0003bc4db226cc2324a506183094f35ff' ;;
            20261024134610_saju_abuse_admission_production_policy_v1.sql) reviewed_blob_sha1='c9a6354ec0d1fb2c932aca1e1916e65a5c623705' ;;
            20261024135504_saju_abuse_admission_cleanup_worker_authority.sql) reviewed_blob_sha1='cd31fb16e0985c732208cf69d41d1bd88f7ef31e' ;;
            20261024141330_saju_abuse_admission_policy_approval_clock_v2.sql) reviewed_blob_sha1='9b3abf4f8296c8385b55f29e224381bdf14e8a4e' ;;
            20261026100200_portone_chat_credit_catalog_staged_v1.sql) reviewed_blob_sha1='a55bd7aa06d6625523090e997f6f76f5539abee1' ;;
            20261026110300_owner_admin_credit_testing_v1.sql) reviewed_blob_sha1='186ffa2085e5922ec8319d4e5dd345a41597f3cd' ;;
            20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql) reviewed_blob_sha1='5e5270466e700f98b2d41cac338298735dc1ad99' ;;
            20261027125500_chat_credit_delivered_ack_private_v1.sql) reviewed_blob_sha1='5e5db487aa8a155cfded83b8d58c363e20f1a7b0' ;;
             20261027163500_commerce_owner_sandbox_credit_checkout_v1.sql) reviewed_blob_sha1='b5a47d794c8ffb0e62fecfb25d81c0b6c9312f70' ;;
             20261027185000_owner_kcp_sandbox_private_prepare_v1.sql) reviewed_blob_sha1='3f2d10daa1b7a22b647d50bd4498408c58e1639b' ;;
             20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql) reviewed_blob_sha1='59a2d005cace08cb46da9cf57351131620218d0b' ;;
            20261027054525_digital_reading_checkout_notice_evidence_v1.sql) reviewed_blob_sha1='550e2ff3dd86d16d30334220c223650387b71ca7' ;;
            20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql) reviewed_blob_sha1='3903c37f80f860f899fb1086b4bab878e73eab1d' ;;
          esac
          local local_blob_sha1 local_bytes normalized_bytes
          if command -v git >/dev/null 2>&1; then
            local_blob_sha1="$(git hash-object "$migration")"
          else
            local_bytes="$(wc -c < "$migration" | tr -d '[:space:]')"
            local_blob_sha1="$(
              { printf 'blob %s\0' "$local_bytes"; cat "$migration"; } |
                sha1sum | cut -d ' ' -f 1
            )"
          fi
          if [[ "$local_blob_sha1" != "$reviewed_blob_sha1" ]]; then
            normalized_bytes="$(sed 's/\r$//' "$migration" | wc -c | tr -d '[:space:]')"
            local_blob_sha1="$(
              { printf 'blob %s\0' "$normalized_bytes"; sed 's/\r$//' "$migration"; } |
                sha1sum | cut -d ' ' -f 1
            )"
          fi
          [[ "$local_blob_sha1" == "$reviewed_blob_sha1" ]] || {
            echo "$hold_reason" >&2; return 1;
          }
          continue
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
  saju-abuse-admission-attack-e2e)
    verify_pg17
    [[ "${GITHUB_ACTIONS:-}" == true && "${DB_SUITE:-}" == postgres17
        && "${PGHOST:-}" == localhost && "${PGPORT:-}" == 5432
        && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
      echo HOLD_SAJU_ADMISSION_NOT_DISPOSABLE_PG17 >&2; exit 1;
    }
    [[ ! -e supabase/migrations/20261024065948_saju_abuse_admission_runtime_authority.sql ]] || {
      echo HOLD_SAJU_ADMISSION_UNAPPROVED_PRODUCTION_SQL >&2; exit 1;
    }
    npm run build
    node --input-type=module -e '
      import { spawnSync } from "node:child_process";
      const url = new URL("postgresql://127.0.0.1:5432/");
      url.username = process.env.PGUSER;
      url.password = process.env.PGPASSWORD;
      url.pathname = process.env.PGDATABASE;
      for (const script of ["scripts/verify-saju-abuse-admission-postgres.mjs", "scripts/verify-saju-abuse-production-policy-postgres.mjs"]) {
        const result = spawnSync(process.execPath, [script], {
          stdio: "inherit", env: { ...process.env, MYEONGHA_SAJU_ADMISSION_TEST_DATABASE_URL: url.href },
        });
        if (result.error) throw result.error;
        if (result.status !== 0) process.exit(result.status ?? 1);
      }
    '
    ;;
  saju-official-records-http-e2e)
    verify_pg17
    [[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
       "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
       "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
      echo HOLD_SAJU_OFFICIAL_REREAD_E2E_DISPOSABLE_DB_REQUIRED >&2
      exit 1
    }
    apply_pg17_migrations_without_birth_authority
    bash test/db/saju_official_records_http_e2e_pg17.sh
    ;;
  seyeon-security-s0-real-path-pg17)
    verify_pg17
    [[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
       "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
       "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
      echo HOLD_S0_REQUIRES_DISPOSABLE_PG17 >&2; exit 1;
    }
    apply_pg17_migrations_without_birth_authority
    bash test/db/seyeon_security_s0_real_path_pg17.sh
    ;;
  seyeon-c08y-disposable-shared-ledger-pg17)
    verify_pg17
    # Synthetic table/RPC schema only: NO repository/Production migrations.
    # PGHOST, PGDATABASE, GitHub CI and DB_SUITE are independently rechecked
    # by the child test before it is allowed to CREATE any scratch object.
    bash test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh
    ;;
  seyeon-c08-first-turn-local-pg17)
    verify_pg17
    # Permit only (a) our local network-disabled Docker scratch DB or
    # (b) the dedicated disposable GitHub Actions PG17 suite case database.
    # Other DB targets / production environments always HOLD.
    if [[ "${PGDATABASE:-}" != myeongha_c08_local_case_1 ]]; then
      [[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true &&
         "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
         "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
        echo 'HOLD_C08_PG17_DISPOSABLE_DATABASE_REQUIRED' >&2
        exit 1
      }
    fi
    apply_pg17_migrations_through_seyeon_production_frontier
    bash test/db/seyeon_c08_first_turn_local_pg17.sh
    ;;
  seyeon-first-zero-locked-reveal-disposable-pg17)
    verify_pg17
    # Only the local --network none Docker scratch DB or the existing isolated
    # GitHub Actions PG17 ephemeral suite database can run this test case.
    if [[ "${PGDATABASE:-}" != myeongha_first_zero_local_case_1 ]]; then
      [[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true &&
         "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
         "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
        echo HOLD_FIRST_ZERO_NOT_DISPOSABLE_DB >&2; exit 1;
      }
    fi
    apply_pg17_migrations_without_birth_authority
    bash test/db/seyeon_first_zero_locked_reveal_disposable_pg17.sh
    ;;
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
  commerce-paid-credit-policy-v1)
    apply_standard_migrations
    psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261026100200_portone_chat_credit_catalog_staged_v1.sql
    psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261026110300_owner_admin_credit_testing_v1.sql
    psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql
    psql -v ON_ERROR_STOP=1 -f test/db/portone_paid_credit_policy_v1.sql
    ;;
  commerce-payment-adversarial-e2e)
    apply_standard_migrations
    bash test/db/commerce_payment_adversarial_e2e_v1.sh
    catalog_snapshot
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
    local_h_cost="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540" "$local_h_cost"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1550_1570_transaction.sql > "$local_h_cost"
    node scripts/operations/verify-seyeon-r2-h-1550-1570.mjs "$local_h_cost"
    local_h_governor="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540" "$local_h_cost" "$local_h_governor"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1580_1590_transaction.sql > "$local_h_governor"
    node scripts/operations/verify-seyeon-r2-h-1580-1590.mjs "$local_h_governor"
    local_h_rate="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540" "$local_h_cost" "$local_h_governor" "$local_h_rate"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1600_1610_transaction.sql > "$local_h_rate"
    node scripts/operations/verify-seyeon-r2-h-1600-1610.mjs "$local_h_rate"
    local_h_governed_role="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540" "$local_h_cost" "$local_h_governor" "$local_h_rate" "$local_h_governed_role"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1620_1630_transaction.sql > "$local_h_governed_role"
    node scripts/operations/verify-seyeon-r2-h-1620-1630.mjs "$local_h_governed_role"
    local_h_pin="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540" "$local_h_cost" "$local_h_governor" "$local_h_rate" "$local_h_governed_role" "$local_h_pin"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1640_transaction.sql > "$local_h_pin"
    node scripts/operations/verify-seyeon-r2-h-1640.mjs "$local_h_pin"
    local_h_1650="$(mktemp)"
    local_h_1650_sql="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540" "$local_h_cost" "$local_h_governor" "$local_h_rate" "$local_h_governed_role" "$local_h_pin" "$local_h_1650" "$local_h_1650_sql"' EXIT
    node scripts/operations/prepare-seyeon-r2-h-1650.mjs "$local_h_1650_sql" --isolated-pg17-only
    psql -X -qAt -v ON_ERROR_STOP=1 -v normalized_1650="$local_h_1650_sql" -f test/db/seyeon_r2_h_1650_transaction.sql > "$local_h_1650"
    node scripts/operations/verify-seyeon-r2-h-1650.mjs "$local_h_1650"
    local_h_1660="$(mktemp)"
    trap 'rm -f -- "$local_shape" "$local_digest" "$local_acl" "$local_acl_transient" "$local_acl_rollback" "$local_effective" "$local_manifest" "$local_h_1520" "$local_h_1530" "$local_h_1540" "$local_h_cost" "$local_h_governor" "$local_h_rate" "$local_h_governed_role" "$local_h_pin" "$local_h_1650" "$local_h_1650_sql" "$local_h_1660"' EXIT
    psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1660_transaction.sql > "$local_h_1660"
    node scripts/operations/verify-seyeon-r2-h-1660.mjs "$local_h_1660"
    ;;
  seyeon-r2-h-1670-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1670_WRONG_SUITE >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1670_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    for migration in 1550 1560 1570 1580 1590 1600 1610 1620 1630; do
      path=(supabase/migrations/"$migration"_*.sql)
      [[ ${#path[@]} == 1 && -f "${path[0]}" ]] || { echo HOLD_R2_H_1670_PRE_REPLAY_SOURCE >&2; exit 1; }
      psql -X -q -v ON_ERROR_STOP=1 -f "${path[0]}" >/dev/null
    done
    bash test/db/seyeon_r2_h_1670_forward.sh
    ;;
  seyeon-r2-h-1680-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1680_NOT_CI >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1680_WRONG_DB >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    for migration in 1550 1560 1570 1580 1590 1600 1610 1620 1630 1650 1670; do
      path=(supabase/migrations/"$migration"_*.sql)
      [[ ${#path[@]} == 1 && -f "${path[0]}" ]] || { echo HOLD_R2_H_1680_MISSING_DEPENDENCY >&2; exit 1; }
      psql -X -q -v ON_ERROR_STOP=1 -f "${path[0]}" >/dev/null
    done
    bash test/db/seyeon_r2_h_1680_forward.sh
    ;;
  seyeon-r2-h-1690-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1690_NOT_CI >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1690_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    for migration in 1550 1560 1570 1580 1590 1600 1610; do
      path=(supabase/migrations/"$migration"_*.sql)
      [[ ${#path[@]} == 1 && -f "${path[0]}" ]] || { echo HOLD_R2_H_1690_MISSING_SETTLEMENT_PREREQUISITE >&2; exit 1; }
      psql -X -q -v ON_ERROR_STOP=1 -f "${path[0]}" >/dev/null
    done
    [[ "$(psql -X -Atqc "select to_regrole('myeongha_seyeon_governed_executor') is null")" == t ]] || { echo HOLD_R2_H_1690_MISSING_ROLE_NEGATIVE_BASELINE >&2; exit 1; }
    echo PASS_R2_H_1690_1630_ROLE_DEPENDENCY_CONFIRMED
    for migration in 1620 1630; do
      path=(supabase/migrations/"$migration"_*.sql)
      [[ ${#path[@]} == 1 && -f "${path[0]}" ]] || { echo HOLD_R2_H_1690_MISSING_EXECUTOR_PREREQUISITE >&2; exit 1; }
      psql -X -q -v ON_ERROR_STOP=1 -f "${path[0]}" >/dev/null
    done
    bash test/db/seyeon_r2_h_1690_forward.sh
    ;;
  seyeon-r2-h-1700-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1700_NOT_CI >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1700_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    for migration in 1550 1560 1570 1580 1590 1600 1610; do
      path=(supabase/migrations/"$migration"_*.sql)
      [[ ${#path[@]} == 1 && -f "${path[0]}" ]] || { echo HOLD_R2_H_1700_PREREQUISITE_MISSING >&2; exit 1; }
      psql -X -q -v ON_ERROR_STOP=1 -f "${path[0]}" >/dev/null
    done
    bash test/db/seyeon_r2_h_1700_forward.sh
    ;;
  seyeon-r2-h-1710-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1710_NOT_CI >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1710_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    for migration in 1550 1560 1570 1580 1590 1600 1610 1620 1630; do
      path=(supabase/migrations/"$migration"_*.sql)
      [[ -f "${path[0]}" ]] || { echo HOLD_R2_H_1710_PREREQUISITE_MISSING >&2; exit 1; }
      psql -X -q -v ON_ERROR_STOP=1 -f "${path[0]}" >/dev/null
    done
    # 1690 has its own COMMIT: safely replay only in this disposable DB.
    psql -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql > /dev/null
    psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql > /dev/null
    bash test/db/seyeon_r2_h_1710_forward.sh
    ;;
  seyeon-r2-h-1750-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 && "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1750_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    bash test/db/seyeon_r2_h_1750_forward.sh
    ;;
  seyeon-r2-h-1740-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1740_NOT_CI >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1740_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    bash test/db/seyeon_r2_h_1740_forward.sh
    ;;
  seyeon-r2-h-1730-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1730_NOT_CI >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1730_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    for migration in 1550 1560 1570 1580 1590 1600 1610 1620 1630; do
      path=(supabase/migrations/"$migration"_*.sql)
      [[ ${#path[@]} == 1 && -f "${path[0]}" ]] || { echo HOLD_R2_H_1730_PREREQUISITE_MISSING >&2; exit 1; }
      psql -X -q -v ON_ERROR_STOP=1 -f "${path[0]}" > /dev/null
    done
    psql -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql > /dev/null
    psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql > /dev/null
    psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql > /dev/null
    bash test/db/seyeon_r2_h_1730_forward.sh
    ;;
  seyeon-r2-h-1720-forward)
    verify_pg17
    [[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || { echo HOLD_R2_H_1720_NOT_CI >&2; exit 1; }
    [[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || { echo HOLD_R2_H_1720_NOT_DISPOSABLE >&2; exit 1; }
    node scripts/operations/verify-seyeon-r2-pending-migrations.mjs > /dev/null
    apply_pg17_migrations_through_seyeon_production_frontier
    bash test/db/seyeon_r2_h_1720_forward.sh
    ;;
  seyeon-r2-helper-service-role-least-privilege)
    verify_pg17
    apply_pg17_migrations_without_birth_authority
    bash test/db/seyeon_r2_helper_service_role_least_privilege.sh
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
  saju-single-project-operator-permit-pg17)
    verify_pg17
    [[ "${GITHUB_ACTIONS:-}" == true && "${DB_SUITE:-}" == postgres17
        && "${PGHOST:-}" == localhost
        && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
      echo HOLD_SAJU_SINGLE_PROJECT_NOT_DISPOSABLE_PG17 >&2; exit 1;
    }
    bash test/db/saju_single_project_operator_permit_pg17.sh
    ;;
  *)
    echo "Unknown DB CI case: $case_name" >&2
    exit 2
    ;;
esac
