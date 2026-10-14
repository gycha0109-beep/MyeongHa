#!/usr/bin/env bash
set -euo pipefail
# D3e5 private, disposable DB only. No real PortOne traffic, refund or grants.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3e5: $*" >&2; exit 1; }
hmac='hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
fingerprint='sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
enqueue() {
 local n="$1"
 p -c "select intake_result from public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
 'sandbox','work-$n','pay-$n','tx-$n','store-1','cancel-$n','Transaction.Cancelled',
 '2026-10-14T00:00:00Z'::timestamptz,'$hmac')"
}
claim() {
 p -c "select inbox_id::text||'|'||claim_token::text||'|'||claim_attempt_count::text
 from public.internal_claim_official_reader_cancel_work_v1('$1',90)"
}
failure() {
 p -c "select failure_state||'|'||coalesce(to_char(retry_due_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'),'none')
 from public.internal_fail_official_reader_cancel_work_v1(
 '$1'::uuid,'$2','$3'::uuid,'$4',$5)"
}
[[ "$(enqueue a)" == queued ]] || fail "initial queue insert"
a="$(claim worker_A)"
IFS='|' read -r a_id a_token a_attempt <<< "$a"
[[ -n "$a_id" && "$a_attempt" == 1 ]] || fail "initial claim"
[[ -z "$(claim worker_B)" ]] || fail "active lease stolen"

# Force expiry ONLY in isolated DB. Reissue must invalidate old token.
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set lease_expires_at=clock_timestamp()-interval '1 second'
 where id='$a_id'::uuid" >/dev/null
b="$(claim worker_B)"
IFS='|' read -r b_id b_token b_attempt <<< "$b"
[[ "$b_id" == "$a_id" && "$b_attempt" == 2 && "$a_token" != "$b_token" ]] ||
 fail "expired lease did not reissue token"
if failure "$a_id" worker_A "$a_token" LOOKUP_TIMEOUT true >/dev/null 2>&1; then
 fail "stale worker mutated new lease"
fi
[[ "$(failure "$a_id" worker_B "$b_token" LOOKUP_TIMEOUT true)" == retry_wait\|* ]] ||
 fail "retry was not durably scheduled"
[[ -z "$(claim worker_C)" ]] || fail "retry occurred before due time"
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set next_attempt_at=clock_timestamp()-interval '1 second' where id='$a_id'::uuid" >/dev/null
c="$(claim worker_C)"
IFS='|' read -r c_id c_token c_attempt <<< "$c"
[[ "$c_id" == "$a_id" && "$c_attempt" == 3 ]] || fail "due retry"

# An observation and its completion MUST share one transaction.
record() {
cat <<SQL
select shadow_result||':'||effect_authorized::text
from public.internal_record_official_reader_portone_cancel_shadow_v1(
 'work-a','pay-a','tx-a','cancel-a','Transaction.Cancelled','full_candidate',
 '2026-10-14T00:00:00Z'::timestamptz,'2026-10-14T00:01:00Z'::timestamptz,
 8900,8900,'KRW','$fingerprint');
SQL
}
reverted="$(p <<SQL
begin isolation level read committed;
$(record)
select completion_state||':'||effect_authorized::text
from public.internal_complete_official_reader_cancel_work_v1('$a_id'::uuid,'worker_C','$c_token'::uuid);
rollback;
SQL
)"
[[ "$reverted" == *'completed:false'* ]] || fail "rollback fixture did not reach completion"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_observation_shadow_v1 where webhook_id='work-a'")" == 0 ]] ||
 fail "rolled-back shadow leaked"
[[ "$(p -c "select inbox_state from public.official_reader_portone_cancel_ingress_inbox_v1 where id='$a_id'")" == leased ]] ||
 fail "rolled-back completion leaked"
committed="$(p <<SQL
begin isolation level read committed;
$(record)
select completion_state||':'||effect_authorized::text
from public.internal_complete_official_reader_cancel_work_v1('$a_id'::uuid,'worker_C','$c_token'::uuid);
commit;
SQL
)"
[[ "$committed" == *'completed:false'* ]] || fail "completion missing"
[[ "$(p -c "select inbox_state from public.official_reader_portone_cancel_ingress_inbox_v1 where id='$a_id'")" == completed ]] ||
 fail "completion state missing"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_observation_shadow_v1 where webhook_id='work-a'")" == 1 ]] ||
 fail "one canonical observation required"
if failure "$a_id" worker_C "$c_token" LOOKUP_TIMEOUT true >/dev/null 2>&1; then
 fail "completed work accepted stale failure"
fi
echo "PASS D3e5: lease fencing, due retry, atomic rollback and complete"

# Competing workers must claim each available row at most once.
[[ "$(enqueue race)" == queued ]] || fail "race fixture"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
(claim race_A >"$tmp/a") & pid1=$!
(claim race_B >"$tmp/b") & pid2=$!
wait "$pid1" && wait "$pid2" || fail "competing SQL claims errored"
[[ "$(cat "$tmp/a" "$tmp/b" | grep -c . || true)" == 1 ]] ||
 fail "two claim owners for one row"
echo "PASS D3e5: two independent PostgreSQL claim sessions never double-own"

# Regression: lease can expire while a contender WAITS for a locked row.
# Complete/fail must compare clock_timestamp AFTER lock acquisition.
race_claim="$(cat "$tmp/a" "$tmp/b" | grep .)"
IFS='|' read -r race_id race_token race_attempt <<< "$race_claim"
if [[ -s "$tmp/a" ]]; then race_owner='race_A'; else race_owner='race_B'; fi
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set lease_expires_at=clock_timestamp()+interval '1 second'
 where id='$race_id'::uuid" >/dev/null
p >"$tmp/holder.out" 2>&1 <<SQL &
set application_name='d3e5_lease_lock_holder';
begin;
select id from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$race_id'::uuid for update;
select pg_sleep(3);
commit;
SQL
holder_pid=$!
locked=0
for attempt in $(seq 1 120); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
 where application_name='d3e5_lease_lock_holder' and wait_event_type='Timeout'")" == 1 ]]; then
   locked=1;break;
 fi
 sleep .04
done
[[ "$locked" == 1 ]] || fail "lease regression holder never acquired the row"
if failure "$race_id" "$race_owner" "$race_token" LOOKUP_TIMEOUT true >"$tmp/stale.out" 2>&1; then
  fail "an expired lease succeeded after waiting for row lock"
fi
wait "$holder_pid" || fail "lease regression lock holder failed"
grep -q 'Private cancellation failure requires a live fenced lease' "$tmp/stale.out" ||
 fail "post-lock expiry was not rejected by lease fence"
echo "PASS D3e5: lease expiry while waiting for row lock cannot finalize"
# Reclaim expired race row so the following HOLD fixture is the next queued item.
reissued_race="$(claim race_recovery)"
IFS='|' read -r race_new_id race_new_token race_new_attempt <<< "$reissued_race"
[[ "$race_new_id" == "$race_id" && "$race_new_attempt" == 2 && "$race_new_token" != "$race_token" ]] ||
 fail "expired race lease could not be safely reissued"

[[ "$(enqueue held)" == queued ]] || fail "hold fixture"
h="$(claim hold_worker)"
IFS='|' read -r h_id h_token h_attempt <<< "$h"
[[ "$(failure "$h_id" hold_worker "$h_token" SOURCE_MISMATCH false)" == 'held|none' ]] ||
 fail "permanent mismatch not held"
# Simulate exhausted attempt followed by crash/lease expiry: next claim sweeps.
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 second'
 where webhook_id='work-race'" >/dev/null
[[ -z "$(claim sweep_worker)" ]] || fail "eighth lease was reissued"
[[ "$(p -c "select inbox_state||':'||last_failure_code from public.official_reader_portone_cancel_ingress_inbox_v1 where webhook_id='work-race'")" == dead_letter:LEASE_EXHAUSTED ]] ||
 fail "exhausted work not dead-lettered"
echo "PASS D3e5: permanent hold and exhausted lease dead-letter"

for sig in \
 'public.internal_claim_official_reader_cancel_work_v1(text,integer)' \
 'public.internal_complete_official_reader_cancel_work_v1(uuid,text,uuid)' \
 'public.internal_fail_official_reader_cancel_work_v1(uuid,text,uuid,text,boolean)'
do
 [[ "$(p -c "select count(*) from pg_roles where rolname in (
 'anon','authenticated','service_role','myeongha_api_executor',
 'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 and has_function_privilege(rolname,'$sig','EXECUTE')")" == 0 ]] ||
 fail "production runtime acquired private worker EXECUTE"
done
[[ "$(p -c "select count(*) from public.entitlement_events")" == 0 ]] ||
 fail "unexpected entitlement mutation"
echo "PASS D3e5: ACL no-effect safety"
