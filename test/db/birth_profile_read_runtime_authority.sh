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
  ('b3100000-0000-0000-0000-000000000001'),
  ('b3100000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values
  ('b3200000-0000-0000-0000-000000000001','member','b3100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('b3200000-0000-0000-0000-000000000002','member','b3100000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp())
on conflict do nothing;

insert into public.birth_profiles(
  id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at
) values
  ('b3300000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','self','owner-profile',null,null,clock_timestamp(),clock_timestamp()),
  ('b3300000-0000-0000-0000-000000000002','b3200000-0000-0000-0000-000000000002','self','other-profile',null,null,clock_timestamp(),clock_timestamp())
on conflict do nothing;

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,
  time_known,is_leap_month,sex,input_hash,created_at
) values
  ('b3400000-0000-0000-0000-000000000001','b3300000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001',1,'solar',date '1990-01-02',time '08:30',true,false,'female','sha256:v1:must-not-be-readable',clock_timestamp()),
  ('b3400000-0000-0000-0000-000000000002','b3300000-0000-0000-0000-000000000002','b3200000-0000-0000-0000-000000000002',1,'solar',date '1991-02-03',null,false,false,'male','sha256:v1:other-secret',clock_timestamp())
on conflict do nothing;

update public.birth_profiles
set current_revision_id = case id
  when 'b3300000-0000-0000-0000-000000000001'::uuid then 'b3400000-0000-0000-0000-000000000001'::uuid
  when 'b3300000-0000-0000-0000-000000000002'::uuid then 'b3400000-0000-0000-0000-000000000002'::uuid
  else current_revision_id
end
where id in (
  'b3300000-0000-0000-0000-000000000001'::uuid,
  'b3300000-0000-0000-0000-000000000002'::uuid
);
SQL

rls_shape=$("${psql_base[@]}" -At -F '|' -c "select
  (select relrowsecurity from pg_class where oid='public.birth_profiles'::regclass),
  (select relrowsecurity from pg_class where oid='public.birth_profile_revisions'::regclass);")
[[ "$rls_shape" == 't|t' ]] || fail "Birth Profile runtime tables do not both have RLS enabled: $rls_shape"
pass "Birth Profile runtime tables have RLS enabled"

exec_shape=$("${psql_base[@]}" -At -F '|' -c "select
  has_function_privilege('myeongha_api_executor','public.qry_birth_profile_current_revision_v1(uuid,uuid)','EXECUTE'),
  has_function_privilege('public','public.qry_birth_profile_current_revision_v1(uuid,uuid)','EXECUTE'),
  has_column_privilege('myeongha_api_executor','public.birth_profiles','subject_id','SELECT'),
  has_column_privilege('myeongha_api_executor','public.birth_profile_revisions','birth_date','SELECT'),
  has_column_privilege('myeongha_api_executor','public.birth_profile_revisions','input_hash','SELECT'),
  has_table_privilege('myeongha_api_executor','public.birth_profiles','INSERT'),
  has_table_privilege('myeongha_api_executor','public.birth_profile_revisions','UPDATE');")
[[ "$exec_shape" == 't|f|t|t|f|f|f' ]] || fail "Birth Profile runtime privilege shape mismatch: $exec_shape"
pass "executor has only the intended query and projection privileges"

own_shape=$("${psql_base[@]}" -At -F '|' <<'SQL'
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','b3200000-0000-0000-0000-000000000001',true);
select birth_profile_id,current_birth_date,revision_no,is_current_revision
from public.qry_birth_profile_current_revision_v1(
  'b3200000-0000-0000-0000-000000000001',
  'b3300000-0000-0000-0000-000000000001'
);
rollback;
SQL
)
[[ "$own_shape" == *'b3300000-0000-0000-0000-000000000001|1990-01-02|1|t'* ]] || fail "executor owner read failed: $own_shape"
pass "executor reads the current subject owned Birth Profile"

isolation_shape=$("${psql_base[@]}" -At -F '|' <<'SQL'
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','b3200000-0000-0000-0000-000000000001',true);
select
  (select count(*) from public.birth_profiles),
  (select count(*) from public.birth_profile_revisions);
rollback;
SQL
)
[[ "$isolation_shape" == *'1|1'* ]] || fail "executor RLS owner isolation mismatch: $isolation_shape"
pass "executor direct SELECT is restricted to the transaction subject"

expect_fail \
  "executor cross-subject Birth Profile query" \
  "birth profile read requires an active canonical subject" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','b3200000-0000-0000-0000-000000000001',true); select * from public.qry_birth_profile_current_revision_v1('b3200000-0000-0000-0000-000000000002','b3300000-0000-0000-0000-000000000002'); rollback;"

expect_fail \
  "executor canonical input hash probe" \
  "permission denied" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','b3200000-0000-0000-0000-000000000001',true); select input_hash from public.birth_profile_revisions; rollback;"

echo "Birth Profile production read runtime authority tests passed"
