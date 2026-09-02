#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
psql_quiet=(psql -X -qAt -v ON_ERROR_STOP=1)

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

signature='public.qry_guest_bootstrap_current_v1(uuid)'
create_signature='public.cmd_create_guest_session_runtime_v1(uuid,uuid,text,timestamptz)'

shape=$("${psql_quiet[@]}" -F '|' -c "
  select pg_get_userbyid(p.proowner),
         case when p.prosecdef then '1' else '0' end,
         case when r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolreplication or r.rolbypassrls then 'UNSAFE' else 'SAFE' end
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_roles r on r.rolname='myeongha_api_executor'
  where n.nspname='public' and p.proname='qry_guest_bootstrap_current_v1';
")
[[ "$shape" == 'postgres|1|SAFE' ]] || fail "current Guest bootstrap query authority shape mismatch: $shape"
pass "current Guest bootstrap query is postgres-owned SECURITY DEFINER behind safe executor role"

[[ "$("${psql_quiet[@]}" -c "select case when has_function_privilege('myeongha_api_executor','$signature','EXECUTE') then '1' else '0' end")" == '1' ]] || fail "executor cannot execute current Guest bootstrap query"
[[ "$("${psql_quiet[@]}" -c "select case when has_function_privilege('public','$signature','EXECUTE') then '1' else '0' end")" == '0' ]] || fail "PUBLIC unexpectedly has current Guest bootstrap query EXECUTE"
[[ "$("${psql_quiet[@]}" -c "select case when has_table_privilege('myeongha_api_executor','public.guest_sessions','SELECT') then '1' else '0' end")" == '0' ]] || fail "executor unexpectedly gained raw guest_sessions SELECT"
expect_role_fail "executor raw guest_sessions read remains denied" "permission denied for table guest_sessions" "select id,subject_id,token_hash,expires_at from public.guest_sessions limit 1"
pass "Guest bootstrap reuse adds no raw guest_sessions table access"

projection=$("${psql_quiet[@]}" -c "select pg_get_function_result('$signature'::regprocedure);")
[[ "$projection" == *'subject_id uuid'* ]] || fail "current Guest bootstrap projection omitted subject_id: $projection"
[[ "$projection" == *'guest_session_id uuid'* ]] || fail "current Guest bootstrap projection omitted guest_session_id: $projection"
[[ "$projection" == *'expires_at timestamp with time zone'* ]] || fail "current Guest bootstrap projection omitted expires_at: $projection"
[[ "$projection" != *'token_hash'* && "$projection" != *'bearer'* ]] || fail "current Guest bootstrap projection exposes credential material: $projection"
pass "current Guest bootstrap projection exposes identity and expiry only"

hash_one='myeongha-guest-bearer-hmac-sha256-v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
hash_two='myeongha-guest-bearer-hmac-sha256-v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

"${psql_quiet[@]}" -c "begin; set local role myeongha_api_executor; select * from public.cmd_create_guest_session_runtime_v1('73000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001','$hash_one',timestamptz '2099-01-01 00:00:00+00'); select * from public.cmd_create_guest_session_runtime_v1('73000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000002','$hash_two',timestamptz '2099-02-01 00:00:00+00'); commit;" >/dev/null

expect_role_fail "current Guest bootstrap query without canonical context is denied" "trusted MyeongHa subject execution context is required" "select * from public.qry_guest_bootstrap_current_v1('73000000-0000-0000-0000-000000000001')"

current=$("${psql_quiet[@]}" -F '|' -c "begin; set local role myeongha_api_executor; select * from public.begin_guest_subject_context_v1('$hash_one'); select subject_id,guest_session_id,to_char(expires_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_guest_bootstrap_current_v1('73000000-0000-0000-0000-000000000001'); rollback;" | tail -n 1)
[[ "$current" == '73000000-0000-0000-0000-000000000001|74000000-0000-0000-0000-000000000001|2099-01-01 00:00:00' ]] || fail "current Guest bootstrap projection mismatch: $current"
pass "verified Guest bearer context resolves only its canonical session id and expiry"

expect_role_fail "cross-subject Guest bootstrap query is denied" "subject execution context mismatch" "select * from public.begin_guest_subject_context_v1('$hash_one'); select * from public.qry_guest_bootstrap_current_v1('73000000-0000-0000-0000-000000000002')"

before=$("${psql_quiet[@]}" -F '|' -c "select s.status,gs.expires_at::text,coalesce(gs.consumed_at::text,'<null>'),coalesce(gs.claimed_by_subject_id::text,'<null>') from public.subjects s join public.guest_sessions gs on gs.subject_id=s.id where s.id='73000000-0000-0000-0000-000000000001';")
"${psql_quiet[@]}" -c "begin; set local role myeongha_api_executor; select * from public.begin_guest_subject_context_v1('$hash_one'); select count(*) from public.qry_guest_bootstrap_current_v1('73000000-0000-0000-0000-000000000001'); rollback;" >/dev/null
after=$("${psql_quiet[@]}" -F '|' -c "select s.status,gs.expires_at::text,coalesce(gs.consumed_at::text,'<null>'),coalesce(gs.claimed_by_subject_id::text,'<null>') from public.subjects s join public.guest_sessions gs on gs.subject_id=s.id where s.id='73000000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "current Guest bootstrap query mutated Guest authority"
pass "current Guest bootstrap query remains read-only"

echo "current Guest bootstrap query authority tests passed"
