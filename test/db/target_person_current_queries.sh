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
  ('9e100000-0000-0000-0000-000000000001'),
  ('9e100000-0000-0000-0000-000000000002'),
  ('9e100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('9e200000-0000-0000-0000-000000000001','member','9e100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9e200000-0000-0000-0000-000000000002','member','9e100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9e200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9e200000-0000-0000-0000-000000000004','member','9e100000-0000-0000-0000-000000000004','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-20 00:00:00+00');

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at) values
  ('9e300000-0000-0000-0000-000000000001','9e200000-0000-0000-0000-000000000001','target','target-a-birth',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('9e300000-0000-0000-0000-000000000002','9e200000-0000-0000-0000-000000000001','target','target-b-birth',null,null,timestamptz '2026-08-02 00:00:00+00',timestamptz '2026-08-02 00:00:00+00'),
  ('9e300000-0000-0000-0000-000000000003','9e200000-0000-0000-0000-000000000001','target','deleted-target-birth',null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-03 00:00:00+00',timestamptz '2026-08-20 00:00:00+00'),
  ('9e300000-0000-0000-0000-000000000004','9e200000-0000-0000-0000-000000000002','target','other-target-birth',null,null,timestamptz '2026-08-04 00:00:00+00',timestamptz '2026-08-04 00:00:00+00'),
  ('9e300000-0000-0000-0000-000000000005','9e200000-0000-0000-0000-000000000003','target','guest-target-birth',null,null,timestamptz '2026-08-05 00:00:00+00',timestamptz '2026-08-05 00:00:00+00'),
  ('9e300000-0000-0000-0000-000000000006','9e200000-0000-0000-0000-000000000004','target','deleting-target-birth',null,null,timestamptz '2026-08-06 00:00:00+00',timestamptz '2026-08-06 00:00:00+00');

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values
  ('9e400000-0000-0000-0000-000000000011','9e300000-0000-0000-0000-000000000001','9e200000-0000-0000-0000-000000000001',1,'solar',date '1990-01-01',time '08:00',true,false,'female','sha256:v1:target-a-r1',timestamptz '2026-08-01 00:00:00+00'),
  ('9e400000-0000-0000-0000-000000000012','9e300000-0000-0000-0000-000000000001','9e200000-0000-0000-0000-000000000001',2,'solar',date '1990-01-02',time '08:30',true,false,'female','sha256:v1:target-a-r2',timestamptz '2026-08-10 00:00:00+00'),
  ('9e400000-0000-0000-0000-000000000021','9e300000-0000-0000-0000-000000000002','9e200000-0000-0000-0000-000000000001',1,'lunar',date '1988-05-05',null,false,true,'male','sha256:v1:target-b-r1',timestamptz '2026-08-02 00:00:00+00'),
  ('9e400000-0000-0000-0000-000000000031','9e300000-0000-0000-0000-000000000003','9e200000-0000-0000-0000-000000000001',1,'solar',date '1987-07-07',null,false,false,'unspecified','sha256:v1:deleted-r1',timestamptz '2026-08-03 00:00:00+00'),
  ('9e400000-0000-0000-0000-000000000041','9e300000-0000-0000-0000-000000000004','9e200000-0000-0000-0000-000000000002',1,'solar',date '1992-03-03',time '07:00',true,false,'female','sha256:v1:other-r1',timestamptz '2026-08-04 00:00:00+00'),
  ('9e400000-0000-0000-0000-000000000051','9e300000-0000-0000-0000-000000000005','9e200000-0000-0000-0000-000000000003',1,'solar',date '1993-04-04',null,false,false,'unspecified','sha256:v1:guest-r1',timestamptz '2026-08-05 00:00:00+00'),
  ('9e400000-0000-0000-0000-000000000061','9e300000-0000-0000-0000-000000000006','9e200000-0000-0000-0000-000000000004',1,'solar',date '1994-05-05',time '06:00',true,false,'male','sha256:v1:deleting-r1',timestamptz '2026-08-06 00:00:00+00');

update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000012',updated_at=timestamptz '2026-08-10 00:00:00+00' where id='9e300000-0000-0000-0000-000000000001';
update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000021' where id='9e300000-0000-0000-0000-000000000002';
update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000031' where id='9e300000-0000-0000-0000-000000000003';
update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000041' where id='9e300000-0000-0000-0000-000000000004';
update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000051' where id='9e300000-0000-0000-0000-000000000005';
update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000061' where id='9e300000-0000-0000-0000-000000000006';

insert into public.target_person_profiles(id,subject_id,birth_profile_id,display_label,relationship_label,created_at,deleted_at) values
  ('9e500000-0000-0000-0000-000000000001','9e200000-0000-0000-0000-000000000001','9e300000-0000-0000-0000-000000000001','A','friend',timestamptz '2026-08-01 00:00:00+00',null),
  ('9e500000-0000-0000-0000-000000000002','9e200000-0000-0000-0000-000000000001','9e300000-0000-0000-0000-000000000002','B','partner',timestamptz '2026-08-12 00:00:00+00',null),
  ('9e500000-0000-0000-0000-000000000003','9e200000-0000-0000-0000-000000000001','9e300000-0000-0000-0000-000000000003','Deleted','former',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-21 00:00:00+00'),
  ('9e500000-0000-0000-0000-000000000004','9e200000-0000-0000-0000-000000000002','9e300000-0000-0000-0000-000000000004','Other','friend',timestamptz '2026-08-04 00:00:00+00',null),
  ('9e500000-0000-0000-0000-000000000005','9e200000-0000-0000-0000-000000000003','9e300000-0000-0000-0000-000000000005','Guest target',null,timestamptz '2026-08-05 00:00:00+00',null),
  ('9e500000-0000-0000-0000-000000000006','9e200000-0000-0000-0000-000000000004','9e300000-0000-0000-0000-000000000006','Deleting target',null,timestamptz '2026-08-06 00:00:00+00',null);
SQL

before_state=$("${psql_base[@]}" -At -F '|' -c "select
  (select count(*) from public.target_person_profiles where subject_id='9e200000-0000-0000-0000-000000000001'),
  (select count(*) from public.birth_profile_revisions where subject_id='9e200000-0000-0000-0000-000000000001'),
  (select current_revision_id from public.birth_profiles where id='9e300000-0000-0000-0000-000000000001');")

list_shape=$("${psql_base[@]}" -At -F '|' -c "select
  target_person_id,display_label,relationship_label,birth_profile_id,current_birth_revision_id,
  current_revision_no,current_calendar_type,current_birth_date,coalesce(current_birth_time::text,''),
  current_time_known,current_is_leap_month,current_sex
from public.qry_target_persons_v1('9e200000-0000-0000-0000-000000000001');")
expected_list=$'9e500000-0000-0000-0000-000000000002|B|partner|9e300000-0000-0000-0000-000000000002|9e400000-0000-0000-0000-000000000021|1|lunar|1988-05-05||f|t|male\n9e500000-0000-0000-0000-000000000001|A|friend|9e300000-0000-0000-0000-000000000001|9e400000-0000-0000-0000-000000000012|2|solar|1990-01-02|08:30:00|t|f|female'
[[ "$list_shape" == "$expected_list" ]] || fail "Target Person current list mismatch: $list_shape"
pass "Target Person list returns only current non-deleted owner rows in deterministic order"

detail_shape=$("${psql_base[@]}" -At -F '|' -c "select
  target_person_id,display_label,relationship_label,birth_profile_id,current_birth_revision_id,
  current_revision_no,current_calendar_type,current_birth_date,current_birth_time,current_time_known,current_is_leap_month,current_sex
from public.qry_target_person_v1('9e200000-0000-0000-0000-000000000001','9e500000-0000-0000-0000-000000000001');")
expected_detail='9e500000-0000-0000-0000-000000000001|A|friend|9e300000-0000-0000-0000-000000000001|9e400000-0000-0000-0000-000000000012|2|solar|1990-01-02|08:30:00|t|f|female'
[[ "$detail_shape" == "$expected_detail" ]] || fail "Target Person detail mismatch: $detail_shape"
pass "Target Person detail exposes exact current Birth revision needed by owner-facing reading/edit flow"

json_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_target_person_v1('9e200000-0000-0000-0000-000000000001','9e500000-0000-0000-0000-000000000001') q;")
[[ "$json_shape" != *'input_hash'* ]] || fail "Birth input_hash field leaked into Target Person projection"
[[ "$json_shape" != *'sha256:v1:'* ]] || fail "Birth canonical hash value leaked into Target Person projection"
[[ "$json_shape" != *'1990-01-01'* ]] || fail "historical Birth input leaked into current Target Person projection"
pass "Target Person projection excludes historical Birth inputs and canonical hash provenance"

expect_fail "deleted Target Person is absent from current detail projection" "target person was not found for this subject" \
  "select * from public.qry_target_person_v1('9e200000-0000-0000-0000-000000000001','9e500000-0000-0000-0000-000000000003');"
expect_fail "cross-owner Target Person probe is denied" "target person was not found for this subject" \
  "select * from public.qry_target_person_v1('9e200000-0000-0000-0000-000000000001','9e500000-0000-0000-0000-000000000004');"
expect_fail "unknown Target Person probe is denied" "target person was not found for this subject" \
  "select * from public.qry_target_person_v1('9e200000-0000-0000-0000-000000000001','9e500000-0000-0000-0000-000000000099');"

guest_shape=$("${psql_base[@]}" -At -F '|' -c "select target_person_id,display_label,current_birth_date from public.qry_target_persons_v1('9e200000-0000-0000-0000-000000000003');")
[[ "$guest_shape" == '9e500000-0000-0000-0000-000000000005|Guest target|1993-04-04' ]] || fail "active guest Target Person list mismatch: $guest_shape"
pass "active canonical guest can read owned current Target Person projection"

expect_fail "deletion-pending generic Target Person read is denied" "target person read requires an active canonical subject" \
  "select * from public.qry_target_persons_v1('9e200000-0000-0000-0000-000000000004');"
expect_fail "Target Person list subject is required" "target person subject is required" \
  "select * from public.qry_target_persons_v1(null);"
expect_fail "Target Person detail subject is required" "target person subject is required" \
  "select * from public.qry_target_person_v1(null,'9e500000-0000-0000-0000-000000000001');"
expect_fail "Target Person detail id is required" "target person id is required" \
  "select * from public.qry_target_person_v1('9e200000-0000-0000-0000-000000000001',null);"

after_state=$("${psql_base[@]}" -At -F '|' -c "select
  (select count(*) from public.target_person_profiles where subject_id='9e200000-0000-0000-0000-000000000001'),
  (select count(*) from public.birth_profile_revisions where subject_id='9e200000-0000-0000-0000-000000000001'),
  (select current_revision_id from public.birth_profiles where id='9e300000-0000-0000-0000-000000000001');")
[[ "$after_state" == "$before_state" ]] || fail "Target Person read mutated authority: before=$before_state after=$after_state"
pass "Target Person reads are projection-only and do not implement SRC-06 deletion effects"

list_public_exec=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.qry_target_persons_v1(uuid)','EXECUTE');")
detail_public_exec=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.qry_target_person_v1(uuid,uuid)','EXECUTE');")
[[ "$list_public_exec" == 'f' && "$detail_public_exec" == 'f' ]] || fail "Target Person query unexpectedly grants PUBLIC EXECUTE"

table_count=$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
[[ "$table_count" == '59' ]] || fail "public table catalog drifted: $table_count"
pass "Target Person queries PUBLIC EXECUTE remain revoked and public table catalog remains 59"

echo "Target Person current projection query tests passed"
