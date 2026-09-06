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
  ('b6100000-0000-4000-8000-000000000001'),
  ('b6100000-0000-4000-8000-000000000002'),
  ('b6100000-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('b6200000-0000-4000-8000-000000000001','guest',null,'active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('b6200000-0000-4000-8000-000000000002','guest',null,'active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('b6200000-0000-4000-8000-000000000003','guest',null,'active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('b6200000-0000-4000-8000-000000000010','member','b6100000-0000-4000-8000-000000000001','active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('b6200000-0000-4000-8000-000000000020','member','b6100000-0000-4000-8000-000000000002','active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('b6200000-0000-4000-8000-000000000030','member','b6100000-0000-4000-8000-000000000003','deletion_pending',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');

insert into public.products(id,product_key,product_type,enabled,created_at,retired_at) values
  ('b6300000-0000-4000-8000-000000000001','history-safe-offer','reading',true,'2026-09-01T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  'b6400000-0000-4000-8000-000000000001',
  'b6300000-0000-4000-8000-000000000001',
  'web','testpay','history-safe-web','KRW',4900,true,'2026-09-01T00:00:00Z',null,'2026-09-01T00:00:00Z'
);

-- Seed while Guest owners are still canonical/active. Two Guest rows are then
-- merged into different existing Members to prove read-time lineage continuity
-- without rewriting historical purchase_intents.subject_id.
insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,idempotency_key,request_hash,
  offer_snapshot_jsonb,offer_snapshot_hash,status,expected_amount_minor,expected_currency,
  charge_terms_version,created_at,updated_at
) values
  ('b6500000-0000-4000-8000-000000000001','b6200000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001',null,'guest-self-new','sha256:guest-self-new','{"safe":"guest-self-new"}'::jsonb,'sha256:snapshot:guest-self-new','pending',12900,'KRW','charge-v1','2026-09-01T05:00:00Z','2026-09-01T05:05:00Z'),
  ('b6500000-0000-4000-8000-000000000002','b6200000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001',null,'guest-self-legacy','sha256:guest-self-legacy','{"safe":"guest-self-legacy"}'::jsonb,'sha256:snapshot:guest-self-legacy','created',null,null,null,'2026-09-01T04:00:00Z','2026-09-01T04:00:00Z'),
  ('b6500000-0000-4000-8000-000000000010','b6200000-0000-4000-8000-000000000010','b6400000-0000-4000-8000-000000000001',null,'member-self','sha256:member-self','{"secretSentinel":"INTERNAL_MEMBER_SNAPSHOT"}'::jsonb,'sha256:snapshot:member-self','created',15900,'KRW','charge-v2','2026-09-01T03:00:00Z','2026-09-01T03:00:00Z'),
  ('b6500000-0000-4000-8000-000000000020','b6200000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000001',null,'merged-guest-member-one','sha256:merged-guest-member-one','{"secretSentinel":"INTERNAL_MERGED_GUEST_SNAPSHOT"}'::jsonb,'sha256:snapshot:merged-one','failed',12900,'KRW','charge-v1','2026-09-01T02:00:00Z','2026-09-01T02:10:00Z'),
  ('b6500000-0000-4000-8000-000000000030','b6200000-0000-4000-8000-000000000003','b6400000-0000-4000-8000-000000000001',null,'merged-guest-member-two','sha256:merged-guest-member-two','{"secretSentinel":"FOREIGN_PROVIDER_DATA"}'::jsonb,'sha256:snapshot:merged-two','cancelled',9900,'KRW','charge-v0','2026-09-01T01:00:00Z','2026-09-01T01:10:00Z');

update public.subjects
set status='merged', merged_into_subject_id='b6200000-0000-4000-8000-000000000010', updated_at='2026-09-01T06:00:00Z'
where id='b6200000-0000-4000-8000-000000000002';

update public.subjects
set status='merged', merged_into_subject_id='b6200000-0000-4000-8000-000000000020', updated_at='2026-09-01T06:00:00Z'
where id='b6200000-0000-4000-8000-000000000003';
SQL

guest_rows=$("${psql_base[@]}" -At -F '|' -c "select purchase_intent_id,status,coalesce(expected_amount_minor::text,'NULL'),coalesce(expected_currency,'NULL') from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000001');")
expected_guest=$'b6500000-0000-4000-8000-000000000001|pending|12900|KRW\nb6500000-0000-4000-8000-000000000002|created|NULL|NULL'
[[ "$guest_rows" == "$expected_guest" ]] || { printf '%s\n' "$guest_rows" >&2; fail "active Guest purchase history mismatch"; }
pass "active canonical Guest reads only its own purchase-intent state history"

member_rows=$("${psql_base[@]}" -At -F '|' -c "select purchase_intent_id,status,expected_amount_minor,expected_currency from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000010');")
expected_member=$'b6500000-0000-4000-8000-000000000010|created|15900|KRW\nb6500000-0000-4000-8000-000000000020|failed|12900|KRW'
[[ "$member_rows" == "$expected_member" ]] || { printf '%s\n' "$member_rows" >&2; fail "active Member purchase history union mismatch"; }
pass "active canonical Member reads self plus direct merged Guest purchase history"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000010') where purchase_intent_id='b6500000-0000-4000-8000-000000000030';")" == '0' ]] || fail "foreign merged Guest Purchase Intent leaked across Member lineage"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000001') where purchase_intent_id in ('b6500000-0000-4000-8000-000000000010','b6500000-0000-4000-8000-000000000020','b6500000-0000-4000-8000-000000000030');")" == '0' ]] || fail "Guest history leaked foreign Member or merged-Guest rows"
pass "purchase history lineage is owner-isolated and direct-only"

legacy=$("${psql_base[@]}" -At -F '|' -c "select coalesce(expected_amount_minor::text,'NULL'),coalesce(expected_currency,'NULL') from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000001') where purchase_intent_id='b6500000-0000-4000-8000-000000000002';")
[[ "$legacy" == 'NULL|NULL' ]] || fail "legacy Purchase Intent monetary NULLs were reinterpreted: $legacy"
pass "legacy Purchase Intent monetary NULLs remain NULL; historical price is never fabricated"

shape=$("${psql_base[@]}" -At -F '|' -c "select p.provolatile,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.oid='public.qry_purchase_intent_history_v2(uuid)'::regprocedure;")
expected_shape='s|f|search_path=public, pg_temp|TABLE(purchase_intent_id uuid, product_offer_id uuid, status text, expected_amount_minor bigint, expected_currency text, created_at timestamp with time zone, updated_at timestamp with time zone)'
[[ "$shape" == "$expected_shape" ]] || { printf '%s\n' "$shape" >&2; fail "purchase history v2 function shape/security mismatch"; }
pass "purchase history projection exposes only the explicit minimal safe column allowlist"

# The exact return shape above is the privacy boundary: no subject id, provider
# account link, idempotency key, request hash, offer snapshot/hash, charge-term
# version, Receipt/Event provenance, provider transaction id, or verified payload.
for forbidden in provider_account_link_id idempotency_key request_hash offer_snapshot_jsonb offer_snapshot_hash charge_terms_version subject_id verified_payload_jsonb external_transaction_id receipt_fingerprint; do
  [[ "$shape" != *"$forbidden"* ]] || fail "sensitive/internal field leaked into purchase history result: $forbidden"
done
pass "internal/provider/idempotency/evidence fields are absent from the read contract"

before_count=$("${psql_base[@]}" -Atc "select count(*) from public.purchase_intents;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000010');" >/dev/null
after_count=$("${psql_base[@]}" -Atc "select count(*) from public.purchase_intents;")
[[ "$before_count" == "$after_count" ]] || fail "purchase history query mutated Purchase Intent authority"
[[ "$("${psql_base[@]}" -Atc "select subject_id from public.purchase_intents where id='b6500000-0000-4000-8000-000000000020';")" == 'b6200000-0000-4000-8000-000000000002' ]] || fail "read-time lineage rewrote historical Purchase Intent owner"
pass "history query is projection-only and preserves historical owner rows"

expect_fail "deletion-pending Member history read is denied" "active canonical Guest or Member subject" "select * from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000030');"
expect_fail "merged Guest cannot query as canonical history subject" "active canonical Guest or Member subject" "select * from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000002');"
expect_fail "unknown subject history read is denied" "active canonical Guest or Member subject" "select * from public.qry_purchase_intent_history_v2('b6200000-0000-4000-8000-000000000099');"
expect_fail "history subject identity is required" "purchase intent history subject identity is required" "select * from public.qry_purchase_intent_history_v2(null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_purchase_intent_history_v2(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "purchase history v2 unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "purchase history v2 is STABLE, SECURITY INVOKER, PUBLIC EXECUTE revoked, and table catalog remains 60"

echo "Privacy-safe Guest-aware Purchase Intent history v2 query tests passed"
