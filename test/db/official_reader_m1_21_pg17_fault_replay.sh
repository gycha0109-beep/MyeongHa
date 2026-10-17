#!/usr/bin/env bash
set -euo pipefail

# M1-21: exercise the ACTUAL source-pinned migration SQL at four interruption
# boundaries, with synthetic errors and rollback, in disposable PG17 CI only.
# This is NOT a data-backed production restore, permission to deploy, or a
# rehearsal of the confidential 20261008090417 historical SeYeon statement.
hold() { echo "FAIL_M1_21: $*" >&2; exit 1; }
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGUSER:-}" == postgres &&
   "${PGDATABASE:-}" == myeongha_ci_case_* ]] ||
  hold 'Disposable localhost CI case only'
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]] ||
  hold 'Production connection configuration is forbidden'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] ||
  hold 'PostgreSQL 17 is required'

# A newly modified, missing or unreviewed SQL source cannot be executed as a
# purported M1-21 proof. The expected live-history disposition remains HOLD.
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditM120SafeStaging } from './scripts/operations/m1-20-safe-staging-preflight.mjs';
const snapshot = JSON.parse(readFileSync(
  'scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json', 'utf8'));
const report = auditM120SafeStaging(snapshot);
assert.equal(report.reviewedSourceCount, 45);
assert.deepEqual(report.sourceDrift, []);
assert.deepEqual(report.unreviewedSourceVersions, []);
assert.deepEqual(report.unknownPredecessors, []);
assert.equal(report.verdict, 'HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED');
assert.equal(report.deployAuthorized, false);
JS

tmp="$(mktemp -d)"
chmod 700 "$tmp"
trap 'rm -rf -- "$tmp"' EXIT

# Catalog-only fingerprint includes public functions and their source/ACL/owner,
# public relation ACL/RLS and direct role memberships. Never emits source SQL.
catalog_fingerprint() {
  psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
with function_catalog as (
  select 'p:' || p.oid::regprocedure::text || ':' ||
    pg_catalog.encode(pg_catalog.convert_to(p.prosrc,'UTF8'),'hex') || ':' ||
    p.prolang::text || ':' || p.proowner::text || ':' ||
    coalesce(p.proacl::text,'<NULL>') || ':' || p.prosecdef::text || ':' ||
    coalesce(p.proconfig::text,'<NULL>') as row
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
),
relation_catalog as (
  select 'r:' || c.oid::regclass::text || ':' || c.relkind::text || ':' ||
    c.relowner::text || ':' || coalesce(c.relacl::text,'<NULL>') || ':' ||
    c.relrowsecurity::text || ':' || c.relforcerowsecurity::text as row
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
),
membership_catalog as (
  select 'm:' || m.roleid::regrole::text || ':' ||
    m.member::regrole::text || ':' || m.grantor::regrole::text || ':' ||
    m.admin_option::text || ':' || m.inherit_option::text || ':' ||
    m.set_option::text as row
  from pg_catalog.pg_auth_members m
),
entries as (
  select row from function_catalog
  union all select row from relation_catalog
  union all select row from membership_catalog
)
select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  coalesce(pg_catalog.string_agg(row, E'\n' order by row),''),'UTF8')),'hex')
from entries;
SQL
}

apply_plain() {
  psql -X -q -v ON_ERROR_STOP=1 -f "$1" >"$tmp/apply.out" 2>"$tmp/apply.err" ||
    hold "Ordinary source migration $(basename "$1") failed"
}

check_stage_acl() {
  local expected="PASS_M1_21_STAGE_CLOSED" actual
  actual="$(psql -X -qAt -v ON_ERROR_STOP=1 -v stage="$1" \
    -f test/db/official_reader_m1_21_pg17_stage_acl.sql)" ||
    hold "Stage $1 ACL query failed"
  [[ "$actual" == "$expected" ]] ||
    hold "Stage $1 runtime/private writer ACL not closed: $actual"
}

fault_replay() {
  local version="$1" file="$2" before after committed repeated
  before="$(catalog_fingerprint)" || hold "Cannot capture $version pre-state"
  # -1 wraps the original SQL and the injected error in ONE transaction.
  # If SQL fails before the injected division-by-zero, this is NOT a pass.
  if psql -X -q -1 -v ON_ERROR_STOP=1 -f "$file" \
      -c 'select 1 / 0;' >"$tmp/fault.out" 2>"$tmp/fault.err"; then
    hold "$version synthetic failure was not triggered"
  fi
  grep -Fq 'division by zero' "$tmp/fault.err" ||
    hold "$version source failed before synthetic interruption"
  after="$(catalog_fingerprint)" || hold "Cannot capture $version post-fault state"
  [[ "$before" == "$after" ]] ||
    hold "$version partial catalog/ACL effect survived transaction ROLLBACK"
  echo "PASS_M1_21_FAULT_ROLLBACK: $version"

  # Commit the actual migration once, test the role boundary immediately,
  # then replay the EXACT same SQL and require idempotent catalog/ACL state.
  psql -X -q -1 -v ON_ERROR_STOP=1 -f "$file" \
    >"$tmp/commit.out" 2>"$tmp/commit.err" ||
    hold "$version real SQL could not commit in disposable PG17"
  if [[ "$version" != 1970 ]]; then check_stage_acl "$version"; fi
  committed="$(catalog_fingerprint)" || hold "Cannot fingerprint $version commit"
  psql -X -q -1 -v ON_ERROR_STOP=1 -f "$file" \
    >"$tmp/replay.out" 2>"$tmp/replay.err" ||
    hold "$version repeat application failed"
  repeated="$(catalog_fingerprint)" || hold "Cannot fingerprint $version replay"
  [[ "$committed" == "$repeated" ]] ||
    hold "$version replay altered catalog/ACL after successful commit"
  if [[ "$version" != 1970 ]]; then check_stage_acl "$version"; fi
  echo "PASS_M1_21_COMMIT_REPLAY_ACL: $version"
}

apply_plain test/db/bootstrap_supabase_auth_stub.sql
count=0
for file in supabase/migrations/*.sql; do
  if [[ "$file" == */0860_birth_profile_create_runtime_authority.sql ]]; then
    echo 'PG17_FIXTURE_SKIP_0860: dedicated managed-principal suite owns this case'
    continue
  fi
  version="$(basename "$file")"
  version="${version%%_*}"
  case "$version" in
    1820|1890|1900|1970)
      fault_replay "$version" "$file"
      ;;
    *)
      apply_plain "$file"
      ;;
  esac
  count=$((count+1))
done
[[ "$count" -ge 210 ]] || hold 'Source migration replay incomplete'

# M1-18 includes an exact read/issuer/source-table catalog check and four
# independently rollbacked negative ACL probes. History and Owner still HOLD.
bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
echo 'PASS_M1_21_DISPOSABLE_PG17: four source-pinned fault+commit+replay boundaries'
echo 'HOLD_M1_21: excludes live-only SeYeon SQL, production data, migration ledger, non-superuser Supabase restore/DR and all Owner cutover decisions'
