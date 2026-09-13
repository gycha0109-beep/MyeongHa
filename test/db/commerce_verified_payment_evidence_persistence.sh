#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

sql_nullable() {
  local value="$1"
  if [[ -z "$value" ]]; then
    printf 'null'
  else
    printf "'%s'" "$value"
  fi
}

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

SUBJECT_ONE='e1010000-0000-0000-0000-000000000001'
SUBJECT_TWO='e1010000-0000-0000-0000-000000000002'
PRODUCT_ID='e1020000-0000-0000-0000-000000000001'
OFFER_ID='e1030000-0000-0000-0000-000000000001'
EXTERNAL_PRODUCT='verified-payment-web'
AMOUNT='12345'
CURRENCY='KRW'
FP_A="hmac-sha256:k1:$(printf 'a%.0s' {1..64})"
FP_B="hmac-sha256:k1:$(printf 'b%.0s' {1..64})"
FP_C="hmac-sha256:k1:$(printf 'c%.0s' {1..64})"
VERIFIER='testpay-verifier-v1'
VERIFIED_AT='2026-09-14T00:00:00.000Z'

run_intent() {
  local subject_id="$1" intent_id="$2" idem="$3" request_hash="$4"
  local snapshot="{\"productOfferId\":\"${OFFER_ID}\",\"productId\":\"${PRODUCT_ID}\",\"platform\":\"web\",\"provider\":\"testpay\",\"externalProductId\":\"${EXTERNAL_PRODUCT}\"}"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select purchase_intent_id,status,expected_amount_minor,expected_currency from public.cmd_create_purchase_intent_v2('${subject_id}','${intent_id}','${OFFER_ID}',null,'${idem}','${request_hash}','${snapshot}'::jsonb,'sha256:verified-payment-snapshot'); commit;"
}

run_attempt() {
  local subject_id="$1" attempt_id="$2" intent_id="$3" idem="$4" request_id="$5"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,status from public.cmd_create_payment_attempt_v1('${subject_id}','${attempt_id}','${intent_id}','sandbox','${idem}','${request_id}'); commit;"
}

run_transition() {
  local subject_id="$1" attempt_id="$2" target="$3" transaction_id="$4" failure_code="$5"
  local tx_sql failure_sql
  tx_sql=$(sql_nullable "$transaction_id")
  failure_sql=$(sql_nullable "$failure_code")
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,status from public.cmd_transition_payment_attempt_v1('${subject_id}','${attempt_id}','${target}',${tx_sql},${failure_sql}); commit;"
}

run_persist() {
  local attempt_id="$1" intent_id="$2" provider="$3" platform="$4" environment="$5"
  local transaction_id="$6" original_id="$7" event_id="$8" external_product="$9"
  local state="${10}" fingerprint="${11}" verifier="${12}" amount="${13}" currency="${14}"
  local verified_at="${15}" occurred_at="${16}" ordering_key="${17}" valid_until="${18}"
  local orig_sql event_sql occurred_sql ordering_sql valid_sql
  orig_sql=$(sql_nullable "$original_id")
  event_sql=$(sql_nullable "$event_id")
  occurred_sql=$(sql_nullable "$occurred_at")
  ordering_sql=$(sql_nullable "$ordering_key")
  valid_sql=$(sql_nullable "$valid_until")
  "${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_commerce_internal_executor; set local myeongha.subject_id='${SUBJECT_TWO}'; select receipt_id,provider_event_id,replayed from public.cmd_persist_verified_payment_evidence_v1('${attempt_id}','${intent_id}','${provider}','${platform}','${environment}','${transaction_id}',${orig_sql},${event_sql},'${external_product}','${state}','${fingerprint}','${verifier}',${amount},'${currency}','${verified_at}',${occurred_sql},${ordering_sql},${valid_sql}); commit;"
}

"${psql_base[@]}" <<SQL
insert into auth.users(id) values
  ('e1000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('${SUBJECT_ONE}','member','e1000000-0000-0000-0000-000000000001','active',null,'2026-09-14T00:00:00Z','2026-09-14T00:00:00Z'),
  ('${SUBJECT_TWO}','member','e1000000-0000-0000-0000-000000000002','active',null,'2026-09-14T00:00:00Z','2026-09-14T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at)
values ('${PRODUCT_ID}','verified-payment-evidence-fixture','reading',true,'2026-09-14T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  '${OFFER_ID}','${PRODUCT_ID}','web','testpay','${EXTERNAL_PRODUCT}','KRW',7777,true,'2026-09-14T00:00:00Z',null,'2026-09-14T00:00:00Z'
);

insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values (
  'e1040000-0000-0000-0000-000000000001','${OFFER_ID}','verified-payment-charge-v1',${AMOUNT},'${CURRENCY}','2026-09-14T00:00:00Z',null
);
SQL

INTENT_ONE='e1050000-0000-0000-0000-000000000001'
ATTEMPT_ONE='e1060000-0000-0000-0000-000000000001'
intent_one=$(run_intent "$SUBJECT_ONE" "$INTENT_ONE" 'verified-payment-intent-1' 'sha256:verified-payment-intent-1')
[[ "$intent_one" == "${INTENT_ONE}|created|${AMOUNT}|${CURRENCY}" ]] || { echo "$intent_one" >&2; fail "Purchase Intent fixture mismatch"; }
run_attempt "$SUBJECT_ONE" "$ATTEMPT_ONE" "$INTENT_ONE" 'verified-payment-attempt-1' 'merchant-order-1' >/dev/null
run_transition "$SUBJECT_ONE" "$ATTEMPT_ONE" 'handed_off' '' '' >/dev/null

# Mutable display price must not participate in verified payment authority.
"${psql_base[@]}" -c "update public.product_offers set display_price_minor=99999,price_cache_updated_at=clock_timestamp() where id='${OFFER_ID}';"

first=$(run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'sandbox' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '2026-09-13T23:59:58Z' 'order-1' '')
IFS='|' read -r receipt_one event_one replay_one <<<"$first"
[[ -n "$receipt_one" && -n "$event_one" && "$replay_one" == 'f' ]] || { echo "$first" >&2; fail "initial atomic persistence result mismatch"; }
pass "handed_off -> response_received + Receipt + Provider Event atomically"

state_row=$("${psql_base[@]}" -At -F '|' -c "select cpa.status,coalesce(cpa.provider_transaction_id,''),pi.status,cr.verification_status,cpe.status,cpe.resolution_source_type,cr.subject_id,cpe.resolved_subject_id from public.commerce_payment_attempts cpa join public.purchase_intents pi on pi.id=cpa.purchase_intent_id join public.commerce_receipts cr on cr.purchase_intent_id=pi.id join public.commerce_provider_events cpe on cpe.resolved_receipt_id=cr.id where cpa.id='${ATTEMPT_ONE}';")
[[ "$state_row" == "response_received|provider-tx-1|verified|verified|verified|receipt|${SUBJECT_ONE}|${SUBJECT_ONE}" ]] || { echo "$state_row" >&2; fail "canonical state transition mismatch"; }
pass "Payment Attempt remains provenance while Receipt/Event carry verified authority"

synthetic_event=$("${psql_base[@]}" -Atc "select external_event_id from public.commerce_provider_events where id='${event_one}';")
[[ "$synthetic_event" == "myeongha:verified-payment:v1:${FP_A}" ]] || fail "synthetic event identity is not deterministic"
pass "missing provider event id uses governed deterministic synthetic identity"

fingerprints=$("${psql_base[@]}" -At -F '|' -c "select cr.receipt_fingerprint,cpe.payload_fingerprint from public.commerce_receipts cr join public.commerce_provider_events cpe on cpe.resolved_receipt_id=cr.id where cr.id='${receipt_one}';")
[[ "$fingerprints" == "${FP_A}|${FP_A}" ]] || fail "canonical evidence fingerprint binding mismatch"
pass "Receipt/Event deliberately bind the same canonical verified-evidence fingerprint"

payload_guard=$("${psql_base[@]}" -At -F '|' -c "select verified_payload_jsonb->>'schemaVersion',verified_payload_jsonb->>'externalTransactionId',verified_payload_jsonb ? 'rawPayload',verified_payload_jsonb ? 'credential' from public.commerce_receipts where id='${receipt_one}';")
[[ "$payload_guard" == 'commerce-evidence-v2|provider-tx-1|f|f' ]] || { echo "$payload_guard" >&2; fail "verified payload is not minimized canonical evidence"; }
pass "verified payload stores normalized evidence only"

replay=$(run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'sandbox' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '2026-09-13T23:59:58Z' 'order-1' '')
[[ "$replay" == "${receipt_one}|${event_one}|t" ]] || { echo "$replay" >&2; fail "exact replay did not return canonical identities"; }
pass "response_received exact replay is idempotent"

expect_fail "conflicting transaction replay rejected" "provider transaction identity conflicts" run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'sandbox' 'provider-tx-other' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''
expect_fail "provider mismatch rejected" "provider authority does not match" run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'otherpay' 'web' 'sandbox' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''
expect_fail "environment mismatch rejected" "provider authority does not match" run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'production' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''
expect_fail "Purchase Intent mismatch rejected" "Purchase Intent authority does not match" run_persist "$ATTEMPT_ONE" 'e1050000-0000-0000-0000-000000000099' 'testpay' 'web' 'sandbox' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''
expect_fail "external product mismatch rejected" "product authority does not match" run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'sandbox' 'provider-tx-1' '' '' 'wrong-product' 'active' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''
expect_fail "amount mismatch rejected" "verified money does not match" run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'sandbox' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" '12346' "$CURRENCY" "$VERIFIED_AT" '' '' ''
expect_fail "currency mismatch rejected" "verified money does not match" run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'sandbox' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_A" "$VERIFIER" "$AMOUNT" 'USD' "$VERIFIED_AT" '' '' ''
expect_fail "non-active initial evidence rejected" "accepts active evidence only" run_persist "$ATTEMPT_ONE" "$INTENT_ONE" 'testpay' 'web' 'sandbox' 'provider-tx-1' '' '' "$EXTERNAL_PRODUCT" 'refunded' "$FP_A" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''

INTENT_STATE='e1050000-0000-0000-0000-000000000002'
run_intent "$SUBJECT_ONE" "$INTENT_STATE" 'verified-payment-intent-state' 'sha256:verified-payment-intent-state' >/dev/null
ATTEMPT_CREATED='e1060000-0000-0000-0000-000000000002'
run_attempt "$SUBJECT_ONE" "$ATTEMPT_CREATED" "$INTENT_STATE" 'verified-payment-attempt-created' 'merchant-order-created' >/dev/null
expect_fail "created attempt rejected" "not verification-persistence eligible" run_persist "$ATTEMPT_CREATED" "$INTENT_STATE" 'testpay' 'web' 'sandbox' 'provider-tx-created' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_B" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''

ATTEMPT_FAILED='e1060000-0000-0000-0000-000000000003'
run_attempt "$SUBJECT_ONE" "$ATTEMPT_FAILED" "$INTENT_STATE" 'verified-payment-attempt-failed' 'merchant-order-failed' >/dev/null
run_transition "$SUBJECT_ONE" "$ATTEMPT_FAILED" 'failed' '' 'PROVIDER_DECLINED' >/dev/null
expect_fail "failed attempt rejected" "not verification-persistence eligible" run_persist "$ATTEMPT_FAILED" "$INTENT_STATE" 'testpay' 'web' 'sandbox' 'provider-tx-failed' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_B" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''

ATTEMPT_CANCELLED='e1060000-0000-0000-0000-000000000004'
run_attempt "$SUBJECT_ONE" "$ATTEMPT_CANCELLED" "$INTENT_STATE" 'verified-payment-attempt-cancelled' 'merchant-order-cancelled' >/dev/null
run_transition "$SUBJECT_ONE" "$ATTEMPT_CANCELLED" 'cancelled' '' '' >/dev/null
expect_fail "cancelled attempt rejected" "not verification-persistence eligible" run_persist "$ATTEMPT_CANCELLED" "$INTENT_STATE" 'testpay' 'web' 'sandbox' 'provider-tx-cancelled' '' '' "$EXTERNAL_PRODUCT" 'active' "$FP_B" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''

# A subject context injected into the internal transaction cannot reparent authority.
[[ "$("${psql_base[@]}" -Atc "select subject_id from public.commerce_receipts where id='${receipt_one}';")" == "$SUBJECT_ONE" ]] || fail "internal caller subject context influenced receipt ownership"
pass "cross-authority subject injection is impossible"

# Force a downstream receipt constraint failure after Attempt/PI updates. The entire
# command transaction must roll back those provenance transitions as well.
INTENT_ROLLBACK='e1050000-0000-0000-0000-000000000003'
ATTEMPT_ROLLBACK='e1060000-0000-0000-0000-000000000005'
run_intent "$SUBJECT_ONE" "$INTENT_ROLLBACK" 'verified-payment-intent-rollback' 'sha256:verified-payment-intent-rollback' >/dev/null
run_attempt "$SUBJECT_ONE" "$ATTEMPT_ROLLBACK" "$INTENT_ROLLBACK" 'verified-payment-attempt-rollback' 'merchant-order-rollback' >/dev/null
run_transition "$SUBJECT_ONE" "$ATTEMPT_ROLLBACK" 'handed_off' '' '' >/dev/null
"${psql_base[@]}" <<SQL
set session_replication_role = replica;
update public.product_offers set platform='ios' where id='${OFFER_ID}';
set session_replication_role = origin;
SQL
expect_fail "late Receipt constraint rolls back entire command" "receipt provider/platform must match" run_persist "$ATTEMPT_ROLLBACK" "$INTENT_ROLLBACK" 'testpay' 'web' 'sandbox' 'provider-tx-rollback' '' 'provider-event-rollback' "$EXTERNAL_PRODUCT" 'active' "$FP_C" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' ''
rollback_state=$("${psql_base[@]}" -At -F '|' -c "select cpa.status,coalesce(cpa.provider_transaction_id,''),pi.status,(select count(*) from public.commerce_receipts where external_transaction_id='provider-tx-rollback'),(select count(*) from public.commerce_provider_events where external_event_id='provider-event-rollback') from public.commerce_payment_attempts cpa join public.purchase_intents pi on pi.id=cpa.purchase_intent_id where cpa.id='${ATTEMPT_ROLLBACK}';")
[[ "$rollback_state" == 'handed_off||created|0|0' ]] || { echo "$rollback_state" >&2; fail "rollback left partial Commerce mutation"; }
pass "rollback leaves no partial Receipt/Event/Attempt/Purchase Intent mutation"
"${psql_base[@]}" <<SQL
set session_replication_role = replica;
update public.product_offers set platform='web' where id='${OFFER_ID}';
set session_replication_role = origin;
SQL

# Concurrency: the Attempt row lock serializes identical persistence calls. Both callers
# resolve to one Receipt/Event pair; exactly one is the first application.
INTENT_CONCURRENT='e1050000-0000-0000-0000-000000000004'
ATTEMPT_CONCURRENT='e1060000-0000-0000-0000-000000000006'
run_intent "$SUBJECT_ONE" "$INTENT_CONCURRENT" 'verified-payment-intent-concurrent' 'sha256:verified-payment-intent-concurrent' >/dev/null
run_attempt "$SUBJECT_ONE" "$ATTEMPT_CONCURRENT" "$INTENT_CONCURRENT" 'verified-payment-attempt-concurrent' 'merchant-order-concurrent' >/dev/null
run_transition "$SUBJECT_ONE" "$ATTEMPT_CONCURRENT" 'handed_off' '' '' >/dev/null
TMP_ONE=$(mktemp)
TMP_TWO=$(mktemp)
run_persist "$ATTEMPT_CONCURRENT" "$INTENT_CONCURRENT" 'testpay' 'web' 'sandbox' 'provider-tx-concurrent' '' 'provider-event-concurrent' "$EXTERNAL_PRODUCT" 'active' "hmac-sha256:k1:$(printf 'd%.0s' {1..64})" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' '' >"$TMP_ONE" &
pid_one=$!
run_persist "$ATTEMPT_CONCURRENT" "$INTENT_CONCURRENT" 'testpay' 'web' 'sandbox' 'provider-tx-concurrent' '' 'provider-event-concurrent' "$EXTERNAL_PRODUCT" 'active' "hmac-sha256:k1:$(printf 'd%.0s' {1..64})" "$VERIFIER" "$AMOUNT" "$CURRENCY" "$VERIFIED_AT" '' '' '' >"$TMP_TWO" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"
concurrent_one=$(cat "$TMP_ONE")
concurrent_two=$(cat "$TMP_TWO")
rm -f "$TMP_ONE" "$TMP_TWO"
IFS='|' read -r c_receipt_one c_event_one c_replay_one <<<"$concurrent_one"
IFS='|' read -r c_receipt_two c_event_two c_replay_two <<<"$concurrent_two"
[[ "$c_receipt_one" == "$c_receipt_two" && "$c_event_one" == "$c_event_two" ]] || fail "concurrent callers produced different canonical identities"
[[ "$(printf '%s\n%s\n' "$c_replay_one" "$c_replay_two" | sort | tr '\n' ' ')" == 'f t ' ]] || { echo "$concurrent_one / $concurrent_two" >&2; fail "concurrent replay markers mismatch"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.commerce_receipts where external_transaction_id='provider-tx-concurrent';")" == '1' ]] || fail "concurrent receipt duplicated"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.commerce_provider_events where external_event_id='provider-event-concurrent';")" == '1' ]] || fail "concurrent provider event duplicated"
pass "concurrent identical calls serialize to one Receipt/Event pair"

signature='public.cmd_persist_verified_payment_evidence_v1(uuid,uuid,text,text,text,text,text,text,text,text,text,text,bigint,text,text,text,text,text)'
[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_commerce_internal_executor','${signature}'::regprocedure,'EXECUTE');")" == 't' ]] || fail "internal Commerce role lacks persistence EXECUTE"
for role_name in anon authenticated service_role myeongha_api_executor; do
  [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('${role_name}','${signature}'::regprocedure,'EXECUTE');")" == 'f' ]] || fail "${role_name} unexpectedly executes persistence command"
done
pass "only internal Commerce executor can invoke verified-evidence persistence"

for table_name in commerce_payment_attempts purchase_intents commerce_receipts commerce_provider_events entitlement_grants entitlement_events entitlements; do
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_table_privilege('myeongha_commerce_internal_executor','public.${table_name}','${privilege}');")" == 'f' ]] || fail "internal Commerce role unexpectedly has ${privilege} on ${table_name}"
  done
done
pass "internal Commerce executor receives no broad table CRUD"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_grants;")" == '0' ]] || fail "persistence command created entitlement grants"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_events;")" == '0' ]] || fail "persistence command created entitlement events"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlements;")" == '0' ]] || fail "persistence command changed effective entitlements"
pass "verified payment evidence persistence has no entitlement side effects"
