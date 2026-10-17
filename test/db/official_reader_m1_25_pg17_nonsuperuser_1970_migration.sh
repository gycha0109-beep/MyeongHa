#!/usr/bin/env bash
set -euo pipefail
# M1-25: source-pinned 1970 executed over an independently authenticated
# non-superuser TCP connection in one disposable PostgreSQL 17 CI database.
fail() { echo "FAIL_M1_25: $*" >&2; exit 1; }
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGPORT:-}" == 5432 && "${PGUSER:-}" == postgres &&
   "${PGDATABASE:-}" == myeongha_ci_case_* && -n "${PGPASSWORD:-}" ]] ||
   fail 'Only disposable localhost PG17 CI may run'
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" &&
   -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] ||
   fail 'Production/Supabase credentials forbidden'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] ||
   fail 'PG17 required'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select current_user || '|' || rolsuper::text from pg_roles where rolname=current_user")" == postgres\|true ]] ||
   fail 'Bootstrap must be disposable postgres superuser'
command -v openssl >/dev/null || fail 'openssl required for disposable credentials'

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditM120SafeStaging } from './scripts/operations/m1-20-safe-staging-preflight.mjs';
const snapshot=JSON.parse(readFileSync(
  'scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json','utf8'));
const audit=auditM120SafeStaging(snapshot);
assert.equal(audit.reviewedSourceCount,45);
assert.deepEqual(audit.sourceDrift,[]);
assert.deepEqual(audit.unreviewedSourceVersions,[]);
assert.deepEqual(audit.unknownPredecessors,[]);
assert.equal(audit.verdict,'HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED');
assert.equal(audit.deployAuthorized,false);
console.log('PASS_M1_25_SOURCE_PIN: 45 reviewed missing-in-live SQL sources unchanged, including 1970');
NODE

src='supabase/migrations/1970_official_reader_unknown_commit_minimal_read_v1.sql'
fn='public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)'
principal='myeongha_m125_migration_executor_ci'
umask 077
dir="$(mktemp -d)"
password="$(openssl rand -hex 24)"
created=false
cleanup() {
  if [[ "$created" == true ]]; then
    # Never touch anything outside this disposable CI database. Drop the
    # candidate function before its owner; shared runner destroys DB too.
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop function if exists $fn;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke create on schema public from $principal;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop role if exists $principal;" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$dir"
}
trap cleanup EXIT
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select to_regprocedure('$fn') is null")" == t ]] ||
  fail '1970 must be intentionally omitted from initial source replay'
psql -X -q -v ON_ERROR_STOP=1 -v pw="$password" >/dev/null <<SQL
create role $principal login nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls password :'pw';
SQL
created=true
identity="$(PGUSER="$principal" PGPASSWORD="$password" psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select session_user || '|' || current_user || '|' || rolsuper::text ||
    '|' || rolcreaterole::text || '|' || rolbypassrls::text
  from pg_roles where rolname=current_user")" ||
  fail 'Independent restricted migration LOGIN failed'
[[ "$identity" == "$principal|$principal|false|false|false" ]] ||
  fail "Unexpected independent migration identity $identity"
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select has_schema_privilege('$principal','public','CREATE')")" == f ]] ||
  fail 'Principal already has unexpected public CREATE'
echo 'PASS_M1_25_INDEPENDENT_EXECUTOR: authenticated non-superuser without CREATEROLE'

# Execute REAL migration SQL as principal, not via privileged SET ROLE.
# psql -1 ensures an error leaves no partial created function.
if PGUSER="$principal" PGPASSWORD="$password" psql -X -qAt -1 \
  -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -f "$src" \
  >"$dir/rejected.out" 2>"$dir/rejected.err"; then
  fail '1970 unexpectedly applied without schema CREATE'
fi
grep -Eq 'ERROR:[[:space:]]+42501([[:space:]]|$)' "$dir/rejected.err" ||
  fail 'Expected SQLSTATE 42501 without schema CREATE'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select to_regprocedure('$fn') is null")" == t ]] ||
  fail 'Failed migration left function in catalog'
echo 'PASS_M1_25_NO_CREATE_DENIED_ATOMIC: genuine source SQL rejected and rolled back'

# Only this disposable PG17 DB receives a temporary CREATE allowance.
psql -X -qAt -v ON_ERROR_STOP=1 -c "grant create on schema public to $principal;" >/dev/null
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select has_schema_privilege('$principal','public','CREATE')")" == t ]] ||
  fail 'Temporary CREATE allowance missing'
if ! PGUSER="$principal" PGPASSWORD="$password" psql -X -qAt -1 \
  -v ON_ERROR_STOP=1 -f "$src" >"$dir/applied.out" 2>"$dir/applied.err"; then
  fail "Real 1970 SQL under restricted executor failed: $(tail -n 3 "$dir/applied.err" | cut -c 1-140)"
fi
echo 'PASS_M1_25_REAL_1970_APPLY: actual source committed by independent non-superuser principal'
psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke create on schema public from $principal;" >/dev/null
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select has_schema_privilege('$principal','public','CREATE')")" == f ]] ||
  fail 'Temporary schema CREATE was not revoked'
catalog="$(psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
select pg_catalog.pg_get_userbyid(p.proowner) || '|' ||
  p.prosecdef::text || '|' ||
  coalesce(pg_catalog.has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE'),false)::text || '|' ||
  coalesce(pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),true)::text || '|' ||
  coalesce(pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'),true)::text || '|' ||
  pg_catalog.array_to_string(p.proconfig,',')
from pg_catalog.pg_proc p where p.oid='$fn'::regprocedure;
SQL
)"
[[ "$catalog" == "$principal|true|true|false|false|search_path=pg_catalog, pg_temp" ]] ||
  fail "Restricted 1970 Owner/ACL/catalog incorrect: $catalog"
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles p on p.oid=m.member
  where p.rolname='$principal'")" == 0 ]] ||
  fail 'Migration principal retained privilege-bearing membership'
echo 'PASS_M1_25_NON_SUPERUSER_OWNER: narrow reader API EXECUTE and no residual schema CREATE or memberships'

# Explicit HOLD: a non-superuser owner without underlying source SELECT
# cannot prove correct behavior for real non-NULL Receipt/Grant data.
raw_count="$(psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
select count(*) from (values
  ('commerce_receipts'),('entitlement_grants'),('entitlement_events'),
  ('standard_reading_reader_access_grants'),('outbox_events')) t(name)
where pg_catalog.has_table_privilege(
  '$principal',pg_catalog.to_regclass('public.' || t.name),'SELECT');
SQL
)"
[[ "$raw_count" == 0 ]] || fail 'Synthetic definer unexpectedly has raw source SELECT'
echo 'HOLD_M1_25_DEFINER_SOURCE_READ: restricted new function Owner lacks underlying private SELECT; data-backed reconciliation NOT proven'

# NULL guard confirms API can EXECUTE without creating/reading a real Receipt.
probe="$(psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate 2>&1 <<SQL || true
begin read only;
set local role myeongha_api_executor;
select public.qry_official_reader_unknown_commit_minimal_v1(null::uuid,null::uuid);
rollback;
SQL
)"
grep -Eq 'ERROR:[[:space:]]+23514([[:space:]]|$)' <<<"$probe" ||
  fail 'Non-superuser definer function does not reach API NULL guard'
bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
echo 'PASS_M1_25_DISPOSABLE_PG17: independent non-superuser 1970 SQL, owner, privileged migration window and ACL'
echo 'HOLD_M1_25: not verified Supabase managed executor/owner, 0860 role parity, SeYeon 104KB restore, target data/ledger, DR or Owner release'
