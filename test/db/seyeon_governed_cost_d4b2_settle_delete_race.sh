#!/usr/bin/env bash
set -euo pipefail
# D4B-2: approved account finalizer vs in-flight governed settlement.
# Offline synthetic fixture and exact disposable DB ONLY.
# Watchtower-Track: character-memory
[[ "${PGDATABASE:-}" == 'myeongha_seyeon_d4b2_test' ]] || {
  echo 'D4B-2 requires the exact disposable PostgreSQL database' >&2; exit 2;
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
settle_pid=''
finalizer_pid=''
cleanup() {
  if [[ -p "$tmp/release" ]]; then
    (printf 'release\n' >"$tmp/release") >/dev/null 2>&1 &
    opener=$!
    sleep 0.05
    kill "$opener" 2>/dev/null || true
  fi
  for child in "$settle_pid" "$finalizer_pid"; do
    if [[ -n "$child" ]]; then
      kill "$child" 2>/dev/null || true
      wait "$child" 2>/dev/null || true
    fi
  done
  db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/fixture.log" 2>&1 || {
  cat "$tmp/fixture.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
subject='a0000000-0000-0000-0000-000000000001'
turn='a4000000-0000-0000-0000-000000000006'
attempt='a6000000-0000-0000-0000-000000000006'
call='d4b20000-0000-4000-8000-000000000001'
job='d4b21000-0000-4000-8000-000000000001'
outbox='d4b22000-0000-4000-8000-000000000001'
owner='d4b2-finalizer-test-worker'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"

cat >"$tmp/start.sql" <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1(
  '00000000-0000-0000-0000-00000000a001');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
  '$subject','$turn','$attempt','post_turn','$call',
  'event_extraction','openai-responses','d4-offline-no-network-model',
  'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
db -f "$tmp/start.sql" >"$tmp/start.log" 2>&1 || {
  cat "$tmp/start.log" >&2; exit 4;
}
grep -Fq "$call|3700" "$tmp/start.log" || {
  echo 'FAIL synthetic governed reservation missing' >&2; exit 5;
}
check() {
  db -c "select
    (select count(*) from public.seyeon_ai_call_cost_events where call_id='$call'),
    (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
      where bucket_utc_date='$day'),
    (select count(*) from public.chat_turn_attempts where id='$attempt'),
    (select status from public.subjects where id='$subject')" -F '|'
}
[[ "$(check)" == '1|3700|1|active' ]] || {
  echo "FAIL incorrect pre-delete reservation: $(check)" >&2; exit 6;
}

# A settle may legitimately be in flight when the account deletion starts.
mkfifo "$tmp/release"
cat >"$tmp/settle.sql" <<SQL
set application_name='seyeon_d4b2_inflight_settle';
set statement_timeout='15s';
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1(
  '00000000-0000-0000-0000-00000000a001');
select call_id,replayed,occupied_micro_usd,over_ceiling
from public.cmd_governed_settle_seyeon_ai_call_v1(
  '$subject','$turn','$attempt','post_turn',
  pg_catalog.jsonb_build_object(
    'schemaVersion','seyeon-ai-cost-v1','callId','$call',
    'purpose','event_extraction','providerKey','openai-responses',
    'modelKey','d4-offline-no-network-model','outcome','response_received',
    'httpStatus',200,'elapsedMs',8,'inputTokens',100,
    'cachedInputTokens',0,'outputTokens',50,'reasoningTokens',0,
    'priceVersion','d4-rate-v1','estimatedCostMicroUsd',300,
    'costStatus','estimated','invoiceReconciled',false));
\\! touch "$tmp/settle-uncommitted"
\\! cat "$tmp/release" >/dev/null
commit;
SQL
db -f "$tmp/settle.sql" >"$tmp/settle.log" 2>&1 &
settle_pid=$!
ready=false
for i in $(seq 1 120); do
  if [[ -f "$tmp/settle-uncommitted" ]]; then ready=true; break; fi
  if ! kill -0 "$settle_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$ready" == true ]] || {
  echo 'FAIL settlement did not reach pre-COMMIT barrier' >&2
  cat "$tmp/settle.log" >&2; exit 7;
}

# In a distinct DB session, the authorized account deletion-start commits,
# revoking further new work, without changing the in-flight cost transaction.
db -c "select deletion_job_id from public.cmd_start_account_deletion_v1(
  '$subject','$job','d4b2-account-delete','$outbox')" >"$tmp/delete-start.log" || {
  cat "$tmp/delete-start.log" >&2; exit 8;
}
[[ "$(db -c "select status from public.subjects where id='$subject'")" == 'deletion_pending' ]] || {
  echo 'FAIL account deletion did not transition to deletion_pending' >&2; exit 9;
}
# The comprehensive chat-commit fixture leaves unrelated pending outboxes.
# Mark those synthetic events processed so that the approved finalizer's
# existing preflight can evaluate the exact deletion outbox lease.
db -c "update public.outbox_events
  set status='processed',locked_at=null,lock_owner=null,lease_expires_at=null
  where aggregate_type<>'data_deletion_job'
    and (payload_jsonb->>'subjectId'='$subject'
      or (aggregate_type='chat_turn' and aggregate_id in
        (select id::text from public.chat_turns where subject_id='$subject')))" >/dev/null
db -c "update public.outbox_events
  set status='processing',locked_at=clock_timestamp(),lock_owner='$owner',
      lease_expires_at=clock_timestamp()+interval '10 minutes'
  where id='$outbox' and aggregate_type='data_deletion_job'" >/dev/null
[[ "$(db -c "select db_preconditions_met from
  public.internal_account_deletion_finalization_preflight_v1(
    '$subject','$job','$owner')")" == 't' ]] || {
  echo 'FAIL approved DB deletion preflight is not ready' >&2; exit 10;
}

# The approved deletion finalizer must wait for the uncommitted Settle ledger
# row, not bypass it and not resurrect the record after cleanup.
cat >"$tmp/finalize.sql" <<SQL
set application_name='seyeon_d4b2_account_finalizer';
set statement_timeout='15s';
select finalized,replayed from public.internal_finalize_account_deletion_db_v1(
  '$subject','$job','$owner');
SQL
db -f "$tmp/finalize.sql" >"$tmp/finalize.log" 2>&1 &
finalizer_pid=$!
waiting=false
for i in $(seq 1 120); do
  blocking="$(db -c "select count(*) from pg_catalog.pg_stat_activity f
    where f.application_name='seyeon_d4b2_account_finalizer'
      and f.wait_event_type='Lock'
      and exists (select 1 from pg_catalog.pg_stat_activity s
        where s.application_name='seyeon_d4b2_inflight_settle'
          and s.pid=any(pg_catalog.pg_blocking_pids(f.pid)))")"
  if [[ "$blocking" == 1 ]]; then waiting=true; break; fi
  if ! kill -0 "$finalizer_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$waiting" == true ]] || {
  echo 'FAIL finalizer did not wait on the unsettled ledger session' >&2
  cat "$tmp/finalize.log" >&2; exit 11;
}

# Settle wins COMMIT, then finalizer gets its row lock and purges personal cost
# ledger data. The global occupancy remains the conservative settled cost.
printf 'release\n' >"$tmp/release"
if ! wait "$settle_pid"; then cat "$tmp/settle.log" >&2; exit 12; fi
settle_pid=''
grep -Fq "$call|f|300|f" "$tmp/settle.log" || {
  cat "$tmp/settle.log" >&2; exit 13;
}
if ! wait "$finalizer_pid"; then cat "$tmp/finalize.log" >&2; exit 14; fi
finalizer_pid=''
grep -Fq 't|f' "$tmp/finalize.log" || {
  cat "$tmp/finalize.log" >&2; exit 15;
}
[[ "$(check)" == '0|300|0|deleted' ]] || {
  echo "FAIL after finalized deletion: $(check)" >&2; exit 16;
}

# A deleted Member's real governed login cannot re-resolve active ownership.
if db -f "$tmp/settle.sql" >"$tmp/replay.log" 2>&1; then
  echo 'FAIL deleted Subject reauthenticated for settlement replay' >&2; exit 17
fi
grep -Fq '28000' "$tmp/replay.log" &&
grep -Fq 'member_subject_context_unresolved' "$tmp/replay.log" || {
  echo 'FAIL deleted identity rejected for unexpected reason' >&2
  cat "$tmp/replay.log" >&2; exit 18
}
# Isolate underlying Governor behavior with a controlled trusted context:
# with the personal record erased, an old Settle call must NOT recreate it.
cat >"$tmp/ghost.sql" <<SQL
begin;
set local role myeongha_seyeon_cost_meter_owner;
set local myeongha.subject_id='$subject';
select * from public.cmd_governed_settle_seyeon_ai_call_v1(
  '$subject','$turn','$attempt','post_turn',
  pg_catalog.jsonb_build_object('callId','$call'));
commit;
SQL
if db -f "$tmp/ghost.sql" >"$tmp/ghost.log" 2>&1; then
  echo 'FAIL deleted cost event was settled through privileged replay' >&2; exit 19
fi
grep -Fq '23514' "$tmp/ghost.log" &&
grep -Fq 'seyeon_ai_governor_settlement_not_owned' "$tmp/ghost.log" || {
  echo 'FAIL missing reservation did not fail closed' >&2
  cat "$tmp/ghost.log" >&2; exit 20
}
[[ "$(check)" == '0|300|0|deleted' ]] || {
  echo 'FAIL ghost settlement replay recreated private data' >&2; exit 21
}
echo 'D4B-2 settle COMMIT / finalizer wait / ledger cleanup / replay denial PASS'
