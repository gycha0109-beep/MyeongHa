#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
expect_fail() {
  local label="$1" needle="$2" sql="$3" out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1); rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('71000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-000000000003'),
  ('71000000-0000-0000-0000-000000000004'),
  ('71000000-0000-0000-0000-000000000006'),
  ('71000000-0000-0000-0000-000000000007')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('72000000-0000-0000-0000-000000000001','member','71000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000003','member','71000000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000004','member','71000000-0000-0000-0000-000000000004','active',null,clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000005','guest',null,'merged','72000000-0000-0000-0000-000000000004',clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000006','member','71000000-0000-0000-0000-000000000006','active',null,clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000007','member','71000000-0000-0000-0000-000000000007','active',null,clock_timestamp(),clock_timestamp());
SQL

created=$("${psql_base[@]}" -At -F '|' -c "select target_person_id,birth_profile_id,revision_id,revision_no from public.cmd_create_target_person_v1(
 '72000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001',
 'A','friend','solar',date '1991-02-03',time '04:05',true,false,'female','hmac-sha256:k2:target-create-member');")
[[ "$created" == '75000000-0000-0000-0000-000000000001|73000000-0000-0000-0000-000000000001|74000000-0000-0000-0000-000000000001|1' ]] || fail "member Target Person create result mismatch: $created"
member_state=$("${psql_base[@]}" -At -F '|' -c "select tp.display_label,tp.relationship_label,tp.deleted_at is null,bp.profile_kind,bp.label is null,bp.current_revision_id::text,bp.archived_at is null,br.revision_no,br.calendar_type,br.birth_date::text,br.birth_time::text,br.time_known,br.is_leap_month,br.sex,br.input_hash from public.target_person_profiles tp join public.birth_profiles bp on bp.id=tp.birth_profile_id and bp.subject_id=tp.subject_id join public.birth_profile_revisions br on br.id=bp.current_revision_id and br.birth_profile_id=bp.id and br.subject_id=bp.subject_id where tp.id='75000000-0000-0000-0000-000000000001';")
[[ "$member_state" == 'A|friend|t|target|t|74000000-0000-0000-0000-000000000001|t|1|solar|1991-02-03|04:05:00|t|f|female|hmac-sha256:k2:target-create-member' ]] || fail "member Target Person authority mismatch: $member_state"
pass "member create atomically establishes Target metadata plus target Birth revision 1"

guest_created=$("${psql_base[@]}" -At -F '|' -c "select target_person_id,birth_profile_id,revision_id,revision_no from public.cmd_create_target_person_v1(
 '72000000-0000-0000-0000-000000000002','75000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000002',
 null,null,'lunar',date '1992-03-04',null,false,true,'unspecified','hmac-sha256:k2:target-create-guest');")
[[ "$guest_created" == '75000000-0000-0000-0000-000000000002|73000000-0000-0000-0000-000000000002|74000000-0000-0000-0000-000000000002|1' ]] || fail "guest Target Person create result mismatch: $guest_created"
pass "active canonical guest can create owner-scoped Target Person authority"

second_target=$("${psql_base[@]}" -At -F '|' -c "select target_person_id,birth_profile_id,revision_id,revision_no from public.cmd_create_target_person_v1(
 '72000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000011','73000000-0000-0000-0000-000000000011','74000000-0000-0000-0000-000000000011',
 'B','partner','solar',date '1990-01-02',null,false,false,'male','hmac-sha256:k2:target-create-second');")
[[ "$second_target" == '75000000-0000-0000-0000-000000000011|73000000-0000-0000-0000-000000000011|74000000-0000-0000-0000-000000000011|1' ]] || fail "second Target Person create result mismatch: $second_target"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.target_person_profiles where subject_id='72000000-0000-0000-0000-000000000001' and deleted_at is null;")" == '2' ]] || fail "Target Person create invented a one-target cardinality"
pass "multiple Target Persons remain valid for one subject"

expect_fail "deletion-pending subject cannot create Target Person authority" "target person create requires an active canonical subject" "select * from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000003','75000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000003','74000000-0000-0000-0000-000000000003',null,null,'solar',date '1993-04-05',null,false,false,null,'hmac-sha256:k2:pending');"
expect_fail "merged guest cannot create Target Person authority" "target person create requires an active canonical subject" "select * from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000005','75000000-0000-0000-0000-000000000005','73000000-0000-0000-0000-000000000005','74000000-0000-0000-0000-000000000005',null,null,'solar',date '1995-06-07',null,false,false,null,'hmac-sha256:k2:merged');"
expect_fail "unknown subject cannot create Target Person authority" "subject was not found" "select * from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000099','75000000-0000-0000-0000-000000000099','73000000-0000-0000-0000-000000000099','74000000-0000-0000-0000-000000000099',null,null,'solar',date '1999-01-01',null,false,false,null,'hmac-sha256:k2:missing');"
expect_fail "null subject is denied" "subject id is required" "select * from public.cmd_create_target_person_v1(null,'75000000-0000-0000-0000-000000000098','73000000-0000-0000-0000-000000000098','74000000-0000-0000-0000-000000000098',null,null,'solar',date '1999-01-01',null,false,false,null,'hmac-sha256:k2:null-subject');"
expect_fail "missing logical ids are denied" "target person, birth profile, and revision ids are required" "select * from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000006',null,'73000000-0000-0000-0000-000000000096','74000000-0000-0000-0000-000000000096',null,null,'solar',date '1996-07-08',null,false,false,null,'hmac-sha256:k2:null-id');"
expect_fail "blank canonical input hash is denied" "canonical birth input hash is required" "select * from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000006','75000000-0000-0000-0000-000000000006','73000000-0000-0000-0000-000000000006','74000000-0000-0000-0000-000000000006',null,null,'solar',date '1996-07-08',null,false,false,null,'   ');"

expect_fail "invalid Birth revision shape rolls back whole Target create" "birth_profile_revisions_time_shape_check" "select * from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000006','75000000-0000-0000-0000-000000000016','73000000-0000-0000-0000-000000000016','74000000-0000-0000-0000-000000000016','invalid',null,'solar',date '1996-07-08',time '09:10',false,false,null,'hmac-sha256:k2:invalid-time');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profiles where id='73000000-0000-0000-0000-000000000016';")" == '0' ]] || fail "failed revision validation left a partial target Birth Profile"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.target_person_profiles where id='75000000-0000-0000-0000-000000000016';")" == '0' ]] || fail "failed revision validation left a partial Target Person row"
pass "Birth validation failure rolls back Target Person creation atomically"

expect_fail "Target Person id collision rolls back newly built Birth authority" "target_person_profiles_pkey" "select * from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000017','74000000-0000-0000-0000-000000000017','collision',null,'solar',date '1989-12-31',null,false,false,null,'hmac-sha256:k2:id-collision');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profiles where id='73000000-0000-0000-0000-000000000017';")" == '0' ]] || fail "Target Person id collision left a partial Birth Profile"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profile_revisions where id='74000000-0000-0000-0000-000000000017';")" == '0' ]] || fail "Target Person id collision left a partial Birth revision"
pass "late Target metadata collision rolls back profile/revision/current-pointer writes"

rm -f /tmp/target-person-create-{1,2}.{out,rc}
(
  set +e
  "${psql_base[@]}" -Atc "begin; select target_person_id from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000007','75000000-0000-0000-0000-000000000071','73000000-0000-0000-0000-000000000071','74000000-0000-0000-0000-000000000071','race-a','friend','solar',date '1997-08-09',null,false,false,'male','hmac-sha256:k2:race-a'); select pg_sleep(0.4); commit;" >/tmp/target-person-create-1.out 2>&1
  echo $? >/tmp/target-person-create-1.rc
) & p1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" -Atc "select target_person_id from public.cmd_create_target_person_v1('72000000-0000-0000-0000-000000000007','75000000-0000-0000-0000-000000000072','73000000-0000-0000-0000-000000000072','74000000-0000-0000-0000-000000000072','race-b','partner','solar',date '1998-09-10',null,false,false,'female','hmac-sha256:k2:race-b');" >/tmp/target-person-create-2.out 2>&1
  echo $? >/tmp/target-person-create-2.rc
) & p2=$!
wait $p1; wait $p2
rc1=$(cat /tmp/target-person-create-1.rc); rc2=$(cat /tmp/target-person-create-2.rc)
[[ "$rc1" == '0' ]] || { cat /tmp/target-person-create-1.out >&2; fail "first concurrent Target Person create failed"; }
[[ "$rc2" == '0' ]] || { cat /tmp/target-person-create-2.out >&2; fail "second concurrent Target Person create failed"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.target_person_profiles where subject_id='72000000-0000-0000-0000-000000000007' and deleted_at is null;")" == '2' ]] || fail "concurrent Target Person creates lost or collapsed an allowed target"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profile_revisions br join public.birth_profiles bp on bp.id=br.birth_profile_id where bp.subject_id='72000000-0000-0000-0000-000000000007' and bp.profile_kind='target';")" == '2' ]] || fail "concurrent Target Person creates did not produce two complete Birth authorities"
pass "independent concurrent Target Person creates both commit as complete authorities"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_create_target_person_v1(uuid,uuid,uuid,uuid,text,text,text,date,time without time zone,boolean,boolean,text,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "Target Person create command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "Target Person create command PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "Target Person create persistence/concurrency tests passed"
