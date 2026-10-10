#!/usr/bin/env bash
set -euo pipefail
# D4B-4: governed settlement crash-before-COMMIT, lost reply replay, and
# unknown-usage preservation on an isolated offline PostgreSQL database.
# Watchtower-Track: character-memory
[[ "$PGDATABASE" == 'myeongha_seyeon_d4b4_test' ]] || {
  echo 'D4B-4 requires its exact disposable PostgreSQL database' >&2; exit 2;
}
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
crash_pid=''
cleanup() {
  if [[ -n "$crash_pid" ]]; then
    kill "$crash_pid" 2>/dev/null || true
    wait "$crash_pid" 2>/dev/null || true
  fi
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
first='d4b40000-0000-4000-8000-000000000001'
unknown='d4b40000-0000-4000-8000-000000000002'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
snapshot() {
  local id="$1"
  db -c "select lifecycle_state,cost_status,
    coalesce(estimated_cost_micro_usd::text,'null'),
    governor_effective_micro_usd,
    (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
      where bucket_utc_date='$day')
    from public.seyeon_ai_call_cost_events where call_id='$id'"
}
total() {
  db -c "select
    (select count(*) from public.seyeon_ai_call_cost_events
      where call_id in ('$first','$unknown')),
    (select coalesce(sum(governor_effective_micro_usd),0)
      from public.seyeon_ai_call_cost_events
      where call_id in ('$first','$unknown')),
    (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
      where bucket_utc_date='$day')"
}
start_call() {
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
settle_estimated() {
  local id="$1" elapsed="$2"
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
    'schemaVersion','seyeon-ai-cost-v1','callId','$id',
    'purpose','event_extraction','providerKey','openai-responses',
    'modelKey','d4-offline-no-network-model','outcome','response_received',
    'httpStatus',200,'elapsedMs',$elapsed,'inputTokens',100,
    'cachedInputTokens',0,'outputTokens',50,'reasoningTokens',0,
    'priceVersion','d4-rate-v1','estimatedCostMicroUsd',300,
    'costStatus','estimated','invoiceReconciled',false));
commit;
SQL
}
settle_unknown() {
  local id="$1" elapsed="$2"
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
    'schemaVersion','seyeon-ai-cost-v1','callId','$id',
    'purpose','event_extraction','providerKey','openai-responses',
    'modelKey','d4-offline-no-network-model','outcome','timeout',
    'httpStatus',null,'elapsedMs',$elapsed,'inputTokens',null,
    'cachedInputTokens',null,'outputTokens',null,'reasoningTokens',null,
    'priceVersion',null,'estimatedCostMicroUsd',null,
    'costStatus','usage_unknown','invoiceReconciled',false));
commit;
SQL
}
expect_conflict() {
  local path="$1" label="$2"
  if db -f "$path" >"$tmp/$label.log" 2>&1; then
    echo "FAIL $label accepted conflicting settlement" >&2; exit 22;
  fi
  grep -Fq '23514' "$tmp/$label.log" &&
  grep -Fq 'seyeon_ai_call_settlement_conflict' "$tmp/$label.log" || {
    echo "FAIL $label did not reject conflicting immutable evidence" >&2
    cat "$tmp/$label.log" >&2; exit 23;
  }
}
start_call "$first" >"$tmp/start-first.sql"
db -f "$tmp/start-first.sql" >"$tmp/start-first.log" 2>&1 || {
  cat "$tmp/start-first.log" >&2; exit 4;
}
grep -Fq "$first|3700" "$tmp/start-first.log" || {
  echo 'FAIL missing initial reserved quote' >&2; exit 5;
}
[[ "$(snapshot "$first")" == 'started|usage_unknown|null|3700|3700' ]] || {
  echo "FAIL starting state is inconsistent: $(snapshot "$first")" >&2; exit 6;
}
settle_estimated "$first" 8 >"$tmp/settle.sql"

# Real backend failure AFTER the settlement SQL returns and BEFORE COMMIT.
# A separate superuser test session terminates the exact tagged backend.
{
  echo "set application_name='seyeon_d4b4_settle_crash_ci';"
  sed '$d' "$tmp/settle.sql"
  printf '\\! touch "%s/settle-uncommitted"\nselect pg_sleep(25);\ncommit;\n' "$tmp"
} >"$tmp/crash.sql"
db -f "$tmp/crash.sql" >"$tmp/crash.log" 2>&1 &
crash_pid=$!
ready=false
for i in $(seq 1 120); do
  if [[ -f "$tmp/settle-uncommitted" ]]; then ready=true; break; fi
  if ! kill -0 "$crash_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$ready" == true ]] || {
  echo 'FAIL settlement never reached pre-COMMIT crash marker' >&2
  cat "$tmp/crash.log" >&2; exit 7;
}
target="$(db -c "select pid::text from pg_catalog.pg_stat_activity
  where application_name='seyeon_d4b4_settle_crash_ci'
  and pid<>pg_backend_pid()")"
[[ "$target" =~ ^[0-9]+$ ]] || {
  echo "FAIL expected one crash fixture backend: $target" >&2; exit 8;
}
[[ "$(db -c "select pg_catalog.pg_terminate_backend($target)")" == 't' ]] || {
  echo 'FAIL backend termination unsuccessful' >&2; exit 9;
}
if wait "$crash_pid" 2>/dev/null; then
  echo 'FAIL terminated settlement unexpectedly committed' >&2; exit 10;
fi
crash_pid=''
[[ "$(snapshot "$first")" == 'started|usage_unknown|null|3700|3700' ]] || {
  echo "FAIL crash left a half-settled ledger or refund: $(snapshot "$first")" >&2
  exit 11;
}
[[ "$(total)" == '1|3700|3700' ]] || {
  echo "FAIL crash counter differs from ledger: $(total)" >&2; exit 12;
}

# Simulate COMMIT success with its client receipt lost: the worker is retried
# from an independent backend and must see an idempotent replay, not a refund.
db -f "$tmp/settle.sql" >/dev/null 2>"$tmp/lost-reply.log" || {
  cat "$tmp/lost-reply.log" >&2; exit 13;
}
[[ "$(snapshot "$first")" == 'settled|estimated|300|300|300' ]] || {
  echo "FAIL successful retry not durably settled: $(snapshot "$first")" >&2
  exit 14;
}
db -f "$tmp/settle.sql" >"$tmp/replay.log" 2>&1 || {
  cat "$tmp/replay.log" >&2; exit 15;
}
grep -Fq "$first|t|300|f" "$tmp/replay.log" || {
  echo 'FAIL replay did not return already settled receipt' >&2
  cat "$tmp/replay.log" >&2; exit 16;
}
[[ "$(total)" == '1|300|300' ]] || {
  echo 'FAIL post-COMMIT replay charged or refunded twice' >&2; exit 17;
}
settle_estimated "$first" 9 >"$tmp/conflict.sql"
expect_conflict "$tmp/conflict.sql" 'estimated-replay'
[[ "$(snapshot "$first")" == 'settled|estimated|300|300|300' ]] || {
  echo 'FAIL conflicting proof mutated immutable settlement' >&2; exit 18;
}

# A second timeout with unknown usage must conservatively retain the entire
# 3700 quote; this is NOT equivalent to a free failed call.
db -c "update public.seyeon_ai_governor_daily_budgets_v1
  set global_limit_micro_usd=8000,subject_limit_micro_usd=8000
  where bucket_utc_date='$day'" >/dev/null
start_call "$unknown" >"$tmp/start-unknown.sql"
db -f "$tmp/start-unknown.sql" >"$tmp/start-unknown.log" 2>&1 || {
  cat "$tmp/start-unknown.log" >&2; exit 19;
}
[[ "$(total)" == '2|4000|4000' ]] || {
  echo "FAIL unknown-call conservative reservation missing: $(total)" >&2
  exit 20;
}
settle_unknown "$unknown" 2000 >"$tmp/unknown.sql"
db -f "$tmp/unknown.sql" >"$tmp/unknown-first.log" 2>&1 || {
  cat "$tmp/unknown-first.log" >&2; exit 21;
}
grep -Fq "$unknown|f|3700|f" "$tmp/unknown-first.log" || {
  echo 'FAIL timeout did not keep full unknown-cost ceiling' >&2; exit 24;
}
db -f "$tmp/unknown.sql" >"$tmp/unknown-replay.log" 2>&1 || {
  cat "$tmp/unknown-replay.log" >&2; exit 25;
}
grep -Fq "$unknown|t|3700|f" "$tmp/unknown-replay.log" || {
  echo 'FAIL unknown-usage retry was not idempotent' >&2; exit 26;
}
settle_unknown "$unknown" 2001 >"$tmp/unknown-conflict.sql"
expect_conflict "$tmp/unknown-conflict.sql" 'timeout-replay'
[[ "$(snapshot "$unknown")" == 'settled|usage_unknown|null|3700|4000' ]] || {
  echo "FAIL timeout accounting changed: $(snapshot "$unknown")" >&2
  exit 27;
}
[[ "$(total)" == '2|4000|4000' ]] || {
  echo "FAIL final global and ledger amounts diverged: $(total)" >&2
  exit 28;
}
# Duplicate paid dispatch authorization for either reserved call ID is banned.
if db -f "$tmp/start-first.sql" >"$tmp/duplicate.log" 2>&1; then
  echo 'FAIL duplicate paid call ID authorized a second dispatch' >&2; exit 29;
fi
grep -Fq '23505' "$tmp/duplicate.log" || {
  echo 'FAIL duplicate paid call rejected for unexpected reason' >&2
  cat "$tmp/duplicate.log" >&2; exit 30;
}
[[ "$(total)" == '2|4000|4000' ]] || {
  echo 'FAIL duplicate authorization mutated accounting' >&2; exit 31;
}
echo 'D4B-4 settle pre-COMMIT crash rollback, lost reply, replay, conflict and unknown usage PASS'
