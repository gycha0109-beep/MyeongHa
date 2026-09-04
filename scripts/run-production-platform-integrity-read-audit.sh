#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${POOL_HOST:?POOL_HOST is required}"
: "${POOL_PORT:?POOL_PORT is required}"
: "${POOL_DB:?POOL_DB is required}"
: "${ADMIN_POOL_USER:?ADMIN_POOL_USER is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" == *.pooler.supabase.com ]]
[[ "$POOL_PORT" == '5432' || "$POOL_PORT" == '6543' ]]
[[ "$POOL_DB" == 'postgres' ]]

snapshot_dir="$RUNNER_TEMP/myeongha-platform-integrity-catalog"
rm -rf "$snapshot_dir"
mkdir -p "$snapshot_dir"

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=require

psql_base=(
  psql -X -q -v ON_ERROR_STOP=1
  -h "$POOL_HOST"
  -p "$POOL_PORT"
  -U "$ADMIN_POOL_USER"
  -d "$POOL_DB"
)

transaction_read_only="$(${psql_base[@]} -A -t <<'SQL'
begin read only;
select current_setting('transaction_read_only');
rollback;
SQL
)"
[[ "$transaction_read_only" == *'on'* ]]

csv_query() {
  local output_file="$1"
  local query
  query="$(cat)"

  {
    printf '%s\n' 'begin read only;'
    printf '%s\n' "set local statement_timeout = '30s';"
    printf '%s\n' "set local lock_timeout = '5s';"
    printf '%s\n' "set local application_name = 'myeongha_pi_catalog_audit';"
    printf '%s\n' 'copy ('
    printf '%s\n' "$query"
    printf '%s\n' ') to stdout with (format csv, header true);'
    printf '%s\n' 'rollback;'
  } | "${psql_base[@]}" > "$snapshot_dir/$output_file"
}

csv_query migration_history.csv <<'SQL'
select version, name
from supabase_migrations.schema_migrations
order by version
SQL

csv_query public_objects.csv <<'SQL'
select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind,
  c.relrowsecurity,
  c.relforcerowsecurity,
  pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
  coalesce(
    c.relacl,
    pg_catalog.acldefault(
      case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end,
      c.relowner
    )
  )::text as effective_acl
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p','v','m','S')
order by c.relkind, c.relname
SQL

csv_query columns.csv <<'SQL'
select
  n.nspname as schema_name,
  c.relname as table_name,
  a.attnum as ordinal_position,
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
  a.attnotnull as not_null,
  coalesce(pg_catalog.pg_get_expr(ad.adbin, ad.adrelid), '') as default_expression
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
left join pg_catalog.pg_attrdef ad
  on ad.adrelid = a.attrelid
 and ad.adnum = a.attnum
where n.nspname = 'public'
  and c.relkind in ('r','p','v','m')
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attnum
SQL

csv_query constraints.csv <<'SQL'
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  con.condeferrable as deferrable,
  con.condeferred as initially_deferred,
  con.convalidated as validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, con.conname
SQL

csv_query indexes.csv <<'SQL'
select
  n.nspname as schema_name,
  c.relname as table_name,
  ic.relname as index_name,
  i.indisunique as is_unique,
  i.indisprimary as is_primary,
  i.indisvalid as is_valid,
  i.indisready as is_ready,
  pg_catalog.pg_get_indexdef(i.indexrelid) as definition
from pg_catalog.pg_index i
join pg_catalog.pg_class c on c.oid = i.indrelid
join pg_catalog.pg_class ic on ic.oid = i.indexrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, ic.relname
SQL

csv_query triggers.csv <<'SQL'
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled as enabled_state,
  pg_catalog.pg_get_triggerdef(t.oid, true) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname
SQL

csv_query policies.csv <<'SQL'
select
  schemaname as schema_name,
  tablename as table_name,
  policyname as policy_name,
  permissive,
  roles::text as roles,
  cmd,
  coalesce(qual, '') as using_expression,
  coalesce(with_check, '') as with_check_expression
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname
SQL

csv_query functions.csv <<'SQL'
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.prokind,
  p.prosecdef as security_definer,
  p.proleakproof as leakproof,
  p.provolatile,
  p.proparallel,
  pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
  coalesce(p.proconfig::text, '') as function_config,
  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))::text as effective_acl,
  pg_catalog.pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind in ('f','p','w')
order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
SQL

csv_query views.csv <<'SQL'
select
  n.nspname as schema_name,
  c.relname as view_name,
  c.relkind,
  pg_catalog.pg_get_viewdef(c.oid, true) as definition
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v','m')
order by c.relname
SQL

csv_query schema_acl.csv <<'SQL'
select
  n.nspname as schema_name,
  pg_catalog.pg_get_userbyid(n.nspowner) as owner_name,
  coalesce(n.nspacl::text, '<NULL>') as raw_acl,
  coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))::text as effective_acl
from pg_catalog.pg_namespace n
where n.nspname = 'public'
SQL

csv_query schema_acl_entries.csv <<'SQL'
select
  n.nspname as schema_name,
  pg_catalog.pg_get_userbyid(a.grantor) as grantor_name,
  case
    when a.grantee = 0 then 'PUBLIC'
    else pg_catalog.pg_get_userbyid(a.grantee)
  end as grantee_name,
  a.privilege_type,
  a.is_grantable
from pg_catalog.pg_namespace n
cross join lateral pg_catalog.aclexplode(
  coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
) a
where n.nspname = 'public'
order by grantee_name, privilege_type, grantor_name
SQL

csv_query schema_init_privileges.csv <<'SQL'
select
  n.nspname as schema_name,
  p.classoid::pg_catalog.regclass::text as class_name,
  p.objoid,
  p.objsubid,
  p.privtype,
  p.initprivs::text as initprivs
from pg_catalog.pg_init_privs p
join pg_catalog.pg_namespace n
  on p.classoid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
 and p.objoid = n.oid
where n.nspname = 'public'
order by p.privtype, p.objsubid
SQL

csv_query role_state.csv <<'SQL'
select
  rolname,
  rolcanlogin,
  rolsuper,
  rolcreatedb,
  rolcreaterole,
  rolinherit,
  rolreplication,
  rolbypassrls,
  rolconnlimit
from pg_catalog.pg_roles
where rolname like 'myeongha\_%' escape '\'
   or rolname in ('postgres','anon','authenticated','service_role')
order by rolname
SQL

csv_query role_memberships.csv <<'SQL'
select
  role.rolname as role_name,
  member.rolname as member_name,
  grantor.rolname as grantor_name,
  membership.admin_option
from pg_catalog.pg_auth_members membership
join pg_catalog.pg_roles role on role.oid = membership.roleid
join pg_catalog.pg_roles member on member.oid = membership.member
join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
where role.rolname like 'myeongha\_%' escape '\'
   or member.rolname like 'myeongha\_%' escape '\'
order by role.rolname, member.rolname
SQL

csv_query table_privileges.csv <<'SQL'
select
  table_schema,
  table_name,
  grantor,
  grantee,
  privilege_type,
  is_grantable,
  with_hierarchy
from information_schema.table_privileges
where table_schema = 'public'
  and (
    grantee like 'myeongha\_%' escape '\'
    or grantee in ('PUBLIC','anon','authenticated','service_role','postgres')
  )
order by table_name, grantee, privilege_type
SQL

csv_query routine_privileges.csv <<'SQL'
select
  routine_schema,
  routine_name,
  specific_name,
  grantor,
  grantee,
  privilege_type,
  is_grantable
from information_schema.routine_privileges
where routine_schema = 'public'
  and (
    grantee like 'myeongha\_%' escape '\'
    or grantee in ('PUBLIC','anon','authenticated','service_role','postgres')
  )
order by routine_name, specific_name, grantee, privilege_type
SQL

csv_query summary.csv <<'SQL'
select 'migration_max_version' as metric,
       coalesce((select max(version) from supabase_migrations.schema_migrations), '')::text as value
union all
select 'public_table_count', count(*)::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p')
union all
select 'public_rls_enabled_table_count', count(*)::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity
union all
select 'public_force_rls_table_count', count(*)::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and c.relforcerowsecurity
union all
select 'public_policy_count', count(*)::text
  from pg_catalog.pg_policies
 where schemaname = 'public'
union all
select 'public_function_count', count(*)::text
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind in ('f','p','w')
SQL

{
  echo "project_ref=$SUPABASE_PROJECT_ID"
  echo "github_sha=$GITHUB_SHA"
  echo "github_run_id=$GITHUB_RUN_ID"
  echo "pooler_port=$POOL_PORT"
  echo "audit_mode=explicit_read_only_transactions"
  echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$snapshot_dir/audit_metadata.txt"

(
  cd "$snapshot_dir"
  sha256sum *.csv audit_metadata.txt > SHA256SUMS
  sha256sum --check SHA256SUMS
)

echo "Production platform-integrity catalog snapshot completed in explicit read-only transactions."
