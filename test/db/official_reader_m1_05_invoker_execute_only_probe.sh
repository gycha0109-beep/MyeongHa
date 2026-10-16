#!/usr/bin/env bash
set -euo pipefail

# M1-05: execute-only permission is insufficient for a SECURITY INVOKER
# D2 issuer. Everything below takes place in one disposable CI database.
[[ "$(printenv CI 2>/dev/null || true)" == true &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ]] || {
  echo 'M1-05 DENY: disposable localhost CI PostgreSQL required' >&2
  exit 2
}
[[ "$#" == 3 ]] || { echo 'M1-05: receipt subject intent required' >&2; exit 2; }
receipt="$1"
subject="$2"
intent="$3"
uuid='^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$'
for value in "$receipt" "$subject" "$intent"; do
  [[ "$value" =~ $uuid ]] || { echo 'M1-05: invalid fixture UUID' >&2; exit 2; }
done
db() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-05: $*" >&2; exit 1; }
role='myeongha_m1_05_issuer_probe'
signature='public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])'
tmp="$(mktemp -d)"
cleanup() {
  db -c "revoke execute on function $signature from $role;" >/dev/null 2>&1 || true
  db -c "revoke usage on schema public from $role;" >/dev/null 2>&1 || true
  db -c "drop role if exists $role;" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

[[ "$(db -c "select count(*) from public.commerce_receipts cr
 where cr.id='$receipt'::uuid and cr.subject_id='$subject'::uuid
 and cr.purchase_intent_id='$intent'::uuid
 and cr.verification_status='verified'")" == 1 ]] ||
 fail 'real verified Receipt fixture absent'
[[ "$(db -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'Receipt must be unissued for isolated probe'
[[ "$(db -c "select to_regrole('$role') is null")" == t ]] ||
 fail 'pre-existing role with test-only identity'

# Grant ONLY schema usage and the top-level private D2 function in a
# disposable DB, never to any real API/service/Worker role.
db -c "create role $role nologin noinherit;" >/dev/null
db -c "grant usage on schema public to $role;" >/dev/null
db -c "grant execute on function $signature to $role;" >/dev/null

[[ "$(db -c "select has_function_privilege('$role','$signature','EXECUTE')")" == t ]] ||
 fail 'test role did not acquire top-level D2 EXECUTE'
[[ "$(db -c "select has_table_privilege('$role',
 'public.entitlement_grants','INSERT')")" == f ]] ||
 fail 'test role unexpectedly has protected entitlement table INSERT'
[[ "$(db -c "select has_table_privilege('$role',
 'public.commerce_receipts','UPDATE')")" == f ]] ||
 fail 'test role unexpectedly has protected Receipt UPDATE'

# This should get PAST top-level 1820 EXECUTE and be denied by a nested
# private function or protected table privilege under SECURITY INVOKER.
if db --set=VERBOSITY=verbose >"$tmp/execute.out" 2>&1 <<SQL
begin;
set local role "$role";
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select result_grant_id
from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
then
  fail 'EXECUTE-only test role unexpectedly issued D2 Grant'
fi
grep -Fq '42501' "$tmp/execute.out" || {
 cat "$tmp/execute.out" >&2
 fail 'denial was not SQLSTATE 42501'
}
grep -Fq 'permission denied' "$tmp/execute.out" || {
 cat "$tmp/execute.out" >&2
 fail 'denial did not come from PostgreSQL ACL'
}
if grep -Fq 'permission denied for function internal_apply_official_reader_unified_receipt_v1' "$tmp/execute.out"; then
 cat "$tmp/execute.out" >&2
 fail 'denial never passed the explicitly granted D2 entrypoint'
fi

[[ "$(db -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'EXECUTE-only probe wrote an entitlement Grant'
[[ "$(db -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail 'EXECUTE-only probe wrote a Reader binding'
[[ "$(db -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and verification_status='verified'")" == 1 ]] ||
 fail 'EXECUTE-only probe changed canonical Receipt'
pass_msg='PASS M1-05: EXECUTE-only dedicated role reached D2 entry but failed closed on nested SECURITY INVOKER privileges; no Grant/binding'
echo "$pass_msg"

# Reject misleading claims that the private runtime issuer can be activated
# by a standalone function GRANT. Cleanup returns DB ACL to its fixture baseline.
cleanup
trap - EXIT
[[ "$(db -c "select to_regrole('$role') is null")" == t ]] ||
 fail 'temporary privilege probe role was not dropped'
echo 'PASS M1-05: synthetic role/GRANT reverted; no production issuer admitted'
