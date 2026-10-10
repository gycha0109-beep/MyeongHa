#!/usr/bin/env bash
set -euo pipefail
# D4B-9: detached worker settles pre-reserved Guest calls after token expiry.
# Watchtower-Track: character-memory; offline synthetic DB ONLY.
[[ "$PGDATABASE" == 'myeongha_seyeon_d4b9_test' ]] || exit 2
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
cleanup() {
 db -c 'drop role if exists myeongha_seyeon_d4b9_worker_login_ci' >/dev/null 2>&1 || true
 db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/fixture.log" 2>&1 || {
 cat "$tmp/fixture.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
subject='a0000000-0000-0000-0000-000000000001'
auth='00000000-0000-0000-0000-00000000a001'
session='d4b90000-0000-4000-8000-000000000001'
hash='myeongha-guest-bearer-hmac-sha256-v1:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
estimated='d4b90000-0000-4000-8000-000000000011'
unknown='d4b90000-0000-4000-8000-000000000012'
turn='a4000000-0000-0000-0000-000000000006'
attempt='a6000000-0000-0000-0000-000000000006'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
db <<SQL >/dev/null
create role myeongha_seyeon_d4b9_worker_login_ci
 login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant myeongha_seyeon_settlement_worker to myeongha_seyeon_d4b9_worker_login_ci;
update public.subjects set kind='guest',auth_user_id=null,updated_at=clock_timestamp()
where id='$subject' and auth_user_id='$auth';
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at)
values ('$session','$subject','$hash',clock_timestamp()+interval '1 day',clock_timestamp());
update public.seyeon_ai_governor_daily_budgets_v1
set global_limit_micro_usd=9000,subject_limit_micro_usd=9000
where bucket_utc_date='$day';
SQL
start() {
 local call="$1"
 cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_seyeon_governed_guest_subject_context_v1('$hash');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn','$call','event_extraction',
 'openai-responses','d4-offline-no-network-model','d4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
}
settle() {
 local call="$1" kind="$2" owner="$3" tid="$4"
 local outcome status http input cached output reasoning price cost
 if [[ "$kind" == estimated ]]; then
   outcome=response_received status=estimated http=200
   input=100 cached=0 output=50 reasoning=0 price="'d4-rate-v1'" cost=300
 else
   outcome=timeout status=usage_unknown http=null
   input=null cached=null output=null reasoning=null price=null cost=null
 fi
 cat <<SQL
set session authorization myeongha_seyeon_d4b9_worker_login_ci;
begin;set local role myeongha_seyeon_settlement_worker;
select call_id,replayed,occupied_micro_usd,over_ceiling
from public.cmd_settle_seyeon_ai_call_detached_v1(
 '$owner','$tid','$attempt','post_turn',
 pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-ai-cost-v1','callId','$call',
 'purpose','event_extraction','providerKey','openai-responses',
 'modelKey','d4-offline-no-network-model','outcome','$outcome',
 'httpStatus',$http,'elapsedMs',8,'inputTokens',$input,
 'cachedInputTokens',$cached,'outputTokens',$output,'reasoningTokens',$reasoning,
 'priceVersion',$price,'estimatedCostMicroUsd',$cost,
 'costStatus','$status','invoiceReconciled',false));
commit;
SQL
}
totals() {
 db -c "select
 (select count(*) from public.seyeon_ai_call_cost_events
 where call_id in ('$estimated','$unknown')),
 (select coalesce(sum(governor_effective_micro_usd),0)
 from public.seyeon_ai_call_cost_events
 where call_id in ('$estimated','$unknown')),
 (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
 where bucket_utc_date='$day')"
}
start "$estimated" >"$tmp/start1.sql"
start "$unknown" >"$tmp/start2.sql"
db -f "$tmp/start1.sql" >"$tmp/start1.log" 2>&1 || { cat "$tmp/start1.log" >&2; exit 4; }
db -f "$tmp/start2.sql" >"$tmp/start2.log" 2>&1 || { cat "$tmp/start2.log" >&2; exit 5; }
[[ "$(totals)" == '2|7400|7400' ]] || {
 echo "FAIL initial reservation: $(totals)" >&2; exit 6;
}
# Expiry before opening the worker's new independent DB session.
db -c "update public.guest_sessions
set expires_at=clock_timestamp()-interval '1 minute'
where id='$session' and subject_id='$subject'" >/dev/null
if db -f "$tmp/start1.sql" >"$tmp/expired.log" 2>&1; then
 echo 'FAIL expired Guest can reserve' >&2; exit 7;
fi
grep -Fq '28000' "$tmp/expired.log" || { cat "$tmp/expired.log" >&2; exit 8; }
# Role separation, no raw ledger, no new paid dispatch.
if db -c "set session authorization myeongha_seyeon_d4b9_worker_login_ci;
set role myeongha_seyeon_governed_executor;" >"$tmp/role-cross.log" 2>&1; then
 echo 'FAIL worker can become governed user' >&2; exit 9;
fi
grep -Fq '42501' "$tmp/role-cross.log" || { cat "$tmp/role-cross.log" >&2; exit 10; }
if db -c "set session authorization myeongha_seyeon_d4b9_worker_login_ci;
begin;set local role myeongha_seyeon_settlement_worker;
select count(*) from public.seyeon_ai_call_cost_events;
commit;" >"$tmp/ledger.log" 2>&1; then
 echo 'FAIL worker read personal ledger' >&2; exit 11;
fi
grep -Fq '42501' "$tmp/ledger.log" || { cat "$tmp/ledger.log" >&2; exit 12; }
if db -c "set session authorization myeongha_seyeon_d4b9_worker_login_ci;
begin;set local role myeongha_seyeon_settlement_worker;
select * from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn',
 'd4b90000-0000-4000-8000-000000000099','event_extraction',
 'openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;" >"$tmp/start-denied.log" 2>&1; then
 echo 'FAIL worker started paid AI call' >&2; exit 13;
fi
grep -Fq '42501' "$tmp/start-denied.log" || {
 cat "$tmp/start-denied.log" >&2; exit 14;
}
settle "$estimated" estimated "$subject" "$turn" >"$tmp/settle1.sql"
settle "$unknown" usage_unknown "$subject" "$turn" >"$tmp/settle2.sql"
db -f "$tmp/settle1.sql" >"$tmp/settle1.log" 2>&1 || { cat "$tmp/settle1.log" >&2; exit 15; }
db -f "$tmp/settle2.sql" >"$tmp/settle2.log" 2>&1 || { cat "$tmp/settle2.log" >&2; exit 16; }
grep -Fq "$estimated|f|300|f" "$tmp/settle1.log" || { cat "$tmp/settle1.log" >&2; exit 17; }
grep -Fq "$unknown|f|3700|f" "$tmp/settle2.log" || { cat "$tmp/settle2.log" >&2; exit 18; }
[[ "$(totals)" == '2|4000|4000' ]] || { echo "FAIL settlement: $(totals)" >&2; exit 19; }
db -f "$tmp/settle1.sql" >"$tmp/replay1.log" 2>&1 || { cat "$tmp/replay1.log" >&2; exit 20; }
db -f "$tmp/settle2.sql" >"$tmp/replay2.log" 2>&1 || { cat "$tmp/replay2.log" >&2; exit 21; }
grep -Fq "$estimated|t|300|f" "$tmp/replay1.log" || exit 22
grep -Fq "$unknown|t|3700|f" "$tmp/replay2.log" || exit 23
# Wrong Subject, Turn, and invented Call remain fail-closed.
settle "$estimated" estimated '00000000-0000-0000-0000-000000000099' "$turn" >"$tmp/foreign.sql"
settle "$estimated" estimated "$subject" '00000000-0000-0000-0000-000000000099' >"$tmp/wrong-turn.sql"
settle 'd4b90000-0000-4000-8000-000000000099' estimated "$subject" "$turn" >"$tmp/ghost.sql"
for label in foreign wrong-turn ghost; do
 if db -f "$tmp/$label.sql" >"$tmp/$label.log" 2>&1; then
   echo "FAIL accepted $label" >&2; exit 24;
 fi
 grep -Fq 'seyeon_detached_settlement_not_reserved' "$tmp/$label.log" || {
   cat "$tmp/$label.log" >&2; exit 25;
 }
done
[[ "$(totals)" == '2|4000|4000' ]] || {
 echo "FAIL forged settlement altered ledger: $(totals)" >&2; exit 26;
}
echo 'D4B-9 expired Guest detached worker settlement, replay, isolation PASS'
