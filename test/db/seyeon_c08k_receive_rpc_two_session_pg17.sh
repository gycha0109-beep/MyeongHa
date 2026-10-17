#!/usr/bin/env bash
set -euo pipefail
# C08-K: two real PG17 backends; only disposable C08 databases.
if [[ "$PGDATABASE" != myeongha_c08_local_case_1 ]]; then
  [[ "$GITHUB_ACTIONS" == true && "$CI" == true &&
     "$DB_SUITE" == postgres17 && "$PGHOST" == localhost &&
     "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
    echo HOLD_C08K_DISPOSABLE_DB_REQUIRED >&2; exit 1;
  }
fi
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || {
  echo HOLD_C08K_PG17_REQUIRED >&2; exit 1;
}
# C08-M demands the actual governed production Commit wrapper, not an
# unavailable EXECUTE privilege or a caller-held direct INSERT workaround.
commit_acl="$(psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -c "
select pg_catalog.has_function_privilege(
  'myeongha_api_executor',
  'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)',
  'EXECUTE'),
  pg_catalog.has_table_privilege('myeongha_api_executor','public.conversation_messages','INSERT');")"
[[ "$commit_acl" == 't|f' ]] || {
  echo "HOLD_C08M_REAL_COMMIT_WRAPPER_ROLE_ACL: $commit_acl" >&2; exit 1;
}

# The second Subject/thread from the C08-I fixture has no prior messages.
subject=68100000-0000-0000-0000-000000000002
thread=68400000-0000-0000-0000-000000000002
first_msg=68800000-0000-0000-0000-000000000010
first_turn=68600000-0000-0000-0000-000000000010
second_msg=68800000-0000-0000-0000-000000000011
second_turn=68600000-0000-0000-0000-000000000011
first="$(psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -c "
select turn_id,message_id,sequence_no,replayed from public.cmd_receive_chat_turn_v1(
 '$subject','$thread','c08k-first','sha256:v1:'||repeat('1',64),
 'v1','{\"text\":\"C08K first\"}'::jsonb,
 '68300000-0000-0000-0000-000000000001',
 '68200000-0000-0000-0000-000000000001',
 '$first_turn','$first_msg','C08K synthetic first',null,'sha256:v1:'||repeat('2',64));")"
[[ "$first" == "$first_turn|$first_msg|1|f" ]] || {
  echo "HOLD_C08K_FIRST_REAL_RECEIVE: $first" >&2; exit 1;
}
echo PASS_C08K_FIRST_USER_MESSAGE_VIA_REAL_RECEIVE_RPC

dir="$(mktemp -d /tmp/myeongha-c08k-receive-XXXXXXXX)"
reader_pid=''
cleanup() {
  if [[ -n "$reader_pid" ]]; then
    kill "$reader_pid" 2>/dev/null || true
    wait "$reader_pid" 2>/dev/null || true
  fi
  rm -rf "$dir"
}
trap cleanup EXIT
# A: same READ COMMITTED transaction, actual owner-bound executor/SELECT.
(
timeout 40 psql -X -qAt -v ON_ERROR_STOP=1 >"$dir/reader.log" 2>&1 <<SQL
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('68000000-0000-0000-0000-000000000002');
\o $dir/reader_pid
select pg_backend_pid();
\o
\o $dir/before
with t as materialized (
 select thread_id,status,participant_character_ids from
 public.qry_chat_thread_runtime_binding_v1('$subject'::uuid,'$thread'::uuid)
), m as materialized (
 select id,sequence_no,sender_type,redacted_at from public.conversation_messages
 where subject_id='$subject'::uuid and thread_id='$thread'::uuid
 order by sequence_no limit 2
)
select t.status,array_to_string(t.participant_character_ids,','),
 (select count(*)::text from m),
 coalesce((select (id='$first_msg'::uuid and sender_type='user' and redacted_at is null)
 from m order by sequence_no desc limit 1),false) from t;
\o
\! touch $dir/reader_ready
\! timeout 25 sh -c 'until test -f "$dir/writer_committed"; do sleep 0.05; done'
-- C08-M: A's last Census was 1. B has now committed a second real Receive
-- after the first Turn's governed abandon. WITHOUT another Census, A attempts
-- the ACTUAL production Commit v2 with its obsolete first Attempt. The DB
-- state machine must reject the stale validated-commit claim in THIS SAME
-- READ COMMITTED session, even though Census itself held no durable lock.
DO \$c08m\$
declare v_constraint text;
begin
  begin
    perform * from public.cmd_commit_seyeon_chat_turn_runtime_v2(
      '$subject'::uuid,
      '$thread'::uuid,
      '$first_turn'::uuid,
      '68600000-0000-0000-0000-000000000020'::uuid,
      '68800000-0000-0000-0000-000000000055'::uuid,
      '68700000-0000-0000-0000-000000000056'::uuid,
      '68700000-0000-0000-0000-000000000057'::uuid,
      jsonb_build_object(
        'schemaVersion','seyeon-post-turn-analysis-snapshot-v1',
        'turnId','$first_turn',
        'userMessageId','$first_msg',
        'assistantMessageId','68800000-0000-0000-0000-000000000055'),
      'sha256:v1:'||repeat('c',64));
    raise exception 'HOLD_C08M_STALE_ATTEMPT_WAS_COMMITTED';
  exception when others then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint is distinct from 'cmd_chat_commit_not_validated' then
      raise;
    end if;
  end;
end \$c08m\$;
\o $dir/c08m_commit_denied
select 'PASS_C08M_ACTUAL_COMMIT_V2_DENIES_STALE_ATTEMPT_AFTER_REAL_RECEIVE';
\o
\o $dir/after
with t as materialized (
 select thread_id,status,participant_character_ids from
 public.qry_chat_thread_runtime_binding_v1('$subject'::uuid,'$thread'::uuid)
), m as materialized (
 select id,sequence_no,sender_type,redacted_at from public.conversation_messages
 where subject_id='$subject'::uuid and thread_id='$thread'::uuid
 order by sequence_no limit 2
)
select t.status,array_to_string(t.participant_character_ids,','),
 (select count(*)::text from m),
 coalesce((select (id='$first_msg'::uuid and sender_type='user' and redacted_at is null)
 from m order by sequence_no desc limit 1),false) from t;
\o
ROLLBACK;
SQL
) &
reader_pid=$!
ready=false
for _ in $(seq 1 300); do
  if [[ -f "$dir/reader_ready" ]]; then ready=true; break; fi
  if ! kill -0 "$reader_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$ready" == true && "$(cat "$dir/before")" == 'active|seyeon|1|t' ]] || {
  echo HOLD_C08K_FIRST_CENSUS_NOT_READY >&2
  cat "$dir/reader.log" >&2; exit 1;
}

# B: actual receive RPC must reject while the first turn is RECEIVED and
# FAILED_RETRYABLE. Retry and abandon are the real DB state-machine commands.
# All operations happen in one independent PostgreSQL backend/transaction.
if ! psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose >"$dir/writer.log" 2>&1 <<'SQL'
BEGIN;
select 'C08K_WRITER_BACKEND|'||pg_backend_pid();
DO $c08k$
declare v_constraint text; v_seq bigint;
begin
  begin
    perform * from public.cmd_receive_chat_turn_v1(
      '68100000-0000-0000-0000-000000000002',
      '68400000-0000-0000-0000-000000000002',
      'c08k-second','sha256:v1:'||repeat('3',64),
      'v1','{"text":"C08K second"}'::jsonb,
      '68300000-0000-0000-0000-000000000001',
      '68200000-0000-0000-0000-000000000001',
      '68600000-0000-0000-0000-000000000011',
      '68800000-0000-0000-0000-000000000011',
      'C08K synthetic second',null,'sha256:v1:'||repeat('4',64));
    raise exception 'unexpected second receive success';
  exception when others then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint is distinct from 'cmd_chat_receive_turn_in_flight' then raise; end if;
  end;
  perform * from public.cmd_allocate_chat_turn_attempt_v1(
    '68100000-0000-0000-0000-000000000002',
    '68600000-0000-0000-0000-000000000010',
    '68600000-0000-0000-0000-000000000020','c08k-planner');
  perform public.cmd_mark_chat_turn_failed_v1(
    '68100000-0000-0000-0000-000000000002',
    '68600000-0000-0000-0000-000000000010',
    '68600000-0000-0000-0000-000000000020',
    'failed_retryable','C08K_SYNTHETIC_RETRY');
  begin
    perform * from public.cmd_receive_chat_turn_v1(
      '68100000-0000-0000-0000-000000000002',
      '68400000-0000-0000-0000-000000000002',
      'c08k-second','sha256:v1:'||repeat('3',64),
      'v1','{"text":"C08K second"}'::jsonb,
      '68300000-0000-0000-0000-000000000001',
      '68200000-0000-0000-0000-000000000001',
      '68600000-0000-0000-0000-000000000011',
      '68800000-0000-0000-0000-000000000011',
      'C08K synthetic second',null,'sha256:v1:'||repeat('4',64));
    raise exception 'failed-retryable unexpectedly admitted';
  exception when others then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint is distinct from 'cmd_chat_receive_turn_in_flight' then raise; end if;
  end;
  perform * from public.cmd_retry_chat_turn_attempt_v1(
    '68100000-0000-0000-0000-000000000002',
    '68600000-0000-0000-0000-000000000010',
    '68600000-0000-0000-0000-000000000021','c08k-retry');
  perform public.cmd_mark_chat_turn_failed_v1(
    '68100000-0000-0000-0000-000000000002',
    '68600000-0000-0000-0000-000000000010',
    '68600000-0000-0000-0000-000000000021',
    'failed_retryable','C08K_SYNTHETIC_RETRY_2');
  perform public.cmd_abandon_chat_turn_v1(
    '68100000-0000-0000-0000-000000000002',
    '68600000-0000-0000-0000-000000000010');
  select next_sequence_no into v_seq from public.conversation_threads
   where id='68400000-0000-0000-0000-000000000002';
  if v_seq <> 2 then raise exception 'rejected receives consumed sequence'; end if;
end $c08k$;
select turn_id,message_id,sequence_no,replayed
from public.cmd_receive_chat_turn_v1(
 '68100000-0000-0000-0000-000000000002',
 '68400000-0000-0000-0000-000000000002',
 'c08k-second','sha256:v1:'||repeat('3',64),
 'v1','{"text":"C08K second"}'::jsonb,
 '68300000-0000-0000-0000-000000000001',
 '68200000-0000-0000-0000-000000000001',
 '68600000-0000-0000-0000-000000000011',
 '68800000-0000-0000-0000-000000000011',
 'C08K synthetic second',null,'sha256:v1:'||repeat('4',64));
COMMIT;
SQL
then
  echo HOLD_C08K_WRITER_REAL_RPC_FAILED >&2
  cat "$dir/writer.log" >&2; exit 1;
fi
reader_backend="$(cat "$dir/reader_pid")"
writer_backend="$(sed -n 's/^C08K_WRITER_BACKEND|//p' "$dir/writer.log")"
[[ "$reader_backend" =~ ^[0-9]+$ && "$writer_backend" =~ ^[0-9]+$ &&
   "$reader_backend" != "$writer_backend" ]] || {
  echo HOLD_C08K_INDEPENDENT_BACKENDS_REQUIRED >&2; exit 1;
}
grep -Fq "$second_turn|$second_msg|2|f" "$dir/writer.log" || {
  echo HOLD_C08K_SECOND_RECEIVE_NOT_COMMITTED >&2; exit 1;
}
touch "$dir/writer_committed"
wait "$reader_pid" || {
  echo HOLD_C08K_READER_RECHECK_FAILURE >&2
  cat "$dir/reader.log" >&2; exit 1;
}
reader_pid=''
[[ "$(cat "$dir/c08m_commit_denied")" ==
   'PASS_C08M_ACTUAL_COMMIT_V2_DENIES_STALE_ATTEMPT_AFTER_REAL_RECEIVE' ]] || {
  echo HOLD_C08M_STALE_COMMIT_REJECTION_NOT_PROVEN >&2; exit 1;
}
[[ "$(cat "$dir/after")" == 'active|seyeon|2|f' ]] || {
  echo HOLD_C08K_STALE_FIRST_CONTACT_AFTER_RPC >&2; exit 1;
}
echo PASS_C08K_TWO_PG17_BACKENDS_REAL_RPC_RECEIVE_RACE
echo PASS_C08K_IN_FLIGHT_RETRYABLE_AND_RETRY_BLOCK_SECOND_RECEIVE

replay="$(psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -c "
select turn_id,message_id,sequence_no,replayed from public.cmd_receive_chat_turn_v1(
 '$subject','$thread','c08k-second','sha256:v1:'||repeat('3',64),
 'v1','{}'::jsonb,
 '68300000-0000-0000-0000-000000000001',
 '68200000-0000-0000-0000-000000000001',
 '68600000-0000-0000-0000-000000000099',
 '68800000-0000-0000-0000-000000000099',
 'C08K synthetic second',null,'sha256:v1:'||repeat('4',64));")"
[[ "$replay" == "$second_turn|$second_msg|2|t" ]] || {
  echo HOLD_C08K_IDEMPOTENT_REPLAY_FAILED >&2; exit 1;
}
reject() {
  local marker="$1" sql="$2" output status
  set +e
  output="$(psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 && "$output" == *"$marker"* ]] || {
    echo "HOLD_C08K_EXPECTED_REJECTION: $marker" >&2
    echo "$output" >&2; exit 1;
  }
}
reject cmd_chat_receive_idempotency_conflict "
select * from public.cmd_receive_chat_turn_v1(
 '$subject','$thread','c08k-second','sha256:v1:'||repeat('5',64),
 'v1','{}'::jsonb,'68300000-0000-0000-0000-000000000001',
 '68200000-0000-0000-0000-000000000001',
 '68600000-0000-0000-0000-000000000098',
 '68800000-0000-0000-0000-000000000098',
 'mismatch',null,'sha256:v1:'||repeat('6',64));"
reject cmd_chat_receive_thread_not_found "
select * from public.cmd_receive_chat_turn_v1(
 '68100000-0000-0000-0000-000000000001','$thread',
 'cross-subject','sha256:v1:'||repeat('7',64),
 'v1','{}'::jsonb,'68300000-0000-0000-0000-000000000001',
 '68200000-0000-0000-0000-000000000001',
 '68600000-0000-0000-0000-000000000097',
 '68800000-0000-0000-0000-000000000097',
 'cross-subject',null,'sha256:v1:'||repeat('8',64));"
shape="$(psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -c "
select (select next_sequence_no from public.conversation_threads where id='$thread'),
 (select count(*) from public.chat_turns where thread_id='$thread'),
 (select count(*) from public.conversation_messages where thread_id='$thread'),
 (select count(*) from public.chat_turn_attempts where turn_id='$first_turn'),
 (select state from public.chat_turns where id='$first_turn');")"
[[ "$shape" == '3|2|2|2|abandoned' ]] || {
  echo "HOLD_C08K_RPC_SEQUENCE_ATTEMPT_ATOMICITY: $shape" >&2; exit 1;
}
echo PASS_C08K_REPLAY_CROSS_SUBJECT_SEQUENCE_AND_ATTEMPT_ATOMICITY
echo C08K_HOLD_NOT_A_FINAL_COMMIT_REVEAL_OR_REVOCATION_LOCK

# All denial paths above must leave the exact original user-message and
# sequence ledger intact. The v2 Commit wrapper must create zero assistant
# messages and zero Chat Commit outbox events for the abandoned first Turn.
commit_shape="$(psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -c "
select
 (select count(*) from public.conversation_messages
   where turn_id='$first_turn' and sender_type='character'),
 (select count(*) from public.outbox_events
   where aggregate_type='chat_turn' and aggregate_id='$first_turn'
     and event_type='CHAT_TURN_COMMITTED'),
 (select state from public.chat_turns where id='$first_turn');")"
[[ "$commit_shape" == '0|0|abandoned' ]] || {
  echo "HOLD_C08M_STALE_COMMIT_MUTATED_LEDGER: $commit_shape" >&2; exit 1;
}
echo PASS_C08M_REAL_COMMIT_V2_STALE_ATTEMPT_NO_ASSISTANT_OR_OUTBOX
echo C08M_HOLD_NO_POSITIVE_GRANT_PIN_OR_HTTP_REVEAL_LINEARIZATION

