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

if [[ "$(jq -r '.db_schema' "$snapshot_dir/postgrest_config.json")" != '' ]]; then
  echo 'Production Data API containment drift detected: PostgREST db_schema is not disabled.' >&2
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

csv_query acl_invariants.csv <<'SQL'
with default_acl_entries as (
  select
    owner_role.rolname as owner_role,
    coalesce(n.nspname, '') as schema_name,
    d.defaclobjtype as object_type,
    acl.grantee,
    grantee_role.rolname as grantee_role,
    acl.privilege_type
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_roles owner_role on owner_role.oid = d.defaclrole
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral pg_catalog.aclexplode(d.defaclacl) acl
  left join pg_catalog.pg_roles grantee_role on grantee_role.oid = acl.grantee
), invariant_values as (
  select 'anon_public_table_privilege_count' as metric,
         count(*)::bigint as value
    from information_schema.table_privileges
   where table_schema = 'public' and grantee = 'anon'
  union all
  select 'authenticated_public_table_privilege_count', count(*)::bigint
    from information_schema.table_privileges
   where table_schema = 'public' and grantee = 'authenticated'
  union all
  select 'public_public_table_privilege_count', count(*)::bigint
    from information_schema.table_privileges
   where table_schema = 'public' and grantee = 'PUBLIC'
  union all
  select 'anon_public_routine_privilege_count', count(*)::bigint
    from information_schema.routine_privileges
   where routine_schema = 'public' and grantee = 'anon'
  union all
  select 'authenticated_public_routine_privilege_count', count(*)::bigint
    from information_schema.routine_privileges
   where routine_schema = 'public' and grantee = 'authenticated'
  union all
  select 'public_public_routine_privilege_count', count(*)::bigint
    from information_schema.routine_privileges
   where routine_schema = 'public' and grantee = 'PUBLIC'
  union all
  select 'anon_public_schema_create',
         case when pg_catalog.has_schema_privilege('anon', 'public', 'CREATE') then 1 else 0 end
  union all
  select 'authenticated_public_schema_create',
         case when pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE') then 1 else 0 end
  union all
  select 'postgres_default_anon_authenticated_grant_count', count(*)::bigint
    from default_acl_entries
   where owner_role = 'postgres'
     and grantee_role in ('anon', 'authenticated')
     and (schema_name = '' or schema_name = 'public')
  union all
  select 'postgres_global_public_function_execute_default_count', count(*)::bigint
    from default_acl_entries
   where owner_role = 'postgres'
     and schema_name = ''
     and object_type = 'f'
     and grantee = 0
     and privilege_type = 'EXECUTE'
  union all
  select 'supabase_admin_public_object_owner_count', count(*)::bigint
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = c.relowner
   where n.nspname = 'public'
     and c.relkind in ('r','p','v','m','S')
     and owner_role.rolname = 'supabase_admin'
  union all
  select 'supabase_admin_public_routine_owner_count', count(*)::bigint
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
   where n.nspname = 'public'
     and p.prokind in ('f','p','w')
     and owner_role.rolname = 'supabase_admin'
  union all
  select 'supabase_admin_default_anon_authenticated_grant_count', count(*)::bigint
    from default_acl_entries
   where owner_role = 'supabase_admin'
     and grantee_role in ('anon', 'authenticated')
     and (schema_name = '' or schema_name = 'public')
)
select metric, value
from invariant_values
order by metric
SQL

assert_zero_metric() {
  local metric="$1"
  local invariant_file="$snapshot_dir/acl_invariants.csv"
  local value

  value="$(awk -F, -v metric="$metric" '$1 == metric { gsub(/\r/, "", $2); print $2 }' "$invariant_file")"
  if [[ -z "$value" ]]; then
    echo "Production ACL drift gate is missing invariant metric: $metric" >&2
    exit 1
  fi
  if [[ "$value" != '0' ]]; then
    echo "Production ACL drift detected: $metric=$value" >&2
    exit 1
  fi
}

migration_max_version="$(awk -F, '$1 == "migration_max_version" { gsub(/\r/, "", $2); print $2 }' "$snapshot_dir/summary.csv")"
if [[ ! "$migration_max_version" =~ ^[0-9]+$ ]] || (( 10#$migration_max_version < 880 )); then
  echo "Production migration lineage drift detected: migration_max_version=${migration_max_version:-missing}" >&2
  exit 1
fi

for metric in \
  anon_public_table_privilege_count \
  authenticated_public_table_privilege_count \
  public_public_table_privilege_count \
  anon_public_routine_privilege_count \
  authenticated_public_routine_privilege_count \
  public_public_routine_privilege_count \
  anon_public_schema_create \
  authenticated_public_schema_create \
  postgres_default_anon_authenticated_grant_count \
  postgres_global_public_function_execute_default_count \
  supabase_admin_public_object_owner_count \
  supabase_admin_public_routine_owner_count
do
  assert_zero_metric "$metric"
done

# The remaining supabase_admin default ACL is captured as evidence but is not mutated or
# treated as a current-object exposure while no public application object is owned by it.
# Its count is intentionally not asserted to zero until supported platform authority and
# rollback semantics are established.
if ! awk -F, '$1 == "supabase_admin_default_anon_authenticated_grant_count" { found=1 } END { exit(found ? 0 : 1) }' "$snapshot_dir/acl_invariants.csv"; then
  echo 'Production ACL drift gate is missing the supabase_admin default-ACL residual metric.' >&2
  exit 1
fi

{
  echo 'data_api_config_source=management_api_v1_postgrest'
  echo 'data_api_surface_metadata_captured=yes'
  echo 'api_role_acl_drift_gate=pass'
} >> "$snapshot_dir/audit_metadata.txt"

(
  cd "$snapshot_dir"
  sha256sum *.csv *.json audit_metadata.txt > SHA256SUMS
  sha256sum --check SHA256SUMS
)

echo 'Production Data API/default-ACL surface snapshot completed without mutations; ACL drift gate passed.'