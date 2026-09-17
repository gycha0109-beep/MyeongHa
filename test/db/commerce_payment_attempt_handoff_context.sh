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
  local snapshot='{"productOfferId":"d1030000-0000-0000-0000-000000000001","productId":"d1020000-0000-0000-0000-000000000001","platform":"web","provider":"portone_v2","externalProductId":"handoff-context-web"}'
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select purchase_intent_id,status,expected_amount_minor,expected_currency,charge_terms_version from public.cmd_create_purchase_intent_v2('${subject_id}','${intent_id}','d1030000-0000-0000-0000-000000000001',null,'${idem}','${request_hash}','${snapshot}'::jsonb,'sha256:handoff-context-snapshot'); commit;"
}

run_attempt() {
  local subject_id="$1" attempt_id="$2" intent_id="$3" idem="$4" provider_request_id="$5"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,status from public.cmd_create_payment_attempt_v1('${subject_id}','${attempt_id}','${intent_id}','sandbox','${idem}','${provider_request_id}'); commit;"
}

run_context() {
  local subject_id="$1" attempt_id="$2"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select payment_attempt_id,provider,environment,provider_request_id,expected_amount_minor,expected_currency,status from public.qry_commerce_payment_attempt_handoff_context_v1('${subject_id}','${attempt_id}'); commit;"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('d1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('d1010000-0000-0000-0000-000000000001','member','d1000000-0000-0000-0000-000000000001','active',null,'2026-09-17T00:00:00Z','2026-09-17T00:00:00Z'),
  ('d1010000-0000-0000-0000-000000000002','member','d1000000-0000-0000-0000-000000000002','active',null,'2026-09-17T00:00:00Z','2026-09-17T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at)
values ('d1020000-0000-0000-0000-000000000001','payment-attempt-handoff-context-fixture','reading',true,'2026-09-17T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  'd1030000-0000-0000-0000-000000000001',
  'd1020000-0000-0000-0000-000000000001',
  'web','portone_v2','handoff-context-web','KRW',7777,true,'2026-09-17T00:00:00Z',null,'2026-09-17T00:00:00Z'
);

insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values (
  'd1040000-0000-0000-0000-000000000001',
  'd1030000-0000-0000-0000-000000000001',
  'handoff-context-charge-v1',12345,'KRW','2026-09-17T00:00:00Z',null
);
SQL

intent=$(run_intent 'd1010000-0000-0000-0000-000000000001' 'd1050000-0000-0000-0000-000000000001' 'handoff-context-intent-1' 'sha256:handoff-context-intent-1')
[[ "$intent" == 'd1050000-0000-0000-0000-000000000001|created|12345|KRW|handoff-context-charge-v1' ]] || { echo "$intent" >&2; fail "Purchase Intent fixture mismatch"; }
pass "Purchase Intent pins handoff monetary authority"

created=$(run_attempt 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000001' 'd1050000-0000-0000-0000-000000000001' 'handoff-attempt-1' 'mha-portone-payment-id-1')
[[ "$created" == 'd1060000-0000-0000-0000-000000000001|created' ]] || { echo "$created" >&2; fail "created attempt fixture mismatch"; }
pass "created Payment Attempt is available before browser handoff"

# Mutable Product Offer display cache must not change the Purchase Intent charge authority.
"${psql_base[@]}" -c "update public.product_offers set display_price_minor=99999,currency='USD',price_cache_updated_at=clock_timestamp() where id='d1030000-0000-0000-0000-000000000001';"

context=$(run_context 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000001')
[[ "$context" == 'd1060000-0000-0000-0000-000000000001|portone_v2|sandbox|mha-portone-payment-id-1|12345|KRW|created' ]] || { echo "$context" >&2; fail "handoff context mismatch"; }
pass "handoff context exposes provider_request_id as paymentId source and pinned charge authority"

expect_fail "handoff context requires trusted Subject context" "trusted MyeongHa subject execution context is required" "select * from public.qry_commerce_payment_attempt_handoff_context_v1('d1010000-0000-0000-0000-000000000001','d1060000-0000-0000-0000-000000000001');"

expect_fail "cross-Subject attempt is non-enumerating" "payment-attempt handoff context is unavailable for the current subject" "begin; set local myeongha.subject_id='d1010000-0000-0000-0000-000000000002'; select * from public.qry_commerce_payment_attempt_handoff_context_v1('d1010000-0000-0000-0000-000000000002','d1060000-0000-0000-0000-000000000001'); commit;"

"${psql_base[@]}" -c "begin; set local myeongha.subject_id='d1010000-0000-0000-0000-000000000001'; select * from public.cmd_transition_payment_attempt_v1('d1010000-0000-0000-0000-000000000001','d1060000-0000-0000-0000-000000000001','handed_off',null,null); commit;" >/dev/null
expect_fail "post-handoff attempt is no longer a pre-browser context" "payment-attempt handoff context is unavailable for the current subject" "begin; set local myeongha.subject_id='d1010000-0000-0000-0000-000000000001'; select * from public.qry_commerce_payment_attempt_handoff_context_v1('d1010000-0000-0000-0000-000000000001','d1060000-0000-0000-0000-000000000001'); commit;"

# A second created attempt proves actual runtime-role execution without relying on the first state.
run_attempt 'd1010000-0000-0000-0000-000000000001' 'd1060000-0000-0000-0000-000000000002' 'd1050000-0000-0000-0000-000000000001' 'handoff-attempt-2' 'mha-portone-payment-id-2' >/dev/null

[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_api_executor','public.qry_commerce_payment_attempt_handoff_context_v1(uuid,uuid)'::regprocedure,'EXECUTE');")" == 't' ]] || fail "myeongha_api_executor lacks handoff-context query EXECUTE"
for role_name in anon authenticated service_role; do
  [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('${role_name}','public.qry_commerce_payment_attempt_handoff_context_v1(uuid,uuid)'::regprocedure,'EXECUTE');")" == 'f' ]] || fail "${role_name} unexpectedly executes handoff-context query"
done
for table_name in commerce_payment_attempts purchase_intents; do
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_table_privilege('myeongha_api_executor','public.${table_name}','${privilege}');")" == 'f' ]] || fail "myeongha_api_executor unexpectedly has ${privilege} on ${table_name}"
  done
done
pass "handoff context preserves narrow runtime ACL"

executor_context=$("${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_api_executor; set local myeongha.subject_id='d1010000-0000-0000-0000-000000000001'; select provider,environment,provider_request_id,expected_amount_minor,expected_currency,status from public.qry_commerce_payment_attempt_handoff_context_v1('d1010000-0000-0000-0000-000000000001','d1060000-0000-0000-0000-000000000002'); rollback;")
[[ "$executor_context" == 'portone_v2|sandbox|mha-portone-payment-id-2|12345|KRW|created' ]] || { echo "$executor_context" >&2; fail "API executor handoff context mismatch"; }
pass "API executor reads only the owned handoff projection"

for table_name in commerce_receipts commerce_provider_events entitlement_grants entitlement_events entitlements; do
  count=$("${psql_base[@]}" -Atc "select count(*) from public.${table_name};")
  [[ "$count" == '0' ]] || fail "handoff context created unauthorized side effect in ${table_name}"
done
pass "handoff context creates no receipt/event/entitlement side effects"

echo "commerce payment attempt handoff context passed"
