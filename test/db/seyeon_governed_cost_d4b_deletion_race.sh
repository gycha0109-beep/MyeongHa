#!/usr/bin/env bash
set -euo pipefail
# D4B-1: independent sessions, deterministic budget lock marker, no paid calls.
# Watchtower-Track: character-memory
[[ "${PGDATABASE:-}" == "myeongha_seyeon_d4b_test" ]] || {
  echo 'D4B requires its exact disposable database' >&2; exit 2;
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
budget_pid=''
start_pid=''
cleanup() {
  # Release the FIFO waiter before terminating test-only processes.
  if [[ -p "$tmp/release" ]]; then
    (printf 'release\n' >"$tmp/release") >/dev/null 2>&1 &
    release_pid=$!
    sleep 0.05
    kill "$release_pid" 2>/dev/null || true
  fi
  for child in "$start_pid" "$budget_pid"; do
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
call='d4b00000-0000-4000-8000-000000000001'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
# The blocker owns ONLY the daily budget row, not the Subject row.
# psql's shell marker is emitted AFTER the row lock has been acquired.
mkfifo "$tmp/release"
cat >"$tmp/budget.sql" <<SQL
set application_name='seyeon_d4b_budget_blocker';
begin;
select bucket_utc_date from public.seyeon_ai_governor_daily_budgets_v1
where bucket_utc_date='$day' for update;
\\! touch "$tmp/budget-locked"
\\! cat "$tmp/release" >/dev/null
commit;
SQL
db -f "$tmp/budget.sql" >"$tmp/budget.log" 2>&1 &
budget_pid=$!
locked=false
for i in $(seq 1 100); do
  if [[ -f "$tmp/budget-locked" ]]; then locked=true; break; fi
  if ! kill -0 "$budget_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$locked" == true ]] || { cat "$tmp/budget.log" >&2; exit 4; }

cat >"$tmp/start.sql" <<SQL
set application_name='seyeon_d4b_waiting_start';
set statement_timeout='15s';
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1(
  '00000000-0000-0000-0000-00000000a001');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
  '$subject',
  'a4000000-0000-0000-0000-000000000006',
  'a6000000-0000-0000-0000-000000000006',
  'post_turn','$call','event_extraction','openai-responses',
  'd4-offline-no-network-model','d4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
db -f "$tmp/start.sql" >"$tmp/start.log" 2>&1 &
start_pid=$!
waiting=false
for i in $(seq 1 100); do
  lock_count="$(db -c "select count(*) from pg_catalog.pg_stat_activity
    where application_name='seyeon_d4b_waiting_start'
      and wait_event_type='Lock'")"
  if [[ "$lock_count" == 1 ]]; then waiting=true; break; fi
  if ! kill -0 "$start_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$waiting" == true ]] || {
  echo 'FAIL governed session never waited on live global budget row' >&2
  cat "$tmp/start.log" >&2; exit 5;
}

# A has already resolved a trusted Subject, but has not passed cost admission.
# B now commits the approved account-deletion start in a different DB session.
db -c "select deletion_job_id from public.cmd_start_account_deletion_v1(
  '$subject','d4b10000-0000-4000-8000-000000000001',
  'd4b-deletion-start','d4b20000-0000-4000-8000-000000000001')" >"$tmp/delete.log" || {
  cat "$tmp/delete.log" >&2; exit 6;
}
[[ "$(db -c "select status from public.subjects where id='$subject'")" == 'deletion_pending' ]] || {
  echo 'FAIL approved deletion start did not commit' >&2; exit 7;
}
# Release precisely the blocked reservation, without sleep-based timing.
printf 'release\n' >"$tmp/release"
if wait "$budget_pid"; then budget_pid=''; else
  cat "$tmp/budget.log" >&2; exit 8;
fi
if wait "$start_pid"; then
  echo 'FAIL stale trusted context admitted a cost after deletion' >&2; exit 9;
fi
start_pid=''
grep -Fq '23514' "$tmp/start.log" &&
grep -Fq 'seyeon_ai_governor_subject_inactive' "$tmp/start.log" || {
  echo 'FAIL stale admission rejected for wrong SQLSTATE/constraint' >&2
  cat "$tmp/start.log" >&2; exit 10;
}
budget="$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date='$day'")"
ledger="$(db -c "select count(*) from public.seyeon_ai_call_cost_events
  where call_id='$call'")"
[[ "$budget|$ledger" == '0|0' ]] || {
  echo "FAIL aborted admission mutated budget/ledger: $budget|$ledger" >&2
  exit 11
}

# Even a fresh trusted resolver of deletion_pending cannot mint another paid call.
sed "s/$call/d4b00000-0000-4000-8000-000000000002/" "$tmp/start.sql" \
  >"$tmp/retry.sql"
if db -f "$tmp/retry.sql" >"$tmp/retry.log" 2>&1; then
  echo 'FAIL deletion_pending Subject admitted a fresh governed call' >&2; exit 12
fi
grep -Fq '23514' "$tmp/retry.log" &&
grep -Fq 'seyeon_ai_governor_subject_inactive' "$tmp/retry.log" || {
  echo 'FAIL post-delete retry rejected for wrong SQLSTATE/constraint' >&2
  cat "$tmp/retry.log" >&2; exit 13
}
[[ "$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date='$day'")" == '0' ]] || exit 14
[[ "$(db -c "select count(*) from public.seyeon_ai_call_cost_events
  where model_key='d4-offline-no-network-model'")" == '0' ]] || exit 15

# No test identity, policy, or lock escapes its isolated template-derived DB.
echo 'D4B-1 deletion-first/admission race, stale context, rollback PASS'
