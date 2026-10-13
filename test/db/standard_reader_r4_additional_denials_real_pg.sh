#!/usr/bin/env bash
set -euo pipefail
mode="${1:?R4 additional denial variant required}"
case "$mode" in no_official|invalid_hash|forged_snapshot|invalid_contract) ;; *) exit 1;; esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_additional_$mode" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/additional/$mode $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
# Use real synthetic verified Commerce receipts. Do not alter production data.
if [[ "$mode" == no_official ]]; then
 awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
   test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
 expected='Additional Reader Interpretation requires an existing committed official Standard Reading'
else
 awk '/^create temp table _v2_additional_result as/{exit} {print}' \
   test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
 case "$mode" in
  invalid_hash) expected='Standard Reading v2 request hash is invalid';;
  forged_snapshot) expected='Standard Reading v2 request snapshot must exactly match server-owned purchase provenance';;
  invalid_contract) expected='Standard Reading v2 request contract is invalid';;
 esac
fi
awk '/^create temp table _b2_additional_result as/{exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 60 "$tmp/setup.err" >&2; fail 'synthetic verified additional purchase fixture'; }
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='b2030000-0000-4000-8000-000000000001'::uuid and status='active'")" == 1 ]] || fail 'additional exact Grant missing'
if [[ "$mode" == no_official ]]; then
 [[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] || fail 'original official Reading unexpectedly exists'
else
 [[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] || fail 'committed official Reading fixture absent'
fi
case "$mode" in
 invalid_hash) hash="sha256:forged"; snapshot='"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"'; version='standard-reading-access-bind-v2';;
 forged_snapshot) hash='sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; snapshot='"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001","readerCharacterId":"seyeon"'; version='standard-reading-access-bind-v2';;
 invalid_contract) hash='sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; snapshot='"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"'; version='forged-contract';;
 no_official) hash='sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; snapshot='"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"'; version='standard-reading-access-bind-v2';;
esac
if p >"$tmp/bind.out" 2>"$tmp/bind.err" <<SQL
begin;
select set_config('myeongha.subject_id','11390000-0000-0000-0000-000000000001',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '11390000-0000-0000-0000-000000000001'::uuid,
 'b2020000-0000-4000-8000-000000000001'::uuid,
 'b2040000-0000-4000-8000-000000000001'::uuid,
 'b2050000-0000-4000-8000-000000000001'::uuid,
 '$hash','$version','{$snapshot}'::jsonb
);
commit;
SQL
then fail 'additional Binder unexpectedly accepted forged/missing provenance'; fi
grep -Fq "$expected" "$tmp/bind.err" || { cat "$tmp/bind.err" >&2; fail 'wrong fail-closed error'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='b2020000-0000-4000-8000-000000000001'::uuid")" == 0 ]] || fail 'additional Reader Access leaked'
[[ "$(p -c "select count(*) from public.standard_reading_reader_interpretations where purchase_intent_id='b2020000-0000-4000-8000-000000000001'::uuid")" == 0 ]] || fail 'additional Interpretation leaked'
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='b2030000-0000-4000-8000-000000000001'::uuid and status='active'")" == 1 ]] || fail 'original Commerce Grant changed'
echo "PASS R4/$mode private additional Binder DENY, original Commerce Grant unchanged, zero additional Interpretation/Access"
