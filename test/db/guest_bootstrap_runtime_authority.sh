#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_role_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "begin; set local role myeongha_api_executor; ${sql}; rollback;" 2>&1)
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

signature='public.cmd_create_guest_session_runtime_v1(uuid,uuid,text,timestamptz)'
core_signature='public.cmd_create_guest_session_v1(uuid,uuid,text,timestamptz)'

shape=$("${psql_base[@]}" -Atc "
  select pg_get_userbyid(p.proowner)||'|'||
         case when p.prosecdef then '1' else '0' end||'|'||
         case when r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolreplication or r.rolbypassrls then 'UNSAFE' else 'SAFE' end
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_roles r on r.rolname='myeongha_api_executor'
  where n.nspname='public' and p.proname='cmd_create_guest_session_runtime_v1';
")
[[ "$shape" == 'postgres|1|SAFE' ]] || fail "runtime guest bootstrap authority shape mismatch: $shape"
pass "runtime guest bootstrap is postgres-owned SECURITY DEFINER behind safe executor role"

[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$signature','EXECUTE') then '1' else '0' end")" == '1' ]] || fail "executor cannot execute runtime guest bootstrap"
[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$core_signature','EXECUTE') then '1' else '0' end")" == '0' ]] || fail "executor unexpectedly gained core guest bootstrap EXECUTE"
for role in public anon authenticated service_role; do
  [[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('$role','$signature','EXECUTE') then '1' else '0' end")" == '0' ]] || fail "$role unexpectedly has runtime guest bootstrap EXECUTE"
done
pass "runtime guest bootstrap EXECUTE is isolated to myeongha_api_executor"

[[ "$("${psql_base[@]}" -Atc "select case when has_table_privilege('myeongha_api_executor','public.subjects','INSERT') then '1' else '0' end")" == '0' ]] || fail "executor unexpectedly has subjects INSERT"
[[ "$("${psql_base[@]}" -Atc "select case when has_table_privilege('myeongha_api_executor','public.guest_sessions','INSERT') then '1' else '0' end")" == '0' ]] || fail "executor unexpectedly has guest_sessions INSERT"
expect_role_fail "executor direct subjects insert remains denied" "permission denied for table subjects" "insert into public.subjects(id,kind,status,created_at,updated_at) values ('71000000-0000-0000-0000-000000000001','guest','active',clock_timestamp(),clock_timestamp())"
expect_role_fail "executor direct guest_sessions insert remains denied" "permission denied for table guest_sessions" "insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at) values ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','x',clock_timestamp()+interval '1 day',clock_timestamp())"

valid_hash='myeongha-guest-bearer-hmac-sha256-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
first=$("${psql_base[@]}" -Atc "begin; set local role myeongha_api_executor; select subject_id||'|'||guest_session_id||'|'||case when replayed then '1' else '0' end from public.cmd_create_guest_session_runtime_v1('71000000-0000-0000-0000-000000000010','72000000-0000-0000-0000-000000000010','$valid_hash',timestamptz '2099-01-01 00:00:00+00'); commit;")
[[ "$first" == *'71000000-0000-0000-0000-000000000010|72000000-0000-0000-0000-000000000010|0'* ]] || fail "executor runtime bootstrap result mismatch: $first"

state=$("${psql_base[@]}" -Atc "select s.kind||'|'||s.status||'|'||case when s.auth_user_id is null then '1' else '0' end||'|'||gs.token_hash from public.subjects s join public.guest_sessions gs on gs.subject_id=s.id where s.id='71000000-0000-0000-0000-000000000010'")
[[ "$state" == "guest|active|1|$valid_hash" ]] || fail "runtime bootstrap persisted unsafe guest state: $state"
pass "executor can create only canonical Guest owner + verifier session through runtime authority"

replay=$("${psql_base[@]}" -Atc "begin; set local role myeongha_api_executor; select case when replayed then '1' else '0' end from public.cmd_create_guest_session_runtime_v1('71000000-0000-0000-0000-000000000010','72000000-0000-0000-0000-000000000010','$valid_hash',timestamptz '2099-01-01 00:00:00+00'); commit;")
[[ "$replay" == *'1'* ]] || fail "runtime bootstrap exact replay failed: $replay"
pass "runtime bootstrap preserves core idempotent replay"

expect_role_fail "runtime bootstrap rejects non-production verifier format" "production guest verifier fingerprint is invalid" "select * from public.cmd_create_guest_session_runtime_v1('71000000-0000-0000-0000-000000000020','72000000-0000-0000-0000-000000000020','sha256:v1:not-production',timestamptz '2099-01-01 00:00:00+00')"
expect_role_fail "executor cannot bypass runtime wrapper through core command" "permission denied for function cmd_create_guest_session_v1" "select * from public.cmd_create_guest_session_v1('71000000-0000-0000-0000-000000000030','72000000-0000-0000-0000-000000000030','$valid_hash',timestamptz '2099-01-01 00:00:00+00')"

echo "guest bootstrap runtime authority tests passed"
