#!/usr/bin/env bash
set -euo pipefail
# D3e4 SQL-side isolated synthetic proof, paired with TypeScript signed/HMAC/GET tests.
# No PortOne network, no refund, entitlement grant/revoke or new operational role.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3e4: $*" >&2; exit 1; }
fingerprint='hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
source_fingerprint='sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

record_sql() {
cat <<SQL
select shadow_result||':'||effect_authorized::text
from public.internal_record_official_reader_portone_cancel_shadow_v1(
 'synthetic-webhook-d3e4','synthetic-payment-d3e4','synthetic-tx-d3e4',
 'synthetic-cancellation-d3e4','Transaction.Cancelled','full_candidate',
 '2026-10-14T00:00:00Z'::timestamptz,
 '2026-10-14T00:01:00Z'::timestamptz,
 8900,8900,'KRW','$source_fingerprint');
SQL
}
enqueued="$(p <<SQL
select intake_result||':'||effect_authorized::text
from public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
 'sandbox','synthetic-webhook-d3e4','synthetic-payment-d3e4','synthetic-tx-d3e4',
 'synthetic-store-d3e4','synthetic-cancellation-d3e4','Transaction.Cancelled',
 '2026-10-14T00:00:00Z'::timestamptz,'$fingerprint');
SQL
)"
[[ "$enqueued" == 'queued:false' ]] || fail "private enqueue failed: $enqueued"
inbox_id="$(p -c "select id::text from public.official_reader_portone_cancel_ingress_inbox_v1
 where webhook_id='synthetic-webhook-d3e4'")"
[[ "$inbox_id" =~ ^[0-9a-f-]{36}$ ]] || fail "persisted inbox UUID missing"

# Synthetic GET success is represented by the verified-only 1860 call below.
# SQL proves its locking+recording shares ONE transaction, not that PG GET occurred.
rollback="$(p <<SQL
begin isolation level read committed;
select id::text from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$inbox_id'::uuid and inbox_state='queued' for update;
$(record_sql)
rollback;
SQL
)"
[[ "$rollback" == *'observed:false'* ]] || fail "shadow candidate not accepted in rolled-back transaction"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_observation_shadow_v1
 where webhook_id='synthetic-webhook-d3e4'")" == 0 ]] ||
 fail "rolled-back shadow write persisted"
echo "PASS D3e4: locked inbox and private observation roll back atomically"

committed="$(p <<SQL
begin isolation level read committed;
select id::text from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$inbox_id'::uuid and inbox_state='queued' for update;
$(record_sql)
commit;
SQL
)"
[[ "$committed" == *'observed:false'* ]] || fail "verified observation did not commit"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_observation_shadow_v1
 where webhook_id='synthetic-webhook-d3e4'")" == 1 ]] ||
 fail "committed shadow history missing"
replay="$(p <<SQL
begin isolation level read committed;
select id::text from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$inbox_id'::uuid and inbox_state='queued' for update;
$(record_sql)
commit;
SQL
)"
[[ "$replay" == *'replayed:false'* ]] || fail "shadow replay not idempotent"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_observation_shadow_v1
 where webhook_id='synthetic-webhook-d3e4'")" == 1 ]] ||
 fail "duplicate shadow appeared"
[[ "$(p -c "select inbox_state from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$inbox_id'::uuid")" == queued ]] || fail "unexpected queue state advancement"
[[ "$(p -c "select count(*) from public.entitlement_events")" == 0 ]] ||
 fail "entitlement mutated by no-effect candidate"
echo "PASS D3e4: durable inbox row lock + 1860 COMMIT/replay, queue unchanged, no rights effect"
