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
  ('c6100000-0000-0000-0000-000000000001'),
  ('c6100000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values
  ('c6200000-0000-0000-0000-000000000001','member','c6100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('c6200000-0000-0000-0000-000000000002','member','c6100000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp())
on conflict do nothing;
SQL

role_shape=$("${psql_base[@]}" -At -F '|' -c "select
  r.rolcanlogin,
  r.rolsuper,
  r.rolcreatedb,
  r.rolcreaterole,
  r.rolinherit,
  r.rolreplication,
  r.rolbypassrls,
  pg_has_role('myeongha_api_executor','myeongha_birth_profile_create_owner','MEMBER')
from pg_roles r
where r.rolname='myeongha_birth_profile_create_owner';")
[[ "$role_shape" == 'f|f|f|f|f|f|f|f' ]] || fail "Birth create command-owner role shape mismatch: $role_shape"
pass "Birth create command owner is isolated NOLOGIN/NOBYPASSRLS"

function_shape=$("${psql_base[@]}" -At -F '|' -c "select
  owner.rolname,
  p.prosecdef,
  has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE'),
  has_function_privilege('public',p.oid,'EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.cmd_create_birth_profile_v1(uuid,uuid,uuid,text,text,date,time without time zone,boolean,boolean,text,text)','EXECUTE')
from pg_proc p
join pg_roles owner on owner.oid=p.proowner
where p.oid='public.cmd_create_birth_profile_runtime_v1(uuid,uuid,uuid,text,text,date,time without time zone,boolean,boolean,text,text)'::regprocedure;")
[[ "$function_shape" == 'myeongha_birth_profile_create_owner|t|t|f|f' ]] || fail "Birth create runtime function shape mismatch: $function_shape"
pass "executor can execute only the narrow runtime wrapper"

priv_shape=$("${psql_base[@]}" -At -F '|' -c "select
  has_column_privilege('myeongha_api_executor','public.birth_profiles','id','INSERT'),
  has_column_privilege('myeongha_api_executor','public.birth_profiles','current_revision_id','UPDATE'),
  has_column_privilege('myeongha_api_executor','public.birth_profile_revisions','input_hash','INSERT'),
  has_column_privilege('myeongha_birth_profile_create_owner','public.subjects','id','UPDATE'),
  has_column_privilege('myeongha_birth_profile_create_owner','public.subjects','status','UPDATE'),
  has_column_privilege('myeongha_birth_profile_create_owner','public.birth_profiles','id','INSERT'),
  has_column_privilege('myeongha_birth_profile_create_owner','public.birth_profile_revisions','input_hash','INSERT');")
[[ "$priv_shape" == 'f|f|f|t|f|t|t' ]] || fail "Birth create column privilege shape mismatch: $priv_shape"
pass "direct API DML stays closed while the command owner has only required columns"

create_shape=$("${psql_base[@]}" -At -F '|' <<'SQL'
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000001',true);
select birth_profile_id,revision_id,revision_no
from public.cmd_create_birth_profile_runtime_v1(
  'c6200000-0000-0000-0000-000000000001',
  'c6300000-0000-0000-0000-000000000001',
  'c6400000-0000-0000-0000-000000000001',
  'self',
  'solar',
  date '1996-01-09',
  time '09:30',
  true,
  false,
  'male',
  'hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);
commit;
SQL
)
[[ "$create_shape" == *'c6300000-0000-0000-0000-000000000001|c6400000-0000-0000-0000-000000000001|1'* ]] || fail "Birth create runtime command failed: $create_shape"
pass "executor creates one self Birth Profile through the command-only wrapper"

stored_shape=$("${psql_base[@]}" -At -F '|' -c "select
  bp.subject_id,
  bp.profile_kind,
  bp.current_revision_id,
  bpr.revision_no,
  bpr.input_hash
from public.birth_profiles bp
join public.birth_profile_revisions bpr on bpr.id=bp.current_revision_id
where bp.id='c6300000-0000-0000-0000-000000000001';")
[[ "$stored_shape" == 'c6200000-0000-0000-0000-000000000001|self|c6400000-0000-0000-0000-000000000001|1|hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ]] || fail "Birth create persisted authority mismatch: $stored_shape"
pass "runtime wrapper persists the exact current revision and versioned HMAC provenance"

expect_fail \
  "runtime wrapper without canonical Subject context" \
  "trusted MyeongHa subject execution context is required" \
  "begin; set local role myeongha_api_executor; select * from public.cmd_create_birth_profile_runtime_v1('c6200000-0000-0000-0000-000000000002','c6300000-0000-0000-0000-000000000002','c6400000-0000-0000-0000-000000000002','self','solar',date '1995-01-01',null,false,false,'female','hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'); rollback;"

expect_fail \
  "runtime wrapper cross-Subject parameter" \
  "subject execution context mismatch" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000001',true); select * from public.cmd_create_birth_profile_runtime_v1('c6200000-0000-0000-0000-000000000002','c6300000-0000-0000-0000-000000000002','c6400000-0000-0000-0000-000000000002','self','solar',date '1995-01-01',null,false,false,'female','hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'); rollback;"

expect_fail \
  "runtime wrapper invalid Birth fingerprint" \
  "production Birth input fingerprint is invalid" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000002',true); select * from public.cmd_create_birth_profile_runtime_v1('c6200000-0000-0000-0000-000000000002','c6300000-0000-0000-0000-000000000002','c6400000-0000-0000-0000-000000000002','self','solar',date '1995-01-01',null,false,false,'female','sha256:v1:not-production'); rollback;"

expect_fail \
  "executor direct Birth insert" \
  "permission denied" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000002',true); insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at) values ('c6300000-0000-0000-0000-000000000009','c6200000-0000-0000-0000-000000000002','self','direct',null,null,clock_timestamp(),clock_timestamp()); rollback;"

expect_fail \
  "executor direct core command" \
  "permission denied for function cmd_create_birth_profile_v1" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000002',true); select * from public.cmd_create_birth_profile_v1('c6200000-0000-0000-0000-000000000002','c6300000-0000-0000-0000-000000000009','c6400000-0000-0000-0000-000000000009','direct','solar',date '1995-01-01',null,false,false,'female','hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'); rollback;"

expect_fail \
  "command-owner cross-Subject direct insert" \
  "row-level security policy" \
  "begin; set local role myeongha_birth_profile_create_owner; select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000001',true); insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at) values ('c6300000-0000-0000-0000-000000000008','c6200000-0000-0000-0000-000000000002','self','cross',null,null,clock_timestamp(),clock_timestamp()); rollback;"

expect_fail \
  "command-owner Subject status mutation" \
  "permission denied" \
  "begin; set local role myeongha_birth_profile_create_owner; select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000001',true); update public.subjects set status='deletion_pending' where id='c6200000-0000-0000-0000-000000000001'; rollback;"

expect_fail \
  "second active self Birth Profile" \
  "active self birth profile already exists" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c6200000-0000-0000-0000-000000000001',true); select * from public.cmd_create_birth_profile_runtime_v1('c6200000-0000-0000-0000-000000000001','c6300000-0000-0000-0000-000000000007','c6400000-0000-0000-0000-000000000007','self-2','solar',date '1996-01-09',time '09:30',true,false,'male','hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'); rollback;"

echo "Birth Profile production create runtime authority tests passed"
