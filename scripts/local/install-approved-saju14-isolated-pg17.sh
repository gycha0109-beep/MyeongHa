#!/usr/bin/env bash
set -euo pipefail

# Always execute INSIDE a disposable localhost-only PostgreSQL 17 container.
# Never install on the governed Supabase Production database.
[[ "${MYEONGHA_DISPOSABLE_SAJU14:-}" == 'explicit-local-only' ]] || {
  echo 'HOLD_NOT_EXPLICIT_DISPOSABLE_SAJU14' >&2; exit 1;
}
[[ -d /app/docs/operations/candidates && -f /app/scripts/local/approved-saju14-isolated-stage.psql ]] || {
  echo 'HOLD_READONLY_REPOSITORY_NOT_MOUNTED' >&2; exit 1;
}
[[ "${PGHOST:-}" == '/var/run/postgresql' ]] || {
  echo 'HOLD_LOCAL_SOCKET_ONLY' >&2; exit 1;
}
cd /app
db="$(psql -X -U postgres -d myeongha_saju_sandbox_v1 -Atqc 'select current_database()')"
version="$(psql -X -U postgres -d myeongha_saju_sandbox_v1 -Atqc 'show server_version_num')"
remote="$(psql -X -U postgres -d myeongha_saju_sandbox_v1 -Atqc 'select inet_server_addr() is null')"
[[ "$db" == 'myeongha_saju_sandbox_v1' && "$version" =~ ^17[0-9]{4}$ && "$remote" == t ]] || {
  echo 'HOLD_UNAUTHORIZED_SAJU14_DB_TARGET' >&2; exit 1;
}
# Full baseline migrations rely on the Supabase Auth stub in isolated CI.
baseline="$(psql -X -U postgres -d "$db" -Atqc "select to_regclass('auth.users') is not null")"
if [[ "$baseline" != 't' ]]; then
  psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql >/dev/null
fi

baseline_installed="$(psql -X -U postgres -d "$db" -Atqc "select to_regclass('public.purchase_intents') is not null")"
if [[ "$baseline_installed" != 't' ]]; then
echo 'Applying existing release-reviewed baseline migrations to disposable PostgreSQL 17...'
for migration in supabase/migrations/*.sql; do
  name="${migration##*/}"
  # Managed principal 0860 is excluded from the established PG17 isolated
  # integration fixture. No production principal or role impersonation.
  [[ "$name" == '0860_birth_profile_create_runtime_authority.sql' ]] && continue
  # The staged PortOne credit-only files belong to a separate reviewed rollout.
  case "$name" in
    20261026100200_portone_chat_credit_catalog_staged_v1.sql|\
    20261026110300_owner_admin_credit_testing_v1.sql|\
    20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql|\
    20261027125500_chat_credit_delivered_ack_private_v1.sql|\
    20261027163500_commerce_owner_sandbox_credit_checkout_v1.sql|\
    20261027185000_owner_kcp_sandbox_private_prepare_v1.sql|\
    20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql|\
    20261027054525_digital_reading_checkout_notice_evidence_v1.sql|\
    20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql)
      continue ;;
  esac
  if ! psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null 2>/tmp/saju14-migration-error; then
    echo "HOLD_BASELINE_MIGRATION: $name" >&2
    tail -12 /tmp/saju14-migration-error >&2
    exit 1
  fi
done
fi
stage_installed="$(psql -X -U postgres -d "$db" -Atqc "select
  to_regclass('commerce_saju_private.approved_fulfillment_release_v1') is not null
  and to_regclass('commerce_saju_private.approved_component_reading_v1') is not null
  and to_regprocedure('public.cmd_claim_approved_saju_issue_job_v1(uuid,jsonb)') is not null")"
if [[ "$stage_installed" != 't' ]]; then
echo 'Installing reviewed 14-offer checkout, signed issuer, Reader and refund authority...'
psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 \
  -f scripts/local/approved-saju14-isolated-stage.psql >/dev/null
fi
echo 'Provisioning exactly 14 isolated catalog offers and pinned sandbox releases...'
psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 \
  -f scripts/local/approved-saju14-isolated-registry.psql >/dev/null

state="$(psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -Atqc "
  with offers(id) as (values
    ('career'),('business'),('wealth'),('relationship'),('year'),('month'),
    ('first-counterpart'),('additional-counterpart'),('relationship-plus-first'),
    ('career-economy'),('basic'),('basic-year'),('basic-month'),('basic-year-month')
  )
  select case when
    (select count(*) from offers o
     where (select count(*) from commerce_saju_private.approved_offer_v1(o.id))=1)=14
    and to_regclass('commerce_saju_private.approved_purchase_scope_v1') is not null
    and to_regclass('commerce_saju_private.approved_component_reading_v1') is not null
    and to_regprocedure('public.cmd_claim_approved_saju_issue_job_v1(uuid,jsonb)') is not null
    and to_regrole('myeongha_approved_saju_issuer_executor') is not null
    and to_regrole('myeongha_approved_saju_pair_reader_executor') is not null
    then 'STAGED_SAJU14_LOCAL_READY' else 'HOLD_SAJU14_SCHEMA_INCOMPLETE' end;
")"
echo "$state"
[[ "$state" == 'STAGED_SAJU14_LOCAL_READY' ]] || exit 1
