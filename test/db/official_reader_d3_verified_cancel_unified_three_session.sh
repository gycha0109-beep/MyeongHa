#!/usr/bin/env bash
set -euo pipefail
# D3 PRIVATE only. Reuses trusted exact S2 provider bridge race fixture, changing
# the invoked entrypoint, then adds first-Reading UNBOUND Grant revoke-before-bind.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3: $*" >&2; exit 1; }
pass() { echo "PASS D3: $*"; }
tmpdir="$(mktemp -d)"
holder_pid="" waiter_pid=""
cleanup() {
  for pid in "$holder_pid" "$waiter_pid"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

# Preserve old S2 test source and all assertions; swap only its dormant bridge
# to the new D3 verified-cancel bridge and the explicit rejection wording.
sed -e 's/internal_execute_official_reader_verified_provider_revoke_v1/internal_execute_official_reader_verified_cancel_v2/g' \
  -e 's/Provider revocation cannot override another Subject context/Provider callback may not override canonical Subject context/g' \
  test/db/official_reader_verified_provider_revoke_bridge_private.sh \
  >"$tmpdir/d3-bridge-race.sh"
bash "$tmpdir/d3-bridge-race.sh" >"$tmpdir/bridge.out" 2>"$tmpdir/bridge.err" || {
  tail -n 95 "$tmpdir/bridge.err" >&2
  tail -n 45 "$tmpdir/bridge.out" >&2
  fail "original two-session provider-first/Reader-first bridge race failed under D3"
}
pass "D3 bound Grant: real two-session Provider-first and Reader-first race, final revoked deny"

subject='11390000-0000-0000-0000-000000000001'
intent='d3030000-0000-0000-0000-000000000001'
receipt='d3031000-0000-0000-0000-000000000001'
event='d3032000-0000-0000-0000-000000000001'
original_intent='11392300-0000-0000-0000-000000000001'
original_receipt='12102000-0000-0000-0000-000000000001'
reading='12103100-0000-0000-0000-000000000001'
product="$(p -c "select product_id from public.standard_reading_official_bindings
 where subject_id='$subject'::uuid and reading_id='$reading'::uuid")"
[[ "$product" =~ ^[0-9a-f-]{36}$ ]] || fail "canonical initial Product missing"

# Clone a REAL verified first-Reading Purchase Intent and its immutable selected
# Reader but issue a NEW independent receipt Grant without ever binding it.
p >"$tmpdir/unbound-seed.out" 2>&1 <<SQL || {
  tail -n 80 "$tmpdir/unbound-seed.out" >&2
  fail "unbound synthetic initial Intent/Receipt seed failed"
}
insert into public.purchase_intents(
 id,subject_id,product_offer_id,provider_account_link_id,
 idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
 status,created_at,updated_at,expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
)
select '$intent'::uuid,subject_id,product_offer_id,provider_account_link_id,
 'd3-unbound-initial-purchase','sha256:test:d3-unbound-initial',
 offer_snapshot_jsonb,offer_snapshot_hash,'created',clock_timestamp(),
 clock_timestamp(),expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
from public.purchase_intents where id='$original_intent'::uuid;

insert into public.purchase_intent_reader_selections(
 purchase_intent_id,product_id,reader_character_id,
 reader_content_bundle_id,selection_contract_version,
 selection_snapshot_jsonb,selection_hash,created_at
)
select '$intent'::uuid,product_id,reader_character_id,
 reader_content_bundle_id,selection_contract_version,
 selection_snapshot_jsonb,'sha256:test:d3-unbound-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$original_intent'::uuid;
update public.purchase_intents set status='verified',updated_at=clock_timestamp()
where id='$intent'::uuid;

insert into public.commerce_receipts(
 id,subject_id,purchase_intent_id,product_offer_id,
 platform,provider,external_transaction_id,
 receipt_fingerprint,verification_status,verified_payload_jsonb,
 verified_at,created_at,environment,verifier_revision,
 verified_amount_minor,verified_currency
)
select '$receipt'::uuid,subject_id,'$intent'::uuid,product_offer_id,
 platform,provider,'tx-d3-unbound-initial',
 'hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
 verification_status,verified_payload_jsonb,
 clock_timestamp(),clock_timestamp(),environment,verifier_revision,
 verified_amount_minor,verified_currency
from public.commerce_receipts where id='$original_receipt'::uuid;
SQL

p <<SQL >"$tmpdir/issuance.out" 2>"$tmpdir/issuance.err" || {
  cat "$tmpdir/issuance.err" >&2
  fail "new verified initial Receipt issuance failed"
}
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select result_grant_id from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
grant_id="$(p -c "select id from public.entitlement_grants where source_receipt_id='$receipt'::uuid")"
[[ "$grant_id" =~ ^[0-9a-f-]{36}$ ]] || fail "unbound verified purchase Grant missing"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where entitlement_grant_id='$grant_id'::uuid")" == 0 ]] ||
 fail "expected genuinely unbound initial Grant"

# Event is synthetic in disposable CI DB; v2 private bridge MUST NOT trust
# unverified external payment payloads or a client-supplied current Subject.
p >"$tmpdir/event.out" 2>&1 <<SQL || fail "unbound cancellation event seed failed"
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '$event'::uuid,cr.provider,'synthetic-d3-unbound-cancel',
 'payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
 clock_timestamp(),'d3-unbound-provider-order',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','d3-synthetic-test-verifier'
from public.commerce_receipts cr
where cr.id='$receipt'::uuid;
SQL

fn="'public.internal_execute_official_reader_verified_cancel_v2(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)'"
role_count="$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_function_privilege(r.rolname,$fn,'EXECUTE')")"
[[ "$role_count" == 0 ]] || fail "dormant D3 bridge has runtime EXECUTE"

# Hold canonical initial Product L0 on connection A. Verified cancellation on
# connection B MUST WAIT, and can then revoke without any Reading L1 binding.
p >"$tmpdir/holder.out" 2>&1 <<SQL &
set application_name='d3_unbound_product_holder';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_scope_lock_v1(
 '$subject'::uuid,'$product'::uuid);
select pg_sleep(5);
commit;
SQL
holder_pid=$!
for _ in $(seq 1 90); do
 [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
 where application_name='d3_unbound_product_holder'
 and wait_event_type='Timeout'")" == 1 ]] && break
 sleep 0.06
done
[[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
 where application_name='d3_unbound_product_holder'
 and wait_event_type='Timeout'")" == 1 ]] ||
 fail "unbound Product holder never acquired L0"

p >"$tmpdir/cancel.out" 2>&1 <<SQL &
set application_name='d3_unbound_provider_waiter';
set statement_timeout='20s';
begin;
select result_grant_id from public.internal_execute_official_reader_verified_cancel_v2(
 '$event'::uuid,'$grant_id'::uuid,
 (select revision from public.entitlement_grants where id='$grant_id'::uuid),
 (select last_provider_ordering_key from public.entitlement_grants where id='$grant_id'::uuid),
 clock_timestamp(),
 (select valid_from from public.entitlement_grants where id='$grant_id'::uuid),
 (select valid_until from public.entitlement_grants where id='$grant_id'::uuid),
 'd3_unbound_initial_cancel');
select case when coalesce(current_setting('myeongha.subject_id',true),'')=''
 then 'D3_CONTEXT_RESTORED' else 'D3_CONTEXT_LEAK' end;
commit;
SQL
waiter_pid=$!
waited=0
for _ in $(seq 1 90); do
 if [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity a
 join pg_catalog.pg_locks l on l.pid=a.pid
 where a.application_name='d3_unbound_provider_waiter'
 and a.wait_event_type='Lock' and l.locktype='advisory'
 and not l.granted")" == 1 ]]; then waited=1; break; fi
 sleep 0.06
done
[[ "$waited" == 1 ]] || {
 cat "$tmpdir/holder.out" "$tmpdir/cancel.out" >&2
 fail "unbound cancellation did not wait on canonical Product L0"
}
wait "$holder_pid" || fail "Product holder failed";holder_pid=""
wait "$waiter_pid" || {
 cat "$tmpdir/cancel.out" >&2
 fail "unbound cancellation failed after lock wait"
}
waiter_pid=""
grep -qx D3_CONTEXT_RESTORED "$tmpdir/cancel.out" ||
 fail "trusted Provider subject leaked into transaction"
[[ "$(p -c "select status from public.entitlement_grants
 where id='$grant_id'::uuid")" == revoked ]] ||
 fail "unbound Grant did not reach revoked state"
[[ "$(p -c "select count(*) from public.entitlement_events
 where grant_id='$grant_id'::uuid and source_provider_event_id='$event'::uuid
 and event_type='revoked'")" == 1 ]] ||
 fail "unbound Provider cancellation ledger did not COMMIT exactly once"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where entitlement_grant_id='$grant_id'::uuid")" == 0 ]] ||
 fail "unbound Grant unexpectedly gained Reader access"
pass "first Reading unbound verified Grant: canonical L0 wait, revoke + ledger atomic COMMIT, zero Reader access"

# Refund-before-bind: historical v2 Binder cannot grant access from revoked
# initial entitlement. Failure MUST leave Official Reading and access state intact.
if p >"$tmpdir/bind-after-refund.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$intent'::uuid,
 'd3033000-0000-0000-0000-000000000001'::uuid,
 'd3034000-0000-0000-0000-000000000001'::uuid,
 'sha256:v1:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
 'standard-reading-access-bind-v2',
 pg_catalog.jsonb_build_object('schemaVersion','standard-reading-access-bind-v2',
 'purchaseIntentId','$intent'));
commit;
SQL
then
 fail "revoked unbound first Reading Grant created Official Reading"
fi
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail "refund-before-bind leaked Reader access"
pass "unbound refund-before-bind denies new official Reading and Reader access"
echo "PASS: D3 private bound/unbound verified cancellation bridge, no operational ingress or restore"
