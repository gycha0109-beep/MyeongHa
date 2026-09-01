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
  [[ $rc -ne 0 ]] || fail "$label unexpectedly succeeded"
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('9e100000-0000-0000-0000-000000000001'),
  ('9e100000-0000-0000-0000-000000000002'),
  ('9e100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('9e200000-0000-0000-0000-000000000001','member','9e100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('9e200000-0000-0000-0000-000000000002','member','9e100000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('9e200000-0000-0000-0000-000000000003','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('9e200000-0000-0000-0000-000000000004','member','9e100000-0000-0000-0000-000000000004','deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at) values
  ('9e300000-0000-0000-0000-000000000001','9e200000-0000-0000-0000-000000000001','self','active-self',null,null,clock_timestamp(),timestamptz '2026-09-01 00:00:00+00'),
  ('9e300000-0000-0000-0000-000000000002','9e200000-0000-0000-0000-000000000001','target','target-record',null,null,clock_timestamp(),clock_timestamp()),
  ('9e300000-0000-0000-0000-000000000003','9e200000-0000-0000-0000-000000000002','self','archived-self',null,timestamptz '2026-08-31 00:00:00+00',clock_timestamp(),clock_timestamp()),
  ('9e300000-0000-0000-0000-000000000004','9e200000-0000-0000-0000-000000000003','self','guest-self',null,null,clock_timestamp(),clock_timestamp()),
  ('9e300000-0000-0000-0000-000000000005','9e200000-0000-0000-0000-000000000004','self','deleting-self',null,null,clock_timestamp(),clock_timestamp());

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values
  ('9e400000-0000-0000-0000-000000000001','9e300000-0000-0000-0000-000000000001','9e200000-0000-0000-0000-000000000001',1,'solar',date '1990-01-01',time '08:00',true,false,'female','sha256:v1:self-locator-1',clock_timestamp()),
  ('9e400000-0000-0000-0000-000000000002','9e300000-0000-0000-0000-000000000004','9e200000-0000-0000-0000-000000000003',1,'solar',date '1991-02-02',null,false,false,'unspecified','sha256:v1:self-locator-2',clock_timestamp()),
  ('9e400000-0000-0000-0000-000000000003','9e300000-0000-0000-0000-000000000005','9e200000-0000-0000-0000-000000000004',1,'solar',date '1992-03-03',time '09:00',true,false,'male','sha256:v1:self-locator-3',clock_timestamp());

update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000001' where id='9e300000-0000-0000-0000-000000000001';
update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000002' where id='9e300000-0000-0000-0000-000000000004';
update public.birth_profiles set current_revision_id='9e400000-0000-0000-0000-000000000003' where id='9e300000-0000-0000-0000-000000000005';
SQL

shape=$("${psql_base[@]}" -At -F '|' -c "select subject_id,birth_profile_id,current_revision_id,current_revision_no,profile_updated_at from public.qry_self_birth_profile_current_v1('9e200000-0000-0000-0000-000000000001');")
[[ "$shape" == '9e200000-0000-0000-0000-000000000001|9e300000-0000-0000-0000-000000000001|9e400000-0000-0000-0000-000000000001|1|2026-09-01 00:00:00+00' ]] || fail "active self locator mismatch: $shape"
pass "active member resolves exactly its active self Birth Profile and current revision identity"

count=$("${psql_base[@]}" -Atc "select count(*) from public.qry_self_birth_profile_current_v1('9e200000-0000-0000-0000-000000000001');")
[[ "$count" == '1' ]] || fail "active self locator cardinality mismatch: $count"
pass "active self locator cardinality is at most one"

no_active=$("${psql_base[@]}" -Atc "select count(*) from public.qry_self_birth_profile_current_v1('9e200000-0000-0000-0000-000000000002');")
[[ "$no_active" == '0' ]] || fail "archived self profile leaked into current locator"
pass "archived self profile is not a current locator result"

guest_shape=$("${psql_base[@]}" -At -F '|' -c "select birth_profile_id,current_revision_id,current_revision_no from public.qry_self_birth_profile_current_v1('9e200000-0000-0000-0000-000000000003');")
[[ "$guest_shape" == '9e300000-0000-0000-0000-000000000004|9e400000-0000-0000-0000-000000000002|1' ]] || fail "active guest self locator mismatch: $guest_shape"
pass "active canonical guest resolves its owned active self Birth Profile"

json_shape=$("${psql_base[@]}" -Atc "select coalesce(json_agg(row_to_json(q))::text,'[]') from public.qry_self_birth_profile_current_v1('9e200000-0000-0000-0000-000000000001') q;")
[[ "$json_shape" != *'birth_date'* ]] || fail "Birth input leaked into locator projection"
[[ "$json_shape" != *'input_hash'* ]] || fail "Birth input hash leaked into locator projection"
[[ "$json_shape" != *'label'* ]] || fail "unneeded profile label leaked into locator projection"
pass "locator projection exposes identity only, not Birth input or label data"

expect_fail "deletion-pending subject is denied" "current self Birth Profile read requires an active canonical subject" \
  "select * from public.qry_self_birth_profile_current_v1('9e200000-0000-0000-0000-000000000004');"
expect_fail "subject is required" "current subject id is required" \
  "select * from public.qry_self_birth_profile_current_v1(null);"

public_exec=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.qry_self_birth_profile_current_v1(uuid)','EXECUTE');")
[[ "$public_exec" == 'f' ]] || fail "self Birth Profile locator unexpectedly grants PUBLIC EXECUTE"
pass "self Birth Profile locator PUBLIC EXECUTE remains revoked"

echo "Current self Birth Profile locator query tests passed"
