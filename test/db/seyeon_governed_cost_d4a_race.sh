#!/usr/bin/env bash
set -euo pipefail
# D4A PostgreSQL independent session test; never Production.
# Watchtower-Track: character-memory
[[ "$PGDATABASE" == "myeongha_seyeon_d4a_test" ]] || exit 2
db() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
tmp="$(mktemp -d)"
pid=''
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/fixture.log" 2>&1 || {
  cat "$tmp/fixture.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
a='d4a00000-0000-4000-8000-000000000001'
b='d4a00000-0000-4000-8000-000000000002'
admit() {
  local id="$1"
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1(
 '00000000-0000-0000-0000-00000000a001');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 'a0000000-0000-0000-0000-000000000001',
 'a4000000-0000-0000-0000-000000000006',
 'a6000000-0000-0000-0000-000000000006',
 'post_turn','$id','event_extraction','openai-responses',
 'd4-offline-no-network-model','d4-policy-v1','d4-rate-v1',500,800,2500);
SQL
}
state() {
  db -F '|' -c "select
  (select count(*) from public.seyeon_ai_call_cost_events
    where model_key='d4-offline-no-network-model'),
  (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
    where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date),
  (select coalesce(sum(governor_effective_micro_usd),0)
    from public.seyeon_ai_call_cost_events
    where model_key='d4-offline-no-network-model')"
}
{ admit "$a"; printf '\\! touch "%s/ready"\nselect pg_sleep(4);\ncommit;\n' "$tmp"; } >"$tmp/a.sql"
db -f "$tmp/a.sql" >"$tmp/a.log" 2>&1 &
pid=$!
ready=false
for i in $(seq 1 100); do
  if [[ -f "$tmp/ready" ]]; then ready=true; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$tmp/a.log" >&2; exit 4; fi
{ echo "set lock_timeout='600ms';"; admit "$b"; echo 'commit;'; } >"$tmp/b.sql"
if db -f "$tmp/b.sql" >"$tmp/block.log" 2>&1; then
  echo 'FAIL budget reservation avoided the live row lock' >&2; exit 5
fi
grep -qi 'lock timeout' "$tmp/block.log" || { cat "$tmp/block.log" >&2; exit 6; }
wait "$pid" || { cat "$tmp/a.log" >&2; exit 7; }
pid=''
[[ "$(state)" == '1|3700|3700' ]] || { echo "FAIL reserved: $(state)" >&2; exit 8; }
if db -f "$tmp/b.sql" >"$tmp/denied.log" 2>&1; then
  echo 'FAIL budget exhausted admitted second call' >&2; exit 9
fi
grep -q 'global daily budget exhausted' "$tmp/denied.log" || {
  cat "$tmp/denied.log" >&2; exit 10;
}
[[ "$(state)" == '1|3700|3700' ]] || { echo 'FAIL retry mutated ledger' >&2; exit 11; }
cat >"$tmp/settle.sql" <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1(
 '00000000-0000-0000-0000-00000000a001');
select call_id,replayed,occupied_micro_usd,over_ceiling
from public.cmd_governed_settle_seyeon_ai_call_v1(
 'a0000000-0000-0000-0000-000000000001',
 'a4000000-0000-0000-0000-000000000006',
 'a6000000-0000-0000-0000-000000000006','post_turn',
 pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-ai-cost-v1','callId','$a',
 'purpose','event_extraction','providerKey','openai-responses',
 'modelKey','d4-offline-no-network-model','outcome','response_received',
 'httpStatus',200,'elapsedMs',8,'inputTokens',100,'cachedInputTokens',0,
 'outputTokens',50,'reasoningTokens',0,'priceVersion','d4-rate-v1',
 'estimatedCostMicroUsd',300,'costStatus','estimated',
 'invoiceReconciled',false));
commit;
SQL
db -f "$tmp/settle.sql" >"$tmp/settled.log"
grep -Fq "$a|f|300|f" "$tmp/settled.log" || { cat "$tmp/settled.log" >&2; exit 12; }
db -f "$tmp/settle.sql" >"$tmp/replay.log"
grep -Fq "$a|t|300|f" "$tmp/replay.log" || { cat "$tmp/replay.log" >&2; exit 13; }
[[ "$(state)" == '1|300|300' ]] || { echo 'FAIL replay double-refunded' >&2; exit 14; }
# C: real PostgreSQL backend termination AFTER bounded admission, BEFORE
# COMMIT. This must rollback both the ledger row and global budget atomically.
db -c "update public.seyeon_ai_governor_daily_budgets_v1
  set global_limit_micro_usd=5000,subject_limit_micro_usd=5000
  where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date" >/dev/null
c='d4a00000-0000-4000-8000-000000000003'
d='d4a00000-0000-4000-8000-000000000004'
{
  printf "set application_name='seyeon_d4a_crash_ci';\n"
  admit "$c"
  printf '\\! touch "%s/crash-ready"\nselect pg_sleep(25);\ncommit;\n' "$tmp"
} >"$tmp/crash.sql"
db -f "$tmp/crash.sql" >"$tmp/crash.log" 2>&1 &
pid=$!
ready=false
for i in $(seq 1 100); do
  if [[ -f "$tmp/crash-ready" ]]; then ready=true; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$tmp/crash.log" >&2; exit 15; fi
# Never evaluate pg_terminate_backend() in a WHERE predicate:
# SQL boolean evaluation order is not a termination-authority boundary.
# First determine the exact backend pid without side effects, then terminate
# that one pid from a distinct superuser test connection.
target_pid="$(db -c "select pid::text from pg_catalog.pg_stat_activity
  where application_name='seyeon_d4a_crash_ci' and pid<>pg_backend_pid()")"
[[ "$target_pid" =~ ^[0-9]+$ ]] || {
  echo "FAIL expected exactly one crash fixture backend PID: $target_pid" >&2
  exit 16
}
terminated="$(db -c "select pg_catalog.pg_terminate_backend($target_pid)")"
[[ "$terminated" == 't' ]] || {
  echo "FAIL failed to terminate intended backend: $target_pid" >&2
  exit 16
}
if wait "$pid" 2>/dev/null; then
  echo 'FAIL terminated transaction unexpectedly committed' >&2; exit 17
fi
pid=''
[[ "$(state)" == '1|300|300' ]] || {
  echo "FAIL backend termination left a phantom reservation: $(state)" >&2
  exit 18
}
sed "s/$a/$c/g" "$tmp/settle.sql" >"$tmp/ghost-settle.sql"
if db -f "$tmp/ghost-settle.sql" >"$tmp/ghost.log" 2>&1; then
  echo 'FAIL uncommitted terminated call was settled' >&2; exit 19
fi
grep -q 'Governed settlement requires an authoritative reserved call' "$tmp/ghost.log" || {
  cat "$tmp/ghost.log" >&2; exit 20
}
{ admit "$d"; printf 'commit;\n'; } >"$tmp/recovered.sql"
db -f "$tmp/recovered.sql" >"$tmp/recovered.log"
grep -Fq "$d|3700" "$tmp/recovered.log" || {
  cat "$tmp/recovered.log" >&2; exit 21
}
[[ "$(state)" == '2|4000|4000' ]] || {
  echo "FAIL new backend cannot recover budget: $(state)" >&2; exit 22
}
# Independent synthetic login remains prohibited from the legacy API role.
if db -c "set session authorization myeongha_seyeon_d4_login_ci;
  set role myeongha_api_executor;" >"$tmp/cross-role.log" 2>&1; then
  echo 'FAIL governed login entered common role' >&2; exit 23
fi
grep -Eiq '(permission denied|not a member)' "$tmp/cross-role.log" || {
  cat "$tmp/cross-role.log" >&2; exit 24
}
echo 'D4A independent sessions: row lock, budget ceiling, replay, crash rollback PASS'
