#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${POOL_HOST:?POOL_HOST is required}"
: "${POOL_PORT:?POOL_PORT is required}"
: "${POOL_DB:?POOL_DB is required}"
: "${ADMIN_POOL_USER:?ADMIN_POOL_USER is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" == *.pooler.supabase.com ]]
[[ "$POOL_PORT" == '5432' || "$POOL_PORT" == '6543' ]]
[[ "$POOL_DB" == 'postgres' ]]

snapshot_dir="$RUNNER_TEMP/myeongha-platform-integrity-catalog"
test -d "$snapshot_dir"

postgrest_raw="$RUNNER_TEMP/myeongha-pi-postgrest-config.json"
cleanup() {
  exit_code=$?
  trap - EXIT
  rm -f "$postgrest_raw"
  exit "$exit_code"
}
trap cleanup EXIT

curl -fsS \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/postgrest" \
  -o "$postgrest_raw"

jq -e '
  if type != "object" then
    error("unexpected PostgREST config response")
  else
    {
      db_schema: (.db_schema // ""),
      db_extra_search_path: (.db_extra_search_path // ""),
      max_rows: (.max_rows // null),
      db_pool: (.db_pool // null),
      db_pool_acquisition_timeout: (.db_pool_acquisition_timeout // null)
    }
  end
' "$postgrest_raw" > "$snapshot_dir/postgrest_config.json"

if jq -e 'has("jwt_secret")' "$snapshot_dir/postgrest_config.json" >/dev/null; then
  echo 'Sanitized PostgREST config must never contain jwt_secret.' >&2
  exit 1
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=require

psql_base=(
  psql -X -q -v ON_ERROR_STOP=1
  -h "$POOL_HOST"
  -p "$POOL_PORT"
  -U "$ADMIN_POOL_USER"
  -d "$POOL_DB"
)

csv_query() {
  local output_file="$1"
  local query
  query="$(cat)"

  {
    printf '%s\n' 'begin read only;'
    printf '%s\n' "set local statement_timeout = '30s';"
    printf '%s\n' "set local lock_timeout = '5s';"
    printf '%s\n' "set local application_name = 'myeongha_pi_data_api_surface_audit';"
    printf '%s\n' 'copy ('
    printf '%s\n' "$query"
    printf '%s\n' ') to stdout with (format csv, header true);'
    printf '%s\n' 'rollback;'
  } | "${psql_base[@]}" > "$snapshot_dir/$output_file"
}

csv_query default_acl.csv <<'SQL'
select
  owner_role.rolname as owner_role,
  coalesce(n.nspname, '') as schema_name,
  d.defaclobjtype as object_type,
  d.defaclacl::text as acl
from pg_catalog.pg_default_acl d
join pg_catalog.pg_roles owner_role on owner_role.oid = d.defaclrole
left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
where owner_role.rolname in ('postgres','anon','authenticated','service_role')
   or owner_role.rolname like 'myeongha\_%' escape '\'
   or n.nspname = 'public'
order by owner_role.rolname, schema_name, d.defaclobjtype
SQL

csv_query role_settings.csv <<'SQL'
select
  coalesce(r.rolname, '') as role_name,
  coalesce(db.datname, '') as database_name,
  setting
from pg_catalog.pg_db_role_setting s
left join pg_catalog.pg_roles r on r.oid = s.setrole
left join pg_catalog.pg_database db on db.oid = s.setdatabase
cross join lateral unnest(s.setconfig) as setting
where r.rolname in ('authenticator','anon','authenticated','service_role','postgres')
   or r.rolname like 'myeongha\_%' escape '\'
   or setting like 'pgrst.%'
order by role_name, database_name, setting
SQL

csv_query schema_privileges.csv <<'SQL'
with inspected_roles(role_name) as (
  values
    ('anon'::text),
    ('authenticated'::text),
    ('service_role'::text),
    ('myeongha_runtime'::text),
    ('myeongha_api_executor'::text)
)
select
  role_name,
  pg_catalog.has_schema_privilege(role_name, 'public', 'USAGE') as has_usage,
  pg_catalog.has_schema_privilege(role_name, 'public', 'CREATE') as has_create
from inspected_roles
where exists (
  select 1
  from pg_catalog.pg_roles r
  where r.rolname = inspected_roles.role_name
)
order by role_name
SQL

{
  echo 'data_api_config_source=management_api_v1_postgrest'
  echo 'data_api_surface_metadata_captured=yes'
} >> "$snapshot_dir/audit_metadata.txt"

(
  cd "$snapshot_dir"
  sha256sum *.csv *.json audit_metadata.txt > SHA256SUMS
  sha256sum --check SHA256SUMS
)

echo 'Production Data API/default-ACL surface snapshot completed without mutations.'
