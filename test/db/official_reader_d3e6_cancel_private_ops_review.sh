#!/usr/bin/env bash
set -euo pipefail
# D3e6 disposable DB only. No production operators, webhook payloads or rights.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3e6: $*" >&2; exit 1; }
fingerprint='hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
enqueue() {
  p -c "select intake_result from public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
  'sandbox','d3e6-webhook-$1','d3e6-payment-$1','d3e6-tx-$1',
  'd3e6-store','d3e6-cancel-$1','Transaction.Cancelled',
  '2026-10-14T00:00:00Z'::timestamptz,'$fingerprint')"
}
claim() {
  p -c "select inbox_id::text||'|'||claim_token::text||'|'||claim_attempt_count::text
 from public.internal_claim_official_reader_cancel_work_v1('$1',90)"
}
review() {
  p -c "select review_state||':'||effect_authorized::text
 from public.internal_private_cancel_review_v1('$1'::uuid,'$2','$3')"
}
[[ "$(enqueue hold)" == queued ]] || fail "HOLD fixture enqueue"
h="$(claim d3e6_hold_worker)"
IFS='|' read -r h_id h_token h_count <<< "$h"
[[ "$h_count" == 1 ]] || fail "HOLD fixture claim"
[[ "$(p -c "select failure_state from public.internal_fail_official_reader_cancel_work_v1(
 '$h_id'::uuid,'d3e6_hold_worker','$h_token'::uuid,'SOURCE_MISMATCH',false)")" == held ]] ||
 fail "SOURCE_MISMATCH must hold"
[[ "$(review "$h_id" acknowledge OPS-1001)" == held:false ]] ||
 fail "review acknowledgment did not preserve held state"
if review "$h_id" retry_transient OPS-1002 >/dev/null 2>&1; then
 fail "source mismatch HOLD incorrectly requeued"
fi
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$h_id'::uuid")" == 1 ]] || fail "only accepted review must be audited"

[[ "$(enqueue transient)" == queued ]] || fail "transient fixture enqueue"
d="$(claim d3e6_dead_worker)"
IFS='|' read -r d_id d_token d_count <<< "$d"
[[ "$d_count" == 1 ]] || fail "transient fixture claim"
# Simulate eighth attempt expiration on this disposable database only.
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 second'
 where id='$d_id'::uuid" >/dev/null
[[ -z "$(claim d3e6_sweeper)" ]] || fail "expired last lease was claimed"
[[ "$(p -c "select inbox_state||':'||last_failure_code from
 public.official_reader_portone_cancel_ingress_inbox_v1 where id='$d_id'::uuid")" == dead_letter:LEASE_EXHAUSTED ]] ||
 fail "dead letter source state missing"

# D3e11 security fence: LEASE_EXHAUSTED gives NO evidence of a transient
# provider lookup failure. Old D3e6 accepted this ambiguous case. Never
# requeue it, even under the privileged owner fixture.
if review "$d_id" retry_transient OPS-2001 >/dev/null 2>&1; then
 fail "ambiguous LEASE_EXHAUSTED dead-letter incorrectly requeued"
fi
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$d_id'::uuid")" == 0 ]] ||
 fail "rejected lease-exhaustion retry wrote an operator audit"
[[ "$(p -c "select inbox_state||':'||last_failure_code from
 public.official_reader_portone_cancel_ingress_inbox_v1 where id='$d_id'::uuid")" == dead_letter:LEASE_EXHAUSTED ]] ||
 fail "rejected ambiguous retry modified the original terminal state"

# Positive control: the EIGHTH claimed attempt explicitly records a
# retryable LOOKUP_TIMEOUT while the lease remains live. Only this
# independently classified dead-letter can receive one manual retry.
[[ "$(enqueue proven_timeout)" == queued ]] || fail "proven timeout fixture enqueue"
t="$(claim d3e6_timeout_worker)"
IFS='|' read -r t_id t_token t_count <<< "$t"
[[ "$t_count" == 1 && -n "$t_token" ]] || fail "timeout fixture lease missing"
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set attempt_count=8 where id='$t_id'::uuid" >/dev/null
[[ "$(p -c "select failure_state from public.internal_fail_official_reader_cancel_work_v1(
 '$t_id'::uuid,'d3e6_timeout_worker','$t_token'::uuid,'LOOKUP_TIMEOUT',true)")" == dead_letter ]] ||
 fail "explicit eighth LOOKUP_TIMEOUT did not become dead_letter"
[[ "$(p -c "select inbox_state||':'||last_failure_code from
 public.official_reader_portone_cancel_ingress_inbox_v1 where id='$t_id'::uuid")" == dead_letter:LOOKUP_TIMEOUT ]] ||
 fail "explicit transient proof not persisted"
d_id="$t_id"

health="$(p -c "select held::text||'|'||dead_letter::text||'|'||effect_authorized::text
 from public.internal_private_cancel_queue_health_v1()")"
[[ "$health" == 1\|2\|false ]] || fail "private aggregated health wrong: $health"
if p -c "select * from public.internal_private_cancel_review_v1(
 '$d_id'::uuid,'retry_transient','UNSAFE FULL CUSTOMER NOTE')" >/dev/null 2>&1; then
 fail "unbounded operator note stored"
fi
[[ "$(review "$d_id" retry_transient OPS-2002)" == queued:false ]] ||
 fail "explicit LOOKUP_TIMEOUT one-time requeue rejected"
[[ "$(p -c "select inbox_state||':'||attempt_count||':'||coalesce(last_failure_code,'none')
 from public.official_reader_portone_cancel_ingress_inbox_v1 where id='$d_id'::uuid")" == queued:0:none ]] ||
 fail "review did not reset transient attempt budget"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$d_id'::uuid and action='retry_transient'")" == 1 ]] ||
 fail "transient requeue not permanently audited"
# Exhaust the one-time recovered record again, then forbid a second requeue.
d2="$(claim d3e6_retry_worker)"
IFS='|' read -r d2_id d2_token d2_count <<< "$d2"
[[ "$d2_id" == "$d_id" && "$d2_count" == 1 ]] || fail "reviewed queue did not reclaim"
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 second'
 where id='$d2_id'::uuid" >/dev/null
[[ -z "$(claim d3e6_sweep_again)" ]] || fail "second eighth expiry reissued"
if review "$d_id" retry_transient OPS-2003 >/dev/null 2>&1; then
 fail "transient item allowed unlimited operator retries"
fi
if review "$d_id" retry_transient OPS-2002 >/dev/null 2>&1; then
 fail "same ticket action idempotency did not reject duplicate"
fi
echo "PASS D3e6: private health metrics, HOLD acknowledgement, single transient recovery"

# Read-only aggregate has no ID or customer detail columns.
[[ "$(p -c "select count(*) from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
 and p.proname='internal_private_cancel_queue_health_v1'
 and (pg_get_function_result(p.oid) ilike '%webhook%'
   or pg_get_function_result(p.oid) ilike '%payment_id%'
   or pg_get_function_result(p.oid) ilike '%inbox_id%')")" == 0 ]] ||
 fail "private aggregate leaked sensitive identifiers"

# Privacy review logs are attached to temporary inbox lifecycle. Verify cascade
# in an isolated, rolled-back transaction; no operational deletion is deployed.
cascade="$(p <<SQL
begin;
delete from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$d_id'::uuid;
select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$d_id'::uuid;
rollback;
SQL
)"
printf "%s\n" "$cascade" | grep -qx "0" || fail "private review audit did not cascade with removed inbox"

for signature in \
  'public.internal_private_cancel_queue_health_v1()' \
  'public.internal_private_cancel_review_v1(uuid,text,text)'
do
 [[ "$(p -c "select count(*) from pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and has_function_privilege(r.rolname,'$signature','EXECUTE')")" == 0 ]] ||
 fail "runtime gained private ops EXECUTE"
done
[[ "$(p -c "select count(*) from pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and has_table_privilege(r.rolname,
 'public.official_reader_portone_cancel_ops_review_v1','SELECT')")" == 0 ]] ||
 fail "private operator audit readable by runtime"
[[ "$(p -c "select count(*) from public.entitlement_events")" == 0 ]] ||
 fail "private operations mutated entitlements"
echo "PASS D3e6: minimal audit, cascaded privacy lineage, role isolation, no-effects"
