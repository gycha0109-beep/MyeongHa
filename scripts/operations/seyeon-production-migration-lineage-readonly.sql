-- Se-yeon production migration lineage READ-ONLY diagnosis.
-- Watchtower-Track: ops
-- Never use this result as permission to repair or deploy.
-- No DML/DDL; succeeds as a query even when the safety verdict is HOLD.
with
  recovered as (
    select version, name,
      coalesce(cardinality(statements), 0) as statement_count,
      coalesce(octet_length(statements[1]), 0) as statement_bytes,
      md5(coalesce(statements[1], '')) as statement_md5
    from supabase_migrations.schema_migrations
    where version = '20261008090417'
  ),
  markers as (
    select
      count(*) filter (
        where version in ('1460', '1470', '1480', '1490', '1500', '1510')
      ) as individual_count,
      count(*) filter (
        where version in ('1460', '1470', '1480', '1490', '1500', '1510')
          and coalesce(cardinality(statements), 0) = 0
      ) as empty_individual_count,
      count(*) filter (
        where version in ('1520', '1530', '1540', '1550', '1560',
                          '1570', '1580', '1590', '1600',
                          '1610', '1620', '1630', '1640')
      ) as newer_versions_count
    from supabase_migrations.schema_migrations
  ),
  pin as (
    select count(*) as columns_present
    from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_turn_attempts'
      and column_name in ('seyeon_personal_source_pin_jsonb',
                          'seyeon_personal_source_pinned_at')
  )
select
  current_setting('server_version') as postgres_version,
  (r.version is not null) as historical_bundle_present,
  r.name as historical_bundle_name,
  r.statement_count as historical_bundle_statements,
  r.statement_bytes as historical_bundle_bytes,
  r.statement_md5 as historical_bundle_md5,
  m.individual_count as individual_1460_to_1510_versions,
  m.empty_individual_count as individual_empty_statement_versions,
  m.newer_versions_count as applied_1520_to_1640_versions,
  p.columns_present as pin_columns,
  (to_regprocedure(
    'public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)'
  ) is not null) as newer_zero_pin_function_present,
  (to_regprocedure(
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'
  ) is not null) as existing_chat_commit_v2_present,
  case
    when r.version is null then 'HOLD_MISSING_HISTORICAL_BUNDLE'
    when r.name is distinct from
        'seyeon_runtime_1460_1510_acl_before_owner_recovery'
      or r.statement_count <> 1
      or r.statement_bytes <> 104021
      or r.statement_md5 <> 'f70776d8c0f6369f6f13484ba9fa2271'
      then 'HOLD_UNRECOGNIZED_BUNDLE'
    when m.individual_count <> 6 or m.empty_individual_count <> 6
      then 'HOLD_INCONSISTENT_INDIVIDUAL_MARKERS'
    when m.newer_versions_count <> 0 or p.columns_present <> 0
      then 'HOLD_CHANGED_RUNTIME_SCHEMA_REASSESS'
    else 'HOLD_OWNER_RECONCILIATION_REQUIRED'
  end as investigation_status
from markers m
cross join pin p
left join recovered r on true;
