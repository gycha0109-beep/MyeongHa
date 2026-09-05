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

run_v2() {
  local subject_id="$1" intent_id="$2" offer_id="$3" idem="$4" request_hash="$5" snapshot="$6" snapshot_hash="$7"
  "${psql_base[@]}" -At -F '|' -c "begin; set local myeongha.subject_id='${subject_id}'; select purchase_intent_id,status,expected_amount_minor,expected_currency,charge_terms_version,replayed from public.cmd_create_purchase_intent_v2('${subject_id}','${intent_id}','${offer_id}',null,'${idem}','${request_hash}','${snapshot}'::jsonb,'${snapshot_hash}'); commit;"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('a9500000-0000-0000-0000-000000000001'),
  ('a9500000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('a9510000-0000-0000-0000-000000000001','member','a9500000-0000-0000-0000-000000000001','active',null,'2026-09-05T00:00:00Z','2026-09-05T00:00:00Z'),
  ('a9510000-0000-0000-0000-000000000002','guest',null,'active',null,'2026-09-05T00:00:00Z','2026-09-05T00:00:00Z'),
  ('a9510000-0000-0000-0000-000000000003','member','a9500000-0000-0000-0000-000000000002','deletion_pending',null,'2026-09-05T00:00:00Z','2026-09-05T00:00:00Z'),
  ('a9510000-0000-0000-0000-000000000004','guest',null,'merged','a9510000-0000-0000-0000-000000000001','2026-09-05T00:00:00Z','2026-09-05T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at) values
  ('a9520000-0000-0000-0000-000000000001','v2-authoritative-charge','reading',true,'2026-09-05T00:00:00Z',null),
  ('a9520000-0000-0000-0000-000000000002','v2-no-charge-authority','reading',true,'2026-09-05T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values
  ('a9530000-0000-0000-0000-000000000001','a9520000-0000-0000-0000-000000000001','web','testpay','v2-web','KRW',4900,true,'2026-09-05T00:00:00Z',null,'2026-09-05T00:00:00Z'),
  ('a9530000-0000-0000-0000-000000000002','a9520000-0000-0000-0000-000000000002','web','testpay','v2-no-terms-web','KRW',2900,true,'2026-09-05T00:00:00Z',null,'2026-09-05T00:00:00Z');

insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values (
  'a9540000-0000-0000-0000-000000000001',
  'a9530000-0000-0000-0000-000000000001',
  'charge-v1',12900,'KRW','2026-09-05T00:00:00Z',null
);
SQL

snapshot='{"productOfferId":"a9530000-0000-0000-0000-000000000001","productId":"a9520000-0000-0000-0000-000000000001","platform":"web","provider":"testpay","externalProductId":"v2-web"}'
no_terms_snapshot='{"productOfferId":"a9530000-0000-0000-0000-000000000002","productId":"a9520000-0000-0000-0000-000000000002","platform":"web","provider":"testpay","externalProductId":"v2-no-terms-web"}'

member=$(run_v2 'a9510000-0000-0000-0000-000000000001' 'a9550000-0000-0000-0000-000000000001' 'a9530000-0000-0000-0000-000000000001' 'member-v2-1' 'sha256:v2:member-request' "$snapshot" 'sha256:v2:member-snapshot')
[[ "$member" == 'a9550000-0000-0000-0000-000000000001|created|12900|KRW|charge-v1|f' ]] || { echo "$member" >&2; fail "active Member v2 result mismatch"; }
pass "active Member Purchase Intent v2 pins authoritative charge terms"

guest=$(run_v2 'a9510000-0000-0000-0000-000000000002' 'a9550000-0000-0000-0000-000000000002' 'a9530000-0000-0000-0000-000000000001' 'guest-v2-1' 'sha256:v2:guest-request' "$snapshot" 'sha256:v2:guest-snapshot')
[[ "$guest" == 'a9550000-0000-0000-0000-000000000002|created|12900|KRW|charge-v1|f' ]] || { echo "$guest" >&2; fail "active Guest v2 result mismatch"; }
pass "active Guest Purchase Intent v2 is canonical owner and pins authoritative charge terms"

[[ "$("${psql_base[@]}" -Atc "select expected_amount_minor||'|'||expected_currency||'|'||charge_terms_version from public.purchase_intents where id='a9550000-0000-0000-0000-000000000002';")" == '12900|KRW|charge-v1' ]] || fail "Guest Purchase Intent did not persist charge tuple"
pass "Guest v2 persisted complete expected charge tuple"

for table in commerce_receipts entitlement_grants entitlement_events entitlements; do
  [[ "$("${psql_base[@]}" -Atc "select count(*) from public.${table} where subject_id='a9510000-0000-0000-0000-000000000002';")" == '0' ]] || fail "Purchase Intent v2 created side effect in ${table}"
done
pass "Purchase Intent v2 creates no receipt/grant/event/effective-entitlement side effects"

expect_fail "v2 requires trusted subject execution context" "trusted MyeongHa subject execution context is required" "select * from public.cmd_create_purchase_intent_v2('a9510000-0000-0000-0000-000000000002','a9550000-0000-0000-0000-000000000010','a9530000-0000-0000-0000-000000000001',null,'no-context','sha256:v2:no-context','${snapshot}'::jsonb,'sha256:v2:no-context-snapshot');"
expect_fail "v2 denies owner override against transaction subject" "subject execution context mismatch" "begin; set local myeongha.subject_id='a9510000-0000-0000-0000-000000000001'; select * from public.cmd_create_purchase_intent_v2('a9510000-0000-0000-0000-000000000002','a9550000-0000-0000-0000-000000000011','a9530000-0000-0000-0000-000000000001',null,'owner-override','sha256:v2:owner-override','${snapshot}'::jsonb,'sha256:v2:owner-override-snapshot'); commit;"
expect_fail "deletion-pending Member v2 is denied" "active canonical Guest or Member" "begin; set local myeongha.subject_id='a9510000-0000-0000-0000-000000000003'; select * from public.cmd_create_purchase_intent_v2('a9510000-0000-0000-0000-000000000003','a9550000-0000-0000-0000-000000000012','a9530000-0000-0000-0000-000000000001',null,'pending-member','sha256:v2:pending-member','${snapshot}'::jsonb,'sha256:v2:pending-member-snapshot'); commit;"
expect_fail "merged Guest v2 is denied" "active canonical Guest or Member" "begin; set local myeongha.subject_id='a9510000-0000-0000-0000-000000000004'; select * from public.cmd_create_purchase_intent_v2('a9510000-0000-0000-0000-000000000004','a9550000-0000-0000-0000-000000000013','a9530000-0000-0000-0000-000000000001',null,'merged-guest','sha256:v2:merged-guest','${snapshot}'::jsonb,'sha256:v2:merged-guest-snapshot'); commit;"
expect_fail "v2 offer without charge authority is denied" "no current authoritative charge terms" "begin; set local myeongha.subject_id='a9510000-0000-0000-0000-000000000002'; select * from public.cmd_create_purchase_intent_v2('a9510000-0000-0000-0000-000000000002','a9550000-0000-0000-0000-000000000014','a9530000-0000-0000-0000-000000000002',null,'no-terms','sha256:v2:no-terms','${no_terms_snapshot}'::jsonb,'sha256:v2:no-terms-snapshot'); commit;"

# Historical v1 remains Member-only even though the shared row invariant now accepts
# the broader P0-CM-04 canonical owner set.
expect_fail "historical v1 still denies Guest" "active member subject" "select * from public.cmd_create_purchase_intent_v1('a9510000-0000-0000-0000-000000000002','a9550000-0000-0000-0000-000000000015','a9530000-0000-0000-0000-000000000001',null,'guest-v1-still-denied','sha256:v1:guest-denied','${snapshot}'::jsonb,'sha256:v1:guest-denied-snapshot');"

# Mutable display cache is deliberately not monetary authority.
"${psql_base[@]}" -c "update public.product_offers set currency='USD', display_price_minor=999999, price_cache_updated_at=clock_timestamp() where id='a9530000-0000-0000-0000-000000000001';"
replay_after_cache=$(run_v2 'a9510000-0000-0000-0000-000000000002' 'a9550000-0000-0000-0000-000000000099' 'a9530000-0000-0000-0000-000000000001' 'guest-v2-1' 'sha256:v2:guest-request' "$snapshot" 'sha256:v2:guest-snapshot')
[[ "$replay_after_cache" == 'a9550000-0000-0000-0000-000000000002|created|12900|KRW|charge-v1|t' ]] || fail "display-cache mutation changed replayed authority: $replay_after_cache"
pass "mutable display price/currency cannot change pinned v2 monetary authority"

expect_fail "charge amount is immutable" "monetary identity is immutable" "update public.product_offer_charge_terms set amount_minor=1 where id='a9540000-0000-0000-0000-000000000001';"
expect_fail "second current charge version is impossible" "uq_product_offer_charge_terms_current" "insert into public.product_offer_charge_terms(id,product_offer_id,terms_version,amount_minor,currency,created_at) values ('a9540000-0000-0000-0000-000000000099','a9530000-0000-0000-0000-000000000001','duplicate-current',14000,'KRW','2026-09-05T01:00:00Z');"

"${psql_base[@]}" <<'SQL'
begin;
update public.product_offer_charge_terms
set retired_at='2026-09-05T02:00:00Z'
where id='a9540000-0000-0000-0000-000000000001';
insert into public.product_offer_charge_terms(
  id,product_offer_id,terms_version,amount_minor,currency,created_at,retired_at
) values (
  'a9540000-0000-0000-0000-000000000002',
  'a9530000-0000-0000-0000-000000000001',
  'charge-v2',14900,'KRW','2026-09-05T02:00:00Z',null
);
commit;
SQL

replay_old=$(run_v2 'a9510000-0000-0000-0000-000000000002' 'a9550000-0000-0000-0000-000000000098' 'a9530000-0000-0000-0000-000000000001' 'guest-v2-1' 'sha256:v2:guest-request' "$snapshot" 'sha256:v2:guest-snapshot')
[[ "$replay_old" == 'a9550000-0000-0000-0000-000000000002|created|12900|KRW|charge-v1|t' ]] || fail "old replay was repriced: $replay_old"
new_price=$(run_v2 'a9510000-0000-0000-0000-000000000002' 'a9550000-0000-0000-0000-000000000003' 'a9530000-0000-0000-0000-000000000001' 'guest-v2-2' 'sha256:v2:guest-request-2' "$snapshot" 'sha256:v2:guest-snapshot')
[[ "$new_price" == 'a9550000-0000-0000-0000-000000000003|created|14900|KRW|charge-v2|f' ]] || fail "new Purchase Intent did not use current terms: $new_price"
pass "charge version switch preserves old replay and pins new terms only for new logical intent"

expect_fail "retired charge terms cannot reactivate" "cannot be reactivated or rewritten" "update public.product_offer_charge_terms set retired_at=null where id='a9540000-0000-0000-0000-000000000001';"
expect_fail "charge-term history cannot be deleted" "history cannot be deleted" "delete from public.product_offer_charge_terms where id='a9540000-0000-0000-0000-000000000001';"

# Ordinary API role receives only the narrow v2 command, never direct charge-table DML.
for privilege in INSERT UPDATE DELETE TRUNCATE; do
  has=$("${psql_base[@]}" -Atc "select pg_catalog.has_table_privilege('myeongha_api_executor','public.product_offer_charge_terms','${privilege}');")
  [[ "$has" == 'f' ]] || fail "myeongha_api_executor unexpectedly has ${privilege} on charge terms"
done
[[ "$("${psql_base[@]}" -Atc "select pg_catalog.has_function_privilege('myeongha_api_executor','public.cmd_create_purchase_intent_v2(uuid,uuid,uuid,uuid,text,text,jsonb,text)'::regprocedure,'EXECUTE');")" == 't' ]] || fail "myeongha_api_executor lacks v2 command EXECUTE"
pass "ordinary API role has narrow v2 command EXECUTE and no direct charge-term mutation"

# Concurrency: same subject + idempotency + semantic request converges on one row.
concurrent_sql="begin; set local myeongha.subject_id='a9510000-0000-0000-0000-000000000002'; select purchase_intent_id from public.cmd_create_purchase_intent_v2('a9510000-0000-0000-0000-000000000002','a9550000-0000-0000-0000-000000000020','a9530000-0000-0000-0000-000000000001',null,'guest-v2-concurrent','sha256:v2:guest-concurrent','${snapshot}'::jsonb,'sha256:v2:guest-snapshot'); commit;"
concurrent_sql_2="begin; set local myeongha.subject_id='a9510000-0000-0000-0000-000000000002'; select purchase_intent_id from public.cmd_create_purchase_intent_v2('a9510000-0000-0000-0000-000000000002','a9550000-0000-0000-0000-000000000021','a9530000-0000-0000-0000-000000000001',null,'guest-v2-concurrent','sha256:v2:guest-concurrent','${snapshot}'::jsonb,'sha256:v2:guest-snapshot'); commit;"
"${psql_base[@]}" -Atc "$concurrent_sql" >/tmp/myeongha-v2-pi-a.out & pid_a=$!
"${psql_base[@]}" -Atc "$concurrent_sql_2" >/tmp/myeongha-v2-pi-b.out & pid_b=$!
wait "$pid_a"
wait "$pid_b"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.purchase_intents where subject_id='a9510000-0000-0000-0000-000000000002' and idempotency_key='guest-v2-concurrent';")" == '1' ]] || fail "concurrent v2 retries created multiple Purchase Intents"
[[ "$("${psql_base[@]}" -Atc "select expected_amount_minor||'|'||expected_currency||'|'||charge_terms_version from public.purchase_intents where subject_id='a9510000-0000-0000-0000-000000000002' and idempotency_key='guest-v2-concurrent';")" == '14900|KRW|charge-v2' ]] || fail "concurrent v2 winner did not pin one current charge authority"
pass "concurrent Guest v2 retries converge on one Purchase Intent with one pinned charge authority"

echo "Purchase Intent v2 Guest/charge-authority tests passed"
