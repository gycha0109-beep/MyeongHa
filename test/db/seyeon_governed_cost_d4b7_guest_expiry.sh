#!/usr/bin/env bash
set -euo pipefail
# D4B-7: real time expiry AFTER governed Guest proof, BEFORE budget admission.
# Isolated synthetic PostgreSQL; no external calls.
# Watchtower-Track: character-memory
[[ "$PGDATABASE" == 'myeongha_seyeon_d4b7_test' ]] || exit 2
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
cleanup() {
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
guest='d4b70000-0000-4000-8000-000000000001'
hash='myeongha-guest-bearer-hmac-sha256-v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
call='d4b70000-0000-4000-8000-000000000011'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
db <<SQL >/dev/null
update public.subjects set kind='guest',auth_user_id=null,updated_at=clock_timestamp()
 where id='$subject' and auth_user_id='$auth';
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at)
 values ('$guest','$subject','$hash',
  clock_timestamp()+interval '2 seconds',clock_timestamp());
SQL
cat >"$tmp/expiry.sql" <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_seyeon_governed_guest_subject_context_v1('$hash');
\\! touch "$tmp/resolved"
select pg_sleep(3);
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','a4000000-0000-0000-0000-000000000006',
 'a6000000-0000-0000-0000-000000000006','post_turn','$call',
 'event_extraction','openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
if db -f "$tmp/expiry.sql" >"$tmp/expiry.log" 2>&1; then
  echo 'BLOCKER: expired Guest proof approved NEW paid reservation after expiry' >&2
  cat "$tmp/expiry.log" >&2
  exit 4
fi
grep -Eq '28000|23514' "$tmp/expiry.log" || {
  cat "$tmp/expiry.log" >&2; exit 5;
}
state="$(db -c "select count(*),
  (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
   where bucket_utc_date='$day')
  from public.seyeon_ai_call_cost_events where call_id='$call'")"
[[ "$state" == '0|0' ]] || {
  echo "FAIL expired proof retained partial charged reservation: $state" >&2
  exit 6
}
echo 'D4B-7 Guest expiry during pre-admission delay rejects paid request PASS'
