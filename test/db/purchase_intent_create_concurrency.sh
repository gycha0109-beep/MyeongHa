#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
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

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('f6600000-0000-0000-0000-000000000001'),
  ('f6600000-0000-0000-0000-000000000002'),
  ('f6600000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values
  ('f6610000-0000-0000-0000-000000000001','member','f6600000-0000-0000-0000-000000000001','active','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z'),
  ('f6610000-0000-0000-0000-000000000002','member','f6600000-0000-0000-0000-000000000002','active','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z'),
  ('f6610000-0000-0000-0000-000000000003','guest',null,'active','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z'),
  ('f6610000-0000-0000-0000-000000000004','member','f6600000-0000-0000-0000-000000000003','deletion_pending','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at) values
  ('f6620000-0000-0000-0000-000000000001','purchase-command-premium','reading',true,'2026-08-01T00:00:00Z',null),
  ('f6620000-0000-0000-0000-000000000002','purchase-command-story','episode',true,'2026-08-01T00:00:00Z',null),
  ('f6620000-0000-0000-0000-000000000003','purchase-command-disabled','reading',false,'2026-08-01T00:00:00Z',null),
  ('f6620000-0000-0000-0000-000000000004','purchase-command-retired','reading',true,'2025-08-01T00:00:00Z','2026-07-01T00:00:00Z');

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values
  ('f6630000-0000-0000-0000-000000000001','f6620000-0000-0000-0000-000000000001','web','testpay','premium-web','KRW',4900,true,'2026-08-01T00:00:00Z',null,'2026-08-01T00:00:00Z'),
  ('f6630000-0000-0000-0000-000000000002','f6620000-0000-0000-0000-000000000002','ios','apple-test','story-ios','KRW',2900,true,'2026-08-01T00:00:00Z',null,'2026-08-01T00:00:00Z'),
  ('f6630000-0000-0000-0000-000000000003','f6620000-0000-0000-0000-000000000003','web','testpay','disabled-product-web','KRW',1000,true,'2026-08-01T00:00:00Z',null,'2026-08-01T00:00:00Z'),
  ('f6630000-0000-0000-0000-000000000004','f6620000-0000-0000-0000-000000000004','web','testpay','retired-product-web','KRW',1000,true,'2025-08-01T00:00:00Z',null,'2025-08-01T00:00:00Z'),
  ('f6630000-0000-0000-0000-000000000005','f6620000-0000-0000-0000-000000000001','android','google-test','premium-android','KRW',4900,false,'2026-08-01T00:00:00Z',null,'2026-08-01T00:00:00Z');

insert into public.commerce_account_links(
  id,subject_id,provider,external_account_fingerprint,status,verified_at,revoked_at,created_at
) values
  ('f6640000-0000-0000-0000-000000000001','f6610000-0000-0000-0000-000000000001','testpay','hmac-sha256:k2:purchase-account-a','active','2026-08-01T00:00:00Z',null,'2026-08-01T00:00:00Z'),
  ('f6640000-0000-0000-0000-000000000002','f6610000-0000-0000-0000-000000000001','apple-test','hmac-sha256:k2:purchase-account-apple','active','2026-08-01T00:00:00Z',null,'2026-08-01T00:00:00Z'),
  ('f6640000-0000-0000-0000-000000000003','f6610000-0000-0000-0000-000000000002','testpay','hmac-sha256:k2:purchase-account-b','active','2026-08-01T00:00:00Z',null,'2026-08-01T00:00:00Z'),
  ('f6640000-0000-0000-0000-000000000004','f6610000-0000-0000-0000-000000000001','testpay','hmac-sha256:k2:purchase-account-revoked','revoked','2026-07-01T00:00:00Z','2026-08-01T00:00:00Z','2026-07-01T00:00:00Z');
SQL

snapshot_web='{"productOfferId":"f6630000-0000-0000-0000-000000000001","productId":"f6620000-0000-0000-0000-000000000001","platform":"web","provider":"testpay","externalProductId":"premium-web"}'
snapshot_ios='{"productOfferId":"f6630000-0000-0000-0000-000000000002","productId":"f6620000-0000-0000-0000-000000000002","platform":"ios","provider":"apple-test","externalProductId":"story-ios"}'
snapshot_disabled_product='{"productOfferId":"f6630000-0000-0000-0000-000000000003","productId":"f6620000-0000-0000-0000-000000000003","platform":"web","provider":"testpay","externalProductId":"disabled-product-web"}'
snapshot_retired_product='{"productOfferId":"f6630000-0000-0000-0000-000000000004","productId":"f6620000-0000-0000-0000-000000000004","platform":"web","provider":"testpay","externalProductId":"retired-product-web"}'
snapshot_disabled_offer='{"productOfferId":"f6630000-0000-0000-0000-000000000005","productId":"f6620000-0000-0000-0000-000000000001","platform":"android","provider":"google-test","externalProductId":"premium-android"}'

created=$("${psql_base[@]}" -At -F '|' -c "select purchase_intent_id,product_offer_id,provider_account_link_id,status,offer_snapshot_hash,replayed from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000001','f6630000-0000-0000-0000-000000000001','f6640000-0000-0000-0000-000000000001','purchase-create-1','hmac-sha256:k2:purchase-request-1','${snapshot_web}'::jsonb,'sha256:v1:purchase-offer-snapshot-1');")
expected='f6650000-0000-0000-0000-000000000001|f6630000-0000-0000-0000-000000000001|f6640000-0000-0000-0000-000000000001|created|sha256:v1:purchase-offer-snapshot-1|f'
[[ "$created" == "$expected" ]] || { echo "$created" >&2; fail "purchase intent create result mismatch"; }
pass "purchase intent create pins the selected immutable offer mapping and starts at created"

stored_snapshot=$("${psql_base[@]}" -Atc "select offer_snapshot_jsonb::text from public.purchase_intents where id='f6650000-0000-0000-0000-000000000001';")
for key in productOfferId productId platform provider externalProductId; do
  [[ "$stored_snapshot" == *"\"$key\""* ]] || fail "stored offer snapshot omitted $key: $stored_snapshot"
done
for forbidden in currency display_price_minor price_cache_updated_at metadata_jsonb; do
  [[ "$stored_snapshot" != *"\"$forbidden\""* ]] || fail "offer snapshot included mutable/non-authoritative field $forbidden: $stored_snapshot"
done
pass "offer snapshot contains only immutable provider/store product mapping"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.commerce_receipts where subject_id='f6610000-0000-0000-0000-000000000001';")" == '0' ]] || fail "purchase intent creation created receipt provenance"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_grants where subject_id='f6610000-0000-0000-0000-000000000001';")" == '0' ]] || fail "purchase intent creation created entitlement grant"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlements where subject_id='f6610000-0000-0000-0000-000000000001';")" == '0' ]] || fail "purchase intent creation opened entitlement authority"
pass "purchase intent creation has no receipt or entitlement side effects"

replay=$("${psql_base[@]}" -At -F '|' -c "select purchase_intent_id,status,replayed from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000099','f6630000-0000-0000-0000-000000000001','f6640000-0000-0000-0000-000000000001','purchase-create-1','hmac-sha256:k2:purchase-request-1','${snapshot_web}'::jsonb,'sha256:v1:purchase-offer-snapshot-1');")
[[ "$replay" == 'f6650000-0000-0000-0000-000000000001|created|t' ]] || fail "same-request replay mismatch: $replay"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.purchase_intents where subject_id='f6610000-0000-0000-0000-000000000001' and idempotency_key='purchase-create-1';")" == '1' ]] || fail "same-request replay duplicated purchase intent"
pass "same idempotency key and canonical request replays the existing logical intent"

expect_fail "same purchase idempotency key with different request conflicts" "different canonical request hash" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000098','f6630000-0000-0000-0000-000000000001','f6640000-0000-0000-0000-000000000001','purchase-create-1','hmac-sha256:k2:different-request','${snapshot_web}'::jsonb,'sha256:v1:purchase-offer-snapshot-1');"
expect_fail "same request hash cannot replay a different pinned offer" "replay arguments do not match" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000097','f6630000-0000-0000-0000-000000000002',null,'purchase-create-1','hmac-sha256:k2:purchase-request-1','${snapshot_ios}'::jsonb,'sha256:v1:purchase-offer-snapshot-2');"

expect_fail "guest purchase intent is denied" "active member subject" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000003','f6650000-0000-0000-0000-000000000003','f6630000-0000-0000-0000-000000000001',null,'guest-purchase','hmac-sha256:k2:guest-purchase','${snapshot_web}'::jsonb,'sha256:v1:guest-snapshot');"
expect_fail "deletion-pending member purchase intent is denied" "active member subject" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000004','f6650000-0000-0000-0000-000000000004','f6630000-0000-0000-0000-000000000001',null,'pending-delete-purchase','hmac-sha256:k2:pending-delete','${snapshot_web}'::jsonb,'sha256:v1:pending-delete-snapshot');"
expect_fail "offer snapshot mismatch is denied" "offer snapshot must exactly match" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000005','f6630000-0000-0000-0000-000000000001',null,'bad-snapshot','hmac-sha256:k2:bad-snapshot','{}'::jsonb,'sha256:v1:bad-snapshot');"
expect_fail "disabled product purchase intent is denied" "enabled and non-retired" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000006','f6630000-0000-0000-0000-000000000003',null,'disabled-product','hmac-sha256:k2:disabled-product','${snapshot_disabled_product}'::jsonb,'sha256:v1:disabled-product');"
expect_fail "retired product purchase intent is denied" "enabled and non-retired" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000007','f6630000-0000-0000-0000-000000000004',null,'retired-product','hmac-sha256:k2:retired-product','${snapshot_retired_product}'::jsonb,'sha256:v1:retired-product');"
expect_fail "disabled offer purchase intent is denied" "enabled and non-retired" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000008','f6630000-0000-0000-0000-000000000005',null,'disabled-offer','hmac-sha256:k2:disabled-offer','${snapshot_disabled_offer}'::jsonb,'sha256:v1:disabled-offer');"
expect_fail "cross-owner provider account link is denied" "owner-matched" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000009','f6630000-0000-0000-0000-000000000001','f6640000-0000-0000-0000-000000000003','cross-owner-link','hmac-sha256:k2:cross-owner-link','${snapshot_web}'::jsonb,'sha256:v1:cross-owner-link');"
expect_fail "wrong-provider account link is denied" "match offer provider" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000010','f6630000-0000-0000-0000-000000000001','f6640000-0000-0000-0000-000000000002','wrong-provider-link','hmac-sha256:k2:wrong-provider-link','${snapshot_web}'::jsonb,'sha256:v1:wrong-provider-link');"
expect_fail "revoked provider account link is denied" "must be active" "select * from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000011','f6630000-0000-0000-0000-000000000001','f6640000-0000-0000-0000-000000000004','revoked-link','hmac-sha256:k2:revoked-link','${snapshot_web}'::jsonb,'sha256:v1:revoked-link');"

# Race two retries of the same logical request. One creates the row and the other must
# replay it; the caller-supplied row id of the loser must not produce a second intent.
cmd_a="select purchase_intent_id,replayed from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000020','f6630000-0000-0000-0000-000000000002','f6640000-0000-0000-0000-000000000002','purchase-race','hmac-sha256:k2:purchase-race','${snapshot_ios}'::jsonb,'sha256:v1:purchase-race');"
cmd_b="select purchase_intent_id,replayed from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000021','f6630000-0000-0000-0000-000000000002','f6640000-0000-0000-0000-000000000002','purchase-race','hmac-sha256:k2:purchase-race','${snapshot_ios}'::jsonb,'sha256:v1:purchase-race');"

"${psql_base[@]}" -At -F '|' -c "$cmd_a" > /tmp/myeongha-purchase-race-a.out 2>/tmp/myeongha-purchase-race-a.err &
pid_a=$!
"${psql_base[@]}" -At -F '|' -c "$cmd_b" > /tmp/myeongha-purchase-race-b.out 2>/tmp/myeongha-purchase-race-b.err &
pid_b=$!
wait "$pid_a" || { cat /tmp/myeongha-purchase-race-a.err >&2; fail "purchase race caller A failed"; }
wait "$pid_b" || { cat /tmp/myeongha-purchase-race-b.err >&2; fail "purchase race caller B failed"; }

race_count=$("${psql_base[@]}" -Atc "select count(*) from public.purchase_intents where subject_id='f6610000-0000-0000-0000-000000000001' and idempotency_key='purchase-race';")
[[ "$race_count" == '1' ]] || fail "concurrent same-request purchase created $race_count rows"
race_id=$("${psql_base[@]}" -Atc "select id from public.purchase_intents where subject_id='f6610000-0000-0000-0000-000000000001' and idempotency_key='purchase-race';")
for out_file in /tmp/myeongha-purchase-race-a.out /tmp/myeongha-purchase-race-b.out; do
  out=$(cat "$out_file")
  [[ "$out" == "$race_id|f" || "$out" == "$race_id|t" ]] || fail "purchase race returned unexpected result: $out"
done
pass "concurrent same-request retries converge on one Purchase Intent"

# A committed idempotent replay remains readable even if the catalog is disabled after
# creation; retry does not become a new purchase decision.
"${psql_base[@]}" -c "update public.product_offers set enabled=false where id='f6630000-0000-0000-0000-000000000001';" >/dev/null
replay_after_disable=$("${psql_base[@]}" -At -F '|' -c "select purchase_intent_id,replayed from public.cmd_create_purchase_intent_v1('f6610000-0000-0000-0000-000000000001','f6650000-0000-0000-0000-000000000096','f6630000-0000-0000-0000-000000000001','f6640000-0000-0000-0000-000000000001','purchase-create-1','hmac-sha256:k2:purchase-request-1','${snapshot_web}'::jsonb,'sha256:v1:purchase-offer-snapshot-1');")
[[ "$replay_after_disable" == 'f6650000-0000-0000-0000-000000000001|t' ]] || fail "committed replay changed after offer disable: $replay_after_disable"
pass "idempotent replay survives later offer disable without creating a new intent"

volatility=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.cmd_create_purchase_intent_v1(uuid,uuid,uuid,uuid,text,text,jsonb,text)'::regprocedure;")
[[ "$volatility" == 'v' ]] || fail "purchase intent command is not VOLATILE: $volatility"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_create_purchase_intent_v1(uuid,uuid,uuid,uuid,text,text,jsonb,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "purchase intent command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "purchase intent command remains API-mediated and public table catalog remains 59"

echo "Purchase Intent create persistence/concurrency tests passed"
