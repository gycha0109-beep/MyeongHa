#!/usr/bin/env bash
set -euo pipefail

# Pure catalog gate. The permissions mutations in this file are rolled back
# inside disposable CI only, and are never sent to production.
[[ ( "$(printenv CI 2>/dev/null || true)" == true ||
      "$(printenv GITHUB_ACTIONS 2>/dev/null || true)" == true ) &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ) ]] || {
  echo 'M1-18 DENY: only disposable PostgreSQL CI fixture owner is permitted' >&2
  exit 2
}
gate='test/db/official_reader_m1_18_live_cutover_readonly_gate.sql'
fn='public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)'
writer='public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])'
fail() { echo "FAIL M1-18: $*" >&2; exit 1; }
actual="$(psql -X -q -At -v ON_ERROR_STOP=1 -f "$gate")"
[[ "$actual" == CATALOG_READY_MIGRATION_HISTORY_STILL_REQUIRED\|* ]] ||
 fail "owner fixture catalog did not pass strict guard: $actual"
echo 'PASS M1-18: complete isolated M1-17 + private D2 baseline passes catalog gate without granting source SELECT or issuer rights'

# Every hypothetical unsafe modification must cause a distinct HOLD.
# All attempted GRANT/REVOKE operate inside rollbacked CI transactions.
check_negative() {
 local label="$1" sql="$2" expected="$3" output
 output="$(psql -X -q -At -v ON_ERROR_STOP=1 <<SQL
begin;
$sql
\i $gate
rollback;
SQL
)"
 grep -Fq "$expected" <<<"$output" ||
  fail "$label did not fail closed: $output"
 echo "PASS M1-18: $label is a HOLD, with NO surviving ACL change"
}
check_negative 'missing approved API function EXECUTE' \
 "revoke execute on function $fn from myeongha_api_executor;" \
 'HOLD_API_READ_EXECUTE_MISSING'
check_negative 'function made public' \
 "grant execute on function $fn to public;" \
 'HOLD_READ_EXECUTE_BROADENED'
check_negative 'raw commerce_receipts SELECT granted to API' \
 'grant select on public.commerce_receipts to myeongha_api_executor;' \
 'HOLD_SOURCE_TABLE_ACL_OPEN'
check_negative 'private D2 Writer EXECUTE granted to API' \
 "grant execute on function $writer to myeongha_api_executor;" \
 'HOLD_PRIVATE_WRITER_ACL_OPEN'

[[ "$(psql -X -q -At -v ON_ERROR_STOP=1 -f "$gate")" == "$actual" ]] ||
  fail 'simulated permission drifts survived transaction ROLLBACK'
echo 'PASS M1-18: rollbacked negative ACL probes leave exact original catalog readiness unchanged'
echo 'HOLD M1-18: CATALOG_READY is not production migration-history parity, deployment or paid Reader release'
