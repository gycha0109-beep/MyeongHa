-- M1-18: pure SELECT, production-safe, no DDL, no writes, no credentials.
-- This catalog safety gate does NOT promote, authorize, or deploy a migration.
-- Supabase migration HISTORY must be checked separately before live cutover.
with objects as (
 select
  pg_catalog.to_regprocedure('public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)') as read_function,
  pg_catalog.to_regprocedure('public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])') as issue_function,
  pg_catalog.to_regprocedure('public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb)') as bind_function,
  pg_catalog.to_regprocedure('public.assert_myeongha_subject_context_v1(uuid)') as context_function
),
read_policy as (
 select
  (o.read_function is not null
   and exists (
     select 1 from pg_catalog.pg_proc p
     where p.oid=o.read_function and p.prosecdef
       and pg_catalog.array_to_string(p.proconfig, ',')
         like '%search_path=pg_catalog, pg_temp%'
   )) as trusted_definer,
  coalesce(
    pg_catalog.has_function_privilege(
      'myeongha_api_executor',o.read_function,'EXECUTE'),false
  ) as api_read_execute,
  not exists (
    select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        p.proacl,pg_catalog.acldefault('f',p.proowner)
      )
    ) privilege
    where p.oid=o.read_function and privilege.grantee=0
      and privilege.privilege_type='EXECUTE'
  ) as no_public_execute,
  not exists (
    select 1 from (
      values ('anon'),('authenticated'),('service_role'),
             ('myeongha_commerce_internal_executor')
    ) deny(rolename)
    where coalesce(
      pg_catalog.has_function_privilege(
        deny.rolename,o.read_function,'EXECUTE'
      ),false)
  ) as no_other_role_execute
 from objects o
),
private_writers as (
 select (o.issue_function is not null and o.bind_function is not null)
   as both_present,
  not exists (
    select 1
    from (values ('anon'),('authenticated'),('service_role'),
                 ('myeongha_api_executor'),
                 ('myeongha_commerce_internal_executor')) deny(rolename)
    cross join lateral (
      select o.issue_function as fn
      union all select o.bind_function
    ) f
    where coalesce(
      pg_catalog.has_function_privilege(deny.rolename,f.fn,'EXECUTE'),
      false)
  ) as runtime_writer_execute_denied
 from objects o
),
source_acl as (
 select count(*)=5 as all_source_tables_exist,
   coalesce(bool_and(
     not coalesce(
       pg_catalog.has_table_privilege(
         'myeongha_api_executor',
         pg_catalog.to_regclass('public.'||name),
         'SELECT'),false
     )),false) as no_direct_api_source_select
 from (values ('commerce_receipts'),('entitlement_grants'),
    ('entitlement_events'),('standard_reading_reader_access_grants'),
    ('outbox_events')) private(name)
 where pg_catalog.to_regclass('public.'||name) is not null
),
status as (
 select
  pw.both_present as private_d2_installed,
  pw.runtime_writer_execute_denied as private_d2_runtime_closed,
  rp.trusted_definer as trusted_read_definer,
  rp.api_read_execute as api_minimal_execute,
  rp.no_public_execute as public_execute_closed,
  rp.no_other_role_execute as non_api_execute_closed,
  sa.all_source_tables_exist as source_tables_present,
  sa.no_direct_api_source_select as direct_source_select_closed,
  o.context_function is not null as subject_context_available
 from objects o cross join private_writers pw
 cross join read_policy rp cross join source_acl sa
)
select
 case
  when not private_d2_installed then 'HOLD_MISSING_PRIVATE_D2_BASELINE'
  when not private_d2_runtime_closed then 'HOLD_PRIVATE_WRITER_ACL_OPEN'
  when not trusted_read_definer or not subject_context_available
    then 'HOLD_READ_DEFINITION_UNTRUSTED'
  when not api_minimal_execute then 'HOLD_API_READ_EXECUTE_MISSING'
  when not public_execute_closed or not non_api_execute_closed
    then 'HOLD_READ_EXECUTE_BROADENED'
  when not source_tables_present or not direct_source_select_closed
    then 'HOLD_SOURCE_TABLE_ACL_OPEN'
  else 'CATALOG_READY_MIGRATION_HISTORY_STILL_REQUIRED'
 end as cutover_gate,
 private_d2_installed,
 private_d2_runtime_closed,
 trusted_read_definer,
 api_minimal_execute,
 public_execute_closed,
 non_api_execute_closed,
 source_tables_present,
 direct_source_select_closed,
 subject_context_available
from status;
