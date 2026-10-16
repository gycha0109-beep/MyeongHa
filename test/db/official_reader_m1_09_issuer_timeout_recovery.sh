#!/usr/bin/env bash
set -euo pipefail

# M1-09: isolated test of an operational DB timeout AFTER first D2 issuance
# but BEFORE the only permissible ISSUE + BIND transaction can COMMIT.
# This does NOT provision an issuer credential or change any role privileges.
[[ ( "$(printenv CI 2>/dev/null || true)" == true ||
      "$(printenv GITHUB_ACTIONS 2>/dev/null || true)" == true ) &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ) ]] || {
  echo 'M1-09 DENY: disposable localhost CI PostgreSQL required' >&2
  exit 2
}
[[ "$#" == 3 ]] || { echo 'M1-09: verified Receipt, Subject and Intent required' >&2; exit 2; }
receipt="$1"; subject="$2"; intent="$3"
uuid='^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$'
for id in "$@"; do
  [[ "$id" =~ $uuid ]] || { echo 'M1-09: malformed fixture UUID' >&2; exit 2; }
done

p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-09: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

[[ "$(p -c "select count(*) from public.commerce_receipts cr
 join public.purchase_intents pi
   on pi.id=cr.purchase_intent_id and pi.subject_id=cr.subject_id
 where cr.id='$receipt'::uuid and cr.subject_id='$subject'::uuid
   and cr.purchase_intent_id='$intent'::uuid
   and cr.verification_status='verified' and cr.environment='production'
   and pi.status='verified'")" == 1 ]] ||
  fail 'real 1050 verified Receipt-to-Intent source unavailable'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
  fail 'fixture must be unissued before the timeout'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
  fail 'fixture already has a Reader binding'

before="$(p -c "select concat(
 (select count(*) from public.entitlement_grants), ':',
 (select count(*) from public.entitlement_events), ':',
 (select count(*) from public.outbox_events), ':',
 (select count(*) from public.entitlements))")"

# Keep the original D1/D2 scope and data writes. Inject statement_timeout
# ONLY AFTER the issuer has actually returned an uncommitted new Grant ID.
# psql ON_ERROR_STOP exits without sending COMMIT after SQLSTATE 57014.
if p --set=VERBOSITY=verbose >"$tmp/issue.out" 2>"$tmp/timeout.err" <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select 'M109_UNCOMMITTED_ISSUE',result_grant_id,result_replayed
from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]);
set local statement_timeout='400ms';
select pg_sleep(3);
commit;
SQL
then
  fail 'timeout injection unexpectedly COMMITTED after issuance'
fi

grep -Eq '^M109_UNCOMMITTED_ISSUE[|][0-9a-f-]{36}[|]f$' "$tmp/issue.out" || {
  cat "$tmp/issue.out" "$tmp/timeout.err" >&2
  fail 'timeout did not occur AFTER a real first uncommitted D2 issuance'
}
grep -Fq '57014' "$tmp/timeout.err" || {
  cat "$tmp/timeout.err" >&2
  fail 'failure is not the expected PostgreSQL SQLSTATE 57014'
}
grep -Fq 'canceling statement due to statement timeout' "$tmp/timeout.err" || {
  cat "$tmp/timeout.err" >&2
  fail 'connection did not fail at the injected statement timeout'
}

# The failed transaction is now closed. A fresh session must find the
# already-committed Receipt, but no orphan first Grant, Event or Reader row.
[[ "$(p -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and verification_status='verified'")" == 1 ]] ||
 fail 'previously committed 1050 Receipt was lost'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'orphan purchased Grant after unacknowledged issuer transaction'
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'orphan entitlement event after issuer rollback'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail 'Reader binding was minted despite missing COMMIT'
after="$(p -c "select concat(
 (select count(*) from public.entitlement_grants), ':',
 (select count(*) from public.entitlement_events), ':',
 (select count(*) from public.outbox_events), ':',
 (select count(*) from public.entitlements))")"
[[ "$after" == "$before" ]] ||
 fail "Grant/Event/outbox/projection rows changed after rolled-back issuance: $before -> $after"
echo 'PASS M1-09: real D2 first issuance followed by SQLSTATE 57014 before COMMIT leaves verified 1050 Receipt and zero Grant/Event/Reader/outbox side effects'

# Prove D1 transaction-scoped locks are released and source authority must
# be acquired AGAIN, not replayed from a cached pre-timeout admission.
fresh="$(p <<SQL
begin;
set local statement_timeout='3s';
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select purchase_role from public.internal_acquire_official_reader_purchase_scope_v2(
 '$subject'::uuid,'$intent'::uuid);
commit;
SQL
)"
[[ "$fresh" == "$subject"
echo 'PASS M1-09: fresh DB session reacquires verified Reader purchase scope after timed-out issuer connection'
echo 'HOLD M1-09: downstream M1-03 retries same Receipt atomically in isolated owner fixture; production Worker credentials, issue authority and release remain unapproved'
\n'additional_reader_interpretation ]] ||
 fail "fresh post-timeout D1 purchase scope cannot be reacquired: $fresh"
echo 'PASS M1-09: fresh DB session reacquires verified Reader purchase scope after timed-out issuer connection'
echo 'HOLD M1-09: downstream M1-03 retries same Receipt atomically in isolated owner fixture; production Worker credentials, issue authority and release remain unapproved'
