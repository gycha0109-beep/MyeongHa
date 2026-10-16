#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: character-memory
# Real two-session PG Attempt-lock race for TEST-ONLY R1 SourceSet XOR.
# No production DDL, real model, public route or G0 approval.
if [[ "$CI" != true || "$PGHOST" != localhost ||
  "$PGDATABASE" != myeongha_seyeon_positive_pin_candidate_test ]]; then
  echo 'FAIL: R1 race requires named disposable CI PostgreSQL DB' >&2
  exit 2
fi
db() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL R1 race: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
pid_a='' pid_b=''
cleanup() {
  for pid in "$pid_a" "$pid_b"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmp"
}
trap cleanup EXIT

subject='d2000000-0000-4000-8000-000000000001'
thread='d4000000-0000-4000-8000-000000000001'
thread_zero='d4000000-0000-4000-8000-000000000002'
turn_positive='d7000000-0000-4000-8000-000000000001'
attempt_positive='d7200000-0000-4000-8000-000000000001'
turn_zero='d7000000-0000-4000-8000-000000000002'
attempt_zero='d7200000-0000-4000-8000-000000000002'
selection='sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
sources='[{"recordId":"d5000000-0000-4000-8000-000000000001","grantId":"d6000000-0000-4000-8000-000000000001"},{"recordId":"d5000000-0000-4000-8000-000000000002","grantId":"d6000000-0000-4000-8000-000000000002"}]'

# A NEW isolated thread is required: the original Positive Turn is still
# running, and the core receive command forbids a second in-flight Turn on
# the same thread. Do not bypass this production invariant.
db <<SQL >"$tmp/setup.log"
insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,active_content_release_id,
  active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
) values (
  '$thread_zero','$subject','single_character','active',
  'offline-r1-zero-first-independent-thread',
  'd3100000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  0,1,clock_timestamp(),clock_timestamp()
);
insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
  'd4100000-0000-4000-8000-000000000002',
  '$thread_zero','seyeon',
  'd3000000-0000-4000-8000-000000000001',
  'primary',clock_timestamp()-interval '1 minute'
);

select * from public.cmd_receive_chat_turn_v1(
  '$subject','$thread_zero','synthetic-r1-zero-first-attempt',
  'sha256:v1:synthetic-r1-zero-first','chat-request-v1',
  '{"clientTurnId":"synthetic-r1-zero-first-attempt","text":"synthetic only","clientCapability":"0.0.1-dev"}'::jsonb,
  'd3100000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  '$turn_zero','d7100000-0000-4000-8000-000000000002',
  'synthetic only',null,'sha256:v1:synthetic-r1-zero-first-user'
);
select * from public.cmd_allocate_chat_turn_attempt_v1(
  '$subject','$turn_zero','$attempt_zero','seyeon-production-chat-planner-v1'
);
SQL
[[ "$(db -c "select count(*) from public.chat_turn_attempts where id='$attempt_zero' and state='running'")" == 1 ]] ||
  fail 'new zero-first Attempt not running'
[[ "$(db -c "select count(*) from seyeon_positive_candidate.source_sets_r1 where attempt_id='$attempt_positive'")" == 1 ]] ||
  fail 'original positive Parent missing'

await_file() {
  local f="$1" pid="$2"
  for _ in $(seq 1 160); do
    [[ -f "$f" ]] && return 0
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.05
  done
  fail "lock holder never reached barrier $f"
}
await_lock_wait() {
  local label="$1" pid="$2" count
  for _ in $(seq 1 160); do
    count="$(db -c "select count(*) from pg_catalog.pg_stat_activity where application_name='$label' and wait_event_type='Lock'")"
    [[ "$count" == 1 ]] && return 0
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.05
  done
  fail "independent backend did not block on actual PostgreSQL lock: $label"
}
finish() {
  local pid="$1" logfile="$2"
  if ! wait "$pid"; then
    cat "$logfile" >&2
    fail 'independent PostgreSQL transaction failed'
  fi
}

# POSITIVE FIRST: exact original Grant recheck holds Attempt FOR UPDATE;
# Zero writer must actually WAIT, then receive a 23514 guard rejection.
mkfifo "$tmp/positive-release"
db >"$tmp/positive-a.log" 2>&1 <<SQL &
set application_name='seyeon_r1_positive_holder';
set statement_timeout='15s';
begin;
set local role myeongha_api_executor;
set local myeongha.subject_id='$subject';
select seyeon_positive_candidate.pin_source_set_r1(
  '$subject','$thread','$turn_positive','$attempt_positive',
  '$sources'::jsonb,'$selection'
);
\! touch "$tmp/positive-ready"
\! cat "$tmp/positive-release" > /dev/null
commit;
SQL
pid_a=$!
await_file "$tmp/positive-ready" "$pid_a"
db >"$tmp/zero-b.log" 2>&1 <<SQL &
set application_name='seyeon_r1_zero_after_positive';
set statement_timeout='15s';
do \$zero_after_positive\$
declare v_constraint text;
begin
  begin
    update public.chat_turn_attempts
    set seyeon_personal_source_pin_jsonb='{"fixture":"forbidden"}'::jsonb,
        seyeon_personal_source_pinned_at=clock_timestamp()
    where id='$attempt_positive';
    raise exception 'unexpected zero-after-positive accepted';
  exception when check_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint <> 'seyeon_offline_r1_zero_positive_xor' then raise; end if;
    raise notice 'R1_POSITIVE_FIRST_HELD';
  end;
end \$zero_after_positive\$;
SQL
pid_b=$!
await_lock_wait 'seyeon_r1_zero_after_positive' "$pid_b"
printf 'release\n' >"$tmp/positive-release"
finish "$pid_a" "$tmp/positive-a.log"; pid_a=''
finish "$pid_b" "$tmp/zero-b.log"; pid_b=''
grep -Fxq 't' "$tmp/positive-a.log" || { cat "$tmp/positive-a.log" >&2; fail 'positive Grant recheck did not pass'; }
grep -Fq 'R1_POSITIVE_FIRST_HELD' "$tmp/zero-b.log" ||
  { cat "$tmp/zero-b.log" >&2; fail 'Zero writer was not denied after lock wait'; }
[[ "$(db -c "select count(*) from public.chat_turn_attempts where id='$attempt_positive' and seyeon_personal_source_pin_jsonb is not null")" == 0 ]] ||
  fail 'positive-first unexpectedly set zero pin'
echo 'PASS R1 two-session positive-first: Zero writer waited and was HELD'

# ZERO FIRST: the legacy zero field is written in a different Attempt under
# an open PG transaction. Positive RPC must WAIT and, after Zero commits, HOLD.
mkfifo "$tmp/zero-release"
db >"$tmp/zero-a.log" 2>&1 <<SQL &
set application_name='seyeon_r1_zero_holder';
set statement_timeout='15s';
begin;
update public.chat_turn_attempts
set seyeon_personal_source_pin_jsonb='{"fixture":"untrusted-test-zero-only"}'::jsonb,
    seyeon_personal_source_pinned_at=clock_timestamp()
where id='$attempt_zero';
\! touch "$tmp/zero-ready"
\! cat "$tmp/zero-release" > /dev/null
commit;
SQL
pid_a=$!
await_file "$tmp/zero-ready" "$pid_a"
db >"$tmp/positive-b.log" 2>&1 <<SQL &
set application_name='seyeon_r1_positive_after_zero';
set statement_timeout='15s';
begin;
set local role myeongha_api_executor;
set local myeongha.subject_id='$subject';
select seyeon_positive_candidate.pin_source_set_r1(
  '$subject','$thread_zero','$turn_zero','$attempt_zero',
  '$sources'::jsonb,'$selection'
);
commit;
SQL
pid_b=$!
await_lock_wait 'seyeon_r1_positive_after_zero' "$pid_b"
printf 'release\n' >"$tmp/zero-release"
finish "$pid_a" "$tmp/zero-a.log"; pid_a=''
finish "$pid_b" "$tmp/positive-b.log"; pid_b=''
grep -Fxq 'f' "$tmp/positive-b.log" || { cat "$tmp/positive-b.log" >&2; fail 'positive Pin allowed existing Zero'; }
[[ "$(db -c "select count(*) from seyeon_positive_candidate.source_sets_r1 where attempt_id='$attempt_zero'")" == 0 ]] ||
  fail 'zero-first unexpectedly persisted positive Parent'
[[ "$(db -c "select count(*) from public.chat_turn_attempts where id='$attempt_zero' and seyeon_personal_source_pin_jsonb is not null")" == 1 ]] ||
  fail 'zero-first did not commit the synthetic Zero field'
echo 'PASS R1 two-session zero-first: Positive writer waited and was HELD'
echo 'PASS R1 two independent PG lock waits on real Attempt with bidirectional test-only XOR; no Production G1/G2/G3'
