#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1" needle="$2" sql="$3" out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

run_intent() {
  local subject_id="$1" intent_id="$2" idem="$3" request_hash="$4"
  local snapshot='{"productOfferId":"c1030000-0000-0000-0000-000000000001","productId":"c1020000-0000-0000-0000-000000000001","platform":"web","provider":"testpay","externalProductId":"verification-context-web"}'
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select purchase_intent_id,status,expected_amount_minor,expected_currency,charge_terms_version from public.cmd_create_purchase_intent_v2('${subject_id}','${intent_id}','c1030000-0000-0000-0000-000000000001',null,'${idem}','${request_hash}','${snapshot}'::jsonb,'sha256:verification-context-snapshot'); commit;"
}

run_attempt() {
  local subject_id="$1" attempt_id="$2" intent_id="$3" idem="$4" provider_request_id="$5"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,status from public.cmd_create_payment_attempt_v1('${subject_id}','${attempt_id}','${intent_id}','sandbox','${idem}','${provider_request_id}'); commit;"
}

run_transition() {
  local subject_id="$1" attempt_id="$2" target="$3" provider_transaction_id="$4" failure_code="$5"
  local tx_sql="null" failure_sql="null"
  [[ -z "$provider_transaction_id" ]] || tx_sql="'${provider_transaction_id}'"
  [[ -z "$failure_code" ]] || failure_sql="'${failure_code}'"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,status from public.cmd_transition_payment_attempt_v1('${subject_id}','${attempt_id}','${target}',${tx_sql},${failure_sql}); commit;"
}

run_context() {
  local subject_id="$1" attempt_id="$2"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,purchase_intent_id,provider,platform,environment,provider_request_id,coalesce(expected_provider_transaction_id,''),expected_external_product_id,expected_amount_minor,expected_currency from public.qry_commerce_payment_verification_context_v1('${subject_id}','${attempt_id}'); commit;"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('c1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('c1010000-0000-0000-0000-000000000001','member','c1000000-0000-0000-0000-000000000001','active',null,'2026-09-13T00:00:00Z','2026-09-13T00:00:00Z'),
  ('c1010000-0000-0000-0000-000000000002','member','c1000000-0000-0000-0000-000000000002','active',null,'2026-09-13T00:00:00Z','2026-09-13T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at)
values ('c1020000-0000-0000-0000-000000000001','payment-verification-context-fixture','reading',true,'2026-09-13T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  'c1030000-0000-0000-0000-000000000001',
  'c1020000-0000-0000-0000-000000000001',
  'web','testpay','verification-context-web','KRW',7777,true,'2026-09-13T00:00:00Z',null,'2026-09-13T00:00:00Z'
);

insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values (
  'c1040000-0000-0000-0000-000000000001',
  'c1030000-0000-0000-0000-000000000001',
  'verification-context-charge-v1',12345,'KRW','2026-09-13T00:00:00Z',null
);
SQL

intent_one=$(run_intent 'c1010000-0000-0000-0000-000000000001' 'c1050000-0000-0000-0000-000000000001' 'verification-context-intent-1' 'sha256:verification-context-intent-1')
[[ "$intent_one" == 'c1050000-0000-0000-0000-000000000001|created|12345|KRW|verification-context-charge-v1' ]] || { echo "$intent_one" >&2; fail "Purchase Intent v2 fixture mismatch"; }
pass "Purchase Intent v2 pins verification monetary authority"

created=$(run_attempt 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000001' 'c1050000-0000-0000-0000-000000000001' 'verification-attempt-1' 'merchant-order-context-1')
[[ "$created" == 'c1060000-0000-0000-0000-000000000001|created' ]] || fail "created attempt fixture mismatch"

expect_fail "created attempt cannot be verification context" "has not reached a verification-eligible handoff state" "begin; set local myeongha.subject_id='c1010000-0000-0000-0000-000000000001'; select * from public.qry_commerce_payment_verification_context_v1('c1010000-0000-0000-0000-000000000001','c1060000-0000-0000-0000-000000000001'); commit;"

handed_off=$(run_transition 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000001' 'handed_off' '' '')
[[ "$handed_off" == 'c1060000-0000-0000-0000-000000000001|handed_off' ]] || fail "handed-off fixture mismatch"

# Mutable display cache changes after Purchase Intent creation must not alter verification authority.
"${psql_base[@]}" -c "update public.product_offers set display_price_minor=99999,currency='USD',price_cache_updated_at=clock_timestamp() where id='c1030000-0000-0000-0000-000000000001';"

context=$(run_context 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000001')
[[ "$context" == 'c1060000-0000-0000-0000-000000000001|c1050000-0000-0000-0000-000000000001|testpay|web|sandbox|merchant-order-context-1||verification-context-web|12345|KRW' ]] || { echo "$context" >&2; fail "handed-off verification context mismatch"; }
pass "verification context uses persisted snapshot and pinned charge authority"

response=$(run_transition 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000001' 'response_received' 'provider-transaction-context-1' '')
[[ "$response" == 'c1060000-0000-0000-0000-000000000001|response_received' ]] || fail "response-received fixture mismatch"

response_context=$(run_context 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000001')
[[ "$response_context" == 'c1060000-0000-0000-0000-000000000001|c1050000-0000-0000-0000-000000000001|testpay|web|sandbox|merchant-order-context-1|provider-transaction-context-1|verification-context-web|12345|KRW' ]] || { echo "$response_context" >&2; fail "response verification context mismatch"; }
pass "response_received preserves optional provider transaction identity without claiming success"

expect_fail "cross-subject verification context denied" "subject execution context mismatch" "begin; set local myeongha.subject_id='c1010000-0000-0000-0000-000000000002'; select * from public.qry_commerce_payment_verification_context_v1('c1010000-0000-0000-0000-000000000001','c1060000-0000-0000-0000-000000000001'); commit;"

# Failed attempts are not verification-context sources.
run_attempt 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000002' 'c1050000-0000-0000-0000-000000000001' 'verification-attempt-2' 'merchant-order-context-2' >/dev/null
run_transition 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000002' 'failed' '' 'PROVIDER_DECLINED' >/dev/null
expect_fail "failed attempt cannot be verification context" "has not reached a verification-eligible handoff state" "begin; set local myeongha.subject_id='c1010000-0000-0000-0000-000000000001'; select * from public.qry_commerce_payment_verification_context_v1('c1010000-0000-0000-0000-000000000001','c1060000-0000-0000-0000-000000000002'); commit;"

# Simulate a privileged historical/corrupt row to prove malformed stored snapshot fails closed.
run_intent 'c1010000-0000-0000-0000-000000000001' 'c1050000-0000-0000-0000-000000000002' 'verification-context-intent-2' 'sha256:verification-context-intent-2' >/dev/null
run_attempt 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000003' 'c1050000-0000-0000-0000-000000000002' 'verification-attempt-3' 'merchant-order-context-3' >/dev/null
run_transition 'c1010000-0000-0000-0000-000000000001' 'c1060000-0000-0000-0000-000000000003' 'handed_off' '' '' >/dev/null
"${psql_base[@]}" <<'SQL'
set session_replication_role = replica;
update public.purchase_intents
set offer_snapshot_jsonb='{"provider":"testpay"}'::jsonb
where id='c1050000-0000-0000-0000-000000000002';
set session_replication_role = origin;
SQL
expect_fail "malformed stored snapshot denied" "offer snapshot is not the canonical v2 shape" "begin; set local myeongha.subject_id='c1010000-0000-0000-0000-000000000001'; select * from public.qry_commerce_payment_verification_context_v1('c1010000-0000-0000-0000-000000000001','c1060000-0000-0000-0000-000000000003'); commit;"

# The governed runtime role gets only EXECUTE on the narrow function.
[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_api_executor','public.qry_commerce_payment_verification_context_v1(uuid,uuid)'::regprocedure,'EXECUTE');")" == 't' ]] || fail "myeongha_api_executor lacks verification-context query EXECUTE"
for role_name in anon authenticated service_role; do
  [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('${role_name}','public.qry_commerce_payment_verification_context_v1(uuid,uuid)'::regprocedure,'EXECUTE');")" == 'f' ]] || fail "${role_name} unexpectedly executes verification-context query"
done
for table_name in commerce_payment_attempts purchase_intents; do
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_table_privilege('myeongha_api_executor','public.${table_name}','${privilege}');")" == 'f' ]] || fail "myeongha_api_executor unexpectedly has ${privilege} on ${table_name}"
  done
done
pass "verification context preserves narrow runtime ACL"

executor_context=$("${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_api_executor; set local myeongha.subject_id='c1010000-0000-0000-0000-000000000001'; select provider,platform,environment,expected_amount_minor,expected_currency from public.qry_commerce_payment_verification_context_v1('c1010000-0000-0000-0000-000000000001','c1060000-0000-0000-0000-000000000001'); rollback;")
[[ "$executor_context" == 'testpay|web|sandbox|12345|KRW' ]] || { echo "$executor_context" >&2; fail "API executor verification context mismatch"; }
pass "API executor can read only the subject-bound verification projection"

for table_name in commerce_receipts commerce_provider_events entitlement_grants entitlement_events entitlements; do
  count=$("${psql_base[@]}" -Atc "select count(*) from public.${table_name};")
  [[ "$count" == '0' ]] || fail "verification context created unauthorized side effect in ${table_name}"
done
pass "verification context creates no receipt/event/entitlement side effects"
