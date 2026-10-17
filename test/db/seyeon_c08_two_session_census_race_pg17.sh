#!/usr/bin/env bash
set -euo pipefail

# C08-J: two real PostgreSQL backends, one existing READ COMMITTED transaction.
# This script is called ONLY after C08-G/J's guarded disposable PG17 fixture
# has seeded one synthetic user message. Nothing here targets production.
if [[ "$PGDATABASE" != myeongha_c08_local_case_1 ]]; then
  [[ "$GITHUB_ACTIONS" == true && "$CI" == true &&
     "$DB_SUITE" == postgres17 && "$PGHOST" == localhost &&
     "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
    echo HOLD_C08J_DISPOSABLE_DATABASE_REQUIRED >&2; exit 1;
  }
fi
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || {
  echo HOLD_C08J_PG17_REQUIRED >&2; exit 1;
}

race_dir="$(mktemp -d /tmp/myeongha-c08j-race-XXXXXXXX)"
reader_pid=''
cleanup() {
  if [[ -n "$reader_pid" ]]; then
    kill "$reader_pid" 2>/dev/null || true
    wait "$reader_pid" 2>/dev/null || true
  fi
  rm -rf "$race_dir"
}
trap cleanup EXIT

# Reader A stays in the SAME READ COMMITTED transaction across both reads.
# psql \! signals are local client barriers, not DB mutations or extra
# transactions; writer B starts only AFTER A's initial result was persisted.
(
  timeout 30 psql -X -qAt -v ON_ERROR_STOP=1 >"$race_dir/reader.log" 2>&1 <<SQL
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('68000000-0000-0000-0000-000000000001');
\\o $race_dir/reader_pid
select pg_backend_pid();
\\o
\\o $race_dir/before
with authorized_thread as materialized (
  select thread_id, status, participant_character_ids
  from public.qry_chat_thread_runtime_binding_v1(
    '68100000-0000-0000-0000-000000000001'::uuid,
    '68400000-0000-0000-0000-000000000001'::uuid)
),
first_two_messages as materialized (
  select m.id, m.sequence_no, m.sender_type, m.redacted_at
  from public.conversation_messages m
  join authorized_thread t on t.thread_id = m.thread_id
  where m.subject_id = '68100000-0000-0000-0000-000000000001'::uuid
    and m.thread_id = '68400000-0000-0000-0000-000000000001'::uuid
  order by m.sequence_no asc limit 2
)
select t.status, array_to_string(t.participant_character_ids, ','),
  (select count(*)::text from first_two_messages),
  coalesce((select (
    m.id = '68800000-0000-0000-0000-000000000001'::uuid
    and m.sender_type = 'user' and m.redacted_at is null)
    from first_two_messages m order by m.sequence_no desc limit 1), false)
from authorized_thread t;
\\o
\\! touch $race_dir/reader_ready
\\! timeout 20 sh -c 'until test -f "$race_dir/writer_committed"; do sleep 0.05; done'
\\o $race_dir/after
with authorized_thread as materialized (
  select thread_id, status, participant_character_ids
  from public.qry_chat_thread_runtime_binding_v1(
    '68100000-0000-0000-0000-000000000001'::uuid,
    '68400000-0000-0000-0000-000000000001'::uuid)
),
first_two_messages as materialized (
  select m.id, m.sequence_no, m.sender_type, m.redacted_at
  from public.conversation_messages m
  join authorized_thread t on t.thread_id = m.thread_id
  where m.subject_id = '68100000-0000-0000-0000-000000000001'::uuid
    and m.thread_id = '68400000-0000-0000-0000-000000000001'::uuid
  order by m.sequence_no asc limit 2
)
select t.status, array_to_string(t.participant_character_ids, ','),
  (select count(*)::text from first_two_messages),
  coalesce((select (
    m.id = '68800000-0000-0000-0000-000000000001'::uuid
    and m.sender_type = 'user' and m.redacted_at is null)
    from first_two_messages m order by m.sequence_no desc limit 1), false)
from authorized_thread t;
\\o
ROLLBACK;
SQL
) &
reader_pid=$!

# No sleep-based ordering: A's marker exists only after its first DB read.
ready=false
for _ in $(seq 1 300); do
  if [[ -f "$race_dir/reader_ready" ]]; then ready=true; break; fi
  if ! kill -0 "$reader_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then
  echo HOLD_C08J_READER_FIRST_CENSUS_NOT_READY >&2
  cat "$race_dir/reader.log" >&2
  exit 1
fi
[[ "$(cat "$race_dir/before")" == 'active|seyeon|1|t' ]] || {
  echo HOLD_C08J_READER_FIRST_CENSUS_MISMATCH >&2; exit 1;
}

# Writer B is a SEPARATE PostgreSQL connection. This is a synthetic
# redacted/tombstone history insert (not cmd_receive_chat_turn or an HTTP
# race). It commits DURING reader A's still-open transaction.
writer_backend="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT pg_backend_pid();
INSERT INTO public.conversation_messages(
 id,thread_id,subject_id,turn_id,sequence_no,sender_type,thread_character_id,
 character_content_bundle_id,body_text,message_payload_jsonb,message_schema_version,
 content_hash,created_at,redacted_at,redaction_reason
) VALUES(
 '68800000-0000-0000-0000-000000000002',
 '68400000-0000-0000-0000-000000000001',
 '68100000-0000-0000-0000-000000000001',
 null,2,'system',null,null,'SYNTHETIC_NEVER_REVEAL',
 '{"testOnly":true}'::jsonb,'system-message/v1',
 'sha256:v1:'||repeat('c',64),now(),now(),'conversation_delete'
);
COMMIT;
SQL
)"
reader_backend="$(cat "$race_dir/reader_pid")"
[[ "$reader_backend" =~ ^[0-9]+$ && "$writer_backend" =~ ^[0-9]+$ &&
   "$reader_backend" != "$writer_backend" ]] || {
  echo HOLD_C08J_NOT_TWO_INDEPENDENT_POSTGRES_BACKENDS >&2; exit 1;
}
touch "$race_dir/writer_committed"
wait "$reader_pid" || {
  echo HOLD_C08J_READER_RECHECK_FAILED >&2
  cat "$race_dir/reader.log" >&2
  exit 1
}
reader_pid=''
[[ "$(cat "$race_dir/after")" == 'active|seyeon|2|f' ]] || {
  echo HOLD_C08J_STALE_FIRST_CONTACT_ADMITTED_AFTER_COMMIT >&2; exit 1;
}

# Verify B actually committed while A was alive and no privileged reads
# were issued by reader A. A read is not a durable lock/pin.
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
select count(*) from public.conversation_messages
where subject_id='68100000-0000-0000-0000-000000000001'
  and thread_id='68400000-0000-0000-0000-000000000001'
")" == '2' ]] || {
  echo HOLD_C08J_WRITER_MESSAGE_NOT_COMMITTED >&2; exit 1;
}
echo PASS_C08J_TWO_PG17_BACKENDS_READ_COMMITTED_RECHECK_BLOCKS_STALE_FIRST_CONTACT
echo C08J_HOLD_NOT_A_SERIALIZABLE_COMMIT_OR_REVEAL_BARRIER
