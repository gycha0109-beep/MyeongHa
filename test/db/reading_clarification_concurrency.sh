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
    'f0000000-0000-0000-0000-000000000001',
    '${session_id}', '${reading_id}',
    '${key}', 'sha256:v1:${key}',
    'reading-request-v1', jsonb_build_object('idempotencyKey','${key}','domain','general'),
    'general', 'f1000000-0000-0000-0000-000000000001', null,
    null, null, null, null
  );" >/dev/null
}

finalize_parent() {
  local reading_id="$1"
  local attempt_id="$2"
  local outbox_id="$3"
  local state="$4"
  local suffix="$5"
  local clarifications_sql="null"
  if [[ "${state}" == 'needs_clarification' ]]; then
    clarifications_sql="jsonb_build_array(jsonb_build_object('id','q-${suffix}','prompt','more detail'))"
  fi

  "${PSQL[@]}" -q -c "select * from public.cmd_prepare_reading_transport_attempt_v1(
    'f0000000-0000-0000-0000-000000000001',
    '${reading_id}','${attempt_id}','clarify-${suffix}','saju-public','engine-v1'
  );" >/dev/null

  "${PSQL[@]}" -q -c "select * from public.cmd_finalize_reading_transport_success_v1(
    'f0000000-0000-0000-0000-000000000001',
    '${reading_id}','${attempt_id}','${outbox_id}',
    'req-${suffix}','engine-v1','ext-${suffix}',
    'sha256:v1:clarify-self-r1',null,
    'product-reading-v1','${state}',null,${clarifications_sql},null,
    jsonb_build_object('state','${state}','fixture','${suffix}'),
    'sha256:v1:response-${suffix}'
  );" >/dev/null
}

append_clarification() {
  local session_id="$1"
  local parent_id="$2"
  local reading_id="$3"
  local key="$4"
  local hash="$5"
  "${PSQL[@]}" -At -F '|' -c "select reading_session_id,reading_id,parent_reading_id,attempt_no,replayed
  from public.cmd_append_reading_clarification_v1(
    'f0000000-0000-0000-0000-000000000001',
    '${session_id}','${parent_id}','${reading_id}',
    '${key}','${hash}','clarification-request-v1',
    jsonb_build_object(
      'idempotencyKey','${key}',
      'expectedCurrentReadingId','${parent_id}',
      'answers',jsonb_build_array(jsonb_build_object('questionId','q','answer','detail'))
    )
  );"
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000f001')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  'f0000000-0000-0000-0000-000000000001',
  'member',
  '00000000-0000-0000-0000-00000000f001',
  'active',
  now(),
  now()
);

insert into public.birth_profiles(
  id, subject_id, profile_kind, label, current_revision_id,
  archived_at, created_at, updated_at
) values (
  'f1000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'self', 'clarification-self', null, null, now(), now()
);

insert into public.birth_profile_revisions(
  id, birth_profile_id, subject_id, revision_no,
  calendar_type, birth_date, birth_time, time_known,
  is_leap_month, sex, input_hash, created_at
) values (
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  1, 'solar', date '1990-06-06', time '06:30', true,
  false, 'unspecified', 'sha256:v1:clarify-self-r1', now()
);

update public.birth_profiles
set current_revision_id='f2000000-0000-0000-0000-000000000001', updated_at=now()
where id='f1000000-0000-0000-0000-000000000001';

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

# Session A: successful ProductResponse explicitly requests clarification.
create_reading \
  'f3000000-0000-0000-0000-000000000001' \
  'f4000000-0000-0000-0000-000000000001' \
  'clarify-parent-a'
finalize_parent \
  'f4000000-0000-0000-0000-000000000001' \
  'f5000000-0000-0000-0000-000000000001' \
  'f9000000-0000-0000-0000-000000000001' \
  'needs_clarification' 'a1'

result="$(append_clarification \
  'f3000000-0000-0000-0000-000000000001' \
  'f4000000-0000-0000-0000-000000000001' \
  'f4000000-0000-0000-0000-000000000002' \
  'clarify-a-2' 'sha256:v1:clarify-a-2')"
shape="$("${PSQL[@]}" -At -F '|' -c "select
  rs.current_reading_id,rs.next_attempt_no,rs.state,
  r.parent_reading_id,r.attempt_no,r.execution_status,r.next_execution_attempt_no,
  r.source_turn_id is null,r.requested_character_id is null,
  (select count(*) from public.reading_execution_attempts where reading_id=r.id)
from public.reading_sessions rs
join public.readings r on r.id=rs.current_reading_id
where rs.id='f3000000-0000-0000-0000-000000000001';")"
if [[ "${result}|${shape}" != 'f3000000-0000-0000-0000-000000000001|f4000000-0000-0000-0000-000000000002|f4000000-0000-0000-0000-000000000001|2|f|f4000000-0000-0000-0000-000000000002|3|active|f4000000-0000-0000-0000-000000000001|2|pending|1|t|t|0' ]]; then
  echo "FAIL clarification append persistence shape: ${result}|${shape}" >&2
  exit 20
fi
echo "PASS clarification append creates a new pending logical reading attempt_no=2 and advances only the session pointer/allocator"

# Response-loss replay: current pointer has moved, but identical key+canonical request replays child.
replay="$(append_clarification \
  'f3000000-0000-0000-0000-000000000001' \
  'f4000000-0000-0000-0000-000000000001' \
  'f4000000-0000-0000-0000-000000000099' \
  'clarify-a-2' 'sha256:v1:clarify-a-2')"
count_a="$("${PSQL[@]}" -At -c "select count(*) from public.readings where reading_session_id='f3000000-0000-0000-0000-000000000001';")"
if [[ "${replay}|${count_a}" != 'f3000000-0000-0000-0000-000000000001|f4000000-0000-0000-0000-000000000002|f4000000-0000-0000-0000-000000000001|2|t|2' ]]; then
  echo "FAIL clarification replay: ${replay}|${count_a}" >&2
  exit 21
fi
echo "PASS exact clarification retry replays authoritative child after current pointer moved"

expect_failure \
  'same clarification idempotency key with different request hash conflicts' \
  'cmd_reading_clarification_idempotency_conflict' \
  "select * from public.cmd_append_reading_clarification_v1(
    'f0000000-0000-0000-0000-000000000001',
    'f3000000-0000-0000-0000-000000000001',
    'f4000000-0000-0000-0000-000000000001',
    'f4000000-0000-0000-0000-000000000098',
    'clarify-a-2','sha256:v1:DIFFERENT','clarification-request-v1',
    jsonb_build_object('idempotencyKey','clarify-a-2','expectedCurrentReadingId','f4000000-0000-0000-0000-000000000001','answers','different'));"

expect_failure \
  'stale expectedCurrentReadingId cannot branch the clarification chain' \
  'cmd_reading_clarification_stale_current' \
  "select * from public.cmd_append_reading_clarification_v1(
    'f0000000-0000-0000-0000-000000000001',
    'f3000000-0000-0000-0000-000000000001',
    'f4000000-0000-0000-0000-000000000001',
    'f4000000-0000-0000-0000-000000000003',
    'clarify-a-stale','sha256:v1:clarify-a-stale','clarification-request-v1','{}'::jsonb);"

# Finalize child with another needs_clarification response, then append attempt_no=3.
finalize_parent \
  'f4000000-0000-0000-0000-000000000002' \
  'f5000000-0000-0000-0000-000000000002' \
  'f9000000-0000-0000-0000-000000000002' \
  'needs_clarification' 'a2'

grandchild="$(append_clarification \
  'f3000000-0000-0000-0000-000000000001' \
  'f4000000-0000-0000-0000-000000000002' \
  'f4000000-0000-0000-0000-000000000003' \
  'clarify-a-3' 'sha256:v1:clarify-a-3')"
chain="$("${PSQL[@]}" -At -F '|' -c "select string_agg(attempt_no::text || ':' || coalesce(parent_reading_id::text,'root'), ',' order by attempt_no),
  (select next_attempt_no from public.reading_sessions where id='f3000000-0000-0000-0000-000000000001')
from public.readings where reading_session_id='f3000000-0000-0000-0000-000000000001';")"
if [[ "${grandchild}" != 'f3000000-0000-0000-0000-000000000001|f4000000-0000-0000-0000-000000000003|f4000000-0000-0000-0000-000000000002|3|f' ]]; then
  echo "FAIL second clarification allocation: ${grandchild}" >&2
  exit 22
fi
if [[ "${chain}" != *'1:root,2:f4000000-0000-0000-0000-000000000001,3:f4000000-0000-0000-0000-000000000002|4' ]]; then
  echo "FAIL clarification linear chain allocator: ${chain}" >&2
  exit 23
fi
echo "PASS sequential clarification responses allocate ordered logical attempts 1 -> 2 -> 3 with a linear parent chain"

# Session B: a complete ProductResponse is not clarification-eligible.
create_reading \
  'f3000000-0000-0000-0000-000000000011' \
  'f4000000-0000-0000-0000-000000000011' \
  'clarify-parent-b'
finalize_parent \
  'f4000000-0000-0000-0000-000000000011' \
  'f5000000-0000-0000-0000-000000000011' \
  'f9000000-0000-0000-0000-000000000011' \
  'complete' 'b1'
expect_failure \
  'ProductResponse without needs_clarification cannot create semantic clarification attempt' \
  'cmd_reading_clarification_not_requested' \
  "select * from public.cmd_append_reading_clarification_v1(
    'f0000000-0000-0000-0000-000000000001',
    'f3000000-0000-0000-0000-000000000011',
    'f4000000-0000-0000-0000-000000000011',
    'f4000000-0000-0000-0000-000000000012',
    'clarify-b-2','sha256:v1:clarify-b-2','clarification-request-v1','{}'::jsonb);"

# Session C: parent asks clarification, but Birth profile advances before user answers.
create_reading \
  'f3000000-0000-0000-0000-000000000021' \
  'f4000000-0000-0000-0000-000000000021' \
  'clarify-parent-c'
finalize_parent \
  'f4000000-0000-0000-0000-000000000021' \
  'f5000000-0000-0000-0000-000000000021' \
  'f9000000-0000-0000-0000-000000000021' \
  'needs_clarification' 'c1'
"${PSQL[@]}" -q -c "select * from public.cmd_append_birth_profile_revision_v1(
  'f0000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000002',
  'solar',date '1990-06-07',time '06:45',true,false,'unspecified','sha256:v1:clarify-self-r2'
);" >/dev/null
expect_failure \
  'Birth revision drift blocks clarification continuation' \
  'cmd_reading_clarification_birth_stale' \
  "select * from public.cmd_append_reading_clarification_v1(
    'f0000000-0000-0000-0000-000000000001',
    'f3000000-0000-0000-0000-000000000021',
    'f4000000-0000-0000-0000-000000000021',
    'f4000000-0000-0000-0000-000000000022',
    'clarify-c-2','sha256:v1:clarify-c-2','clarification-request-v1','{}'::jsonb);"
stale_count="$("${PSQL[@]}" -At -c "select count(*) from public.readings where reading_session_id='f3000000-0000-0000-0000-000000000021';")"
if [[ "${stale_count}" != '1' ]]; then
  echo "FAIL Birth-stale clarification left child row: ${stale_count}" >&2
  exit 24
fi
echo "PASS Birth-stale clarification leaves original session/history intact and requires new recalculation path"

# Restore profile current revision to r1 ONLY as isolated fixture setup for later sessions.
# This direct pointer reset is test-only; production Birth revision append remains append-only.
"${PSQL[@]}" -q -c "update public.birth_profiles set current_revision_id='f2000000-0000-0000-0000-000000000001', updated_at=now() where id='f1000000-0000-0000-0000-000000000001';" >/dev/null

# Session D: distinct concurrent answers against the same expected parent serialize;
# exactly one can extend the linear chain, the loser observes stale current.
create_reading \
  'f3000000-0000-0000-0000-000000000031' \
  'f4000000-0000-0000-0000-000000000031' \
  'clarify-parent-d'
finalize_parent \
  'f4000000-0000-0000-0000-000000000031' \
  'f5000000-0000-0000-0000-000000000031' \
  'f9000000-0000-0000-0000-000000000031' \
  'needs_clarification' 'd1'
race_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -At -F '|' -c "begin; select * from public.cmd_append_reading_clarification_v1(
  'f0000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000031',
  'f4000000-0000-0000-0000-000000000031',
  'f4000000-0000-0000-0000-000000000032',
  'clarify-d-a','sha256:v1:clarify-d-a','clarification-request-v1',
  '{\"answer\":\"a\"}'::jsonb); select pg_sleep(0.4); commit;" >"${race_dir}/a.out" 2>&1 &
a_pid=$!
"${PSQL[@]}" -q -At -F '|' -c "select * from public.cmd_append_reading_clarification_v1(
  'f0000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000031',
  'f4000000-0000-0000-0000-000000000031',
  'f4000000-0000-0000-0000-000000000033',
  'clarify-d-b','sha256:v1:clarify-d-b','clarification-request-v1',
  '{\"answer\":\"b\"}'::jsonb);" >"${race_dir}/b.out" 2>&1 &
b_pid=$!
wait ${a_pid}; a_status=$?
wait ${b_pid}; b_status=$?
set -e
race_shape="$("${PSQL[@]}" -At -F '|' -c "select
  count(*),count(*) filter (where parent_reading_id='f4000000-0000-0000-0000-000000000031'),
  min(attempt_no),max(attempt_no),
  (select next_attempt_no from public.reading_sessions where id='f3000000-0000-0000-0000-000000000031')
from public.readings where reading_session_id='f3000000-0000-0000-0000-000000000031';")"
if [[ "${race_shape}" != '2|1|1|2|3' ]]; then
  echo "FAIL concurrent clarification persistence shape: ${race_shape}" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 25
fi
if [[ ${a_status} -eq 0 && ${b_status} -eq 0 ]]; then
  echo "FAIL concurrent distinct clarifications both succeeded" >&2
  exit 26
fi
if ! grep -q 'cmd_reading_clarification_stale_current' "${race_dir}/a.out" && ! grep -q 'cmd_reading_clarification_stale_current' "${race_dir}/b.out"; then
  echo "FAIL losing clarification did not fail with stale-current authority" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 27
fi
echo "PASS concurrent distinct clarification answers -> one linear child attempt_no=2, loser denied as stale"

expect_failure \
  'cross-subject clarification session probe is denied' \
  'cmd_reading_clarification_session_not_found' \
  "select * from public.cmd_append_reading_clarification_v1(
    'f0000000-0000-0000-0000-000000000099',
    'f3000000-0000-0000-0000-000000000031',
    'f4000000-0000-0000-0000-000000000031',
    'f4000000-0000-0000-0000-000000000034',
    'clarify-cross','sha256:v1:clarify-cross','clarification-request-v1','{}'::jsonb);"

priv="$("${PSQL[@]}" -At -c "select has_function_privilege(
  'public',
  'public.cmd_append_reading_clarification_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)',
  'EXECUTE'
);")"
if [[ "${priv}" != 'f' ]]; then
  echo "FAIL clarification command PUBLIC EXECUTE boundary: ${priv}" >&2
  exit 28
fi
echo "PASS Reading clarification command PUBLIC EXECUTE remains revoked while P0-AUTH-01 is open"

echo "reading clarification append persistence/concurrency tests passed"
