#!/usr/bin/env bash
set -euo pipefail

case_name="${1:?db CI case name is required}"

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

verify_pg17() {
  version_num="$(psql -Atqc "show server_version_num")"
  test "${version_num}" -ge 170000
  test "${version_num}" -lt 180000
}

catalog_snapshot() {
  bash test/db/catalog_snapshot.sh
}

case "$case_name" in
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
  records-production-read-authority)
    apply_standard_migrations
    bash test/db/records_read_runtime_authority.sh
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
  member-character-thread-open)
    verify_pg17
    apply_pg17_migrations_without_birth_authority
    bash test/db/member_character_thread_open_concurrency.sh
    ;;
  *)
    echo "Unknown DB CI case: $case_name" >&2
    exit 2
    ;;
esac
