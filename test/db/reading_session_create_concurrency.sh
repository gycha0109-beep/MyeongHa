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

seed_birth_profile() {
  local profile_id="$1"
  local revision_id="$2"
  local kind="$3"
  local hash="$4"
  "${PSQL[@]}" -q <<SQL >/dev/null
insert into public.birth_profiles(
  id, subject_id, profile_kind, label, current_revision_id,
  archived_at, created_at, updated_at
) values (
  '${profile_id}', 'd0000000-0000-0000-0000-000000000001',
  '${kind}', '${kind}-${profile_id}', null, null, now(), now()
);
insert into public.birth_profile_revisions(
  id, birth_profile_id, subject_id, revision_no,
  calendar_type, birth_date, birth_time, time_known,
  is_leap_month, sex, input_hash, created_at
) values (
  '${revision_id}', '${profile_id}', 'd0000000-0000-0000-0000-000000000001', 1,
  'solar', date '1991-01-01', time '08:00', true,
  false, 'unspecified', '${hash}', now()
);
update public.birth_profiles
set current_revision_id='${revision_id}', updated_at=now()
where id='${profile_id}';
SQL
}

create_general_reading() {
  local session_id="$1"
  local reading_id="$2"
  local key="$3"
  local hash="$4"
  local source_profile_id="$5"
  "${PSQL[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
    'd0000000-0000-0000-0000-000000000001',
    '${session_id}', '${reading_id}', '${key}', '${hash}',
    'reading-request-v1', jsonb_build_object('idempotencyKey','${key}','domain','general'),
    'general', '${source_profile_id}', null,
    null, null, null, null
  );"
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values
  ('00000000-0000-0000-0000-00000000d001'),
  ('00000000-0000-0000-0000-00000000d002')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('d0000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-00000000d001', 'active', now(), now()),
  ('d0000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-00000000d002', 'active', now(), now());

insert into public.saju_domain_runtime(saju_domain, availability, capability_version, required_engine_version, updated_at)
values
  ('general', 'available', 'reading-general-v1', null, now()),
  ('compatibility', 'partial', 'reading-compat-v1', null, now()),
  ('career', 'unavailable', 'reading-career-v1', null, now());
SQL

seed_birth_profile 'd1000000-0000-0000-0000-000000000001' 'd2000000-0000-0000-0000-000000000011' 'self' 'sha256:v1:self-r1'
seed_birth_profile 'd1000000-0000-0000-0000-000000000002' 'd2000000-0000-0000-0000-000000000021' 'target' 'sha256:v1:target-r1'
seed_birth_profile 'd1000000-0000-0000-0000-000000000003' 'd2000000-0000-0000-0000-000000000031' 'target' 'sha256:v1:target2-r1'

# 1. General session pins exact current self revision and creates logical attempt 1 only.
result="$(create_general_reading \
  'd3000000-0000-0000-0000-000000000001' \
  'd4000000-0000-0000-0000-000000000001' \
  'reading-general-1' 'sha256:v1:reading-general-1' \
  'd1000000-0000-0000-0000-000000000001' | tail -n +1)"
shape="$("${PSQL[@]}" -At -F '|' -c "select
  rs.state, rs.next_attempt_no, rs.current_reading_id,
  rs.source_birth_revision_id, coalesce(rs.target_birth_revision_id::text,''),
  rs.domain_capability_version,
  r.attempt_no, r.execution_status, r.next_execution_attempt_no,
  (select count(*) from public.reading_execution_attempts rea where rea.reading_id=r.id)
from public.reading_sessions rs
join public.readings r on r.id=rs.current_reading_id
where rs.id='d3000000-0000-0000-0000-000000000001';")"
if [[ "${shape}" != 'active|2|d4000000-0000-0000-0000-000000000001|d2000000-0000-0000-0000-000000000011||reading-general-v1|1|pending|1|0' ]]; then
  echo "FAIL reading create persistence shape: ${shape}" >&2
  exit 20
fi
echo "PASS Reading Session create pins current self revision and creates logical attempt 1 without transport attempt"

# 2. Exact idempotency retry replays prior authority even if caller proposes new ids.
replay="$("${PSQL[@]}" -At -F '|' -c "select reading_session_id,reading_id,attempt_no,replayed
from public.cmd_create_reading_session_v1(
  'd0000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000099',
  'd4000000-0000-0000-0000-000000000099',
  'reading-general-1','sha256:v1:reading-general-1',
  'reading-request-v1','{}'::jsonb,
  'general','d1000000-0000-0000-0000-000000000001',null,
  null,null,null,null
);")"
counts="$("${PSQL[@]}" -At -F '|' -c "select
  (select count(*) from public.reading_sessions where subject_id='d0000000-0000-0000-0000-000000000001'),
  (select count(*) from public.readings where subject_id='d0000000-0000-0000-0000-000000000001');")"
if [[ "${replay}|${counts}" != 'd3000000-0000-0000-0000-000000000001|d4000000-0000-0000-0000-000000000001|1|t|1|1' ]]; then
  echo "FAIL reading idempotency replay: ${replay}|${counts}" >&2
  exit 21
fi
echo "PASS exact Reading create retry replays existing session/reading without orphan rows"

expect_failure \
  'same reading idempotency key with different request hash conflicts' \
  'cmd_reading_create_idempotency_conflict' \
  "select * from public.cmd_create_reading_session_v1(
    'd0000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000098','d4000000-0000-0000-0000-000000000098',
    'reading-general-1','sha256:v1:DIFFERENT','reading-request-v1','{}'::jsonb,
    'general','d1000000-0000-0000-0000-000000000001',null,null,null,null,null);"

# 3. Later Birth append does not rewrite the session's pinned immutable revision.
"${PSQL[@]}" -q -c "select * from public.cmd_append_birth_profile_revision_v1(
  'd0000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000011',
  'd2000000-0000-0000-0000-000000000012',
  'solar',date '1991-01-02',time '09:00',true,false,'unspecified','sha256:v1:self-r2');" >/dev/null
pin_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select current_revision_id from public.birth_profiles where id='d1000000-0000-0000-0000-000000000001'),
  (select source_birth_revision_id from public.reading_sessions where id='d3000000-0000-0000-0000-000000000001');")"
if [[ "${pin_shape}" != 'd2000000-0000-0000-0000-000000000012|d2000000-0000-0000-0000-000000000011' ]]; then
  echo "FAIL reading session revision pin drift: ${pin_shape}" >&2
  exit 22
fi
echo "PASS later Birth append leaves existing Reading Session pinned to original immutable revision"

# 4. Compatibility pins one target current revision and accepts partial runtime availability.
compat="$("${PSQL[@]}" -At -F '|' -c "select source_birth_revision_id,target_birth_revision_id,domain_capability_version,replayed
from public.cmd_create_reading_session_v1(
  'd0000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000002','d4000000-0000-0000-0000-000000000002',
  'reading-compat-1','sha256:v1:reading-compat-1','reading-request-v1','{}'::jsonb,
  'compatibility','d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002',
  null,null,null,null
);")"
if [[ "${compat}" != 'd2000000-0000-0000-0000-000000000012|d2000000-0000-0000-0000-000000000021|reading-compat-v1|f' ]]; then
  echo "FAIL compatibility reading pins: ${compat}" >&2
  exit 23
fi
echo "PASS compatibility Reading Session pins self+target current revisions and runtime capability version"

expect_failure \
  'compatibility without target is denied' \
  'ct_reading_session_profile_cardinality' \
  "select * from public.cmd_create_reading_session_v1(
    'd0000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000003','d4000000-0000-0000-0000-000000000003',
    'reading-compat-no-target','sha256:v1:compat-no-target','reading-request-v1','{}'::jsonb,
    'compatibility','d1000000-0000-0000-0000-000000000001',null,null,null,null,null);"

expect_failure \
  'non-compatibility target is denied' \
  'ct_reading_session_profile_cardinality' \
  "select * from public.cmd_create_reading_session_v1(
    'd0000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000004','d4000000-0000-0000-0000-000000000004',
    'reading-general-target','sha256:v1:general-target','reading-request-v1','{}'::jsonb,
    'general','d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002',null,null,null,null);"

# 5. Unavailable domain fails before any session/reading mutation.
before_counts="$("${PSQL[@]}" -At -F '|' -c "select count(*) from public.reading_sessions; select count(*) from public.readings;")"
expect_failure \
  'unavailable Saju domain cannot start a session' \
  'ct_reading_session_domain_available' \
  "select * from public.cmd_create_reading_session_v1(
    'd0000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000005','d4000000-0000-0000-0000-000000000005',
    'reading-career-unavailable','sha256:v1:career-unavailable','reading-request-v1','{}'::jsonb,
    'career','d1000000-0000-0000-0000-000000000001',null,null,null,null,null);"
after_counts="$("${PSQL[@]}" -At -F '|' -c "select count(*) from public.reading_sessions; select count(*) from public.readings;")"
if [[ "${before_counts}" != "${after_counts}" ]]; then
  echo "FAIL unavailable domain left persistence side effect: before=${before_counts} after=${after_counts}" >&2
  exit 24
fi
echo "PASS unavailable domain leaves no Reading Session/reading row"

# 6. Cross-owner source profile probing fails closed.
expect_failure \
  'cross-subject source birth profile is not exposed' \
  'cmd_reading_create_source_profile_not_found' \
  "select * from public.cmd_create_reading_session_v1(
    'd0000000-0000-0000-0000-000000000002',
    'd3000000-0000-0000-0000-000000000006','d4000000-0000-0000-0000-000000000006',
    'reading-cross-owner','sha256:v1:cross-owner','reading-request-v1','{}'::jsonb,
    'general','d1000000-0000-0000-0000-000000000001',null,null,null,null,null);"

# 7. Same idempotency key concurrency yields one session + one reading; loser replays winner.
race_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -At -F '|' -c "select reading_session_id,reading_id,replayed
from public.cmd_create_reading_session_v1(
  'd0000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000071','d4000000-0000-0000-0000-000000000071',
  'reading-race','sha256:v1:reading-race','reading-request-v1','{}'::jsonb,
  'general','d1000000-0000-0000-0000-000000000001',null,null,null,null,null
);" >"${race_dir}/a.out" 2>&1 &
a_pid=$!
"${PSQL[@]}" -q -At -F '|' -c "select reading_session_id,reading_id,replayed
from public.cmd_create_reading_session_v1(
  'd0000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000072','d4000000-0000-0000-0000-000000000072',
  'reading-race','sha256:v1:reading-race','reading-request-v1','{}'::jsonb,
  'general','d1000000-0000-0000-0000-000000000001',null,null,null,null,null
);" >"${race_dir}/b.out" 2>&1 &
b_pid=$!
wait "${a_pid}"; a_status=$?
wait "${b_pid}"; b_status=$?
set -e
if [[ ${a_status} -ne 0 || ${b_status} -ne 0 ]]; then
  echo "FAIL concurrent same-key Reading create should replay, not fail" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 25
fi
race_counts="$("${PSQL[@]}" -At -F '|' -c "select
  (select count(*) from public.readings where subject_id='d0000000-0000-0000-0000-000000000001' and request_idempotency_key='reading-race'),
  (select count(*) from public.reading_sessions rs join public.readings r on r.reading_session_id=rs.id where r.subject_id='d0000000-0000-0000-0000-000000000001' and r.request_idempotency_key='reading-race');")"
if [[ "${race_counts}" != '1|1' ]]; then
  echo "FAIL concurrent Reading create produced duplicate/orphan authority: ${race_counts}" >&2
  exit 26
fi
race_a="$(cat "${race_dir}/a.out")"
race_b="$(cat "${race_dir}/b.out")"
if [[ "${race_a}" != *'|f'* && "${race_b}" != *'|f'* ]]; then
  echo "FAIL same-key race has no mutation winner" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 27
fi
if [[ "${race_a}" != *'|t'* && "${race_b}" != *'|t'* ]]; then
  echo "FAIL same-key race loser did not replay winner" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 28
fi
echo "PASS concurrent same-key Reading create -> one logical session/reading plus authoritative replay"
rm -rf "${race_dir}"

# 8. Character-triggered reading requires exact bundle capability and thread participation.
"${PSQL[@]}" <<'SQL'
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
  asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values (
  'da000000-0000-0000-0000-000000000001','reading-char-bundle-v1','sha256:v1:reading-char-bundle',
  'test://reading-char-bundle','bundle-v1','0.0.1-dev','sha256:v1:reading-char-assets','cue-v1','{}'::jsonb,now()
);
insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_policy_version,rollout_seed,activated_at,created_at
) values (
  'db000000-0000-0000-0000-000000000001','reading-char-release','da000000-0000-0000-0000-000000000001',
  'active',false,'test-rollout-v1','reading-char-seed',now(),now()
);
insert into public.characters(character_id,created_at) values ('reading-char',now());
insert into public.character_runtime_catalog(character_id,content_bundle_id,availability,enabled,published_at)
values ('reading-char','da000000-0000-0000-0000-000000000001','available',true,now());
insert into public.character_capabilities(id,content_bundle_id,character_id,saju_domain,role,can_initiate,capability_version)
values ('dc000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000001','reading-char','general','primary',true,'reading-general-v1');
insert into public.conversation_threads(
  id,subject_id,thread_type,status,active_content_release_id,active_content_bundle_id,next_sequence_no,created_at,updated_at
) values (
  'dd000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','single_character','active',
  'db000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000001',1,now(),now()
);
insert into public.conversation_thread_characters(id,thread_id,character_id,content_bundle_id,role,joined_at)
values ('de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','reading-char','da000000-0000-0000-0000-000000000001','primary',now()-interval '1 minute');
insert into public.chat_turns(
  id,thread_id,subject_id,client_turn_id,request_hash,request_contract_version,request_snapshot_jsonb,
  resolved_content_release_id,resolved_content_bundle_id,state,created_at,updated_at
) values (
  'df000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',
  'reading-source-turn','sha256:v1:reading-source-turn','chat-v1','{}'::jsonb,
  'db000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000001','failed_final',now(),now()
);
SQL
char_result="$("${PSQL[@]}" -At -F '|' -c "select reading_id,replayed
from public.cmd_create_reading_session_v1(
  'd0000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000008','d4000000-0000-0000-0000-000000000008',
  'reading-char-1','sha256:v1:reading-char-1','reading-request-v1','{}'::jsonb,
  'general','d1000000-0000-0000-0000-000000000001',null,
  'df000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001',
  'reading-char','da000000-0000-0000-0000-000000000001'
);")"
if [[ "${char_result}" != 'd4000000-0000-0000-0000-000000000008|f' ]]; then
  echo "FAIL character-triggered reading create: ${char_result}" >&2
  exit 29
fi
echo "PASS character-triggered Reading create preserves exact source-turn participation and capability authority"

expect_failure \
  'character-triggered reading without exact participation is denied' \
  'ct_reading_character_participation' \
  "select * from public.cmd_create_reading_session_v1(
    'd0000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000009','d4000000-0000-0000-0000-000000000009',
    'reading-char-no-participant','sha256:v1:char-no-participant','reading-request-v1','{}'::jsonb,
    'general','d1000000-0000-0000-0000-000000000001',null,
    'df000000-0000-0000-0000-000000000001',null,
    'reading-char','da000000-0000-0000-0000-000000000001');"

public_grant_count="$("${PSQL[@]}" -At -c "select count(*) from information_schema.routine_privileges
where routine_schema='public'
  and routine_name='cmd_create_reading_session_v1'
  and grantee='PUBLIC'
  and privilege_type='EXECUTE';")"
if [[ "${public_grant_count}" != '0' ]]; then
  echo "FAIL Reading create command unexpectedly has PUBLIC EXECUTE" >&2
  exit 30
fi
echo "PASS Reading create command PUBLIC EXECUTE remains revoked while P0-AUTH-01 is open"

echo "reading session create persistence/concurrency tests passed"
