#!/usr/bin/env bash
set -euo pipefail
# D4B-10G: disposable PostgreSQL only; never Production, never Provider network.
# Watchtower-Track: character-memory
[[ "${PGDATABASE:-}" == 'myeongha_seyeon_d4b10g_test' ]] || exit 2
[[ "${CI:-}" == 'true' ]] || { echo 'Refuse non-CI actual driver integration' >&2; exit 2; }
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
cleanup(){
  db -c 'drop role if exists myeongha_seyeon_settlement_login' >/dev/null 2>&1 || true
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
auth='00000000-0000-0000-0000-00000000a001'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
db <<SQL >/dev/null
create role myeongha_seyeon_settlement_login
  login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant myeongha_seyeon_settlement_worker to myeongha_seyeon_settlement_login;
update public.seyeon_ai_governor_daily_budgets_v1
set global_limit_micro_usd=20000,subject_limit_micro_usd=20000
where bucket_utc_date='$day';
SQL
provider_event(){
  local call="$1" kind="$2"
  local outcome status http input cached output reasoning cost
  if [[ "$kind" == estimated ]]; then
    outcome=response_received status=estimated http=200
    input=100 cached=0 output=50 reasoning=0 cost=300
  else
    outcome=timeout status=usage_unknown http=null
    input=null cached=null output=null reasoning=null cost=null
  fi
  cat <<SQL
pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-ai-cost-v1','callId','$call',
 'purpose','event_extraction','providerKey','openai-responses',
 'modelKey','d4-offline-no-network-model','outcome','$outcome',
 'httpStatus',$http,'elapsedMs',8,'inputTokens',$input,
 'cachedInputTokens',$cached,'outputTokens',$output,
 'reasoningTokens',$reasoning,'priceVersion','d4-rate-v1',
 'estimatedCostMicroUsd',$cost,'costStatus','$status',
 'invoiceReconciled',false)
SQL
}
admit_and_store(){
  local call="$1" kind="$2"
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select call_id from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn','$call',
 'event_extraction','openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select call_id from public.cmd_store_seyeon_provider_receipt_v1(
 '$subject','$turn','$attempt','post_turn',$(provider_event "$call" "$kind"));
commit;
SQL
}
for item in "d4f00000-0000-4000-8000-000000000011 estimated" \
            "d4f00000-0000-4000-8000-000000000012 unknown" \
            "d4f00000-0000-4000-8000-000000000013 estimated"; do
  read -r call kind <<< "$item"
  admit_and_store "$call" "$kind" >"$tmp/$kind-$call.sql"
  db -f "$tmp/$kind-$call.sql" >"$tmp/$kind-$call.log" 2>&1 || {
    cat "$tmp/$kind-$call.log" >&2; exit 4;
  }
done
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1")" == 3 ]] || exit 5
[[ "$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date='$day'")" == 11100 ]] || exit 6

SEYEON_DETACHED_REAL_DB_TEST=1 \
  ./node_modules/.bin/vitest run test/seyeon-detached-worker-real-postgres.test.ts --maxWorkers=1

[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1 where acked_at is not null")" == 3 ]] || exit 7
[[ "$(db -c "select count(*) from public.seyeon_ai_call_cost_events
  where call_id::text like 'd4f00000-%' and lifecycle_state='settled'")" == 3 ]] || exit 8
[[ "$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date='$day'")" == 4300 ]] || exit 9
echo 'D4B-10G real TypeScript PostgreSQL driver, exact receipt, lost COMMIT, replay and ACK PASS'
