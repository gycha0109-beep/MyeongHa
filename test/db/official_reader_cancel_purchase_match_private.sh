#!/usr/bin/env bash
set -euo pipefail
# PRIVATE test fixture. Do not connect public payment/cancellation runtime.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
die() { echo "FAIL purchase cancellation match: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
subject='11390000-0000-0000-0000-000000000001'
receipt='12192000-0000-0000-0000-000000000002'
intent='12192300-0000-0000-0000-000000000002'
event='18700001-0000-0000-0000-000000000001'
attempt='18700002-0000-0000-0000-000000000001'
fingerprint='sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

# Fixture Payment Attempt must be inserted while Purchase Intent is CREATED,
# before the fixture's second transition to VERIFIED. This is isolated test
# setup only and preserves Commerce attempt DB constraints/triggers.
awk '
  /^update public.purchase_intents$/ {
    seen++;
    if (seen==2) {
      print "insert into public.commerce_payment_attempts(";
      print " id,purchase_intent_id,subject_id,product_offer_id,attempt_no,provider,environment,";
      print " idempotency_key,provider_request_id,provider_transaction_id,status,created_at,updated_at";
      print ") select";
      print " '\''18700002-0000-0000-0000-000000000001'\''::uuid,";
      print " pi.id,pi.subject_id,pi.product_offer_id,1,'\''portone_v2'\'','\''production'\'',";
      print " '\''purchase-match-test'\'' ,'\''p-reader-b2'\'','\''tx-official-reader-b2'\'',";
      print " '\''response_received'\'',clock_timestamp(),clock_timestamp()";
      print " from public.purchase_intents pi";
      print " where pi.id='\''12192300-0000-0000-0000-000000000002'\''::uuid;";
    }
  }
  {print}
' test/db/official_standard_reading_reader_interpretation.sql |
  p >"$tmp/fixture.out" 2>"$tmp/fixture.err" || {
    tail -n 60 "$tmp/fixture.err" >&2
    tail -n 30 "$tmp/fixture.out" >&2
    die "verified purchase fixture with server-owned payment attempt failed"
  }
[[ "$(p -c "select count(*) from public.commerce_payment_attempts
 where id='$attempt' and status='response_received'
   and provider_request_id='p-reader-b2'
   and provider_transaction_id='tx-official-reader-b2'")" == 1 ]] ||
 die "authoritative Payment Attempt was not initialized"

# The standard fixture ends with B2/B3 revoked to test older terminal states.
# Isolated test-only reset lets us examine an already active single purchase.
grant="$(p -c "select g.id from public.entitlement_grants g
 where g.source_receipt_id='$receipt'::uuid and g.subject_id='$subject'::uuid
   and g.grant_source_type='purchase'")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || die "one B2 purchase Grant missing"
p -c "update public.entitlement_grants
 set status='active', revision=revision+1,
     last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
 where id='$grant'::uuid and status='revoked'" >"$tmp/reactivate.out"
[[ "$(p -c "select count(*) from public.entitlement_grants where
 id='$grant'::uuid and status='active'")" == 1 ]] || die "active synthetic Grant missing"

p <<SQL >"$tmp/evidence.out"
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
) values (
 '$event'::uuid,'portone_v2','wh-reader-b2','payment.cancelled',
 'tx-official-reader-b2','$subject'::uuid,'receipt','$receipt'::uuid,
 '$fingerprint','2026-10-13T03:00:00Z'::timestamptz,'verified-cancel-order-1',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','test-verifier'
);
select shadow_result from public.internal_record_official_reader_portone_cancel_shadow_v1(
 'wh-reader-b2','p-reader-b2','tx-official-reader-b2','cancel-final-b2',
 'Transaction.Cancelled','full_candidate',
 '2026-10-13T03:00:00Z'::timestamptz,'2026-10-13T03:00:01Z'::timestamptz,
 1,1,'KRW','$fingerprint'
);
SQL
grep -qx observed "$tmp/evidence.out" || die "independent cancellation observation missing"
observation="$(p -c "select id from public.official_reader_portone_cancel_observation_shadow_v1
 where webhook_id='wh-reader-b2'")"
[[ "$observation" =~ ^[0-9a-f-]{36}$ ]] || die "expected shadow UUID absent"
check() {
 p -c "select match_state||':'||effect_authorized::text
 from public.internal_qry_official_reader_cancel_purchase_match_v1(
 '$1'::uuid,'$2'::uuid,'$3'::uuid)"
}
[[ "$(check "$observation" "$event" "$grant")" == 'review_candidate:false' ]] ||
 die "exact paymentId->Attempt->Receipt/Event->one active Grant did not match"
[[ "$(p -c "select matched_receipt_id from
 public.internal_qry_official_reader_cancel_purchase_match_v1(
 '$observation'::uuid,'$event'::uuid,'$grant'::uuid)")" == "$receipt" ]] ||
 die "different Receipt returned"
echo "PASS purchase match: provider payment ID, attempt, full receipt, verified event, Offer and active Grant"
# Called only by the separate offline, never-production reviewed revoke fixture.
if [[ "${MHA_PURCHASE_MATCH_SEED_ONLY:-0}" == 1 ]]; then exit 0; fi

[[ "$(check "$observation" "$event" 'ffffffff-ffff-ffff-ffff-ffffffffffff')" == 'hold:false' ]] ||
 die "wrong Grant was accepted"
[[ "$(check "$observation" 'ffffffff-ffff-ffff-ffff-ffffffffffff' "$grant")" == 'hold:false' ]] ||
 die "unverified event accepted"
[[ "$(check 'ffffffff-ffff-ffff-ffff-ffffffffffff' "$event" "$grant")" == 'hold:false' ]] ||
 die "unknown observation accepted"
p -c "update public.official_reader_portone_cancel_observation_shadow_v1
 set payment_id='unrelated-payment' where id='$observation'::uuid" >/dev/null
[[ "$(check "$observation" "$event" "$grant")" == 'hold:false' ]] ||
 die "unrelated paymentId accepted"
p -c "update public.official_reader_portone_cancel_observation_shadow_v1
 set payment_id='p-reader-b2',paid_amount_minor=2,cancelled_amount_minor=2
 where id='$observation'::uuid" >/dev/null
[[ "$(check "$observation" "$event" "$grant")" == 'hold:false' ]] ||
 die "wrong payment amount accepted"
p -c "update public.official_reader_portone_cancel_observation_shadow_v1
 set paid_amount_minor=1,cancelled_amount_minor=1,currency='USD'
 where id='$observation'::uuid" >/dev/null
[[ "$(check "$observation" "$event" "$grant")" == 'hold:false' ]] ||
 die "wrong currency accepted"
p -c "update public.official_reader_portone_cancel_observation_shadow_v1
 set currency='KRW',source_disposition='superseded'
 where id='$observation'::uuid" >/dev/null
[[ "$(check "$observation" "$event" "$grant")" == 'hold:false' ]] ||
 die "superseded cancellation accepted"
p -c "update public.official_reader_portone_cancel_observation_shadow_v1
 set source_disposition='full_candidate',shadow_classification='out_of_order'
 where id='$observation'::uuid" >/dev/null
[[ "$(check "$observation" "$event" "$grant")" == 'hold:false' ]] ||
 die "out-of-order cancellation accepted"
p -c "update public.official_reader_portone_cancel_observation_shadow_v1
 set shadow_classification='observed' where id='$observation'::uuid" >/dev/null
[[ "$(check "$observation" "$event" "$grant")" == 'review_candidate:false' ]] ||
 die "restored complete observation lost"
echo "PASS purchase match: wrong payment, amount, currency, Grant, event, stale source all HOLD"

p -c "select shadow_result from public.internal_record_official_reader_portone_cancel_shadow_v1(
 'wh-reader-later','p-reader-b2','tx-official-reader-b2','cancel-later-b2',
 'Transaction.CancelPending','pending',
 '2026-10-13T03:01:00Z'::timestamptz,'2026-10-13T03:01:01Z'::timestamptz,
 1,1,'KRW','$fingerprint'
)" >"$tmp/later.out"
[[ "$(check "$observation" "$event" "$grant")" == 'hold:false' ]] ||
 die "newer provider observation failed to invalidate old review candidate"
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_provider_event_id='$event'::uuid")" == 0 ]] ||
 die "read-only purchase match created Entitlement Event"
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == 'active' ]] ||
 die "read-only purchase match revoked Grant"
sig='public.internal_qry_official_reader_cancel_purchase_match_v1(uuid,uuid,uuid)'
[[ "$(p -c "select count(*) from pg_catalog.pg_proc
 where oid='$sig'::regprocedure and not prosecdef and provolatile='s'")" == 1 ]] ||
 die "match function must be STABLE invoker"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_function_privilege(r.rolname,'$sig','EXECUTE')")" == 0 ]] ||
 die "runtime/Commerce may call private review"
echo "PASS purchase match: newest-event ambiguity HOLD, no Grant change, no public execute"
