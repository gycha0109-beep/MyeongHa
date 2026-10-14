#!/usr/bin/env bash
set -euo pipefail
# D3e7 disposable database only: no live alert destinations.
p() { psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3e7: $*" >&2; exit 1; }
fp='hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
enqueue_inbox() {
 p -c "select intake_result from public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
 'sandbox','d3e7-webhook-$1','d3e7-payment-$1','d3e7-tx-$1','d3e7-store',
 'd3e7-cancel-$1','Transaction.Cancelled','2026-10-14T00:00:00Z'::timestamptz,'$fp')"
}
claim_work() {
 p -c "select inbox_id::text||'|'||claim_token::text from public.internal_claim_official_reader_cancel_work_v1('$1',60)"
}
generate() {
 p -c "select enqueued_count::text||':'||effect_authorized::text
 from public.internal_private_cancel_enqueue_alerts_v1()"
}
claim_alert() {
 p -c "select alert_id::text||'|'||delivery_token::text||'|'||alert_kind||'|'||delivery_attempt
 from public.internal_private_cancel_claim_alert_v1('$1',60)"
}
finalize_alert() {
 p -c "select final_state||':'||effect_authorized::text
 from public.internal_private_cancel_finalize_alert_v1(
 '$1'::uuid,'$2','$3'::uuid,$4)"
}
[[ "$(generate)" == 0:false ]] || fail "empty private queue generated an alert"
[[ "$(enqueue_inbox held)" == queued ]] || fail "held alert inbox fixture"
c="$(claim_work d3e7_work_held)"
IFS='|' read -r work_id work_token <<< "$c"
[[ -n "$work_id" ]] || fail "no private work claimed"
[[ "$(p -c "select failure_state from public.internal_fail_official_reader_cancel_work_v1(
 '$work_id'::uuid,'d3e7_work_held','$work_token'::uuid,'SOURCE_MISMATCH',false)")" == held ]] ||
 fail "inbox mismatch did not HOLD"
[[ "$(generate)" == 1:false ]] || fail "expected one HELD alert"
[[ "$(generate)" == 0:false ]] || fail "15-minute dedupe failed"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ops_alert_outbox_v1")" == 1 ]] ||
 fail "unexpected duplicate aggregate alert"
first="$(claim_alert d3e7_alert_one)"
IFS='|' read -r alert_id alert_token alert_kind alert_attempt <<< "$first"
[[ "$alert_kind" == HELD_REVIEW_REQUIRED && "$alert_attempt" == 1 ]] ||
 fail "wrong alert code or attempt"
[[ -z "$(claim_alert d3e7_alert_two)" ]] || fail "live alert lease stolen"
if finalize_alert "$alert_id" d3e7_alert_one 00000000-0000-4000-8000-000000000000 true >/dev/null 2>&1; then
 fail "invalid alert fencing token accepted"
fi
[[ "$(finalize_alert "$alert_id" d3e7_alert_one "$alert_token" true)" == delivered:false ]] ||
 fail "acknowledged alert not delivered"
[[ "$(generate)" == 0:false ]] || fail "delivered alert got a duplicate in same window"
if finalize_alert "$alert_id" d3e7_alert_one "$alert_token" false >/dev/null 2>&1; then
 fail "delivered alert accepted stale failure"
fi
echo "PASS D3e7: no-PPI alert dedupe, one live claim and fenced delivery ack"

# Dead-letter in 1920 drives a DIFFERENT aggregate code in 1940.
[[ "$(enqueue_inbox exhausted)" == queued ]] || fail "exhausted work fixture"
c="$(claim_work d3e7_work_exhausted)"
IFS='|' read -r exhausted_id exhausted_token <<< "$c"
[[ -n "$exhausted_id" ]] || fail "failed to claim exhausted fixture"
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 second'
 where id='$exhausted_id'::uuid" >/dev/null
[[ -z "$(claim_work d3e7_work_sweeper)" ]] || fail "eighth expired work reclaimed"
[[ "$(generate)" == 1:false ]] || fail "dead-letter alert was not queued"
second="$(claim_alert d3e7_alert_retry)"
IFS='|' read -r retry_id retry_token retry_kind retry_attempt <<< "$second"
[[ "$retry_kind" == DEAD_LETTER_REVIEW_REQUIRED && "$retry_attempt" == 1 ]] ||
 fail "dead-letter alert was not leased"
[[ "$(finalize_alert "$retry_id" d3e7_alert_retry "$retry_token" false)" == retry_wait:false ]] ||
 fail "failed alert should persist retry_wait"
[[ -z "$(claim_alert d3e7_alert_early)" ]] || fail "backoff was bypassed"

for attempt in 2 3 4 5; do
 p -c "update public.official_reader_portone_cancel_ops_alert_outbox_v1
 set next_attempt_at=clock_timestamp()-interval '1 second'
 where id='$retry_id'::uuid" >/dev/null
 next="$(claim_alert d3e7_alert_retry)"
 IFS='|' read -r id token kind current_attempt <<< "$next"
 [[ "$id" == "$retry_id" && "$current_attempt" == "$attempt" ]] ||
 fail "alert attempt/retry mismatch at $attempt"
 if finalize_alert "$retry_id" d3e7_alert_retry "$retry_token" true >/dev/null 2>&1; then
  fail "stale delivery token accepted after reclaim"
 fi
 state="$(finalize_alert "$id" d3e7_alert_retry "$token" false)"
 if [[ "$attempt" == 5 ]]; then
   [[ "$state" == dead_letter:false ]] || fail "fifth delivery failed to dead-letter"
 else
   [[ "$state" == retry_wait:false ]] || fail "early attempt $attempt must backoff"
 fi
 retry_token="$token"
done
[[ -z "$(claim_alert d3e7_alert_after_exhaustion)" ]] || fail "alert dead-letter was silently redelivered"
[[ "$(p -c "select attempt_count||':'||delivery_state from
 public.official_reader_portone_cancel_ops_alert_outbox_v1 where id='$retry_id'::uuid")" == 5:dead_letter ]] ||
 fail "alert dead-letter did not persist"
echo "PASS D3e7: durable delivery backoff, fenced retries and max-five dead letter"

for sig in \
 'public.internal_private_cancel_enqueue_alerts_v1()' \
 'public.internal_private_cancel_claim_alert_v1(text,integer)' \
 'public.internal_private_cancel_finalize_alert_v1(uuid,text,uuid,boolean)'
do
 [[ "$(p -c "select count(*) from pg_roles r where r.rolname in (
 'anon','authenticated','service_role','myeongha_api_executor',
 'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 and has_function_privilege(r.rolname,'$sig','EXECUTE')")" == 0 ]] ||
 fail "private alert RPC became accessible to a runtime role"
done
[[ "$(p -c "select count(*) from pg_roles r where r.rolname in (
 'anon','authenticated','service_role','myeongha_api_executor',
 'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 and has_table_privilege(r.rolname,
 'public.official_reader_portone_cancel_ops_alert_outbox_v1','SELECT')")" == 0 ]] ||
 fail "private alert table readable by runtime"
[[ "$(p -c "select count(*) from public.entitlement_events")" == 0 ]] ||
 fail "alert outbox modified entitlement events"
echo "PASS D3e7: private ACL and zero refund/entitlement effects"
