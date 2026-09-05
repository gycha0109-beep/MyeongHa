#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    fail "$label unexpectedly succeeded"
  fi
  if [[ "$out" != *"$needle"* ]]; then
    echo "$out" >&2
    fail "$label failed for unexpected reason"
  fi
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('9d100000-0000-0000-0000-000000000001'),
  ('9d100000-0000-0000-0000-000000000002'),
  ('9d100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('9d200000-0000-0000-0000-000000000001','member','9d100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9d200000-0000-0000-0000-000000000002','member','9d100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9d200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9d200000-0000-0000-0000-000000000004','member','9d100000-0000-0000-0000-000000000004','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-20 00:00:00+00');

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at) values
  ('9d300000-0000-0000-0000-000000000001','9d200000-0000-0000-0000-000000000001','self','owner-self',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9d300000-0000-0000-0000-000000000002','9d200000-0000-0000-0000-000000000001','target','archived-target',null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-02 00:00:00+00',timestamptz '2026-08-20 00:00:00+00'),
  ('9d300000-0000-0000-0000-000000000003','9d200000-0000-0000-0000-000000000002','self','other-self',null,null,timestamptz '2026-08-03 00:00:00+00',timestamptz '2026-08-03 00:00:00+00'),
  ('9d300000-0000-0000-0000-000000000004','9d200000-0000-0000-0000-000000000003','self','guest-self',null,null,timestamptz '2026-08-04 00:00:00+00',timestamptz '2026-08-04 00:00:00+00'),
  ('9d300000-0000-0000-0000-000000000005','9d200000-0000-0000-0000-000000000004','self','deleting-self',null,null,timestamptz '2026-08-05 00:00:00+00',timestamptz '2026-08-05 00:00:00+00');

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values
  ('9d400000-0000-0000-0000-000000000011','9d300000-0000-0000-0000-000000000001','9d200000-0000-0000-0000-000000000001',1,'solar',date '1990-01-01',time '08:00',true,false,'female','sha256:v1:birth-owner-r1',timestamptz '2026-08-01 00:00:00+00'),
  ('9d400000-0000-0000-0000-000000000012','9d300000-0000-0000-0000-000000000001','9d200000-0000-0000-0000-000000000001',2,'solar',date '1990-01-02',time '08:30',true,false,'female','sha256:v1:birth-owner-r2',timestamptz '2026-08-10 00:00:00+00'),
  ('9d400000-0000-0000-0000-000000000021','9d300000-0000-0000-0000-000000000002','9d200000-0000-0000-0000-000000000001',1,'lunar',date '1988-05-05',null,false,true,'male','sha256:v1:birth-target-r1',timestamptz '2026-08-02 00:00:00+00'),
  ('9d400000-0000-0000-0000-000000000031','9d300000-0000-0000-0000-000000000003','9d200000-0000-0000-0000-000000000002',1,'solar',date '1992-03-03',time '07:00',true,false,'unspecified','sha256:v1:birth-other-r1',timestamptz '2026-08-03 00:00:00+00'),
  ('9d400000-0000-0000-0000-000000000041','9d300000-0000-0000-0000-000000000004','9d200000-0000-0000-0000-000000000003',1,'solar',date '1993-04-04',null,false,false,'unspecified','sha256:v1:birth-guest-r1',timestamptz '2026-08-04 00:00:00+00'),
  ('9d400000-0000-0000-0000-000000000051','9d300000-0000-0000-0000-000000000005','9d200000-0000-0000-0000-000000000004',1,'solar',date '1994-05-05',time '06:00',true,false,'male','sha256:v1:birth-deleting-r1',timestamptz '2026-08-05 00:00:00+00');

update public.birth_profiles set current_revision_id='9d400000-0000-0000-0000-000000000012',updated_at=timestamptz '2026-08-10 00:00:00+00' where id='9d300000-0000-0000-0000-000000000001';
update public.birth_profiles set current_revision_id='9d400000-0000-0000-0000-000000000021' where id='9d300000-0000-0000-0000-000000000002';
update public.birth_profiles set current_revision_id='9d400000-0000-0000-0000-000000000031' where id='9d300000-0000-0000-0000-000000000003';
update public.birth_profiles set current_revision_id='9d400000-0000-0000-0000-000000000041' where id='9d300000-0000-0000-0000-000000000004';
update public.birth_profiles set current_revision_id='9d400000-0000-0000-0000-000000000051' where id='9d300000-0000-0000-0000-000000000005';
SQL

before_state=$("${psql_base[@]}" -At -F '|' -c "select
  (select count(*) from public.birth_profiles where subject_id='9d200000-0000-0000-0000-000000000001'),
  (select count(*) from public.birth_profile_revisions where subject_id='9d200000-0000-0000-0000-000000000001'),
  (select current_revision_id from public.birth_profiles where id='9d300000-0000-0000-0000-000000000001');")

shape=$("${psql_base[@]}" -At -F '|' -c "select
  birth_profile_id,profile_kind,label,current_revision_id,
  coalesce(archived_at::text,''),current_revision_no,current_calendar_type,current_birth_date,
  current_birth_time,current_time_known,current_is_leap_month,current_sex,
  revision_id,revision_no,is_current_revision
from public.qry_birth_profile_current_revision_v1(
  '9d200000-0000-0000-0000-000000000001','9d300000-0000-0000-0000-000000000001'
);")
expected=$'9d300000-0000-0000-0000-000000000001|self|owner-self|9d400000-0000-0000-0000-000000000012||2|solar|1990-01-02|08:30:00|t|f|female|9d400000-0000-0000-0000-000000000012|2|t\n9d300000-0000-0000-0000-000000000001|self|owner-self|9d400000-0000-0000-0000-000000000012||2|solar|1990-01-02|08:30:00|t|f|female|9d400000-0000-0000-0000-000000000011|1|f'
[[ "$shape" == "$expected" ]] || fail "Birth Profile current/revision summary mismatch: $shape"
pass "Birth Profile read returns exact current revision plus deterministic revision summary"

json_shape=$("${psql_base[@]}" -Atc "select json_agg(row_to_json(q) order by revision_no desc)::text from public.qry_birth_profile_current_revision_v1('9d200000-0000-0000-0000-000000000001','9d300000-0000-0000-0000-000000000001') q;")
[[ "$json_shape" == *'1990-01-02'* ]] || fail "current Birth input missing from projection"
[[ "$json_shape" != *'1990-01-01'* ]] || fail "historical exact Birth input leaked beyond revision summary"
[[ "$json_shape" != *'input_hash'* ]] || fail "input_hash field leaked into Birth Profile projection"
[[ "$json_shape" != *'sha256:v1:birth-owner'* ]] || fail "canonical Birth input hash value leaked into projection"
pass "historical Birth rows are revision summaries and canonical input hashes stay internal"

archived_shape=$("${psql_base[@]}" -At -F '|' -c "select
  profile_kind,label,archived_at,current_revision_no,current_calendar_type,current_birth_date,
  current_time_known,current_is_leap_month,current_sex,revision_no,is_current_revision
from public.qry_birth_profile_current_revision_v1(
  '9d200000-0000-0000-0000-000000000001','9d300000-0000-0000-0000-000000000002'
);")
expected_archived='target|archived-target|2026-08-20 00:00:00+00|1|lunar|1988-05-05|f|t|male|1|t'
[[ "$archived_shape" == "$expected_archived" ]] || fail "archived Birth Profile stored-state projection mismatch: $archived_shape"
pass "archived_at is projected as stored state without inventing SRC-06 deletion semantics"

guest_shape=$("${psql_base[@]}" -At -F '|' -c "select profile_kind,current_birth_date,revision_no,is_current_revision from public.qry_birth_profile_current_revision_v1('9d200000-0000-0000-0000-000000000003','9d300000-0000-0000-0000-000000000004');")
[[ "$guest_shape" == 'self|1993-04-04|1|t' ]] || fail "active guest Birth Profile read mismatch: $guest_shape"
pass "active canonical guest can read its owned Birth Profile"

expect_fail "cross-owner Birth Profile probe is denied" "birth profile was not found for this subject" \
  "select * from public.qry_birth_profile_current_revision_v1('9d200000-0000-0000-0000-000000000001','9d300000-0000-0000-0000-000000000003');"
expect_fail "unknown Birth Profile probe is denied" "birth profile was not found for this subject" \
  "select * from public.qry_birth_profile_current_revision_v1('9d200000-0000-0000-0000-000000000001','9d300000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending generic Birth Profile read is denied" "birth profile read requires an active canonical subject" \
  "select * from public.qry_birth_profile_current_revision_v1('9d200000-0000-0000-0000-000000000004','9d300000-0000-0000-0000-000000000005');"
expect_fail "Birth Profile subject is required" "birth profile subject is required" \
  "select * from public.qry_birth_profile_current_revision_v1(null,'9d300000-0000-0000-0000-000000000001');"
expect_fail "Birth Profile id is required" "birth profile id is required" \
  "select * from public.qry_birth_profile_current_revision_v1('9d200000-0000-0000-0000-000000000001',null);"

after_state=$("${psql_base[@]}" -At -F '|' -c "select
  (select count(*) from public.birth_profiles where subject_id='9d200000-0000-0000-0000-000000000001'),
  (select count(*) from public.birth_profile_revisions where subject_id='9d200000-0000-0000-0000-000000000001'),
  (select current_revision_id from public.birth_profiles where id='9d300000-0000-0000-0000-000000000001');")
[[ "$after_state" == "$before_state" ]] || fail "Birth Profile read mutated authority: before=$before_state after=$after_state"
pass "Birth Profile read is projection-only"

public_exec=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.qry_birth_profile_current_revision_v1(uuid,uuid)','EXECUTE');")
[[ "$public_exec" == 'f' ]] || fail "Birth Profile query unexpectedly grants PUBLIC EXECUTE"

table_count=$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
[[ "$table_count" == '60' ]] || fail "public table catalog drifted: $table_count"
pass "Birth Profile query PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "Birth Profile current/revision summary query tests passed"
