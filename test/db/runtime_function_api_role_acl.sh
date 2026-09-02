#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

"${psql_base[@]}" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

grant execute on function public.current_myeongha_subject_id() to anon, authenticated, service_role;
grant execute on function public.assert_myeongha_subject_context_v1(uuid) to anon, authenticated, service_role;
grant execute on function public.begin_member_subject_context_v1(uuid) to anon, authenticated, service_role;
grant execute on function public.begin_guest_subject_context_v1(text) to anon, authenticated, service_role;
grant execute on function public.qry_subject_profile_current_v1(uuid) to anon, authenticated, service_role;
grant execute on function public.cmd_create_guest_session_runtime_v1(uuid, uuid, text, timestamptz) to anon, authenticated, service_role;
grant execute on function public.qry_guest_bootstrap_current_v1(uuid) to anon, authenticated, service_role;
grant execute on function public.qry_birth_profile_current_revision_v1(uuid, uuid) to anon, authenticated, service_role;
SQL

# Reapply the hardening migration after simulating Supabase's explicit default grants.
"${psql_base[@]}" -f supabase/migrations/0840_runtime_function_api_role_acl_hardening.sql >/dev/null

for role in anon authenticated service_role; do
  shape=$("${psql_base[@]}" -At -F '|' -c "select
    has_function_privilege('$role','public.current_myeongha_subject_id()','EXECUTE'),
    has_function_privilege('$role','public.assert_myeongha_subject_context_v1(uuid)','EXECUTE'),
    has_function_privilege('$role','public.begin_member_subject_context_v1(uuid)','EXECUTE'),
    has_function_privilege('$role','public.begin_guest_subject_context_v1(text)','EXECUTE'),
    has_function_privilege('$role','public.qry_subject_profile_current_v1(uuid)','EXECUTE'),
    has_function_privilege('$role','public.cmd_create_guest_session_runtime_v1(uuid,uuid,text,timestamptz)','EXECUTE'),
    has_function_privilege('$role','public.qry_guest_bootstrap_current_v1(uuid)','EXECUTE'),
    has_function_privilege('$role','public.qry_birth_profile_current_revision_v1(uuid,uuid)','EXECUTE');")
  [[ "$shape" == 'f|f|f|f|f|f|f|f' ]] || fail "$role retained runtime function EXECUTE: $shape"
  pass "$role cannot execute production runtime functions"
done

executor_shape=$("${psql_base[@]}" -At -F '|' -c "select
  has_function_privilege('myeongha_api_executor','public.current_myeongha_subject_id()','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.assert_myeongha_subject_context_v1(uuid)','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.begin_member_subject_context_v1(uuid)','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.begin_guest_subject_context_v1(text)','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.qry_subject_profile_current_v1(uuid)','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.cmd_create_guest_session_runtime_v1(uuid,uuid,text,timestamptz)','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.qry_guest_bootstrap_current_v1(uuid)','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.qry_birth_profile_current_revision_v1(uuid,uuid)','EXECUTE');")
[[ "$executor_shape" == 't|t|t|t|t|t|t|t' ]] || fail "myeongha_api_executor lost runtime function EXECUTE: $executor_shape"
pass "myeongha_api_executor retains the explicit runtime function allowlist"

echo "Runtime function API role ACL hardening tests passed"
