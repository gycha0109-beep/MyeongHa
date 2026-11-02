#!/usr/bin/env bash
set -euo pipefail
# #1887: isolated PG17 fixture only. Simulate the exact unwanted
# Production grant, then prove the repository migration removes ONLY it.
# Watchtower-Track: db-authority-core
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
   "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
   "${PGUSER:-}" == postgres &&
   "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo HOLD_SEYEON_HELPER_ACL_DISPOSABLE_PG17_REQUIRED >&2; exit 1;
}
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]] || {
  echo HOLD_SEYEON_HELPER_ACL_PRODUCTION_SETTINGS_FORBIDDEN >&2; exit 1;
}
version="$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')"
[[ "$version" =~ ^17[0-9]{4}$ ]] || exit 1
helper='public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)'
migration='supabase/migrations/20261026025332_seyeon_chat_helper_service_role_least_privilege.sql'

# Confirm before fixture that the checked-in baseline already denies the
# extra direct edge. This is a disposable local PostgreSQL database.
before="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
 select has_function_privilege('service_role','$helper','EXECUTE')::text
   || '|' || has_function_privilege('myeongha_api_executor','$helper','EXECUTE')::text
   || '|' || has_function_privilege('myeongha_seyeon_chat_runtime_owner','$helper','EXECUTE')::text")"
[[ "$before" == 'false|false|true' ]] || exit 1

psql -X -q -v ON_ERROR_STOP=1 -c "
 grant execute on function public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid) to service_role"
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
 select has_function_privilege('service_role','$helper','EXECUTE')")" == t ]] || exit 1

psql -X -q -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
result="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
 select
   has_function_privilege('service_role','$helper','EXECUTE')::text || '|' ||
   has_function_privilege('anon','$helper','EXECUTE')::text || '|' ||
   has_function_privilege('authenticated','$helper','EXECUTE')::text || '|' ||
   has_function_privilege('myeongha_api_executor','$helper','EXECUTE')::text || '|' ||
   has_function_privilege('myeongha_seyeon_chat_runtime_owner','$helper','EXECUTE')::text || '|' ||
   has_function_privilege('myeongha_api_executor',
     'public.cmd_receive_seyeon_chat_turn_runtime_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text)',
     'EXECUTE')::text")"
[[ "$result" == 'false|false|false|false|true|true' ]] || {
  echo HOLD_SEYEON_HELPER_ACL_POST_REVOKE_DRIFT >&2; exit 1;
}
echo 'PASS_SEYEON_HELPER_SERVICE_ROLE_REVOKE_ISOLATED_PG17'

# The normal CI service postgres is the bootstrap superuser and cannot be
# demoted. Exercise owner-restricted authority on a separate PG17 cluster.
bash test/db/seyeon_r2_helper_owner_restricted_pg17.sh
