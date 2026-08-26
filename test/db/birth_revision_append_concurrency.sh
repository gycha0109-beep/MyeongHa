#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)

expect_failure() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local output
  local status

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

seed_profile() {
  local profile_id="$1"
  local revision_id="$2"
  local kind="$3"
  local label="$4"

  "${PSQL[@]}" -q <<SQL >/dev/null
insert into public.birth_profiles(
  id, subject_id, profile_kind, label, current_revision_id,
  archived_at, created_at, updated_at
) values (
  '${profile_id}',
  'c0000000-0000-0000-0000-000000000001',
  '${kind}',
  '${label}',
  null,
  null,
  now(), now()
);

insert into public.birth_profile_revisions(
  id, birth_profile_id, subject_id, revision_no,
  calendar_type, birth_date, birth_time, time_known,
  is_leap_month, sex, input_hash, created_at
) values (
  '${revision_id}',
  '${profile_id}',
  'c0000000-0000-0000-0000-000000000001',
  1,
  'solar', date '1990-01-01', time '08:30', true,
  false, 'male', 'sha256:v1:${label}-r1', now()
);

update public.birth_profiles
set current_revision_id='${revision_id}', updated_at=now()
where id='${profile_id}';
SQL
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c002')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('c0000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-00000000c001', 'active', now(), now()),
  ('c0000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-00000000c002', 'active', now(), now());
SQL

# 1. Normal append: one immutable revision + atomic current pointer move.
seed_profile \
  'c1000000-0000-0000-0000-000000000001' \
  'c2000000-0000-0000-0000-000000000011' \
  'self' \
  'normal'

append_result="$("${PSQL[@]}" -At -F '|' -c "select revision_id,revision_no,replayed
from public.cmd_append_birth_profile_revision_v1(
  'c0000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000011',
  'c2000000-0000-0000-0000-000000000012',
  'lunar', date '1990-01-02', time '09:45', true,
  true, 'female', 'sha256:v1:normal-r2'
);")"
if [[ "${append_result}" != 'c2000000-0000-0000-0000-000000000012|2|f' ]]; then
  echo "FAIL normal append result: ${append_result}" >&2
  exit 20
fi
normal_shape="$("${PSQL[@]}" -At -F '|' -c "select
  bp.current_revision_id,
  count(br.*),
  max(br.revision_no),
  (select input_hash from public.birth_profile_revisions where id='c2000000-0000-0000-0000-000000000011')
from public.birth_profiles bp
join public.birth_profile_revisions br on br.birth_profile_id=bp.id
where bp.id='c1000000-0000-0000-0000-000000000001'
group by bp.current_revision_id;")"
if [[ "${normal_shape}" != 'c2000000-0000-0000-0000-000000000012|2|2|sha256:v1:normal-r1' ]]; then
  echo "FAIL normal append persistence shape: ${normal_shape}" >&2
  exit 21
fi
echo "PASS birth append atomically advances current pointer and preserves prior revision"

# 2. Response-loss retry with exact same deterministic revision id/input replays.
replay_result="$("${PSQL[@]}" -At -F '|' -c "select revision_id,revision_no,replayed
from public.cmd_append_birth_profile_revision_v1(
  'c0000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000011',
  'c2000000-0000-0000-0000-000000000012',
  'lunar', date '1990-01-02', time '09:45', true,
  true, 'female', 'sha256:v1:normal-r2'
);")"
replay_count="$("${PSQL[@]}" -At -c "select count(*) from public.birth_profile_revisions where birth_profile_id='c1000000-0000-0000-0000-000000000001';")"
if [[ "${replay_result}|${replay_count}" != 'c2000000-0000-0000-0000-000000000012|2|t|2' ]]; then
  echo "FAIL append replay: ${replay_result}|${replay_count}" >&2
  exit 22
fi
echo "PASS exact append retry replays authoritative revision without duplicate row"

expect_failure \
  'same revision id with different canonical input conflicts' \
  'cmd_birth_revision_replay_conflict' \
  "select * from public.cmd_append_birth_profile_revision_v1(
    'c0000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000011',
    'c2000000-0000-0000-0000-000000000012',
    'lunar', date '1990-01-02', time '09:45', true,
    true, 'female', 'sha256:v1:DIFFERENT');"

# 3. Stale expected pointer cannot branch the revision stream.
expect_failure \
  'stale expected revision is rejected' \
  'cmd_birth_revision_revision_conflict' \
  "select * from public.cmd_append_birth_profile_revision_v1(
    'c0000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000011',
    'c2000000-0000-0000-0000-000000000013',
    'solar', date '1990-01-03', time '10:00', true,
    false, 'unspecified', 'sha256:v1:stale');"

# 4. Constraint failure rolls back both insert and pointer movement.
seed_profile \
  'c1000000-0000-0000-0000-000000000002' \
  'c2000000-0000-0000-0000-000000000021' \
  'target' \
  'rollback'

expect_failure \
  'invalid time shape is rejected by birth schema' \
  'birth_profile_revisions_time_shape_check' \
  "select * from public.cmd_append_birth_profile_revision_v1(
    'c0000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000021',
    'c2000000-0000-0000-0000-000000000022',
    'solar', date '1992-02-02', null, true,
    false, 'female', 'sha256:v1:rollback-invalid');"
rollback_shape="$("${PSQL[@]}" -At -F '|' -c "select bp.current_revision_id,
  count(br.*), max(br.revision_no)
from public.birth_profiles bp
join public.birth_profile_revisions br on br.birth_profile_id=bp.id
where bp.id='c1000000-0000-0000-0000-000000000002'
group by bp.current_revision_id;")"
if [[ "${rollback_shape}" != 'c2000000-0000-0000-0000-000000000021|1|1' ]]; then
  echo "FAIL invalid append left half-applied state: ${rollback_shape}" >&2
  exit 23
fi
echo "PASS failed birth revision insert leaves current pointer unchanged"

expect_failure \
  'empty canonical input hash is rejected before mutation' \
  'cmd_birth_revision_input_hash_required' \
  "select * from public.cmd_append_birth_profile_revision_v1(
    'c0000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000021',
    'c2000000-0000-0000-0000-000000000023',
    'solar', date '1992-02-02', time '07:00', true,
    false, 'female', '');"

# 5. Two writers with the same expected current revision serialize; one append wins.
seed_profile \
  'c1000000-0000-0000-0000-000000000003' \
  'c2000000-0000-0000-0000-000000000031' \
  'target' \
  'race'

race_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -c "begin; select * from public.cmd_append_birth_profile_revision_v1(
  'c0000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000003',
  'c2000000-0000-0000-0000-000000000031',
  'c2000000-0000-0000-0000-000000000032',
  'solar', date '1993-03-02', time '06:00', true,
  false, 'male', 'sha256:v1:race-a'); select pg_sleep(0.4); commit;" >"${race_dir}/a.out" 2>&1 &
a_pid=$!
"${PSQL[@]}" -q -c "begin; select * from public.cmd_append_birth_profile_revision_v1(
  'c0000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000003',
  'c2000000-0000-0000-0000-000000000031',
  'c2000000-0000-0000-0000-000000000033',
  'solar', date '1993-03-03', time '06:30', true,
  false, 'male', 'sha256:v1:race-b'); select pg_sleep(0.4); commit;" >"${race_dir}/b.out" 2>&1 &
b_pid=$!
wait "${a_pid}"; a_status=$?
wait "${b_pid}"; b_status=$?
set -e

if [[ ${a_status} -eq ${b_status} ]]; then
  echo "FAIL concurrent birth append expected exactly one winner: a=${a_status} b=${b_status}" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 24
fi
if [[ ${a_status} -ne 0 && "$(cat "${race_dir}/a.out")" != *'cmd_birth_revision_revision_conflict'* ]]; then
  echo "FAIL writer A lost without revision conflict" >&2
  cat "${race_dir}/a.out" >&2
  exit 25
fi
if [[ ${b_status} -ne 0 && "$(cat "${race_dir}/b.out")" != *'cmd_birth_revision_revision_conflict'* ]]; then
  echo "FAIL writer B lost without revision conflict" >&2
  cat "${race_dir}/b.out" >&2
  exit 26
fi
race_shape="$("${PSQL[@]}" -At -F '|' -c "select
  count(*), min(revision_no), max(revision_no),
  bp.current_revision_id,
  (select count(*) from public.birth_profile_revisions r2 where r2.birth_profile_id=bp.id and r2.revision_no=2)
from public.birth_profiles bp
join public.birth_profile_revisions br on br.birth_profile_id=bp.id
where bp.id='c1000000-0000-0000-0000-000000000003'
group by bp.id,bp.current_revision_id;")"
if [[ "${race_shape}" != c2* ]]; then
  :
fi
IFS='|' read -r race_count race_min race_max race_current race_rev2_count <<<"${race_shape}"
if [[ "${race_count}|${race_min}|${race_max}|${race_rev2_count}" != '2|1|2|1' ]]; then
  echo "FAIL concurrent append branched revision stream: ${race_shape}" >&2
  exit 27
fi
if [[ "${race_current}" != 'c2000000-0000-0000-0000-000000000032' && "${race_current}" != 'c2000000-0000-0000-0000-000000000033' ]]; then
  echo "FAIL race current pointer is not the winning revision: ${race_current}" >&2
  exit 28
fi
echo "PASS concurrent same-expected append -> one revision_no=2 winner, stale writer denied"
rm -rf "${race_dir}"

# 6. The allocator follows the locked current pointer, not MAX(revision_no)+1.
seed_profile \
  'c1000000-0000-0000-0000-000000000004' \
  'c2000000-0000-0000-0000-000000000041' \
  'target' \
  'pointer'
"${PSQL[@]}" -q -c "insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  'c2000000-0000-0000-0000-000000000049',
  'c1000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000001',
  9,'solar',date '1994-04-09',time '09:00',true,false,'female','sha256:v1:pointer-orphan-r9',now()
);" >/dev/null
pointer_result="$("${PSQL[@]}" -At -F '|' -c "select revision_no,replayed
from public.cmd_append_birth_profile_revision_v1(
  'c0000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000004',
  'c2000000-0000-0000-0000-000000000041',
  'c2000000-0000-0000-0000-000000000042',
  'solar', date '1994-04-02', time '08:00', true,
  false, 'female', 'sha256:v1:pointer-r2'
);")"
if [[ "${pointer_result}" != '2|f' ]]; then
  echo "FAIL revision allocator used global MAX instead of current pointer: ${pointer_result}" >&2
  exit 29
fi
echo "PASS revision allocator derives 2 from locked current revision even with unrelated higher revision row"

# 7. Cross-owner probe fails closed and immutable history remains immutable.
expect_failure \
  'cross-subject birth profile probe is denied' \
  'cmd_birth_revision_profile_not_found' \
  "select * from public.cmd_append_birth_profile_revision_v1(
    'c0000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000004',
    'c2000000-0000-0000-0000-000000000041',
    'c2000000-0000-0000-0000-000000000043',
    'solar', date '1994-04-03', time '08:30', true,
    false, 'female', 'sha256:v1:cross-owner');"

expect_failure \
  'prior birth revision cannot be rewritten after append' \
  'tr_birth_revision_immutable' \
  "update public.birth_profile_revisions set input_hash='sha256:v1:rewrite' where id='c2000000-0000-0000-0000-000000000041';"

public_grant_count="$("${PSQL[@]}" -At -c "select count(*) from information_schema.routine_privileges
where routine_schema='public'
  and routine_name='cmd_append_birth_profile_revision_v1'
  and grantee='PUBLIC'
  and privilege_type='EXECUTE';")"
if [[ "${public_grant_count}" != '0' ]]; then
  echo "FAIL birth append command unexpectedly has PUBLIC EXECUTE" >&2
  exit 30
fi
echo "PASS birth append command PUBLIC EXECUTE remains revoked while P0-AUTH-01 is open"

echo "birth revision append persistence/concurrency tests passed"
