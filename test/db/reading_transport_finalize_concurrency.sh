#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)

expect_failure() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local output status
  set +e
  output="$("${PSQL[@]}" -c "${sql}" 2>&1)"
  status=$?
  set -e
  if [[ ${status} -eq 0 ]]; then
    echo "FAIL ${label}: statement unexpectedly succeeded" >&2
    exit 10
  fi
  if [[ "${output}" != *"${expected}"* ]]; then
    echo "FAIL ${label}: expected ${expected}" >&2
    echo "${output}" >&2
    exit 11
  fi
  echo "PASS ${label} -> ${expected}"
}

create_reading() {
  local session_id="$1"
  local reading_id="$2"
  local key="$3"
  "${PSQL[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
    'e0000000-0000-0000-0000-000000000001',
    '${session_id}', '${reading_id}',
    '${key}', 'sha256:v1:${key}',
    'reading-request-v1', jsonb_build_object('idempotencyKey','${key}','domain','general'),
    'general', 'e1000000-0000-0000-0000-000000000001', null,
    null, null, null, null
  );" >/dev/null
}

prepare_attempt() {
  local reading_id="$1"
  local attempt_id="$2"
  local transport_key="$3"
  "${PSQL[@]}" -At -F '|' -c "select execution_attempt_id,execution_attempt_no,attempt_state,replayed
  from public.cmd_prepare_reading_transport_attempt_v1(
    'e0000000-0000-0000-0000-000000000001',
    '${reading_id}','${attempt_id}','${transport_key}','saju-public','engine-v1'
  );"
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000e001')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  'e0000000-0000-0000-0000-000000000001',
  'member',
  '00000000-0000-0000-0000-00000000e001',
  'active',
  now(),
  now()
);

insert into public.birth_profiles(
  id, subject_id, profile_kind, label, current_revision_id,
  archived_at, created_at, updated_at
) values (
  'e1000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'self', 'transport-self', null, null, now(), now()
);

insert into public.birth_profile_revisions(
  id, birth_profile_id, subject_id, revision_no,
  calendar_type, birth_date, birth_time, time_known,
  is_leap_month, sex, input_hash, created_at
) values (
  'e2000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  1, 'solar', date '1990-05-05', time '05:30', true,
  false, 'unspecified', 'sha256:v1:transport-self-r1', now()
);

update public.birth_profiles
set current_revision_id='e2000000-0000-0000-0000-000000000001', updated_at=now()
where id='e1000000-0000-0000-0000-000000000001';

insert into public.saju_domain_runtime(
  saju_domain, availability, capability_version, required_engine_version, updated_at
) values (
  'general', 'available', 'reading-general-v1', null, now()
)
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;
SQL

# Reading A: retryable transport failure, retry allocation, successful finalize.
create_reading \
  'e3000000-0000-0000-0000-000000000001' \
  'e4000000-0000-0000-0000-000000000001' \
  'transport-reading-a'

prepared="$(prepare_attempt \
  'e4000000-0000-0000-0000-000000000001' \
  'e5000000-0000-0000-0000-000000000001' \
  'transport-a-1')"
shape="$("${PSQL[@]}" -At -F '|' -c "select execution_status,next_execution_attempt_no,committed_execution_attempt_id is null,
  (select count(*) from public.reading_refs where reading_id='e4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.outbox_events where aggregate_type='reading' and aggregate_id='e4000000-0000-0000-0000-000000000001')
from public.readings where id='e4000000-0000-0000-0000-000000000001';")"
if [[ "${prepared}|${shape}" != 'e5000000-0000-0000-0000-000000000001|1|running|f|running|2|t|0|0' ]]; then
  echo "FAIL first transport prepare shape: ${prepared}|${shape}" >&2
  exit 20
fi
echo "PASS first transport prepare allocates attempt_no=1 and performs no external/finalize side effect"

replay="$(prepare_attempt \
  'e4000000-0000-0000-0000-000000000001' \
  'e5000000-0000-0000-0000-000000000001' \
  'transport-a-1')"
if [[ "${replay}" != 'e5000000-0000-0000-0000-000000000001|1|running|t' ]]; then
  echo "FAIL exact transport prepare replay: ${replay}" >&2
  exit 21
fi
echo "PASS exact transport prepare replay returns existing authoritative attempt"

expect_failure \
  'second transport allocation while attempt is running is denied' \
  'cmd_reading_transport_attempt_in_flight' \
  "select * from public.cmd_prepare_reading_transport_attempt_v1(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000002',
    'transport-a-2','saju-public','engine-v1');"

failure="$("${PSQL[@]}" -At -F '|' -c "select execution_attempt_id,execution_attempt_no,attempt_state,reading_state,replayed
from public.cmd_finalize_reading_transport_failure_v1(
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000001',
  true,'SAJU_TIMEOUT','req-a-1'
);")"
if [[ "${failure}" != 'e5000000-0000-0000-0000-000000000001|1|failed_retryable|running|f' ]]; then
  echo "FAIL retryable failure finalize: ${failure}" >&2
  exit 22
fi
echo "PASS retryable transport failure terminalizes only the execution attempt and keeps logical reading retryable"

failure_replay="$("${PSQL[@]}" -At -F '|' -c "select execution_attempt_id,execution_attempt_no,attempt_state,reading_state,replayed
from public.cmd_finalize_reading_transport_failure_v1(
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000001',
  true,'SAJU_TIMEOUT','req-a-1'
);")"
if [[ "${failure_replay}" != 'e5000000-0000-0000-0000-000000000001|1|failed_retryable|running|t' ]]; then
  echo "FAIL retryable failure replay: ${failure_replay}" >&2
  exit 23
fi
echo "PASS exact retryable failure replay is idempotent"

retry="$(prepare_attempt \
  'e4000000-0000-0000-0000-000000000001' \
  'e5000000-0000-0000-0000-000000000002' \
  'transport-a-2')"
if [[ "${retry}" != 'e5000000-0000-0000-0000-000000000002|2|running|f' ]]; then
  echo "FAIL transport retry allocation: ${retry}" >&2
  exit 24
fi
echo "PASS failed_retryable transport allocates a new execution attempt without creating a new logical reading"

expect_failure \
  'stale terminal attempt cannot be finalized as success' \
  'cmd_reading_transport_attempt_not_current' \
  "select * from public.cmd_finalize_reading_transport_success_v1(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000001',
    'e9000000-0000-0000-0000-000000000001',
    'req-stale','engine-v1','ext-stale',
    'sha256:v1:transport-self-r1',null,
    'product-reading-v1','complete',null,null,null,
    '{\"state\":\"complete\"}'::jsonb,'sha256:v1:stale-response');"

expect_failure \
  'success with wrong pinned Birth hash rolls back' \
  'ct_reading_finalize' \
  "select * from public.cmd_finalize_reading_transport_success_v1(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000002',
    'e9000000-0000-0000-0000-000000000002',
    'req-a-2','engine-v1','ext-a-2',
    'sha256:v1:WRONG',null,
    'product-reading-v1','complete',null,null,null,
    '{\"state\":\"complete\"}'::jsonb,'sha256:v1:response-a');"
rollback_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.reading_execution_attempts where id='e5000000-0000-0000-0000-000000000002'),
  (select execution_status from public.readings where id='e4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.reading_refs where reading_id='e4000000-0000-0000-0000-000000000001');")"
if [[ "${rollback_shape}" != 'running|running|0' ]]; then
  echo "FAIL wrong Birth hash left half-finalize: ${rollback_shape}" >&2
  exit 25
fi
echo "PASS Birth provenance mismatch leaves attempt/reading/ref unchanged"

success="$("${PSQL[@]}" -At -F '|' -c "select reading_id,execution_attempt_id,response_hash,replayed
from public.cmd_finalize_reading_transport_success_v1(
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000002',
  'e9000000-0000-0000-0000-000000000003',
  'req-a-2','engine-v1','ext-a-2',
  'sha256:v1:transport-self-r1',null,
  'product-reading-v1','complete',null,null,null,
  '{\"state\":\"complete\",\"blocks\":[]}'::jsonb,'sha256:v1:response-a'
);")"
success_shape="$("${PSQL[@]}" -At -F '|' -c "select
  r.execution_status,r.committed_execution_attempt_id,
  rea.state,rea.resolved_engine_version,rr.saju_engine_key,rr.saju_engine_version,rr.response_hash,
  (select count(*) from public.outbox_events where aggregate_type='reading' and aggregate_id=r.id::text and event_type='READING_FINALIZED')
from public.readings r
join public.reading_execution_attempts rea on rea.id=r.committed_execution_attempt_id
join public.reading_refs rr on rr.reading_id=r.id
where r.id='e4000000-0000-0000-0000-000000000001';")"
if [[ "${success}|${success_shape}" != 'e4000000-0000-0000-0000-000000000001|e5000000-0000-0000-0000-000000000002|sha256:v1:response-a|f|succeeded|e5000000-0000-0000-0000-000000000002|succeeded|engine-v1|saju-public|engine-v1|sha256:v1:response-a|1' ]]; then
  echo "FAIL successful transport finalize shape: ${success}|${success_shape}" >&2
  exit 26
fi
echo "PASS successful transport finalize atomically commits execution provenance, immutable ReadingRef, logical pointer, and outbox"

success_replay="$("${PSQL[@]}" -At -F '|' -c "select reading_id,execution_attempt_id,response_hash,replayed
from public.cmd_finalize_reading_transport_success_v1(
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000002',
  'e9000000-0000-0000-0000-000000000099',
  'req-a-2','engine-v1','ext-a-2',
  'sha256:v1:transport-self-r1',null,
  'product-reading-v1','complete',null,null,null,
  '{\"ignored\":\"replay-does-not-rewrite\"}'::jsonb,'sha256:v1:response-a'
);")"
outbox_count="$("${PSQL[@]}" -At -c "select count(*) from public.outbox_events where aggregate_type='reading' and aggregate_id='e4000000-0000-0000-0000-000000000001' and event_type='READING_FINALIZED';")"
if [[ "${success_replay}|${outbox_count}" != 'e4000000-0000-0000-0000-000000000001|e5000000-0000-0000-0000-000000000002|sha256:v1:response-a|t|1' ]]; then
  echo "FAIL success replay/outbox dedupe: ${success_replay}|${outbox_count}" >&2
  exit 27
fi
echo "PASS response-loss retry replays committed Reading authority without rewriting snapshot or duplicating outbox"

expect_failure \
  'succeeded reading cannot be replayed with a different response hash' \
  'cmd_reading_transport_success_replay_conflict' \
  "select * from public.cmd_finalize_reading_transport_success_v1(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000002',
    'e9000000-0000-0000-0000-000000000098',
    'req-a-2','engine-v1','ext-a-2',
    'sha256:v1:transport-self-r1',null,
    'product-reading-v1','complete',null,null,null,
    '{}'::jsonb,'sha256:v1:DIFFERENT');"

expect_failure \
  'succeeded logical reading cannot allocate another transport retry' \
  'cmd_reading_transport_reading_terminal' \
  "select * from public.cmd_prepare_reading_transport_attempt_v1(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000003',
    'transport-a-3','saju-public','engine-v1');"

# Reading B: final transport failure terminalizes logical reading without fabricating a ref.
create_reading \
  'e3000000-0000-0000-0000-000000000002' \
  'e4000000-0000-0000-0000-000000000002' \
  'transport-reading-b'
prepare_attempt \
  'e4000000-0000-0000-0000-000000000002' \
  'e5000000-0000-0000-0000-000000000011' \
  'transport-b-1' >/dev/null
final_failure="$("${PSQL[@]}" -At -F '|' -c "select execution_attempt_no,attempt_state,reading_state,replayed
from public.cmd_finalize_reading_transport_failure_v1(
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000002',
  'e5000000-0000-0000-0000-000000000011',
  false,'SAJU_INVALID_RESPONSE','req-b-1'
);")"
final_failure_shape="$("${PSQL[@]}" -At -F '|' -c "select execution_status,completed_at is not null,
  (select count(*) from public.reading_refs where reading_id='e4000000-0000-0000-0000-000000000002')
from public.readings where id='e4000000-0000-0000-0000-000000000002';")"
if [[ "${final_failure}|${final_failure_shape}" != '1|failed_final|failed|f|failed|t|0' ]]; then
  echo "FAIL final transport failure shape: ${final_failure}|${final_failure_shape}" >&2
  exit 28
fi
echo "PASS failed_final transport closes logical reading and creates no ProductReadingResponse ref"

expect_failure \
  'failed_final logical reading cannot retry transport' \
  'cmd_reading_transport_reading_terminal' \
  "select * from public.cmd_prepare_reading_transport_attempt_v1(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000002',
    'e5000000-0000-0000-0000-000000000012',
    'transport-b-2','saju-public','engine-v1');"

# Reading C: late outbox failure must roll back execution/ref/logical finalize as one unit.
create_reading \
  'e3000000-0000-0000-0000-000000000003' \
  'e4000000-0000-0000-0000-000000000003' \
  'transport-reading-c'
prepare_attempt \
  'e4000000-0000-0000-0000-000000000003' \
  'e5000000-0000-0000-0000-000000000021' \
  'transport-c-1' >/dev/null
"${PSQL[@]}" -q -c "insert into public.outbox_events(
  id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,
  status,attempt_count,available_at,created_at
) values (
  'e9000000-0000-0000-0000-000000000021','fixture','collision','FIXTURE','v1','fixture','{}'::jsonb,
  'pending',0,now(),now()
);" >/dev/null
expect_failure \
  'late outbox collision rolls back reading success finalize' \
  'duplicate key value violates unique constraint' \
  "select * from public.cmd_finalize_reading_transport_success_v1(
    'e0000000-0000-0000-0000-000000000001',
    'e4000000-0000-0000-0000-000000000003',
    'e5000000-0000-0000-0000-000000000021',
    'e9000000-0000-0000-0000-000000000021',
    'req-c-1','engine-v1','ext-c-1',
    'sha256:v1:transport-self-r1',null,
    'product-reading-v1','complete',null,null,null,
    '{}'::jsonb,'sha256:v1:response-c');"
late_rollback="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.reading_execution_attempts where id='e5000000-0000-0000-0000-000000000021'),
  (select execution_status from public.readings where id='e4000000-0000-0000-0000-000000000003'),
  (select committed_execution_attempt_id is null from public.readings where id='e4000000-0000-0000-0000-000000000003'),
  (select count(*) from public.reading_refs where reading_id='e4000000-0000-0000-0000-000000000003');")"
if [[ "${late_rollback}" != 'running|running|t|0' ]]; then
  echo "FAIL late outbox rollback left half state: ${late_rollback}" >&2
  exit 29
fi
echo "PASS late outbox failure rolls back execution/ref/reading finalize completely"

# Reading D: concurrent distinct prepares serialize on the reading row; exactly one can run.
create_reading \
  'e3000000-0000-0000-0000-000000000004' \
  'e4000000-0000-0000-0000-000000000004' \
  'transport-reading-d'
race_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -At -F '|' -c "begin; select * from public.cmd_prepare_reading_transport_attempt_v1(
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000004',
  'e5000000-0000-0000-0000-000000000031',
  'transport-d-a','saju-public','engine-v1'); select pg_sleep(0.4); commit;" >"${race_dir}/a.out" 2>&1 &
a_pid=$!
"${PSQL[@]}" -q -At -F '|' -c "select * from public.cmd_prepare_reading_transport_attempt_v1(
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000004',
  'e5000000-0000-0000-0000-000000000032',
  'transport-d-b','saju-public','engine-v1');" >"${race_dir}/b.out" 2>&1 &
b_pid=$!
wait ${a_pid}; a_status=$?
wait ${b_pid}; b_status=$?
set -e
race_count="$("${PSQL[@]}" -At -F '|' -c "select
  count(*),
  count(*) filter (where state='running'),
  min(execution_attempt_no),max(execution_attempt_no),
  (select next_execution_attempt_no from public.readings where id='e4000000-0000-0000-0000-000000000004')
from public.reading_execution_attempts where reading_id='e4000000-0000-0000-0000-000000000004';")"
if [[ "${race_count}" != '1|1|1|1|2' ]]; then
  echo "FAIL concurrent prepare persistence shape: ${race_count}" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 30
fi
if [[ ${a_status} -eq 0 && ${b_status} -eq 0 ]]; then
  echo "FAIL concurrent distinct prepares both succeeded" >&2
  exit 31
fi
if ! grep -q 'cmd_reading_transport_attempt_in_flight' "${race_dir}/a.out" && ! grep -q 'cmd_reading_transport_attempt_in_flight' "${race_dir}/b.out"; then
  echo "FAIL losing prepare did not fail with in-flight authority" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 32
fi
echo "PASS concurrent distinct transport prepares -> exactly one running attempt_no=1"

# Reading E: concurrent success workers converge on one immutable ref/outbox; loser replays.
create_reading \
  'e3000000-0000-0000-0000-000000000005' \
  'e4000000-0000-0000-0000-000000000005' \
  'transport-reading-e'
prepare_attempt \
  'e4000000-0000-0000-0000-000000000005' \
  'e5000000-0000-0000-0000-000000000041' \
  'transport-e-1' >/dev/null
final_dir="$(mktemp -d)"
final_sql_a="select reading_id,execution_attempt_id,response_hash,replayed from public.cmd_finalize_reading_transport_success_v1(
  'e0000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000005','e5000000-0000-0000-0000-000000000041',
  'e9000000-0000-0000-0000-000000000041','req-e-1','engine-v1','ext-e-1','sha256:v1:transport-self-r1',null,
  'product-reading-v1','complete',null,null,null,'{}'::jsonb,'sha256:v1:response-e');"
final_sql_b="select reading_id,execution_attempt_id,response_hash,replayed from public.cmd_finalize_reading_transport_success_v1(
  'e0000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000005','e5000000-0000-0000-0000-000000000041',
  'e9000000-0000-0000-0000-000000000042','req-e-1','engine-v1','ext-e-1','sha256:v1:transport-self-r1',null,
  'product-reading-v1','complete',null,null,null,'{}'::jsonb,'sha256:v1:response-e');"
"${PSQL[@]}" -q -At -F '|' -c "${final_sql_a}" >"${final_dir}/a.out" 2>&1 &
fa_pid=$!
"${PSQL[@]}" -q -At -F '|' -c "${final_sql_b}" >"${final_dir}/b.out" 2>&1 &
fb_pid=$!
wait ${fa_pid}
wait ${fb_pid}
final_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select count(*) from public.reading_refs where reading_id='e4000000-0000-0000-0000-000000000005'),
  (select count(*) from public.outbox_events where aggregate_type='reading' and aggregate_id='e4000000-0000-0000-0000-000000000005' and event_type='READING_FINALIZED'),
  (select execution_status from public.readings where id='e4000000-0000-0000-0000-000000000005');")"
if [[ "${final_shape}" != '1|1|succeeded' ]]; then
  echo "FAIL concurrent finalize convergence: ${final_shape}" >&2
  cat "${final_dir}/a.out" >&2
  cat "${final_dir}/b.out" >&2
  exit 33
fi
if ! grep -q '|f' "${final_dir}/a.out" && ! grep -q '|f' "${final_dir}/b.out"; then
  echo "FAIL concurrent finalize had no first committer" >&2
  exit 34
fi
if ! grep -q '|t' "${final_dir}/a.out" && ! grep -q '|t' "${final_dir}/b.out"; then
  echo "FAIL concurrent finalize loser did not replay" >&2
  cat "${final_dir}/a.out" >&2
  cat "${final_dir}/b.out" >&2
  exit 35
fi
echo "PASS concurrent success finalize -> one immutable ReadingRef/outbox and one authoritative replay"

# SECURITY INVOKER + P0-AUTH-01 boundary: no command is PUBLIC executable.
privs="$("${PSQL[@]}" -At -F '|' -c "select
  has_function_privilege('public', 'public.cmd_prepare_reading_transport_attempt_v1(uuid,uuid,uuid,text,text,text)', 'EXECUTE'),
  has_function_privilege('public', 'public.cmd_finalize_reading_transport_failure_v1(uuid,uuid,uuid,boolean,text,text)', 'EXECUTE'),
  has_function_privilege('public', 'public.cmd_finalize_reading_transport_success_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text)', 'EXECUTE');")"
if [[ "${privs}" != 'f|f|f' ]]; then
  echo "FAIL reading transport command PUBLIC EXECUTE boundary: ${privs}" >&2
  exit 36
fi
echo "PASS Reading transport commands PUBLIC EXECUTE remain revoked while P0-AUTH-01 is open"

echo "reading transport prepare/retry/finalize persistence tests passed"
