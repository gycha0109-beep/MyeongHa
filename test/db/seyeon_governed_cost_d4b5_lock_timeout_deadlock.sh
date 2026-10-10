#!/usr/bin/env bash
set -euo pipefail
# D4B-5: lock timeout, statement timeout, deliberately reversed lock-order
# deadlock. Disposable PostgreSQL DB and offline synthetic calls ONLY.
# Watchtower-Track: character-memory
[[ "$PGDATABASE" == 'myeongha_seyeon_d4b5_test' ]] || {
  echo 'D4B-5 requires the exact disposable DB' >&2; exit 2;
}
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
blocker_pid=''
reverse_pid=''
start_pid=''
cleanup() {
  for fifo in "$tmp/lock-release" "$tmp/reverse-release"; do
    if [[ -p "$fifo" ]]; then
      (printf 'release\n' >"$fifo") >/dev/null 2>&1 &
      local opener=$!
      sleep 0.05
      kill "$opener" 2>/dev/null || true
    fi
  done
  for child in "$start_pid" "$reverse_pid" "$blocker_pid"; do
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
first='d4b50000-0000-4000-8000-000000000001'
second='d4b50000-0000-4000-8000-000000000002'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
state() {
  db -c "select
    (select count(*) from public.seyeon_ai_call_cost_events
      where call_id in ('$first','$second')),
    (select coalesce(sum(governor_effective_micro_usd),0)
      from public.seyeon_ai_call_cost_events
      where call_id in ('$first','$second')),
    (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
      where bucket_utc_date='$day')"
}
admit() {
  local id="$1"
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1(
 '00000000-0000-0000-0000-00000000a001');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn','$id',
 'event_extraction','openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
}
settle() {
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1(
 '00000000-0000-0000-0000-00000000a001');
select call_id,replayed,occupied_micro_usd,over_ceiling
from public.cmd_governed_settle_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn',
 pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-ai-cost-v1','callId','$first',
 'purpose','event_extraction','providerKey','openai-responses',
 'modelKey','d4-offline-no-network-model','outcome','response_received',
 'httpStatus',200,'elapsedMs',8,'inputTokens',100,
 'cachedInputTokens',0,'outputTokens',50,'reasoningTokens',0,
 'priceVersion','d4-rate-v1','estimatedCostMicroUsd',300,
 'costStatus','estimated','invoiceReconciled',false));
commit;
SQL
}
# This blocker holds ONLY the global row, and is released by an exact FIFO.
# No sleeping in the lock-owning transaction, no reliance on SQL execution race.
hold_budget() {
  local label="$1"
  mkfifo "$tmp/lock-release"
  cat >"$tmp/blocker.sql" <<SQL
set application_name='seyeon_d4b5_budget_holder';
begin;
select bucket_utc_date from public.seyeon_ai_governor_daily_budgets_v1
where bucket_utc_date='$day' for update;
\\! touch "$tmp/$label-locked"
\\! cat "$tmp/lock-release" >/dev/null
commit;
SQL
  db -f "$tmp/blocker.sql" >"$tmp/blocker.log" 2>&1 &
  blocker_pid=$!
  local ready=false
  for i in $(seq 1 120); do
    if [[ -f "$tmp/$label-locked" ]]; then ready=true; break; fi
    if ! kill -0 "$blocker_pid" 2>/dev/null; then break; fi
    sleep 0.05
  done
  [[ "$ready" == true ]] || {
    echo "FAIL budget blocker $label not ready" >&2
    cat "$tmp/blocker.log" >&2; exit 4;
  }
}
free_budget() {
  printf 'release\n' >"$tmp/lock-release"
  if ! wait "$blocker_pid"; then
    cat "$tmp/blocker.log" >&2; exit 5;
  fi
  blocker_pid=''
  rm -f "$tmp/lock-release"
}
# Case 1: a reservation waiting on the canonical global lock reaches the
# configured lock timeout. It must have written neither ledger nor counter.
hold_budget 'admission'
{ echo "set lock_timeout='900ms';"; echo "set statement_timeout='5s';";
  admit "$first"; } >"$tmp/admit-timeout.sql"
if db -f "$tmp/admit-timeout.sql" >"$tmp/admit-timeout.log" 2>&1; then
  echo 'FAIL admission bypassed the busy global budget row' >&2; exit 6;
fi
grep -Fq '55P03' "$tmp/admit-timeout.log" || {
  echo 'FAIL admission did not fail with lock_timeout SQLSTATE' >&2
  cat "$tmp/admit-timeout.log" >&2; exit 7;
}
[[ "$(state)" == '0|0|0' ]] || {
  echo "FAIL timed-out admission had a partial reservation: $(state)" >&2
  exit 8;
}
free_budget
admit "$first" >"$tmp/admit-first.sql"
db -f "$tmp/admit-first.sql" >"$tmp/admit-first.log" 2>&1 || {
  cat "$tmp/admit-first.log" >&2; exit 9;
}
grep -Fq "$first|3700" "$tmp/admit-first.log" || {
  echo 'FAIL admission retry after lock release' >&2; exit 10;
}
[[ "$(state)" == '1|3700|3700' ]] || {
  echo "FAIL admission changed ledger or counter incorrectly: $(state)" >&2
  exit 11;
}
# Case 2: settlement waiting on that same global lock reaches a statement
# timeout BEFORE its longer lock timeout. The already held 3700 must remain.
hold_budget 'settlement'
{ echo "set lock_timeout='5s';"; echo "set statement_timeout='900ms';";
  settle; } >"$tmp/settle-timeout.sql"
if db -f "$tmp/settle-timeout.sql" >"$tmp/settle-timeout.log" 2>&1; then
  echo 'FAIL settlement passed locked global budget row' >&2; exit 12;
fi
grep -Fq '57014' "$tmp/settle-timeout.log" || {
  echo 'FAIL settlement did not stop for statement_timeout' >&2
  cat "$tmp/settle-timeout.log" >&2; exit 13;
}
[[ "$(state)" == '1|3700|3700' ]] || {
  echo "FAIL timed-out settlement partly refunded: $(state)" >&2
  exit 14;
}
free_budget
settle >"$tmp/settle-success.sql"
db -f "$tmp/settle-success.sql" >"$tmp/settle-success.log" 2>&1 || {
  cat "$tmp/settle-success.log" >&2; exit 15;
}
grep -Fq "$first|f|300|f" "$tmp/settle-success.log" || {
  echo 'FAIL settlement could not recover after lock release' >&2; exit 16;
}
[[ "$(state)" == '1|300|300' ]] || {
  echo "FAIL recovered settlement accounting incorrect: $(state)" >&2
  exit 17;
}
# Case 3: deliberately invert the documented global-budget -> Subject order
# using a SUPERUSER-ONLY SYNTHETIC transaction. This is not an application
# endpoint: it verifies that PostgreSQL detects a real two-session deadlock
# and a failed admission cannot persist a half-reservation.
db -c "update public.seyeon_ai_governor_daily_budgets_v1
  set global_limit_micro_usd=8000,subject_limit_micro_usd=8000
  where bucket_utc_date='$day'" >/dev/null
mkfifo "$tmp/reverse-release"
cat >"$tmp/reverse.sql" <<SQL
set application_name='seyeon_d4b5_reverse_subject';
set deadlock_timeout='250ms';
set statement_timeout='12s';
begin;
select id from public.subjects where id='$subject' for update;
\\! touch "$tmp/subject-locked"
\\! cat "$tmp/reverse-release" >/dev/null
select bucket_utc_date from public.seyeon_ai_governor_daily_budgets_v1
where bucket_utc_date='$day' for update;
commit;
SQL
db -f "$tmp/reverse.sql" >"$tmp/reverse.log" 2>&1 &
reverse_pid=$!
ready=false
for i in $(seq 1 120); do
  if [[ -f "$tmp/subject-locked" ]]; then ready=true; break; fi
  if ! kill -0 "$reverse_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$ready" == true ]] || {
  echo 'FAIL inverted-lock test could not hold Subject row' >&2
  cat "$tmp/reverse.log" >&2; exit 18;
}
{ echo "set application_name='seyeon_d4b5_governed_start';";
  echo "set deadlock_timeout='250ms';";
  echo "set statement_timeout='12s';";
  admit "$second"; } >"$tmp/competing.sql"
db -f "$tmp/competing.sql" >"$tmp/competing.log" 2>&1 &
start_pid=$!
blocked=false
for i in $(seq 1 120); do
  blockers="$(db -c "select count(*) from pg_catalog.pg_stat_activity b
    where b.application_name='seyeon_d4b5_governed_start'
      and b.wait_event_type='Lock'
      and exists (select 1 from pg_catalog.pg_stat_activity a
        where a.application_name='seyeon_d4b5_reverse_subject'
          and a.pid=any(pg_catalog.pg_blocking_pids(b.pid)))")"
  if [[ "$blockers" == 1 ]]; then blocked=true; break; fi
  if ! kill -0 "$start_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$blocked" == true ]] || {
  echo 'FAIL governed admission did not wait for Subject lock' >&2
  cat "$tmp/competing.log" >&2; exit 19;
}
# Subject lock was acquired first by reverse session. It now requests the
# global row held by governed Start, forcing an actual PostgreSQL deadlock.
printf 'release\n' >"$tmp/reverse-release"
a_ok=0
b_ok=0
if wait "$reverse_pid"; then a_ok=1; fi
reverse_pid=''
if wait "$start_pid"; then b_ok=1; fi
start_pid=''
[[ $((a_ok+b_ok)) -eq 1 ]] || {
  echo "FAIL expected one deadlock victim, got reverse=$a_ok admission=$b_ok" >&2
  cat "$tmp/reverse.log" "$tmp/competing.log" >&2; exit 20;
}
if [[ "$a_ok" == 0 ]]; then
  grep -Fq '40P01' "$tmp/reverse.log" || {
    echo 'FAIL reverse lock-holder failed without deadlock detection' >&2
    cat "$tmp/reverse.log" >&2; exit 21;
  }
else
  grep -Fq '40P01' "$tmp/competing.log" || {
    echo 'FAIL governed admission failed without deadlock detection' >&2
    cat "$tmp/competing.log" >&2; exit 22;
  }
fi
if [[ "$b_ok" == 0 ]]; then
  [[ "$(state)" == '1|300|300' ]] || {
    echo "FAIL deadlocked admission persisted partial cost: $(state)" >&2
    exit 23;
  }
  db -f "$tmp/competing.sql" >"$tmp/recovered.log" 2>&1 || {
    cat "$tmp/recovered.log" >&2; exit 24;
  }
  grep -Fq "$second|3700" "$tmp/recovered.log" || {
    echo 'FAIL failed admission cannot recover with same call ID' >&2
    exit 25;
  }
else
  grep -Fq "$second|3700" "$tmp/competing.log" || {
    echo 'FAIL surviving governed admission did not commit' >&2
    cat "$tmp/competing.log" >&2; exit 26;
  }
fi
[[ "$(state)" == '2|4000|4000' ]] || {
  echo "FAIL post-deadlock budget/ledger invariant: $(state)" >&2
  exit 27;
}
# No stale uncommitted locks should survive either transaction.
[[ "$(db -c "select count(*) from pg_catalog.pg_stat_activity
  where application_name like 'seyeon_d4b5_%'
    and wait_event_type='Lock'")" == '0' ]] || {
  echo 'FAIL lock remains after deadlock recovery' >&2; exit 28;
}
echo 'D4B-5 lock_timeout, statement_timeout, deadlock abort and accounting recovery PASS'
