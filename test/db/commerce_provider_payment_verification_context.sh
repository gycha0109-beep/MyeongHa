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
  local snapshot='{"productOfferId":"d1030000-0000-0000-0000-000000000001","productId":"d1020000-0000-0000-0000-000000000001","platform":"web","provider":"testpay","externalProductId":"provider-context-web"}'
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select purchase_intent_id,status,expected_amount_minor,expected_currency,charge_terms_version from public.cmd_create_purchase_intent_v2('${subject_id}','${intent_id}','d1030000-0000-0000-0000-000000000001',null,'${idem}','${request_hash}','${snapshot}'::jsonb,'sha256:provider-context-snapshot'); commit;"
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

run_provider_context() {
  local request_id="$1" transaction_id="$2"
  local request_sql="null" transaction_sql="null"
  [[ -z "$request_id" ]] || request_sql="'${request_id}'"
  [[ -z "$transaction_id" ]] || transaction_sql="'${transaction_id}'"
  "${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_commerce_internal_executor; select payment_attempt_id,resolved_subject_id,purchase_intent_id,provider,platform,environment,provider_request_id,coalesce(expected_provider_transaction_id,''),expected_external_product_id,expected_amount_minor,expected_currency from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox',${request_sql},${transaction_sql}); rollback;"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('d1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('d1010000-0000-0000-0000-000000000001','member','d1000000-0000-0000-0000-000000000001','active',null,'2026-09-13T00:00:00Z','2026-09-13T00:00:00Z'),
  ('d1010000-0000-0000-0000-000000000002','member','d1000000-0000-0000-0000-000000000002','active',null,'2026-09-13T00:00:00Z','2026-09-13T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at)
values ('d1020000-0000-0000-0000-000000000001','provider-payment-context-fixture','reading',true,'2026-09-13T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  'd1030000-0000-0000-0000-000000000001',
  'd1020000-0000-0000-0000-000000000001',
  'web','testpay','provider-context-web','KRW',7777,true,'2026-09-13T00:00:00Z',null,'2026-09-13T00:00:00Z'
);

insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values (
  'd1040000-0000-0000-0000-000000000001',
  'd1030000-0000-0000-0000-000000000001',
  'provider-context-charge-v1',12345,'KRW','2026-09-13T00:00:00Z',null
);
SQL

intent_one=$(run_intent 'd1010000-0000-0000-0000-000000000001' 'd1050000-0000-0000-0000-000000000001' 'provider-context-intent-1' 'sha256:provider-context-intent-1')
[[ "$intent_one" == 'd1050000-0000-0000-0000-000000000001|created|12345|KRW|provider-context-charge-v1' ]] || { echo "$intent_one" >&2; fail "Purchase Intent v2 fixture mismatch"; }
pass "Purchase Intent v2 pins provider verification authority"

created=$(run_attempt 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000001' 'd1050000-0000-0000-0000-000000000001' 'provider-attempt-1' 'merchant-provider-order-1')
[[ "$created" == 'd1060000-0000-0000-0000-000000000001|created' ]] || fail "created attempt fixture mismatch"

expect_fail "created attempt is not provider verification context" "has not reached a verification-eligible handoff state" "begin; set local role myeongha_commerce_internal_executor; select * from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox','merchant-provider-order-1',null); rollback;"

handed_off=$(run_transition 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000001' 'handed_off' '' '')
[[ "$handed_off" == 'd1060000-0000-0000-0000-000000000001|handed_off' ]] || fail "handed-off fixture mismatch"

"${psql_base[@]}" -c "update public.product_offers set display_price_minor=99999,price_cache_updated_at=clock_timestamp() where id='d1030000-0000-0000-0000-000000000001';"

request_context=$(run_provider_context 'merchant-provider-order-1' '')
[[ "$request_context" == 'd1060000-0000-0000-0000-000000000001|d1010000-0000-0000-0000-000000000001|d1050000-0000-0000-0000-000000000001|testpay|web|sandbox|merchant-provider-order-1||provider-context-web|12345|KRW' ]] || { echo "$request_context" >&2; fail "request-only provider context mismatch"; }
pass "provider request identity resolves snapshot product and pinned charge authority"

foreign_subject_context=$("${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_commerce_internal_executor; set local myeongha.subject_id='d1010000-0000-0000-0000-000000000002'; select resolved_subject_id from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox','merchant-provider-order-1',null); rollback;")
[[ "$foreign_subject_context" == 'd1010000-0000-0000-0000-000000000001' ]] || fail "provider resolver accepted caller-selected subject lineage"
pass "provider resolver derives subject lineage without subject impersonation"

response=$(run_transition 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000001' 'response_received' 'provider-transaction-1' '')
[[ "$response" == 'd1060000-0000-0000-0000-000000000001|response_received' ]] || fail "response-received fixture mismatch"

transaction_context=$(run_provider_context '' 'provider-transaction-1')
[[ "$transaction_context" == 'd1060000-0000-0000-0000-000000000001|d1010000-0000-0000-0000-000000000001|d1050000-0000-0000-0000-000000000001|testpay|web|sandbox|merchant-provider-order-1|provider-transaction-1|provider-context-web|12345|KRW' ]] || { echo "$transaction_context" >&2; fail "transaction-only provider context mismatch"; }
pass "provider transaction identity resolves the same authority"

expect_fail "request and transaction identity mismatch fails closed" "provider payment verification context is unavailable" "begin; set local role myeongha_commerce_internal_executor; select * from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox','merchant-provider-order-1','provider-transaction-other'); rollback;"
expect_fail "provider identity is required" "provider request or transaction identity is required" "begin; set local role myeongha_commerce_internal_executor; select * from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox',null,null); rollback;"

run_attempt 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000002' 'd1050000-0000-0000-0000-000000000001' 'provider-attempt-2' 'merchant-provider-order-2' >/dev/null
run_transition 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000002' 'failed' '' 'PROVIDER_DECLINED' >/dev/null
expect_fail "failed attempt denied" "has not reached a verification-eligible handoff state" "begin; set local role myeongha_commerce_internal_executor; select * from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox','merchant-provider-order-2',null); rollback;"

run_attempt 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000003' 'd1050000-0000-0000-0000-000000000001' 'provider-attempt-3' 'merchant-provider-order-3' >/dev/null
run_transition 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000003' 'cancelled' '' '' >/dev/null
expect_fail "cancelled attempt denied" "has not reached a verification-eligible handoff state" "begin; set local role myeongha_commerce_internal_executor; select * from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox','merchant-provider-order-3',null); rollback;"

run_intent 'd1010000-0000-0000-0000-000000000001' 'd1050000-0000-0000-0000-000000000002' 'provider-context-intent-2' 'sha256:provider-context-intent-2' >/dev/null
run_attempt 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000004' 'd1050000-0000-0000-0000-000000000002' 'provider-attempt-4' 'merchant-provider-order-4' >/dev/null
run_transition 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000004' 'handed_off' '' '' >/dev/null
"${psql_base[@]}" <<'SQL'
set session_replication_role = replica;
update public.purchase_intents
set offer_snapshot_jsonb='{"provider":"testpay"}'::jsonb
where id='d1050000-0000-0000-0000-000000000002';
set session_replication_role = origin;
SQL
expect_fail "malformed stored snapshot denied" "offer snapshot is not the canonical v2 shape" "begin; set local role myeongha_commerce_internal_executor; select * from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox','merchant-provider-order-4',null); rollback;"

run_intent 'd1010000-0000-0000-0000-000000000001' 'd1050000-0000-0000-0000-000000000003' 'provider-context-intent-3' 'sha256:provider-context-intent-3' >/dev/null
run_attempt 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000005' 'd1050000-0000-0000-0000-000000000003' 'provider-attempt-5' 'merchant-provider-order-5' >/dev/null
run_transition 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000005' 'handed_off' '' '' >/dev/null
"${psql_base[@]}" <<'SQL'
set session_replication_role = replica;
update public.purchase_intents
set expected_amount_minor=null,
    expected_currency=null,
    charge_terms_version=null
where id='d1050000-0000-0000-0000-000000000003';
set session_replication_role = origin;
SQL
expect_fail "missing pinned charge authority denied" "pinned charge authority is missing or malformed" "begin; set local role myeongha_commerce_internal_executor; select * from public.qry_commerce_provider_payment_verification_context_v1('testpay','sandbox','merchant-provider-order-5',null); rollback;"

[[ "$("${psql_base[@]}" -Atc "select pg_catalog.pg_has_role('myeongha_runtime','myeongha_commerce_internal_executor','MEMBER');")" == 't' ]] || fail "runtime principal is not a member of dedicated Commerce role"
[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_commerce_internal_executor','public.qry_commerce_provider_payment_verification_context_v1(text,text,text,text)'::regprocedure,'EXECUTE');")" == 't' ]] || fail "internal Commerce role lacks provider resolver EXECUTE"
for role_name in anon authenticated service_role myeongha_api_executor; do
  [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('${role_name}','public.qry_commerce_provider_payment_verification_context_v1(text,text,text,text)'::regprocedure,'EXECUTE');")" == 'f' ]] || fail "${role_name} unexpectedly executes provider verification resolver"
done
for table_name in commerce_payment_attempts purchase_intents commerce_receipts commerce_provider_events entitlement_grants entitlement_events entitlements; do
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_table_privilege('myeongha_commerce_internal_executor','public.${table_name}','${privilege}');")" == 'f' ]] || fail "internal Commerce role unexpectedly has ${privilege} on ${table_name}"
  done
done
pass "provider resolver preserves narrow internal Commerce ACL"

for table_name in commerce_receipts commerce_provider_events entitlement_grants entitlement_events entitlements; do
  count=$("${psql_base[@]}" -Atc "select count(*) from public.${table_name};")
  [[ "$count" == '0' ]] || fail "provider resolver created unauthorized side effect in ${table_name}"
done
pass "provider resolver creates no receipt/event/entitlement side effects"
