-- Admin Console production installation inventory (read-only).
-- Run against the intended Production project only after verifying its project ref.
-- This report is diagnostic: installed roles alone never prove grants, RLS or TLS.
with expected_roles(name) as (
  values ('myeongha_admin_reader'),
         ('myeongha_admin_audit_writer')
), expected_tables(name) as (
  values ('subjects'), ('readings'), ('reading_execution_attempts'),
         ('commerce_receipts'), ('chat_credit_lots_v1'),
         ('ai_execution_logs'), ('birth_profile_revisions')
), role_inventory as (
  select e.name, r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolbypassrls,
         r.rolcreatedb, r.rolcreaterole, r.rolreplication,
         (select count(*) from pg_catalog.pg_auth_members m where m.member=r.oid) as memberships
  from expected_roles e left join pg_catalog.pg_roles r on r.rolname=e.name
), table_inventory as (
  select e.name, c.oid is not null as present
  from expected_tables e
  left join pg_catalog.pg_class c
    on c.oid=to_regclass(format('public.%I',e.name))
   and c.relkind in ('r','p')
)
select jsonb_build_object(
  'database', current_database(),
  'roles', (select jsonb_agg(jsonb_build_object(
    'name', name,
    'present', rolcanlogin is not null,
    'login', rolcanlogin,
    'safe_role_flags', coalesce(rolcanlogin and not rolinherit and
      not rolsuper and not rolbypassrls and not rolcreatedb and
      not rolcreaterole and not rolreplication and memberships=0,false)
  ) order by name) from role_inventory),
  'core_tables', (select jsonb_agg(jsonb_build_object(
    'name', name, 'present', present) order by name) from table_inventory),
  'private_admin_schemas', (select coalesce(jsonb_agg(nspname order by nspname),'[]'::jsonb)
    from pg_catalog.pg_namespace where nspname like 'myeongha_admin%')
) as admin_install_inventory_v1;
