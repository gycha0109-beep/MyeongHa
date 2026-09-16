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

run_v3() {
  local subject_id="$1" intent_id="$2" offer_id="$3" idem="$4" request_hash="$5" offer_snapshot="$6" offer_snapshot_hash="$7" capability_snapshot="$8" capability_snapshot_hash="$9"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select purchase_intent_id,status,expected_amount_minor,expected_currency,charge_terms_version,capability_set_id,capability_snapshot_jsonb::text,capability_snapshot_hash,replayed from public.cmd_create_purchase_intent_v3('${subject_id}','${intent_id}','${offer_id}',null,'${idem}','${request_hash}','${offer_snapshot}'::jsonb,'${offer_snapshot_hash}','${capability_snapshot}'::jsonb,'${capability_snapshot_hash}'); commit;"
}

"${psql_base[@]}" <<'SQL'
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('a1071000-0000-0000-0000-000000000001','guest',null,'active',null,'2026-09-17T00:00:00Z','2026-09-17T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at) values
  ('a1072000-0000-0000-0000-000000000001','v3-capability-pinned','reading',true,'2026-09-17T00:00:00Z',null),
  ('a1072000-0000-0000-0000-000000000002','v3-capability-unpinned','reading',true,'2026-09-17T00:00:00Z',null);

insert into public.product_capability_sets(
  id,product_id,definition_version,definition_hash,created_at,retired_at
) values (
  'a1073000-0000-0000-0000-000000000001',
  'a1072000-0000-0000-0000-000000000001',
  'capability-v1','sha256:semantic-capability-v1','2026-09-17T00:00:00Z',null
);

insert into public.product_capability_items(
  capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,validity_mode,duration_seconds
) values (
  'a1073000-0000-0000-0000-000000000001',
  'reading-access','reading.full','global',null,'unbounded',null
);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,
  enabled,created_at,retired_at,price_cache_updated_at
) values
  ('a1074000-0000-0000-0000-000000000001','a1072000-0000-0000-0000-000000000001','web','testpay','v3-pinned-web','KRW',12900,true,'2026-09-17T00:00:00Z',null,'2026-09-17T00:00:00Z'),
  ('a1074000-0000-0000-0000-000000000002','a1072000-0000-0000-0000-000000000002','web','testpay','v3-unpinned-web','KRW',9900,true,'2026-09-17T00:00:00Z',null,'2026-09-17T00:00:00Z');

update public.product_offers
set capability_set_id='a1073000-0000-0000-0000-000000000001'
where id='a1074000-0000-0000-0000-000000000001';

insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values
  ('a1075000-0000-0000-0000-000000000001','a1074000-0000-0000-0000-000000000001','charge-v1',12900,'KRW','2026-09-17T00:00:00Z',null),
  ('a1075000-0000-0000-0000-000000000002','a1074000-0000-0000-0000-000000000002','charge-v1',9900,'KRW','2026-09-17T00:00:00Z',null);
SQL

offer_snapshot='{"productOfferId":"a1074000-0000-0000-0000-000000000001","productId":"a1072000-0000-0000-0000-000000000001","platform":"web","provider":"testpay","externalProductId":"v3-pinned-web"}'
unpinned_offer_snapshot='{"productOfferId":"a1074000-0000-0000-0000-000000000002","productId":"a1072000-0000-0000-0000-000000000002","platform":"web","provider":"testpay","externalProductId":"v3-unpinned-web"}'
capability_snapshot='{"capabilitySetId":"a1073000-0000-0000-0000-000000000001","definitionVersion":"capability-v1","definitionHash":"sha256:semantic-capability-v1"}'
wrong_capability_snapshot='{"capabilitySetId":"a1073000-0000-0000-0000-000000000099","definitionVersion":"capability-v1","definitionHash":"sha256:semantic-capability-v1"}'
capability_hash='sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

created=$(run_v3 'a1071000-0000-0000-0000-000000000001' 'a1076000-0000-0000-0000-000000000001' 'a1074000-0000-0000-0000-000000000001' 'v3-capability-1' 'sha256:v3:request-1' "$offer_snapshot" 'sha256:v3:offer-snapshot-1' "$capability_snapshot" "$capability_hash")
[[ "$created" == *'a1076000-0000-0000-0000-000000000001|created|12900|KRW|charge-v1|a1073000-0000-0000-0000-000000000001|'*"${capability_hash}|f" ]] || { echo "$created" >&2; fail "v3 created result mismatch"; }
pass "Purchase Intent v3 pins authoritative charge and Capability provenance"

stored=$("${psql_base[@]}" -At -F '|' -c "select capability_set_id,capability_snapshot_jsonb::text,capability_snapshot_hash from public.purchase_intents where id='a1076000-0000-0000-0000-000000000001';")
[[ "$stored" == *"a1073000-0000-0000-0000-000000000001|"*"${capability_hash}" ]] || { echo "$stored" >&2; fail "v3 capability provenance was not persisted"; }
pass "v3 capability provenance persists on Purchase Intent"

expect_fail "v3 fails closed for Offer without Capability Set" "no pinned Product Capability Set" "begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select * from public.cmd_create_purchase_intent_v3('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000002','a1074000-0000-0000-0000-000000000002',null,'v3-unpinned','sha256:v3:unpinned','${unpinned_offer_snapshot}'::jsonb,'sha256:v3:unpinned-offer','${capability_snapshot}'::jsonb,'${capability_hash}'); commit;"

expect_fail "v3 rejects caller-selected Capability Set semantics" "Capability snapshot must exactly match" "begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select * from public.cmd_create_purchase_intent_v3('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000003','a1074000-0000-0000-0000-000000000001',null,'v3-wrong-capability','sha256:v3:wrong-capability','${offer_snapshot}'::jsonb,'sha256:v3:offer-snapshot-1','${wrong_capability_snapshot}'::jsonb,'${capability_hash}'); commit;"

expect_fail "v3 same-key different request hash is an idempotency conflict" "different canonical request hash" "begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select * from public.cmd_create_purchase_intent_v3('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000099','a1074000-0000-0000-0000-000000000001',null,'v3-capability-1','sha256:v3:different-request','${offer_snapshot}'::jsonb,'sha256:v3:offer-snapshot-1','${capability_snapshot}'::jsonb,'${capability_hash}'); commit;"

expect_fail "v3 same-key cannot rewrite Capability snapshot hash" "do not match stored historical provenance" "begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select * from public.cmd_create_purchase_intent_v3('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000099','a1074000-0000-0000-0000-000000000001',null,'v3-capability-1','sha256:v3:request-1','${offer_snapshot}'::jsonb,'sha256:v3:offer-snapshot-1','${capability_snapshot}'::jsonb,'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'); commit;"

expect_fail "pinned Purchase Intent capability hash is immutable" "pinned Offer/Capability provenance are immutable" "update public.purchase_intents set capability_snapshot_hash='sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' where id='a1076000-0000-0000-0000-000000000001';"

"${psql_base[@]}" -c "begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select purchase_intent_id from public.cmd_create_purchase_intent_v2('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000010','a1074000-0000-0000-0000-000000000001',null,'historical-v2-on-pinned-offer','sha256:v2:historical','${offer_snapshot}'::jsonb,'sha256:v2:historical-offer'); commit;" >/dev/null
[[ "$("${psql_base[@]}" -At -F '|' -c "select capability_set_id is null,capability_snapshot_jsonb is null,capability_snapshot_hash is null from public.purchase_intents where id='a1076000-0000-0000-0000-000000000010';")" == 't|t|t' ]] || fail "historical v2 row was silently capability-backfilled"
pass "historical v2 row remains capability-unpinned"

expect_fail "v3 cannot silently upgrade historical v2 replay" "requires previously pinned Capability provenance" "begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select * from public.cmd_create_purchase_intent_v3('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000011','a1074000-0000-0000-0000-000000000001',null,'historical-v2-on-pinned-offer','sha256:v2:historical','${offer_snapshot}'::jsonb,'sha256:v2:historical-offer','${capability_snapshot}'::jsonb,'${capability_hash}'); commit;"

concurrent_sql="begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select purchase_intent_id from public.cmd_create_purchase_intent_v3('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000020','a1074000-0000-0000-0000-000000000001',null,'v3-concurrent','sha256:v3:concurrent','${offer_snapshot}'::jsonb,'sha256:v3:offer-snapshot-concurrent','${capability_snapshot}'::jsonb,'${capability_hash}'); commit;"
concurrent_sql_2="begin; set local myeongha.subject_id='a1071000-0000-0000-0000-000000000001'; select purchase_intent_id from public.cmd_create_purchase_intent_v3('a1071000-0000-0000-0000-000000000001','a1076000-0000-0000-0000-000000000021','a1074000-0000-0000-0000-000000000001',null,'v3-concurrent','sha256:v3:concurrent','${offer_snapshot}'::jsonb,'sha256:v3:offer-snapshot-concurrent','${capability_snapshot}'::jsonb,'${capability_hash}'); commit;"
"${psql_base[@]}" -Atc "$concurrent_sql" >/tmp/myeongha-v3-pi-a.out & pid_a=$!
"${psql_base[@]}" -Atc "$concurrent_sql_2" >/tmp/myeongha-v3-pi-b.out & pid_b=$!
wait "$pid_a"
wait "$pid_b"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.purchase_intents where subject_id='a1071000-0000-0000-0000-000000000001' and idempotency_key='v3-concurrent';")" == '1' ]] || fail "concurrent v3 retries created multiple Purchase Intents"
[[ "$("${psql_base[@]}" -At -F '|' -c "select capability_set_id,capability_snapshot_hash from public.purchase_intents where subject_id='a1071000-0000-0000-0000-000000000001' and idempotency_key='v3-concurrent';")" == "a1073000-0000-0000-0000-000000000001|${capability_hash}" ]] || fail "concurrent v3 winner did not pin one Capability authority"
pass "concurrent v3 retries converge on one immutable Capability pin"

"${psql_base[@]}" <<'SQL'
begin;
update public.product_capability_sets
set retired_at='2026-09-17T03:00:00Z'
where id='a1073000-0000-0000-0000-000000000001';
update public.product_offers
set enabled=false, retired_at='2026-09-17T03:00:00Z'
where id='a1074000-0000-0000-0000-000000000001';
update public.product_offer_charge_terms
set retired_at='2026-09-17T03:00:00Z'
where id='a1075000-0000-0000-0000-000000000001';
commit;
SQL

replayed=$(run_v3 'a1071000-0000-0000-0000-000000000001' 'a1076000-0000-0000-0000-000000000099' 'a1074000-0000-0000-0000-000000000001' 'v3-capability-1' 'sha256:v3:request-1' "$offer_snapshot" 'sha256:v3:offer-snapshot-1' "$capability_snapshot" "$capability_hash")
[[ "$replayed" == *'a1076000-0000-0000-0000-000000000001|created|12900|KRW|charge-v1|a1073000-0000-0000-0000-000000000001|'*"${capability_hash}|t" ]] || { echo "$replayed" >&2; fail "retirement/current movement changed v3 replay provenance"; }
pass "v3 replay preserves stored Capability and charge provenance after retirement/current movement"

for role in anon authenticated service_role; do
  [[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('${role}','public.cmd_create_purchase_intent_v3(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text)'::regprocedure,'EXECUTE');")" == 'f' ]] || fail "${role} unexpectedly has v3 command EXECUTE"
done
[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_api_executor','public.cmd_create_purchase_intent_v3(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text)'::regprocedure,'EXECUTE');")" == 't' ]] || fail "myeongha_api_executor lacks v3 command EXECUTE"
pass "v3 command ACL is internal API executor only"

for table in commerce_receipts entitlement_grants entitlement_events entitlements; do
  [[ "$("${psql_base[@]}" -Atc "select count(*) from public.${table} where subject_id='a1071000-0000-0000-0000-000000000001';")" == '0' ]] || fail "Purchase Intent v3 created forbidden side effect in ${table}"
done
pass "Purchase Intent v3 creates no Receipt/Grant/Event/effective-entitlement side effects"

echo "Purchase Intent v3 Capability provenance tests passed"
