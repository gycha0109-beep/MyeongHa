#!/usr/bin/env bash
set -euo pipefail
mode="$1"
case "$mode" in sandbox|unverified|future_grant) ;; *) exit 1;; esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_b13_$mode" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/$mode $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
receipt=b4230000-0000-4000-8000-000000000001
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^-- Verified initial issuance acquires SAME/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql |
 awk -v mode="$mode" '
 mode=="sandbox" && /^  environment,verifier_revision,verified_amount_minor,verified_currency$/ {
   n++; if(n==2) {sub(/^  environment/, "  \x27sandbox\x27");changed++}
 }
 mode=="unverified" && /^  verification_status,verified_payload_jsonb,clock_timestamp/ {
   sub(/^  verification_status/, "  \x27pending\x27");changed++
 }
 {print}
 END {if (mode!="future_grant" && changed!=1) exit 3}
 ' >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 50 "$tmp/setup.err" >&2; fail 'verified purchase/unbound Receipt fixture'; }
if [[ "$mode" == sandbox || "$mode" == unverified ]]; then
 [[ "$(p -c "select count(*) from public.commerce_receipts where id='$receipt'::uuid
 and ((environment='sandbox' and '$mode'='sandbox') or
      (verification_status='pending' and '$mode'='unverified'))")" == 1 ]] ||
 fail 'untrusted receipt fixture was not persisted'
 if p -c "select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
  '$receipt'::uuid,array['test-reader-unit'],array[transaction_timestamp()],
  array[transaction_timestamp()],array[null]::timestamptz[],array[null]::text[])" >"$tmp/issue.out" 2>"$tmp/issue.err"; then
  fail 'Commerce issuer accepted untrusted Receipt'
 fi
 grep -Fq 'One verified initial Standard Reader receipt is required' "$tmp/issue.err" ||
 { cat "$tmp/issue.err" >&2; fail 'issuer denied for unrelated cause'; }
else
 p -c "select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
  '$receipt'::uuid,array['test-reader-unit'],array[transaction_timestamp()],
  array[clock_timestamp()+interval '1 hour'],array[null]::timestamptz[],array[null]::text[])" \
  >"$tmp/issue.out" 2>"$tmp/issue.err" ||
  { cat "$tmp/issue.err" >&2; fail 'future-dated verified Grant fixture'; }
 [[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and status='active'
 and valid_from>clock_timestamp()")" == 1 ]] ||
  fail 'future-valid Grant is not staged'
fi
ledger="$(p -c "select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid")"
if p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/bind.out" 2>"$tmp/bind.err"; then
 fail 'private Reader Binder accepted untrusted/future-dated source'
fi
grep -Fq 'active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable' "$tmp/bind.err" ||
 { cat "$tmp/bind.err" >&2; fail 'wrong Binder denial'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] || fail 'orphan Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] || fail 'orphan Reader Access'
[[ "$(p -c "select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid")" == "$ledger" ]] ||
 fail 'Binder mutated Commerce ledger'
echo "PASS R4/BIND-13/$mode verified issuer and private Binder fail closed, zero Reading/Reader Access"
