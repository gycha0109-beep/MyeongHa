#!/usr/bin/env bash
set -euo pipefail
# #1887: production-shaped owner grantor regression on a *separate* PG17 cluster.
# The main CI PostgreSQL service initializes postgres as its bootstrap
# superuser. PostgreSQL forbids demoting that bootstrap superuser. Build an
# isolated docker cluster with a DIFFERENT bootstrap superuser instead.
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
   "${DB_SUITE:-}" == postgres17 ]] || {
  echo HOLD_SEYEON_HELPER_PG17_CI_SCOPE >&2; exit 1;
}
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]] || {
  echo HOLD_SEYEON_HELPER_PG17_PRODUCTION_ENV_FORBIDDEN >&2; exit 1;
}
command -v docker >/dev/null || {
  echo HOLD_SEYEON_HELPER_PG17_DOCKER_UNAVAILABLE >&2; exit 1;
}
migration="$PWD/supabase/migrations/20261026025332_seyeon_chat_helper_service_role_least_privilege.sql"
[[ -f "$migration" ]] || exit 1
# Git Bash would rewrite docker-exec container paths such as /reviewed.sql.
# Disable argument conversion and use a native host path for the bind mount.
if command -v cygpath >/dev/null 2>&1; then
  migration="$(cygpath -m "$migration")"
  export MSYS_NO_PATHCONV=1
fi
container="mh-helper-acl-${GITHUB_RUN_ID:-local}-${RANDOM}"
password="$(openssl rand -hex 24)"
# No published ports or external networking; only Unix-socket docker exec.
docker run --detach --rm --network none --name "$container" \
  -e POSTGRES_USER=myeongha_acl_ci_bootstrap \
  -e POSTGRES_DB=postgres \
  -e "POSTGRES_PASSWORD=$password" \
  -v "$migration:/reviewed.sql:ro" \
  postgres:17.6 >/dev/null
unset password
trap 'docker rm --force "$container" >/dev/null 2>&1 || true' EXIT
ready=false
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -q -U myeongha_acl_ci_bootstrap -d postgres; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || {
  echo HOLD_SEYEON_HELPER_PG17_BOOTSTRAP_UNAVAILABLE >&2; exit 1;
}
ci_psql() {
  docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 \
    -U myeongha_acl_ci_bootstrap -d postgres "$@"
}
actor_psql() {
  docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 \
    -U postgres -d postgres "$@"
}
ci_psql <<'SQL'
create role postgres nosuperuser createrole login;
create role myeongha_seyeon_chat_runtime_owner nologin;
create role service_role nologin;
create role anon nologin;
create role authenticated nologin;
create role myeongha_api_executor nologin;
grant usage,create on schema public to myeongha_seyeon_chat_runtime_owner;
grant myeongha_seyeon_chat_runtime_owner to postgres
  with admin true,inherit false,set false;
set role myeongha_seyeon_chat_runtime_owner;
create function public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
  returns boolean language sql as 'select true';
revoke all on function public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
  from public;
grant execute on function public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
  to service_role;
grant execute on function public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
  to postgres;
reset role;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
SQL
before="$(actor_psql -At -c "
  select current_user::text||'|'||
    (select rolsuper::text from pg_roles where rolname='postgres')||'|'||
    pg_has_role('postgres','myeongha_seyeon_chat_runtime_owner','SET')::text||'|'||
    (select count(*)::text from pg_auth_members m
     where m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
       and m.member='postgres'::regrole
       and m.admin_option and not m.inherit_option and not m.set_option)||'|'||
    has_function_privilege('service_role',
      'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)',
      'EXECUTE')::text")"
[[ "$before" == 'postgres|false|false|1|true' ]] || {
  echo "HOLD_SEYEON_HELPER_PG17_RESTRICTED_BEFORE=$before" >&2; exit 1;
}
actor_psql -f /reviewed.sql >/dev/null
actor_psql -f /reviewed.sql >/dev/null
after="$(actor_psql -At -c "
  select current_user::text||'|'||
    pg_has_role('postgres','myeongha_seyeon_chat_runtime_owner','SET')::text||'|'||
    pg_has_role('postgres','myeongha_seyeon_chat_runtime_owner','USAGE')::text||'|'||
    (select count(*)::text from pg_auth_members m
     where m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
       and m.member='postgres'::regrole
       and m.admin_option and not m.inherit_option and not m.set_option)||'|'||
    (select count(*)::text from pg_auth_members m
     where m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
       and m.member='postgres'::regrole
       and m.grantor='postgres'::regrole)||'|'||
    has_function_privilege('service_role',
      'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)',
      'EXECUTE')::text||'|'||
    has_function_privilege('myeongha_seyeon_chat_runtime_owner',
      'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)',
      'EXECUTE')::text")"
[[ "$after" == 'postgres|false|false|1|0|false|true' ]] || {
  echo "HOLD_SEYEON_HELPER_PG17_RESTRICTED_AFTER=$after" >&2; exit 1;
}
echo 'PASS_SEYEON_HELPER_OWNER_GRANTOR_REVOKE_RESTRICTED_PG17'
