-- M1-22. Run only after full source migration replay + M1-18 PG17
-- catalog/negative ACL test in disposable CI. SELECT-only catalog metadata.
-- The boolean flags named "historicalRestoreBundleReplayed" and similar are
-- explicitly declared by the controlled CI runner; they are NOT inferred
-- from pg_catalog, and cannot prove production-equivalent reconstruction.
with objects as (
  select
    pg_catalog.to_regprocedure('public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)') as min_fn,
    pg_catalog.to_regprocedure('public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])') as issuer_fn,
    pg_catalog.to_regprocedure('public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb)') as binder_fn
),
checks as (
  select
    (select current_setting('server_version_num')::integer) as version_num,
    (select rolsuper from pg_catalog.pg_roles where rolname=current_user) as is_superuser,
    (pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null) as ledger_present,
    (o.min_fn is not null) as minimal_read_present,
    (o.issuer_fn is not null) as issuer_present,
    (o.binder_fn is not null) as binder_present,
    (o.min_fn is not null
      and pg_catalog.has_function_privilege('myeongha_api_executor', o.min_fn, 'EXECUTE')
      and exists (select 1 from pg_catalog.pg_proc p where p.oid=o.min_fn
        and p.prosecdef
        and pg_catalog.array_to_string(p.proconfig, ',')
          like '%search_path=pg_catalog, pg_temp%')
      and not exists (
        select 1 from pg_catalog.pg_proc p
        cross join lateral pg_catalog.aclexplode(
          coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        where p.oid=o.min_fn and a.grantee=0 and a.privilege_type='EXECUTE')
      and not exists (
        select 1 from (values ('anon'),('authenticated'),('service_role'),
          ('myeongha_commerce_internal_executor')) denied(rolename)
        where coalesce(pg_catalog.has_function_privilege(
          denied.rolename,o.min_fn,'EXECUTE'),true)
      )) as api_only_read,
    (o.issuer_fn is not null and o.binder_fn is not null
      and not exists (
        select 1 from
          (values ('anon'),('authenticated'),('service_role'),
            ('myeongha_api_executor'),('myeongha_commerce_internal_executor'),
            ('myeongha_seyeon_chat_runtime_owner')) denied(rolename)
        cross join lateral (select o.issuer_fn as fn union all
          select o.binder_fn) f
        where coalesce(pg_catalog.has_function_privilege(
          denied.rolename,f.fn,'EXECUTE'),true)
      )) as private_writers_closed,
    ((select count(*) from (values ('commerce_receipts'),
      ('entitlement_grants'),('entitlement_events'),
      ('standard_reading_reader_access_grants'),('outbox_events')) s(name)
      where pg_catalog.to_regclass('public.' || s.name) is not null) = 5
      and not exists (
        select 1 from (values ('commerce_receipts'),('entitlement_grants'),
          ('entitlement_events'),('standard_reading_reader_access_grants'),
          ('outbox_events')) s(name)
        where coalesce(pg_catalog.has_table_privilege(
          'myeongha_api_executor',
          pg_catalog.to_regclass('public.' || s.name),'SELECT'),true)
      )) as source_acl_closed
  from objects o
)
select pg_catalog.jsonb_build_object(
  'fixtureKind','SOURCE_TREE_PG17_DISPOSABLE',
  'postgresVersionNum',version_num,
  'executorIsSuperuser',is_superuser,
  'migrationLedgerTablePresent',ledger_present,
  'issuerPresent',issuer_present,
  'binderPresent',binder_present,
  'minimalReadPresent',minimal_read_present,
  'onlyApiCanExecuteMinimalRead',api_only_read,
  'allPrivateWritersClosedToRuntime',private_writers_closed,
  'apiSourceSelectDenied',source_acl_closed,
  'historicalRestoreBundleReplayed',false,
  'liveDataRestored',false,
  'sourceReplayCompleted',true,
  'managed0860MigrationSkipped',true
)::text
from checks;
