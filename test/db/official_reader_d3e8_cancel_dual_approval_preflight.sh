#!/usr/bin/env bash
set -euo pipefail
# D3e8 TEST ONLY: disposable PG. No real identity, private keys or LIVE roles.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3e8: $*" >&2; exit 1; }
fingerprint='hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
digest='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
challenge='a001a001-a001-4001-8001-a001a001a001'
enqueue() {
 p -c "select intake_result
 from public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
 'sandbox','d3e8-wh-$1','d3e8-pay-$1','d3e8-tx-$1','d3e8-store','d3e8-cancel-$1',
 'Transaction.Cancelled','2026-10-14T00:00:00Z'::timestamptz,'$fingerprint')"
}
claim_work() {
 p -c "select inbox_id::text||'|'||claim_token::text
 from public.internal_claim_official_reader_cancel_work_v1('$1',90)"
}
commit_review() {
 local id="$1" action="$2" ticket="$3" nonce="$4"
 local requester='op_request1' approver='op_approve1'
 local key_a='key_request1' key_b='key_approve1'
 local issued="clock_timestamp()-interval '1 minute'"
 local expires="clock_timestamp()+interval '4 minutes'"
 if [[ "$#" -ge 6 ]]; then requester="$5"; approver="$6"; fi
 if [[ "$#" -ge 8 ]]; then key_a="$7"; key_b="$8"; fi
 if [[ "$#" -ge 10 ]]; then shift 8; issued="$1"; expires="$2"; fi
 p -c "select review_state||'|'||effect_authorized::text
 from public.internal_private_cancel_commit_review_approval_v1(
 '$id'::uuid,'$action','$ticket','$nonce'::uuid,
 $issued,$expires,'$key_a','$key_b','$requester','$approver','$digest')"
}
[[ "$(enqueue hold)" == queued ]] || fail "HOLD fixture intake"
claim="$(claim_work d3e8_hold_worker)"
IFS='|' read -r hold_id hold_token <<< "$claim"
[[ -n "$hold_id" ]] || fail "HOLD fixture lease"
[[ "$(p -c "select failure_state from public.internal_fail_official_reader_cancel_work_v1(
 '$hold_id'::uuid,'d3e8_hold_worker','$hold_token'::uuid,'SOURCE_MISMATCH',false)")" == held ]] ||
 fail "security mismatch not HELD"

# Structural SQL fence; Ed25519 itself is verified by D3e8 TypeScript.
if commit_review "$hold_id" acknowledge OPS-2001 "$challenge" \
 op_request1 op_request1 >/dev/null 2>&1; then
 fail "same-principal bypassed dual-control structure"
fi
if commit_review "$hold_id" acknowledge OPS-2001 "$challenge" \
 op_request1 op_approve1 key_request1 key_request1 >/dev/null 2>&1; then
 fail "same signing key bypassed dual-control structure"
fi
if commit_review "$hold_id" acknowledge OPS-2001 "$challenge" \
 op_request1 op_approve1 key_request1 key_approve1 \
 "clock_timestamp()-interval '15 minutes'" "clock_timestamp()-interval '10 minutes'" >/dev/null 2>&1; then
 fail "expired operator challenge accepted"
fi
if commit_review "$hold_id" acknowledge OPS-2001 "$challenge" \
 op_request1 op_approve1 key_request1 key_approve1 \
 "clock_timestamp()+interval '1 minute'" "clock_timestamp()+interval '2 minutes'" >/dev/null 2>&1; then
 fail "future-dated operator challenge accepted"
fi
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$hold_id'::uuid")" == 0 ]] || fail "invalid approval wrote D3e6 review"
[[ "$(p -c "select count(*) from public.official_reader_cancel_review_approval_v1")" == 0 ]] ||
 fail "invalid approval wrote D3e8 receipt"

[[ "$(commit_review "$hold_id" acknowledge OPS-2001 "$challenge")" == 'held|false' ]] ||
 fail "sandbox offline approval not committed"
[[ "$(p -c "select count(*) from public.official_reader_cancel_review_approval_v1
 where inbox_id='$hold_id'::uuid and challenge_id='$challenge'::uuid")" == 1 ]] ||
 fail "approval digest receipt missing"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$hold_id'::uuid and action='acknowledge'")" == 1 ]] ||
 fail "D3e6 review and D3e8 approval not committed atomically"
[[ "$(p -c "select inbox_state from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$hold_id'::uuid")" == held ]] || fail "acknowledgement cleared security HOLD"

if commit_review "$hold_id" acknowledge OPS-2002 "$challenge" >/dev/null 2>&1; then
 fail "replayed nonce accepted with a new ticket"
fi
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$hold_id'::uuid")" == 1 ]] ||
 fail "replayed challenge inserted partial extra D3e6 review"
if commit_review "$hold_id" acknowledge OPS-2001 \
 'a002a002-a002-4002-8002-a002a002a002' >/dev/null 2>&1; then
 fail "duplicate ticket allowed second review receipt"
fi
[[ "$(p -c "select count(*) from public.official_reader_cancel_review_approval_v1")" == 1 ]] ||
 fail "failed duplicate inserted a receipt"
echo "PASS D3e8: distinct principals/keys, expiration, replay and atomic review"

[[ "$(enqueue transient)" == queued ]] || fail "transient fixture intake"
claim="$(claim_work d3e8_dead_worker)"
IFS='|' read -r dead_id dead_token <<< "$claim"
[[ -n "$dead_id" ]] || fail "dead-letter fixture lease"
p -c "update public.official_reader_portone_cancel_ingress_inbox_v1
 set attempt_count=8,lease_expires_at=clock_timestamp()-interval '1 second'
 where id='$dead_id'::uuid" >/dev/null
[[ -z "$(claim_work d3e8_sweeper)" ]] || fail "eighth expired attempt claimed"
[[ "$(p -c "select inbox_state from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$dead_id'::uuid")" == dead_letter ]] || fail "dead letter absent"
retry_nonce='a003a003-a003-4003-8003-a003a003a003'
[[ "$(commit_review "$dead_id" retry_transient OPS-2003 "$retry_nonce")" == 'queued|false' ]] ||
 fail "valid transient dead-letter approval failed"
[[ "$(p -c "select inbox_state||':'||attempt_count from
 public.official_reader_portone_cancel_ingress_inbox_v1 where id='$dead_id'::uuid")" == queued:0 ]] ||
 fail "dual approval did not atomically requeue eligible work"
[[ "$(p -c "select count(*) from public.official_reader_cancel_review_approval_v1")" == 2 ]] ||
 fail "receipt count mismatch"
[[ "$(p -c "select count(*) from public.entitlement_events")" == 0 ]] ||
 fail "privileged review mutated entitlement ledger"

cascade="$(p <<SQL
begin;
delete from public.official_reader_portone_cancel_ingress_inbox_v1
 where id='$hold_id'::uuid;
select count(*) from public.official_reader_cancel_review_approval_v1
 where inbox_id='$hold_id'::uuid;
select count(*) from public.official_reader_portone_cancel_ops_review_v1
 where inbox_id='$hold_id'::uuid;
rollback;
SQL
)"
[[ "$(printf '%s\n' "$cascade" | grep -cx '0' || true)" == 2 ]] ||
 fail "temporary review and receipt did not cascade in rolled-back test"

[[ "$(p -c "select count(*) from pg_roles r where r.rolname in (
 'anon','authenticated','service_role','myeongha_api_executor',
 'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 and (has_function_privilege(r.rolname,
 'public.internal_private_cancel_commit_review_approval_v1(uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text)',
 'EXECUTE')
 or has_table_privilege(r.rolname,
 'public.official_reader_cancel_review_approval_v1','SELECT'))")" == 0 ]] ||
 fail "private signed review reachable by runtime"
echo "PASS D3e8: transient recovery, privacy cascade, runtime ACL, no-rights"
