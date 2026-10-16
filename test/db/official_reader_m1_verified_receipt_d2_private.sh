#!/usr/bin/env bash
set -euo pipefail
# Run after the existing official_standard_reading_reader_interpretation.sql fixture.
# This verifies real 1050 evidence -> private 1820 issuance/bind, not runtime cutover.
p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-02: $*" >&2; exit 1; }
pass() { echo "PASS M1-02: $*"; }

subject='11390000-0000-0000-0000-000000000001'
source_intent='12192300-0000-0000-0000-000000000002'
intent='d2031000-0000-0000-0000-000000000001'
attempt='d2032000-0000-0000-0000-000000000001'
session='d2033000-0000-0000-0000-000000000001'
proposal='d2034000-0000-0000-0000-000000000001'
official='12103100-0000-0000-0000-000000000001'
fingerprint="hmac-sha256:k1:$(printf 'e%.0s' {1..64})"
verified_at='2026-10-16T00:00:00.000Z'
tx='m1-02-private-provider-verified-transaction'

# Reuse an existing fixture Product, Capability and Reader selection. This
# independent Purchase Intent uses the canonical five-key 1050 offer snapshot.
p <<SQL >/dev/null
insert into public.purchase_intents(
 id,subject_id,product_offer_id,provider_account_link_id,
 idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
 status,created_at,updated_at,expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
)
select '$intent'::uuid,pi.subject_id,pi.product_offer_id,pi.provider_account_link_id,
 'm1-02-independent-additional-intent','sha256:test:m1-02-request',
 pg_catalog.jsonb_build_object(
  'productOfferId',po.id::text,'productId',po.product_id::text,
  'platform',po.platform,'provider',po.provider,
  'externalProductId',po.external_product_id
 ),'sha256:test:m1-02-offer','created',clock_timestamp(),clock_timestamp(),
 pi.expected_amount_minor,pi.expected_currency,pi.charge_terms_version,
 pi.capability_set_id,pi.capability_snapshot_jsonb,pi.capability_snapshot_hash
from public.purchase_intents pi join public.product_offers po on po.id=pi.product_offer_id
where pi.id='$source_intent'::uuid;
insert into public.purchase_intent_reader_selections(
 purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
 selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$intent'::uuid,product_id,reader_character_id,reader_content_bundle_id,
 selection_contract_version,selection_snapshot_jsonb,
 'sha256:test:m1-02-reader-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$source_intent'::uuid;
SQL

[[ "$(p -c "select count(*) from public.purchase_intents
 where id='$intent'::uuid and status='created' and subject_id='$subject'::uuid")" == 1 ]] ||
 fail "fresh additional Purchase Intent missing"
p <<SQL >/dev/null
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select payment_attempt_id from public.cmd_create_payment_attempt_v1(
 '$subject'::uuid,'$attempt'::uuid,'$intent'::uuid,
 'production','m1-02-attempt','m1-02-private-merchant-request');
select payment_attempt_id from public.cmd_transition_payment_attempt_v1(
 '$subject'::uuid,'$attempt'::uuid,'handed_off',null,null);
commit;
SQL
expected="$(p -c "select pi.expected_amount_minor || '|' || pi.expected_currency ||
 '|' || po.external_product_id from public.purchase_intents pi
 join public.product_offers po on po.id=pi.product_offer_id
 where pi.id='$intent'::uuid")"
IFS='|' read -r amount currency external_product <<<"$expected"
[[ "$amount" == 1 && "$currency" == 'KRW' && -n "$external_product" ]] ||
 fail "pinned expected charge/Product fixture missing"

persist() {
 p -c "begin; set local role myeongha_commerce_internal_executor;
 select receipt_id,provider_event_id,replayed
 from public.cmd_persist_verified_payment_evidence_v1(
 '$attempt'::uuid,'$intent'::uuid,'portone_v2','web','production',
 '$tx',null,null,'$external_product','active','$fingerprint',
 'm1-02-synthetic-verifier',$amount,'$currency','$verified_at',
 null,null,null); commit;"
}

first="$(persist)"
IFS='|' read -r receipt event replay <<<"$first"
[[ -n "$receipt" && -n "$event" && "$replay" == f ]] ||
 fail "1050 persistence failed: $first"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail "1050 unexpectedly minted a Grant"
pass "real 1050 role-scoped Receipt/Event persistence, zero Grant"

for signature in \
 'public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])' \
 'public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb)'; do
 [[ "$(p -c "select has_function_privilege(
 'myeongha_commerce_internal_executor','$signature','EXECUTE')")" == f ]] ||
 fail "runtime executor unexpectedly has D2 EXECUTE"
done
pass "runtime Commerce executor remains denied both private D2 functions"

# M1-03: The existing verified Receipt MUST survive a downstream bind
# error while ALL issuance writes from the same transaction are rolled back.
# Use the isolated DB fixture owner, NOT an API or Commerce runtime account.
tmp_error="$(mktemp)"
trap 'rm -f "$tmp_error"' EXIT
if p <<SQL > /dev/null 2>"$tmp_error"; then
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select result_grant_id
from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]);
-- Deliberately invalid *bind* request hash; after successful issue above.
select reading_id from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$intent'::uuid,'$session'::uuid,'$proposal'::uuid,
 'not-a-request-hash','standard-reading-access-bind-v2',
 pg_catalog.jsonb_build_object('schemaVersion','standard-reading-access-bind-v2',
 'purchaseIntentId','$intent'));
commit;
SQL
 fail "invalid Reader bind unexpectedly committed after D2 issuance"
fi
grep -q 'cmd_standard_reading_access_v2_request_hash\|request hash is invalid' "$tmp_error" ||
 { cat "$tmp_error" >&2; fail "D2 failure was not the intended downstream bind error"; }

[[ "$(p -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and verification_status='verified'")" == 1 ]] ||
 fail "downstream failure lost already-committed canonical Receipt"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail "failed bind left a phantom purchased Grant"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail "failed bind left immutable Reader access"
pass "failed bind rolls back same-transaction issuance; verified Receipt remains"

# Retrying from the same persisted Receipt now issues AND binds in a single
# READ COMMITTED transaction. No new provider lookup or Evidence insert.
atomic="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select 'ISSUE',result_grant_id,result_replayed
from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]);
select 'BIND',reading_id,entitlement_grant_id,access_role,official_reading_created
from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$intent'::uuid,'$session'::uuid,'$proposal'::uuid,
 'sha256:v1:$(printf '7%.0s' {1..64})',
 'standard-reading-access-bind-v2',
 pg_catalog.jsonb_build_object('schemaVersion','standard-reading-access-bind-v2',
 'purchaseIntentId','$intent'));
commit;
SQL
)"
issue_line="$(printf '%s\n' "$atomic" | grep '^ISSUE|')"
bind_line="$(printf '%s\n' "$atomic" | grep '^BIND|')"
IFS='|' read -r issue_marker grant issue_replay <<<"$issue_line"
IFS='|' read -r bind_marker bound_reading bound_grant role created <<<"$bind_line"
[[ "$issue_marker" == ISSUE && "$bind_marker" == BIND &&
 -n "$grant" && "$issue_replay" == f &&
 "$bound_reading" == "$official" && "$bound_grant" == "$grant" &&
 "$role" == additional_reader && "$created" == f ]] ||
 fail "atomic D2 issuance/bind mismatch: $atomic"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id='$grant'::uuid and source_receipt_id='$receipt'::uuid
 and subject_id='$subject'::uuid and status='active'")" == 1 ]] ||
 fail "atomic Grant does not match exact 1050 Receipt"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid and entitlement_grant_id='$grant'::uuid
 and official_reading_id='$official'::uuid")" == 1 ]] ||
 fail "atomic bind did not persist exact purchase-backed Reader access"
pass "verified Receipt retry atomically issues Grant and binds existing Official Reading"

second="$(persist)"
IFS='|' read -r receipt2 event2 replay2 <<<"$second"
[[ "$receipt2" == "$receipt" && "$event2" == "$event" && "$replay2" == t ]] ||
 fail "1050 replay failed to return identical Receipt/Event"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 1 ]] ||
 fail "replay created a duplicate Grant"
pass "verified evidence replay converges without duplicate Grant"
echo "PASS M1-02: isolated PG receipt-to-D2 only; runtime authorization/T2 remain HOLD"
