#!/usr/bin/env bash
set -euo pipefail

# M1-06: reapply a real 1050 Receipt only with original event semantics.
# Isolated PostgreSQL fixture owner; no runtime issuer role.
[[ "$(printenv CI 2>/dev/null || true)" == true &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ) ]] || {
  echo 'M1-06 DENY: disposable localhost CI PostgreSQL required' >&2
  exit 2
}
[[ "$#" == 7 ]] || { echo 'M1-06 requires seven exact fixture UUIDs' >&2; exit 2; }
uuid='^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$'
for value in "$@"; do
  [[ "$value" =~ $uuid ]] || { echo 'M1-06: malformed fixture UUID' >&2; exit 2; }
done
receipt="$1"; subject="$2"; intent="$3"; session="$4"
proposal="$5"; grant="$6"; official="$7"
p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-06: $*" >&2; exit 1; }
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# 1080 dedupe identity includes immutable event effective_at and valid_from.
record="$(p -c "select concat_ws('|',
 pg_catalog.to_char(ee.effective_at at time zone 'UTC',
  'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
 pg_catalog.to_char(ee.target_valid_from at time zone 'UTC',
  'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
 coalesce(ee.target_valid_until::text,'none'),
 coalesce(ee.reason_code,'none'))
 from public.entitlement_events ee
 join public.entitlement_grants eg on eg.id=ee.grant_id
 where ee.source_receipt_id='$receipt'::uuid
   and ee.source_type='receipt' and ee.event_type='granted'
   and ee.grant_id='$grant'::uuid
   and eg.subject_id='$subject'::uuid;")"
[[ "$(printf '%s\n' "$record" | wc -l)" == 1 ]] ||
 fail 'expected exactly one authoritative original Receipt event'
IFS='|' read -r effective valid_from valid_until reason <<< "$record"
[[ -n "$effective" && -n "$valid_from" && "$valid_until" == none &&
   "$reason" == none ]] ||
 fail "unexpected authoritative source event semantics: $record"

snapshot() {
 p -c "select concat_ws('|',
  (select count(*)::text from public.entitlement_grants
   where source_receipt_id='$receipt'::uuid),
  (select count(*)::text from public.entitlement_events
   where source_receipt_id='$receipt'::uuid and event_type='granted'),
  (select count(*)::text from public.standard_reading_reader_access_grants
   where purchase_intent_id='$intent'::uuid),
  (select count(*)::text from public.standard_reading_official_bindings
   where reading_id='$official'::uuid and subject_id='$subject'::uuid),
  (select count(*)::text from public.outbox_events oe
   join public.entitlement_events ee on ee.event_dedupe_key=oe.dedupe_key
   where ee.source_receipt_id='$receipt'::uuid and ee.source_type='receipt'
     and oe.aggregate_type='entitlement'),
  (select revision::text from public.entitlement_grants
   where id='$grant'::uuid and source_receipt_id='$receipt'::uuid));"
}
before="$(snapshot)"
[[ "$before" == 1\|1\|1\|1\|*\|* ]] ||
 fail "unexpected paid Receipt/Grant/Reader baseline: $before"

# A drifted timestamp must fail the actual original 1080 semantic check.
if p > /dev/null 2>"$tmp" <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select result_grant_id from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array['$effective'::timestamptz + interval '1 second'],
 array['$valid_from'::timestamptz],
 array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
then fail 'same Receipt with changed effect timestamp was accepted'; fi
grep -Fq 'conflicting Entitlement Effect semantics' "$tmp" || {
 cat "$tmp" >&2
 fail 'timestamp drift was rejected for the wrong reason'
}
[[ "$(snapshot)" == "$before" ]] ||
 fail 'semantically conflicting retry changed committed authority'
echo 'PASS M1-06: changed effect timestamp conflicts with committed Receipt provenance, zero side effects'

# Replay in one isolated owner transaction using ORIGINAL event time values
# and the identical Reader bind request. No API/Worker authorization implied.
result="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select 'ISSUE',result_grant_id,result_replayed
from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array['$effective'::timestamptz],array['$valid_from'::timestamptz],
 array[null]::timestamptz[],array[null]::text[]);
select 'BIND',reading_id,entitlement_grant_id,replayed
from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$intent'::uuid,'$session'::uuid,'$proposal'::uuid,
 'sha256:v1:$(printf '7%.0s' {1..64})',
 'standard-reading-access-bind-v2',
 pg_catalog.jsonb_build_object(
 'schemaVersion','standard-reading-access-bind-v2',
 'purchaseIntentId','$intent'));
commit;
SQL
)"
issue="$(printf '%s\n' "$result" | grep '^ISSUE|' || true)"
bind="$(printf '%s\n' "$result" | grep '^BIND|' || true)"
[[ "$issue" == "ISSUE|$grant|t" &&
   "$bind" == "BIND|$official|$grant|t" ]] ||
 fail "original event/binder replay did not converge: $result"
[[ "$(snapshot)" == "$before" ]] ||
 fail "exact replay changed immutable Grant/Event/Access/Outbox state: $(snapshot)"
echo 'PASS M1-06: 1050 Receipt D2 issue/bind exact semantic replay returns same Grant and Reading with zero new ledger rows'
echo 'HOLD M1-06: issuer must source persisted effect semantics; runtime credentials and paid T2 remain off'
