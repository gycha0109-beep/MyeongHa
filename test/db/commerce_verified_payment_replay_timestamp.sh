#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1" needle="$2"
  shift 2
  local out rc
  set +e
  out=$("$@" 2>&1)
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

ATTEMPT_ID='e1060000-0000-0000-0000-000000000001'
INTENT_ID='e1050000-0000-0000-0000-000000000001'
EXTERNAL_PRODUCT='verified-payment-web'
AMOUNT='12345'
CURRENCY='KRW'
FP_A="hmac-sha256:k1:$(printf 'a%.0s' {1..64})"
FP_B="hmac-sha256:k1:$(printf 'b%.0s' {1..64})"
VERIFIER='testpay-verifier-v1'
ORIGINAL_VERIFIED_AT='2026-09-14T00:00:00.000Z'
RETRY_VERIFIED_AT='2026-09-14T00:05:00.000Z'
OCCURRED_AT='2026-09-13T23:59:58Z'
ORDERING_KEY='order-1'

run_persist() {
  local fingerprint="$1" verifier="$2" amount="$3" currency="$4" verified_at="$5" occurred_at="$6" ordering_key="$7"
  "${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_commerce_internal_executor; select receipt_id,provider_event_id,replayed from public.cmd_persist_verified_payment_evidence_v1('${ATTEMPT_ID}','${INTENT_ID}','testpay','web','sandbox','provider-tx-1',null,null,'${EXTERNAL_PRODUCT}','active','${fingerprint}','${verifier}',${amount},'${currency}','${verified_at}','${occurred_at}','${ordering_key}',null); commit;"
}

before=$("${psql_base[@]}" -At -F '|' -c "select cr.id,cpe.id,pg_catalog.to_char(cr.verified_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),cr.verified_payload_jsonb->>'verifiedAt',cpe.verified_payload_jsonb->>'verifiedAt',cr.verified_payload_jsonb::text,cpe.verified_payload_jsonb::text from public.commerce_receipts cr join public.commerce_provider_events cpe on cpe.resolved_receipt_id=cr.id where cr.provider='testpay' and cr.external_transaction_id='provider-tx-1';")
IFS='|' read -r receipt_id event_id receipt_verified_at receipt_payload_verified_at event_payload_verified_at receipt_payload_before event_payload_before <<<"$before"
[[ -n "$receipt_id" && -n "$event_id" ]] || { echo "$before" >&2; fail "base persistence fixture missing"; }
[[ "$receipt_verified_at" == "$ORIGINAL_VERIFIED_AT" ]] || fail "base Receipt verifiedAt fixture mismatch"
[[ "$receipt_payload_verified_at" == "$ORIGINAL_VERIFIED_AT" && "$event_payload_verified_at" == "$ORIGINAL_VERIFIED_AT" ]] || fail "base payload verifiedAt fixture mismatch"

replay=$(run_persist "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$RETRY_VERIFIED_AT" "$OCCURRED_AT" "$ORDERING_KEY")
[[ "$replay" == "${receipt_id}|${event_id}|t" ]] || { echo "$replay" >&2; fail "fresh verification timestamp replay did not reuse canonical identities"; }
pass "same verified provider facts replay across fresh verifiedAt"

after=$("${psql_base[@]}" -At -F '|' -c "select pg_catalog.to_char(cr.verified_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),cr.verified_payload_jsonb->>'verifiedAt',cpe.verified_payload_jsonb->>'verifiedAt',cr.verified_payload_jsonb::text,cpe.verified_payload_jsonb::text from public.commerce_receipts cr join public.commerce_provider_events cpe on cpe.resolved_receipt_id=cr.id where cr.id='${receipt_id}' and cpe.id='${event_id}';")
IFS='|' read -r stored_verified_at stored_receipt_payload_verified_at stored_event_payload_verified_at receipt_payload_after event_payload_after <<<"$after"
[[ "$stored_verified_at" == "$ORIGINAL_VERIFIED_AT" ]] || fail "replay rewrote immutable Receipt verifiedAt"
[[ "$stored_receipt_payload_verified_at" == "$ORIGINAL_VERIFIED_AT" && "$stored_event_payload_verified_at" == "$ORIGINAL_VERIFIED_AT" ]] || fail "replay rewrote immutable payload verifiedAt"
[[ "$receipt_payload_after" == "$receipt_payload_before" && "$event_payload_after" == "$event_payload_before" ]] || fail "replay rewrote stored normalized evidence"
pass "fresh verifiedAt replay preserves immutable first-write provenance and payload"

expect_fail "verifier revision drift remains conflicting" "existing Commerce evidence conflicts" run_persist "$FP_A" 'testpay-verifier-v2' "$AMOUNT" "$CURRENCY" "$RETRY_VERIFIED_AT" "$OCCURRED_AT" "$ORDERING_KEY"
expect_fail "fingerprint drift remains conflicting" "existing Commerce evidence conflicts" run_persist "$FP_B" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$RETRY_VERIFIED_AT" "$OCCURRED_AT" "$ORDERING_KEY"
expect_fail "provider occurrence drift remains conflicting" "existing Commerce evidence conflicts" run_persist "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$RETRY_VERIFIED_AT" '2026-09-13T23:59:59Z' "$ORDERING_KEY"
expect_fail "provider ordering drift remains conflicting" "existing Commerce evidence conflicts" run_persist "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$RETRY_VERIFIED_AT" "$OCCURRED_AT" 'order-2'
expect_fail "amount drift remains conflicting" "verified money does not match" run_persist "$FP_A" "$VERIFIER" '12346' "$CURRENCY" "$RETRY_VERIFIED_AT" "$OCCURRED_AT" "$ORDERING_KEY"
expect_fail "currency drift remains conflicting" "verified money does not match" run_persist "$FP_A" "$VERIFIER" "$AMOUNT" 'USD' "$RETRY_VERIFIED_AT" "$OCCURRED_AT" "$ORDERING_KEY"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_grants;")" == '0' ]] || fail "replay hardening created entitlement grants"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_events;")" == '0' ]] || fail "replay hardening created entitlement events"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlements;")" == '0' ]] || fail "replay hardening changed effective entitlements"
pass "verified payment replay timestamp hardening has no entitlement side effects"
