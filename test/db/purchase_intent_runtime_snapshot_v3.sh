#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

for role in public anon authenticated service_role; do
  shape=$("${psql_base[@]}" -Atc "select has_function_privilege('${role}','public.qry_purchase_intent_runtime_snapshot_v3(uuid)','EXECUTE');")
  [[ "$shape" == 'f' ]] || fail "$role unexpectedly gained Purchase Intent runtime snapshot EXECUTE"
done
[[ "$("${psql_base[@]}" -Atc "select has_function_privilege('myeongha_api_executor','public.qry_purchase_intent_runtime_snapshot_v3(uuid)','EXECUTE');")" == 't' ]] || fail "myeongha_api_executor lacks Purchase Intent runtime snapshot EXECUTE"
pass "Purchase Intent runtime snapshot resolver is executor-only"

"${psql_base[@]}" <<'SQL'
begin;
insert into public.products(id,product_key,product_type,enabled,created_at,retired_at) values
  ('b1100000-0000-0000-0000-000000000001','runtime-snapshot-v3','reading',true,'2026-09-17T00:00:00Z',null);
insert into public.product_capability_sets(id,product_id,definition_version,definition_hash,created_at,retired_at) values
  ('b1100000-0000-0000-0000-000000000002','b1100000-0000-0000-0000-000000000001','capability-v1','sha256:runtime-capability-v1','2026-09-17T00:00:00Z',null);
insert into public.product_capability_items(capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,validity_mode,duration_seconds) values
  ('b1100000-0000-0000-0000-000000000002','runtime-reading','reading.full','global',null,'unbounded',null);
insert into public.product_offers(id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at,capability_set_id) values
  ('b1100000-0000-0000-0000-000000000003','b1100000-0000-0000-0000-000000000001','web','testpay','runtime-snapshot-web','KRW',12900,true,'2026-09-17T00:00:00Z',null,'2026-09-17T00:00:00Z','b1100000-0000-0000-0000-000000000002');
commit;
SQL

shape=$("${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_api_executor; select product_offer_id,product_id,platform,provider,external_product_id,capability_set_id,capability_definition_version,capability_definition_hash from public.qry_purchase_intent_runtime_snapshot_v3('b1100000-0000-0000-0000-000000000003'); commit;")
[[ "$shape" == *'b1100000-0000-0000-0000-000000000003|b1100000-0000-0000-0000-000000000001|web|testpay|runtime-snapshot-web|b1100000-0000-0000-0000-000000000002|capability-v1|sha256:runtime-capability-v1'* ]] || { echo "$shape" >&2; fail "runtime snapshot shape mismatch"; }
pass "runtime snapshot resolves immutable Offer and pinned Capability mapping"

"${psql_base[@]}" -c "update public.product_offers set enabled=false, retired_at='2026-09-17T13:00:00Z' where id='b1100000-0000-0000-0000-000000000003'; update public.product_capability_sets set retired_at='2026-09-17T13:00:00Z' where id='b1100000-0000-0000-0000-000000000002';" >/dev/null
retired=$("${psql_base[@]}" -At -F '|' -c "begin; set local role myeongha_api_executor; select product_offer_id,capability_set_id,capability_definition_version from public.qry_purchase_intent_runtime_snapshot_v3('b1100000-0000-0000-0000-000000000003'); commit;")
[[ "$retired" == *'b1100000-0000-0000-0000-000000000003|b1100000-0000-0000-0000-000000000002|capability-v1'* ]] || { echo "$retired" >&2; fail "retired immutable mapping disappeared"; }
pass "resolver preserves retired mapping for idempotent replay; DB command remains availability authority"

missing=$("${psql_base[@]}" -Atc "begin; set local role myeongha_api_executor; select count(*) from public.qry_purchase_intent_runtime_snapshot_v3('b1100000-0000-0000-0000-000000000099'); commit;")
[[ "$missing" == *'0'* ]] || fail "unknown Offer did not resolve to zero rows"
pass "unknown Offer resolves fail-closed"
