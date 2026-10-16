#!/usr/bin/env bash
set -euo pipefail

# M1-04: isolated PostgreSQL only. Verify real 1050-persisted Receipt against
# the two actual API transaction SET LOCAL ROLE targets; no runtime grants.
[[ ( "$(printenv CI 2>/dev/null || true)" == true ||
      "$(printenv GITHUB_ACTIONS 2>/dev/null || true)" == true ) &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ) ]] || {
  echo 'M1-04 DENY: requires disposable localhost CI PostgreSQL' >&2
  echo "M1 CI guard: ci=$(printenv CI 2>/dev/null || true) github_actions=$(printenv GITHUB_ACTIONS 2>/dev/null || true) host=$(printenv PGHOST 2>/dev/null || true) user=$(printenv PGUSER 2>/dev/null || true) database=$(printenv PGDATABASE 2>/dev/null || true)" >&2
  exit 2
}
[[ "$#" == 3 ]] || { echo 'M1-04: receipt subject intent required' >&2; exit 2; }
receipt="$1"
subject="$2"
intent="$3"
uuid='^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$'
for id in "$receipt" "$subject" "$intent"; do
  [[ "$id" =~ $uuid ]] || { echo 'M1-04: invalid fixture identity' >&2; exit 2; }
done
db() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-04: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

[[ "$(db -c "select count(*) from public.commerce_receipts r
 where r.id='$receipt'::uuid and r.subject_id='$subject'::uuid
 and r.purchase_intent_id='$intent'::uuid and r.verification_status='verified'")" == 1 ]] ||
  fail 'verified Receipt-to-Intent lineage absent'
[[ "$(db -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
  fail 'fixture already has purchased Grant'

# Narrow caller-specific test. Existing D3e covers broad role/table/definer ACL.
for actor in myeongha_commerce_internal_executor myeongha_api_executor; do
  for entry in d2_issue d2_bind legacy_issue; do
    case "$entry" in
      d2_issue)
        fn='internal_apply_official_reader_unified_receipt_v1'
        statement="select * from public.$fn(
          '$receipt'::uuid,array['test-reader-unit'],
          array[transaction_timestamp()],array[transaction_timestamp()],
          array[null]::timestamptz[],array[null]::text[])"
        ;;
      d2_bind)
        fn='internal_cmd_bind_official_reader_unified_v1'
        statement="select * from public.$fn(
          '$subject'::uuid,'$intent'::uuid,
          'd2033000-0000-0000-0000-000000000001'::uuid,
          'd2034000-0000-0000-0000-000000000001'::uuid,
          'sha256:v1:$(printf '7%.0s' {1..64})',
          'standard-reading-access-bind-v2',
          pg_catalog.jsonb_build_object(
            'schemaVersion','standard-reading-access-bind-v2',
            'purchaseIntentId','$intent'))"
        ;;
      legacy_issue)
        fn='internal_apply_verified_receipt_capability_effects_v1'
        statement="select * from public.$fn(
          '$receipt'::uuid,array['test-reader-unit'],
          array[transaction_timestamp()],array[transaction_timestamp()],
          array[null]::timestamptz[],array[null]::text[])"
        ;;
    esac
    if db --set=VERBOSITY=verbose >"$tmp/$actor-$entry.out" 2>&1 <<SQL
begin;
set local role "$actor";
select current_role;
$statement;
commit;
SQL
    then fail "$actor unexpectedly executed $fn"; fi
    grep -Fq '42501' "$tmp/$actor-$entry.out" || {
      cat "$tmp/$actor-$entry.out" >&2
      fail "$actor/$entry failed for a reason other than SQLSTATE 42501"
    }
    grep -Fq "permission denied for function $fn" "$tmp/$actor-$entry.out" || {
      cat "$tmp/$actor-$entry.out" >&2
      fail "$actor/$entry failed before protected-function EXECUTE check"
    }
  done
done
[[ "$(db -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
  fail 'denied role attempts wrote an entitlement Grant'
[[ "$(db -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
  fail 'denied role attempts created Reader access'
[[ "$(db -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and verification_status='verified'")" == 1 ]] ||
  fail 'denied role attempts altered canonical Receipt'
echo 'PASS M1-04: both actual SET LOCAL ROLE executor targets denied D2 and legacy issuance on verified Receipt, with zero side effects'
echo 'HOLD M1-04: runtime issuer credential, private worker and production cutover not authorized'
