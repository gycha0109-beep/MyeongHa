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
  local snapshot='{"productOfferId":"b1030000-0000-0000-0000-000000000001","productId":"b1020000-0000-0000-0000-000000000001","platform":"web","provider":"testpay","externalProductId":"attempt-web"}'
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select purchase_intent_id,status,expected_amount_minor,expected_currency,charge_terms_version,replayed from public.cmd_create_purchase_intent_v2('${subject_id}','${intent_id}','b1030000-0000-0000-0000-000000000001',null,'${idem}','${request_hash}','${snapshot}'::jsonb,'sha256:attempt-offer-snapshot'); commit;"
}

run_attempt() {
  local subject_id="$1" attempt_id="$2" intent_id="$3" idem="$4" provider_request_id="$5"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,purchase_intent_id,attempt_no,provider,environment,provider_request_id,status,replayed from public.cmd_create_payment_attempt_v1('${subject_id}','${attempt_id}','${intent_id}','sandbox','${idem}','${provider_request_id}'); commit;"
}

run_transition() {
  local subject_id="$1" attempt_id="$2" target="$3" provider_transaction_id="$4" failure_code="$5"
  local tx_sql="null" failure_sql="null"
  [[ -z "$provider_transaction_id" ]] || tx_sql="'${provider_transaction_id}'"
  [[ -z "$failure_code" ]] || failure_sql="'${failure_code}'"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,attempt_no,provider,environment,provider_request_id,coalesce(provider_transaction_id,''),status,coalesce(failure_code,'') from public.cmd_transition_payment_attempt_v1('${subject_id}','${attempt_id}','${target}',${tx_sql},${failure_sql}); commit;"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('b1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('b1010000-0000-0000-0000-000000000001','member','b1000000-0000-0000-0000-000000000001','active',null,'2026-09-13T00:00:00Z','2026-09-13T00:00:00Z'),
  ('b1010000-0000-0000-0000-000000000002','member','b1000000-0000-0000-0000-000000000002','active',null,'2026-09-13T00:00:00Z','2026-09-13T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at)
values ('b1020000-0000-0000-0000-000000000001','payment-attempt-authority-fixture','reading',true,'2026-09-13T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  'b1030000-0000-0000-0000-000000000001',
  'b1020000-0000-0000-0000-000000000001',
  'web','testpay','attempt-web','KRW',7777,true,'2026-09-13T00:00:00Z',null,'2026-09-13T00:00:00Z'
);

insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values (
  'b1040000-0000-0000-0000-000000000001',
  'b1030000-0000-0000-0000-000000000001',
  'attempt-charge-v1',12345,'KRW','2026-09-13T00:00:00Z',null
);
SQL

intent_one=$(run_intent 'b1010000-0000-0000-0000-000000000001' 'b1050000-0000-0000-0000-000000000001' 'attempt-intent-1' 'sha256:attempt-intent-1')
[[ "$intent_one" == 'b1050000-0000-0000-0000-000000000001|created|12345|KRW|attempt-charge-v1|f' ]] || { echo "$intent_one" >&2; fail "fixture Purchase Intent v2 mismatch"; }
pass "fixture Purchase Intent v2 pins charge authority"

first=$(run_attempt 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000001' 'b1050000-0000-0000-0000-000000000001' 'attempt-1' 'merchant-order-1')
[[ "$first" == 'b1060000-0000-0000-0000-000000000001|b1050000-0000-0000-0000-000000000001|1|testpay|sandbox|merchant-order-1|created|f' ]] || { echo "$first" >&2; fail "first payment attempt mismatch"; }
pass "first payment attempt derives provider and ordinal from authoritative parent"

replay=$(run_attempt 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000099' 'b1050000-0000-0000-0000-000000000001' 'attempt-1' 'merchant-order-1')
[[ "$replay" == 'b1060000-0000-0000-0000-000000000001|b1050000-0000-0000-0000-000000000001|1|testpay|sandbox|merchant-order-1|created|t' ]] || { echo "$replay" >&2; fail "payment attempt replay mismatch"; }
pass "payment-attempt idempotency replays canonical attempt identity"

second=$(run_attempt 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000002' 'b1050000-0000-0000-0000-000000000001' 'attempt-2' 'merchant-order-2')
[[ "$second" == 'b1060000-0000-0000-0000-000000000002|b1050000-0000-0000-0000-000000000001|2|testpay|sandbox|merchant-order-2|created|f' ]] || { echo "$second" >&2; fail "second payment attempt mismatch"; }
pass "retry receives a monotonic per-intent attempt ordinal"

expect_fail "attempt replay shape conflict denied" "idempotency key already exists with different request identity" "begin; set local myeongha.subject_id='b1010000-0000-0000-0000-000000000001'; select * from public.cmd_create_payment_attempt_v1('b1010000-0000-0000-0000-000000000001','b1060000-0000-0000-0000-000000000098','b1050000-0000-0000-0000-000000000001','production','attempt-1','merchant-order-1'); commit;"
expect_fail "attempt creation requires trusted subject context" "trusted MyeongHa subject execution context is required" "select * from public.cmd_create_payment_attempt_v1('b1010000-0000-0000-0000-000000000001','b1060000-0000-0000-0000-000000000097','b1050000-0000-0000-0000-000000000001','sandbox','attempt-no-context','merchant-order-no-context');"
expect_fail "attempt creation denies owner override" "subject execution context mismatch" "begin; set local myeongha.subject_id='b1010000-0000-0000-0000-000000000002'; select * from public.cmd_create_payment_attempt_v1('b1010000-0000-0000-0000-000000000001','b1060000-0000-0000-0000-000000000096','b1050000-0000-0000-0000-000000000001','sandbox','attempt-owner-override','merchant-order-owner-override'); commit;"

handed_off=$(run_transition 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000001' 'handed_off' '' '')
[[ "$handed_off" == 'b1060000-0000-0000-0000-000000000001|1|testpay|sandbox|merchant-order-1||handed_off|' ]] || { echo "$handed_off" >&2; fail "handed-off transition mismatch"; }
pass "attempt records provider handoff without claiming payment success"

response=$(run_transition 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000001' 'response_received' 'provider-payment-key-1' '')
[[ "$response" == 'b1060000-0000-0000-0000-000000000001|1|testpay|sandbox|merchant-order-1|provider-payment-key-1|response_received|' ]] || { echo "$response" >&2; fail "response transition mismatch"; }
pass "attempt records provider transaction identity as unverified provenance"

response_replay=$(run_transition 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000001' 'response_received' 'provider-payment-key-1' '')
[[ "$response_replay" == "$response" ]] || fail "exact terminal transition replay changed provenance"
pass "exact terminal transition replay is idempotent"

expect_fail "terminal response provenance cannot be rewritten" "transition replay does not match stored provenance" "begin; set local myeongha.subject_id='b1010000-0000-0000-0000-000000000001'; select * from public.cmd_transition_payment_attempt_v1('b1010000-0000-0000-0000-000000000001','b1060000-0000-0000-0000-000000000001','response_received','provider-payment-key-rewritten',null); commit;"
expect_fail "terminal attempt row rejects direct rewrite" "terminal payment-attempt handoff provenance cannot be rewritten" "update public.commerce_payment_attempts set updated_at=updated_at + interval '1 second' where id='b1060000-0000-0000-0000-000000000001';"
expect_fail "attempt provenance cannot be deleted" "payment-attempt provenance cannot be deleted" "delete from public.commerce_payment_attempts where id='b1060000-0000-0000-0000-000000000001';"

failed=$(run_transition 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000002' 'failed' '' 'PROVIDER_DECLINED')
[[ "$failed" == 'b1060000-0000-0000-0000-000000000002|2|testpay|sandbox|merchant-order-2||failed|PROVIDER_DECLINED' ]] || { echo "$failed" >&2; fail "failed transition mismatch"; }
pass "failed attempt requires immutable normalized failure code"

expect_fail "failed state requires failure code" "failed payment attempt requires a non-empty failure code" "begin; set local myeongha.subject_id='b1010000-0000-0000-0000-000000000001'; select * from public.cmd_transition_payment_attempt_v1('b1010000-0000-0000-0000-000000000001','b1060000-0000-0000-0000-000000000002','failed',null,null); commit;"

# Direct inserts are not a runtime surface, but cross-row invariants must still reject
# a forged provider if a privileged maintenance actor attempts one.
expect_fail "cross-row provider mismatch denied" "provider must match the immutable Product Offer mapping" "insert into public.commerce_payment_attempts(id,purchase_intent_id,subject_id,product_offer_id,attempt_no,provider,environment,idempotency_key,provider_request_id,status,created_at,updated_at) values ('b1060000-0000-0000-0000-000000000090','b1050000-0000-0000-0000-000000000001','b1010000-0000-0000-0000-000000000001','b1030000-0000-0000-0000-000000000001',90,'forgedpay','sandbox','forged-provider','merchant-forged','created',now(),now());"

# Payment attempts intentionally carry no independent money authority.
for col in amount_minor currency charge_terms_version expected_amount_minor expected_currency; do
  count=$("${psql_base[@]}" -Atc "select count(*) from information_schema.columns where table_schema='public' and table_name='commerce_payment_attempts' and column_name='${col}';")
  [[ "$count" == '0' ]] || fail "payment attempt unexpectedly duplicates monetary authority column ${col}"
done
pass "payment attempts duplicate no amount/currency/charge-term authority"

# Attempt state alone must never materialize verified evidence or paid access.
for table in commerce_receipts commerce_provider_events entitlement_grants entitlement_events entitlements; do
  count=$("${psql_base[@]}" -Atc "select count(*) from public.${table};")
  [[ "$count" == '0' ]] || fail "payment attempt created unauthorized side effect in ${table}"
done
pass "payment attempts create no receipt/event/entitlement side effects"

# Runtime caller can execute the narrow commands but cannot mutate the table directly.
for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
  has=$("${psql_base[@]}" -Atc "select pg_catalog.has_table_privilege('myeongha_api_executor','public.commerce_payment_attempts','${privilege}');")
  [[ "$has" == 'f' ]] || fail "myeongha_api_executor unexpectedly has ${privilege} on payment attempts"
done
[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_api_executor','public.cmd_create_payment_attempt_v1(uuid,uuid,uuid,text,text,text)'::regprocedure,'EXECUTE');")" == 't' ]] || fail "myeongha_api_executor lacks create-payment-attempt command"
[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_api_executor','public.cmd_transition_payment_attempt_v1(uuid,uuid,text,text,text)'::regprocedure,'EXECUTE');")" == 't' ]] || fail "myeongha_api_executor lacks transition-payment-attempt command"
for role_name in anon authenticated service_role; do
  [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('${role_name}','public.cmd_create_payment_attempt_v1(uuid,uuid,uuid,text,text,text)'::regprocedure,'EXECUTE');")" == 'f' ]] || fail "${role_name} unexpectedly executes create-payment-attempt command"
  [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('${role_name}','public.cmd_transition_payment_attempt_v1(uuid,uuid,text,text,text)'::regprocedure,'EXECUTE');")" == 'f' ]] || fail "${role_name} unexpectedly executes transition-payment-attempt command"
done
pass "payment-attempt command/table ACL boundary is narrow"

# Existing replay must survive later Purchase Intent finalization, while new attempts do not.
"${psql_base[@]}" -c "update public.purchase_intents set status='verified', updated_at=clock_timestamp() where id='b1050000-0000-0000-0000-000000000001';"
terminal_replay=$(run_attempt 'b1010000-0000-0000-0000-000000000001' 'b1060000-0000-0000-0000-000000000095' 'b1050000-0000-0000-0000-000000000001' 'attempt-1' 'merchant-order-1')
[[ "$terminal_replay" == 'b1060000-0000-0000-0000-000000000001|b1050000-0000-0000-0000-000000000001|1|testpay|sandbox|merchant-order-1|response_received|t' ]] || { echo "$terminal_replay" >&2; fail "terminal parent replay mismatch"; }
pass "existing attempt replay survives terminal Purchase Intent state"
expect_fail "terminal Purchase Intent blocks new attempt" "new payment attempts require a non-terminal Purchase Intent" "begin; set local myeongha.subject_id='b1010000-0000-0000-0000-000000000001'; select * from public.cmd_create_payment_attempt_v1('b1010000-0000-0000-0000-000000000001','b1060000-0000-0000-0000-000000000094','b1050000-0000-0000-0000-000000000001','sandbox','attempt-after-terminal','merchant-after-terminal'); commit;"

# Concurrency: both callers race after the fast replay check. Parent-row serialization
# must resolve the loser as a replay instead of surfacing a unique violation.
intent_two=$(run_intent 'b1010000-0000-0000-0000-000000000002' 'b1050000-0000-0000-0000-000000000002' 'attempt-intent-2' 'sha256:attempt-intent-2')
[[ "$intent_two" == 'b1050000-0000-0000-0000-000000000002|created|12345|KRW|attempt-charge-v1|f' ]] || fail "concurrency fixture intent mismatch"

tmp_one=$(mktemp)
tmp_two=$(mktemp)
trap 'rm -f "$tmp_one" "$tmp_two"' EXIT

run_attempt 'b1010000-0000-0000-0000-000000000002' 'b1060000-0000-0000-0000-000000000010' 'b1050000-0000-0000-0000-000000000002' 'attempt-race' 'merchant-race' >"$tmp_one" &
pid_one=$!
run_attempt 'b1010000-0000-0000-0000-000000000002' 'b1060000-0000-0000-0000-000000000011' 'b1050000-0000-0000-0000-000000000002' 'attempt-race' 'merchant-race' >"$tmp_two" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"

race_one=$(cat "$tmp_one")
race_two=$(cat "$tmp_two")
race_id_one=${race_one%%|*}
race_id_two=${race_two%%|*}
[[ "$race_id_one" == "$race_id_two" ]] || { echo "$race_one"; echo "$race_two"; fail "concurrent retry returned different canonical attempt ids"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.commerce_payment_attempts where purchase_intent_id='b1050000-0000-0000-0000-000000000002' and idempotency_key='attempt-race';")" == '1' ]] || fail "concurrent retry created more than one logical attempt"
flags=$(printf '%s\n%s\n' "$race_one" "$race_two" | awk -F'|' '{print $8}' | sort | tr '\n' ' ')
[[ "$flags" == 'f t ' ]] || { echo "$race_one"; echo "$race_two"; fail "concurrent retry did not yield one create and one replay"; }
pass "concurrent identical retry converges on one canonical attempt"

echo "commerce payment attempt authority passed"
