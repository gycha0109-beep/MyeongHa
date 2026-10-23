#!/usr/bin/env bash
set -euo pipefail
# Actual migrated 2240/2250 S7 evidence + 1900/1910 PortOne cancellation.
# S4 protected body and S7 ACK here are synthetic fixture rows ONLY.
# No authorized S5 commit, checkout notice, consumer delivery or refund decision.
if [[ "$CI" != true || "$PGHOST" != localhost ||
      "$PGDATABASE" != myeongha_reader_s7_original_delivery_ledger_test ]]; then
  echo 'FAIL: isolated CI PostgreSQL is required' >&2
  exit 1
fi
p() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
p -f test/db/official_standard_reading_reader_interpretation.sql \
  >"$tmp/source.out" 2>"$tmp/source.err" ||
  { tail -70 "$tmp/source.err" >&2; fail "purchase-backed Reader source fixture"; }
p -f test/db/official_reader_s7_original_delivery_ledger_fixture.sql \
  >"$tmp/ledger.out" 2>"$tmp/ledger.err" ||
  { tail -70 "$tmp/ledger.err" >&2; fail "actual S4/S7 schema fixture"; }
subject='11390000-0000-0000-0000-000000000001'
intent='12192300-0000-0000-0000-000000000002'
receipt='12192000-0000-0000-0000-000000000002'
other_intent='12192300-0000-0000-0000-000000000003'
other_receipt='12192000-0000-0000-0000-000000000003'
body='f7080000-0000-4000-8000-000000000001'
grant="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and grant_source_type='purchase';")"
sibling="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$other_receipt'::uuid and grant_source_type='purchase';")"
[[ "$grant" =~ ^[a-f0-9-]{36}$ && "$sibling" =~ ^[a-f0-9-]{36}$ &&
 "$grant" != "$sibling" ]] || fail "independent Receipt Grants missing"
read_evidence() {
  p <<SQL
begin;
set local myeongha.subject_id='$subject';
select original_receipt_status || '|' || delivery_attempt_count::text ||
  '|' || acknowledged_attempt_count::text || '|' || product_spec_version
from public.internal_qry_official_reader_withdrawal_delivery_state_v2(
  '$subject'::uuid,'$1'::uuid,'$2'::uuid,'$body'::uuid
);
commit;
SQL
}
before="$(read_evidence "$intent" "$grant")"
[[ "$before" == 'verified|2|1|fixture-only-s7' ]] ||
 fail "real 2240/2250 pre-cancel proof incorrect: $before"
[[ -z "$(read_evidence "$other_intent" "$grant")" ]] ||
 fail "S7 substituted another Purchase Intent"
[[ -z "$(read_evidence "$intent" "$sibling")" ]] ||
 fail "S7 substituted another Grant"
echo 'PASS original verified Receipt/Grant and actual 2-prepared/1-ACK private S7 evidence'

# Exact verified PortOne original payment: revoke B2, NOT independently paid B3.
cancel="$(p -c "select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'synthetic-portone-reader-b2-payment','tx-official-reader-b2',
 's7-real-ledger-full-cancel',clock_timestamp(),
 cr.verified_amount_minor,cr.verified_currency,'production',
 'hmac-sha256:k1:abababababababababababababababababababababababababababababababab',
 's7-real-ledger-fixture-v1')->'revoke'->>'grantCount'
 from public.commerce_receipts cr where cr.id='$receipt'::uuid;")"
[[ "$cancel" == 1 ]] || fail "verified original PortOne cancel did not process one Grant: $cancel"
after="$(read_evidence "$intent" "$grant")"
[[ "$after" == 'revoked|2|1|fixture-only-s7' ]] ||
 fail "real S7 revoked-Receipt history lost/reclassified: $after"
[[ -z "$(read_evidence "$other_intent" "$grant")" ]] ||
 fail "post-refund S7 used sibling Purchase Intent"
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid;")" == revoked ]] ||
 fail "original Grant not revoked"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$receipt'::uuid;")" == revoked ]] ||
 fail "original Receipt not revoked"
[[ "$(p -c "select status from public.entitlement_grants where id='$sibling'::uuid;")" == active ]] ||
 fail "sibling Grant was revoked"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$other_receipt'::uuid;")" == verified ]] ||
 fail "sibling Receipt was revoked"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
 where ee.grant_id='$grant'::uuid and ee.event_type='revoked'
 and pe.event_type='Transaction.Cancelled'
 and pe.resolved_receipt_id='$receipt'::uuid;")" == 1 ]] ||
 fail "actual original provider Event lineage missing"
[[ "$(p -c "select count(*) from public.official_reader_paid_answer_bodies
 where id='$body'::uuid and originating_entitlement_grant_id='$grant'::uuid;")" == 1 ]] ||
 fail "historical protected answer was erased without S4 privacy ledger"
[[ "$(p -c "select count(*) from public.official_reader_paid_delivery_attempts_v1
 where body_id='$body'::uuid and client_acknowledged_at is not null;")" == 1 ]] ||
 fail "historical S7 ACK was lost"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles
 where rolname in ('anon','authenticated','service_role','myeongha_api_executor')
 and has_function_privilege(rolname,
 'public.internal_qry_official_reader_withdrawal_delivery_state_v2(uuid,uuid,uuid,uuid)',
 'EXECUTE');")" == 0 ]] ||
 fail "private S7 evidence leaked runtime EXECUTE"
# Duplicate provider delivery must be a genuine 1900/1910 replay of the
# ORIGINAL Cancellation event (not a new cancellation ID, Receipt or Grant).
# The source timestamp comes from persisted verified Provider evidence:
# changing it or the HMAC on replay is a conflict, not a new refund.
cancel_id='s7-real-ledger-full-cancel'
event_key="myeongha:portone-v2:full-cancel:v1:$cancel_id"
event_id="$(p -c "select id from public.commerce_provider_events
 where provider='portone_v2' and external_event_id='$event_key';")"
[[ "$event_id" =~ ^[0-9a-f-]{36}$ ]] ||
  fail "exact originating PortOne cancellation Event not recorded"
replay="$(p -c "select
 public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'synthetic-portone-reader-b2-payment','tx-official-reader-b2',
 '$cancel_id',pe.provider_occurred_at,
 cr.verified_amount_minor,cr.verified_currency,'production',
 'hmac-sha256:k1:abababababababababababababababababababababababababababababababab',
 's7-real-ledger-fixture-v1')->'revoke'->>'grantCount'
 from public.commerce_receipts cr
 join public.commerce_provider_events pe on pe.resolved_receipt_id=cr.id
 where cr.id='$receipt'::uuid and pe.id='$event_id'::uuid;")"
[[ "$replay" == 1 ]] ||
  fail "verified PortOne redelivery was not idempotent: $replay"
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where provider='portone_v2' and external_event_id='$event_key';")" == 1 ]] ||
  fail "duplicate original PortOne Provider Event recorded"
[[ "$(p -c "select count(*) from public.entitlement_events
 where grant_id='$grant'::uuid
 and source_provider_event_id='$event_id'::uuid and event_type='revoked';")" == 1 ]] ||
  fail "duplicate original Grant revocation Event recorded"
[[ "$(read_evidence "$intent" "$grant")" == "$after" ]] ||
  fail "duplicated cancellation rewrote the original S7 delivery timeline"

# A re-delivered Cancellation ID with a forged new verifier fingerprint
# MUST be rejected without changing the original Receipt/Grant/ACK history.
set +e
conflict="$(p -c "select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'synthetic-portone-reader-b2-payment','tx-official-reader-b2',
 '$cancel_id',pe.provider_occurred_at,
 cr.verified_amount_minor,cr.verified_currency,'production',
 'hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
 's7-real-ledger-fixture-v1')
 from public.commerce_receipts cr
 join public.commerce_provider_events pe on pe.resolved_receipt_id=cr.id
 where cr.id='$receipt'::uuid and pe.id='$event_id'::uuid;" 2>&1)"
conflict_status=$?
set -e
[[ "$conflict_status" -ne 0 && "$conflict" == *'PortOne full cancellation replay conflicts with persisted evidence'* ]] ||
  fail "conflicting PortOne evidence must fail closed: $conflict"
[[ "$(read_evidence "$intent" "$grant")" == "$after" ]] ||
  fail "rejected provider replay changed S7 original history"

# Client retransmits the ORIGINAL acknowledgement after the provider refund.
# Actual 2140 ACK function must return only the previously persisted receipt,
# never create a second ACK, reveal ciphertext, or prove legal delivery.
delivery_id='f7090000-0000-4000-8000-000000000002'
request_id='f70a0000-0000-4000-8000-000000000002'
thread_id='f7010000-0000-4000-8000-000000000001'
marker_id='f7050000-0000-4000-8000-000000000001'
# Use the actual retained, S7-validated digest instead of duplicating
# the fixture's SHA-256 literal: the first retry accidentally supplied 58 hex
# characters after the fixture was corrected to 64.
ack_hash="$(p -c "select acknowledgement_token_hash
 from public.official_reader_paid_delivery_attempts_v1
 where id='$delivery_id'::uuid and body_id='$body'::uuid
 and subject_id='$subject'::uuid and thread_id='$thread_id'::uuid
 and safe_message_id='$marker_id'::uuid and delivery_request_id='$request_id'::uuid;")"
[[ "$ack_hash" =~ ^sha256:v1:[a-f0-9]{64}$ ]] ||
  fail "original retained ACK digest missing or malformed"
ack_before="$(p -c "select client_acknowledged_at
 from public.official_reader_paid_delivery_attempts_v1
 where id='$delivery_id'::uuid and body_id='$body'::uuid;")"
ack_replay="$(p <<SQL
begin;
set local myeongha.subject_id='$subject';
select replayed::text
from public.internal_ack_official_reader_paid_delivery_v1(
 '$subject'::uuid,'$thread_id'::uuid,'$marker_id'::uuid,
 '$delivery_id'::uuid,'$request_id'::uuid,'$ack_hash');
commit;
SQL
)"
[[ "$ack_replay" == 'true' ]] ||
  fail "verified historical client ACK replay not returned as replayed"
[[ "$(p -c "select client_acknowledged_at
 from public.official_reader_paid_delivery_attempts_v1
 where id='$delivery_id'::uuid;")" == "$ack_before" ]] ||
  fail "client acknowledgement was rewritten on replay"
[[ "$(read_evidence "$intent" "$grant")" == "$after" ]] ||
  fail "client ACK replay changed retained historical delivery evidence"
echo 'PASS duplicate verified PortOne cancellation and client ACK are replay-safe; forged cancellation rejected'

echo 'PASS real S2 verified PortOne full cancel retains historical S7 ACK ledger and sibling right'
echo 'PASS S7 evidence remains private, not proof of statutory delivery or refund authorization'
