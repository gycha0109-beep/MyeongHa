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
  ('a1000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000003'),
  ('a1000000-0000-0000-0000-000000000004'),
  ('a1000000-0000-0000-0000-000000000006'),
  ('a1000000-0000-0000-0000-000000000007')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('a2000000-0000-0000-0000-000000000001','member','a1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('a2000000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('a2000000-0000-0000-0000-000000000003','member','a1000000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('a2000000-0000-0000-0000-000000000004','member','a1000000-0000-0000-0000-000000000004','active',null,clock_timestamp(),clock_timestamp()),
  ('a2000000-0000-0000-0000-000000000005','guest',null,'merged','a2000000-0000-0000-0000-000000000004',clock_timestamp(),clock_timestamp()),
  ('a2000000-0000-0000-0000-000000000006','member','a1000000-0000-0000-0000-000000000006','active',null,clock_timestamp(),clock_timestamp()),
  ('a2000000-0000-0000-0000-000000000007','member','a1000000-0000-0000-0000-000000000007','active',null,clock_timestamp(),clock_timestamp());
SQL

created=$("${psql_base[@]}" -At -F '|' -c "
  select birth_profile_id,revision_id,revision_no
  from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    '나의 명식록','solar',date '1991-02-03',time '04:05',true,false,'female',
    'hmac-sha256:k2:birth-create-member'
  );")
[[ "$created" == 'a3000000-0000-0000-0000-000000000001|a4000000-0000-0000-0000-000000000001|1' ]] || fail "member Birth create result mismatch: $created"

member_state=$("${psql_base[@]}" -At -F '|' -c "
  select bp.profile_kind,bp.label,bp.current_revision_id::text,bp.archived_at is null,
         br.revision_no,br.calendar_type,br.birth_date::text,br.birth_time::text,br.time_known,
         br.is_leap_month,br.sex,br.input_hash
  from public.birth_profiles bp
  join public.birth_profile_revisions br
    on br.id=bp.current_revision_id and br.birth_profile_id=bp.id and br.subject_id=bp.subject_id
  where bp.id='a3000000-0000-0000-0000-000000000001';")
[[ "$member_state" == 'self|나의 명식록|a4000000-0000-0000-0000-000000000001|t|1|solar|1991-02-03|04:05:00|t|f|female|hmac-sha256:k2:birth-create-member' ]] || fail "member Birth authority mismatch: $member_state"
pass "member create atomically establishes one self profile and immutable revision 1"

guest_created=$("${psql_base[@]}" -At -F '|' -c "
  select birth_profile_id,revision_id,revision_no
  from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000002',
    'a3000000-0000-0000-0000-000000000002',
    'a4000000-0000-0000-0000-000000000002',
    null,'lunar',date '1992-03-04',null,false,true,'unspecified',
    'hmac-sha256:k2:birth-create-guest'
  );")
[[ "$guest_created" == 'a3000000-0000-0000-0000-000000000002|a4000000-0000-0000-0000-000000000002|1' ]] || fail "guest Birth create result mismatch: $guest_created"
pass "active canonical guest can create the same self Birth authority"

expect_fail "second active self profile is denied" "active self birth profile already exists" "
  select * from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000011',
    'a4000000-0000-0000-0000-000000000011',
    'duplicate','solar',date '1991-02-03',null,false,false,'female','hmac-sha256:k2:duplicate'
  );"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profiles where subject_id='a2000000-0000-0000-0000-000000000001' and profile_kind='self' and archived_at is null;")" == '1' ]] || fail "duplicate create changed active self cardinality"

expect_fail "deletion-pending subject cannot create Birth authority" "birth profile create requires an active canonical subject" "
  select * from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000003',
    'a3000000-0000-0000-0000-000000000003',
    'a4000000-0000-0000-0000-000000000003',
    null,'solar',date '1993-04-05',null,false,false,null,'hmac-sha256:k2:pending'
  );"
expect_fail "merged guest cannot create new Birth authority" "birth profile create requires an active canonical subject" "
  select * from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000005',
    'a3000000-0000-0000-0000-000000000005',
    'a4000000-0000-0000-0000-000000000005',
    null,'solar',date '1995-06-07',null,false,false,null,'hmac-sha256:k2:merged'
  );"
expect_fail "unknown subject cannot create Birth authority" "subject was not found" "
  select * from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000099',
    'a3000000-0000-0000-0000-000000000099',
    'a4000000-0000-0000-0000-000000000099',
    null,'solar',date '1999-01-01',null,false,false,null,'hmac-sha256:k2:missing'
  );"
expect_fail "null subject is denied" "subject id is required" "
  select * from public.cmd_create_birth_profile_v1(
    null,'a3000000-0000-0000-0000-000000000098','a4000000-0000-0000-0000-000000000098',
    null,'solar',date '1999-01-01',null,false,false,null,'hmac-sha256:k2:null-subject'
  );"
expect_fail "blank canonical input hash is denied" "canonical birth input hash is required" "
  select * from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000006',
    'a3000000-0000-0000-0000-000000000006',
    'a4000000-0000-0000-0000-000000000006',
    null,'solar',date '1996-07-08',null,false,false,null,'   '
  );"

expect_fail "invalid time-known shape rolls back whole create" "birth_profile_revisions_time_shape_check" "
  select * from public.cmd_create_birth_profile_v1(
    'a2000000-0000-0000-0000-000000000006',
    'a3000000-0000-0000-0000-000000000016',
    'a4000000-0000-0000-0000-000000000016',
    null,'solar',date '1996-07-08',time '09:10',false,false,null,'hmac-sha256:k2:invalid-time'
  );"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profiles where id='a3000000-0000-0000-0000-000000000016';")" == '0' ]] || fail "failed revision validation left a partial profile row"
pass "revision constraint failure rolls back logical profile creation atomically"

rm -f /tmp/birth-profile-create-1.out /tmp/birth-profile-create-2.out /tmp/birth-profile-create-1.rc /tmp/birth-profile-create-2.rc
(
  set +e
  "${psql_base[@]}" -Atc "begin;
    select birth_profile_id from public.cmd_create_birth_profile_v1(
      'a2000000-0000-0000-0000-000000000007',
      'a3000000-0000-0000-0000-000000000071',
      'a4000000-0000-0000-0000-000000000071',
      'race-a','solar',date '1997-08-09',null,false,false,'male','hmac-sha256:k2:race-a'
    );
    select pg_sleep(0.4);
    commit;" > /tmp/birth-profile-create-1.out 2>&1
  echo $? > /tmp/birth-profile-create-1.rc
) & p1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" -Atc "
    select birth_profile_id from public.cmd_create_birth_profile_v1(
      'a2000000-0000-0000-0000-000000000007',
      'a3000000-0000-0000-0000-000000000072',
      'a4000000-0000-0000-0000-000000000072',
      'race-b','solar',date '1998-09-10',null,false,false,'female','hmac-sha256:k2:race-b'
    );" > /tmp/birth-profile-create-2.out 2>&1
  echo $? > /tmp/birth-profile-create-2.rc
) & p2=$!
wait $p1
wait $p2

rc1=$(cat /tmp/birth-profile-create-1.rc)
rc2=$(cat /tmp/birth-profile-create-2.rc)
[[ "$rc1" == '0' ]] || { cat /tmp/birth-profile-create-1.out >&2; fail "first concurrent Birth create failed"; }
[[ "$rc2" != '0' ]] || { cat /tmp/birth-profile-create-2.out >&2; fail "second concurrent Birth create unexpectedly succeeded"; }
grep -q "active self birth profile already exists" /tmp/birth-profile-create-2.out || { cat /tmp/birth-profile-create-2.out >&2; fail "second concurrent Birth create failed for unexpected reason"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profiles where subject_id='a2000000-0000-0000-0000-000000000007' and profile_kind='self' and archived_at is null;")" == '1' ]] || fail "concurrent create produced more than one active self profile"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.birth_profile_revisions br join public.birth_profiles bp on bp.id=br.birth_profile_id where bp.subject_id='a2000000-0000-0000-0000-000000000007';")" == '1' ]] || fail "concurrent create left an extra first revision"
pass "concurrent self-profile create -> one complete authority, one deterministic denial"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_create_birth_profile_v1(uuid,uuid,uuid,text,text,date,time without time zone,boolean,boolean,text,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "Birth create command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "Birth create command PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "Birth Profile create persistence/concurrency tests passed"
