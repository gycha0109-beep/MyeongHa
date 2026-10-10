#!/usr/bin/env bash
set -euo pipefail
# Real Guest->Member promotion while an already-resolved Guest waits for
# governed budget admission. Disposable synthetic PostgreSQL only.
# Watchtower-Track: character-memory
[[ "$PGDATABASE" == 'myeongha_seyeon_d4b6_test' ]] || exit 2
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
holder='' waiter='' promoter=''
cleanup() {
  if [[ -p "$tmp/release" ]]; then
    (printf 'release\n' >"$tmp/release") >/dev/null 2>&1 &
    local x=$!; sleep 0.05; kill "$x" 2>/dev/null || true
  fi
  for x in "$holder" "$waiter" "$promoter"; do
    if [[ -n "$x" ]]; then kill "$x" 2>/dev/null || true; wait "$x" 2>/dev/null || true; fi
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
auth='00000000-0000-0000-0000-00000000a001'
guest='d4b60000-0000-4000-8000-000000000001'
hash='myeongha-guest-bearer-hmac-sha256-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
pre='d4b60000-0000-4000-8000-000000000011'
stale='d4b60000-0000-4000-8000-000000000012'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
db <<SQL >/dev/null
update public.subjects
  set kind='guest',auth_user_id=null,updated_at=clock_timestamp()
  where id='$subject' and auth_user_id='$auth';
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at)
values ('$guest','$subject','$hash',clock_timestamp()+interval '1 day',clock_timestamp());
update public.seyeon_ai_governor_daily_budgets_v1
  set global_limit_micro_usd=8000,subject_limit_micro_usd=8000
  where bucket_utc_date='$day';
SQL
guest_start() {
  local id="$1"
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id,subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$hash');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','a4000000-0000-0000-0000-000000000006',
 'a6000000-0000-0000-0000-000000000006','post_turn','$id',
 'event_extraction','openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
}
guest_start "$pre" >"$tmp/pre.sql"
db -f "$tmp/pre.sql" >"$tmp/pre.log" 2>&1 || {
  cat "$tmp/pre.log" >&2; exit 4;
}
grep -Fq "$pre|3700" "$tmp/pre.log" || { cat "$tmp/pre.log" >&2; exit 5; }
mkfifo "$tmp/release"
cat >"$tmp/holder.sql" <<SQL
set application_name='seyeon_d4b6_global_holder';
begin;
select bucket_utc_date from public.seyeon_ai_governor_daily_budgets_v1
where bucket_utc_date='$day' for update;
\\! touch "$tmp/ready"
\\! cat "$tmp/release" >/dev/null
commit;
SQL
db -f "$tmp/holder.sql" >"$tmp/holder.log" 2>&1 &
holder=$!
ready=false
for i in $(seq 1 120); do
  if [[ -f "$tmp/ready" ]]; then ready=true; break; fi
  if ! kill -0 "$holder" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$ready" == true ]] || { cat "$tmp/holder.log" >&2; exit 6; }
{ echo "set application_name='seyeon_d4b6_stale_guest';";
  echo "set statement_timeout='15s';";
  guest_start "$stale"; } >"$tmp/stale.sql"
db -f "$tmp/stale.sql" >"$tmp/stale.log" 2>&1 &
waiter=$!
blocked=false
for i in $(seq 1 120); do
  n="$(db -c "select count(*) from pg_catalog.pg_stat_activity
    where application_name='seyeon_d4b6_stale_guest'
      and wait_event_type='Lock'")"
  if [[ "$n" == 1 ]]; then blocked=true; break; fi
  if ! kill -0 "$waiter" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$blocked" == true ]] || {
  echo 'FAIL Guest was not blocked on the live daily budget lock' >&2
  cat "$tmp/stale.log" >&2; exit 7;
}
cat >"$tmp/promote.sql" <<SQL
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_guest_subject_context_v1('$hash');
select subject_id,subject_kind,subject_status,replayed
  from public.cmd_promote_guest_runtime_v1('$subject','$guest','$auth');
commit;
SQL
# A validated Guest cost call already owns the canonical Subject SHARE lock.
# Promotion must now WAIT (not commit early), despite a concurrent budget lock.
{
  echo "set application_name='seyeon_d4b6_promotion_wait';"
  echo "set statement_timeout='15s';"
  cat "$tmp/promote.sql"
} >"$tmp/promote-wait.sql"
db -f "$tmp/promote-wait.sql" >"$tmp/promote.log" 2>&1 &
promoter=$!
promoting=false
for i in $(seq 1 120); do
  n="$(db -c "select count(*) from pg_catalog.pg_stat_activity
    where application_name='seyeon_d4b6_promotion_wait'
      and wait_event_type='Lock'")"
  if [[ "$n" == 1 ]]; then promoting=true; break; fi
  if ! kill -0 "$promoter" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$promoting" == true ]] || {
  echo 'FAIL Member promotion did not wait for prior governed Guest proof' >&2
  cat "$tmp/promote.log" >&2; exit 8;
}
[[ "$(db -c "select kind from public.subjects where id='$subject'")" == 'guest' ]] || {
  echo 'FAIL promotion became visible before original Guest cost finished' >&2
  exit 9;
}
# Release the global budget: the already-authorized Guest admission commits
# BEFORE membership changes; this is serial order, not stale authorization.
printf 'release\n' >"$tmp/release"
wait "$holder" || { cat "$tmp/holder.log" >&2; exit 10; }
holder=''
if ! wait "$waiter"; then
  echo 'FAIL valid Guest request denied before Member promotion could commit' >&2
  cat "$tmp/stale.log" >&2; exit 11;
fi
waiter=''
grep -Fq "$stale|3700" "$tmp/stale.log" || {
  cat "$tmp/stale.log" >&2; exit 12;
}
if ! wait "$promoter"; then
  echo 'FAIL promotion could not finish after Guest reservation COMMIT' >&2
  cat "$tmp/promote.log" >&2; exit 13;
fi
promoter=''
grep -Fq "$subject|member|active|f" "$tmp/promote.log" || {
  cat "$tmp/promote.log" >&2; exit 14;
}
cat >"$tmp/expired.sql" <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_seyeon_governed_guest_subject_context_v1('$hash');
rollback;
SQL
if db -f "$tmp/expired.sql" >"$tmp/expired.log" 2>&1; then
  echo 'FAIL consumed Guest credential still resolves' >&2; exit 15;
fi
grep -Fq '28000' "$tmp/expired.log" || {
  cat "$tmp/expired.log" >&2; exit 16;
}
member="$(db -c "set session authorization myeongha_seyeon_d4_login_ci;
begin; set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
commit;")"
[[ "$member" == "$subject" ]] || {
  echo 'FAIL canonical Subject changed during promotion' >&2; exit 17;
}
state="$(db -c "select count(*),sum(governor_effective_micro_usd),
 (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date='$day')
 from public.seyeon_ai_call_cost_events where call_id in ('$pre','$stale')")"
[[ "$state" == '2|7400|7400' ]] || {
  echo "FAIL Guest->Member changed charge ledger: $state" >&2; exit 18;
}
if db -c "set session authorization myeongha_seyeon_d4_login_ci;
  set role myeongha_seyeon_governed_executor;
  select * from public.begin_guest_subject_context_v1('$hash');" >"$tmp/old-role.log" 2>&1; then
  echo 'FAIL old unlocked Guest resolver still callable by governed role' >&2; exit 19;
fi
grep -Fq '42501' "$tmp/old-role.log" || {
  cat "$tmp/old-role.log" >&2; exit 20;
}
echo 'D4B-6 Guest-before-Member serialization, stale proof denial and exact ledger PASS'
