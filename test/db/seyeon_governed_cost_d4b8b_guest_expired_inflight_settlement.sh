#!/usr/bin/env bash
set -euo pipefail
# D4B-8B: in-flight settlement after Guest expiry; no new Guest auth.
# Watchtower-Track: character-memory
[[ "$PGDATABASE" == 'myeongha_seyeon_d4b8b_test' ]] || exit 2
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
trap 'db -c "drop role if exists myeongha_seyeon_d4_login_ci" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/fixture.log" 2>&1 || {
  cat "$tmp/fixture.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
subject='a0000000-0000-0000-0000-000000000001'
auth='00000000-0000-0000-0000-00000000a001'
session='d4b82000-0000-4000-8000-000000000001'
hash='myeongha-guest-bearer-hmac-sha256-v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
call='d4b82000-0000-4000-8000-000000000011'
turn='a4000000-0000-0000-0000-000000000006'
attempt='a6000000-0000-0000-0000-000000000006'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
db <<SQL >/dev/null
update public.subjects set kind='guest',auth_user_id=null,updated_at=clock_timestamp()
where id='$subject' and auth_user_id='$auth';
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at)
values ('$session','$subject','$hash',clock_timestamp()+interval '4 seconds',clock_timestamp());
SQL
cat >"$tmp/inflight.sql" <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_seyeon_governed_guest_subject_context_v1('$hash');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn','$call','event_extraction',
 'openai-responses','d4-offline-no-network-model','d4-policy-v1','d4-rate-v1',500,800,2500);
commit;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_seyeon_governed_guest_subject_context_v1('$hash');
select pg_sleep(5);
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
commit;
SQL
db -f "$tmp/inflight.sql" >"$tmp/inflight.log" 2>&1 || {
  cat "$tmp/inflight.log" >&2; exit 4;
}
grep -Fq "$call|3700" "$tmp/inflight.log" || exit 5
grep -Fq "$call|f|300|f" "$tmp/inflight.log" || exit 6
if db -c "set session authorization myeongha_seyeon_d4_login_ci;
begin;set local role myeongha_seyeon_governed_executor;
select * from public.begin_seyeon_governed_guest_subject_context_v1('$hash');
commit;" >"$tmp/late-auth.log" 2>&1; then
  echo 'FAIL fresh expired Guest auth succeeded' >&2; exit 7;
fi
grep -Fq '28000' "$tmp/late-auth.log" || {
  cat "$tmp/late-auth.log" >&2; exit 8;
}
state="$(db -c "select count(*),sum(governor_effective_micro_usd),
(select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
where bucket_utc_date='$day') from public.seyeon_ai_call_cost_events
where call_id='$call' and subject_id='$subject'")"
[[ "$state" == '1|300|300' ]] || {
  echo "FAIL in-flight expiry accounting: $state" >&2; exit 9;
}
echo 'D4B-8B already-authorized Guest settlement survives expiry, new Guest auth denied PASS'
