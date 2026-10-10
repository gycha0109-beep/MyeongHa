-- Read-only Production migration-history authorization preflight.
-- Watchtower-Track: ops
-- A code-only hard stop for unapproved out-of-order Se-yeon relationship
-- migrations and an untracked remote-only recovery bundle.
-- Does not approve deployment even when it returns ALLOW_PRELIMINARY_HISTORY_CHECK.
with
  source_versions(version) as (
    values ('1400'),('1410'),('1420'),('1430'),('1440'),('1450')
  ),
  later_versions(version) as (
    values ('1460'),('1470'),('1480'),('1490'),('1500'),('1510')
  ),
  required_functions(source_version, function_name) as (
    values
      ('1400','relationship_event_json_v1'),
      ('1400','cmd_lock_relationship_apply_context_v1'),
      ('1410','cmd_apply_relationship_event_runtime_v1'),
      ('1420','cmd_lock_relationship_history_context_v1'),
      ('1430','relationship_assert_adjustment_slot_v1'),
      ('1430','cmd_append_relationship_retraction_runtime_v1'),
      ('1430','cmd_append_relationship_correction_runtime_v1'),
      ('1430','cmd_commit_relationship_replay_projection_v1'),
      ('1440','cmd_rebuild_relationship_projection_runtime_v1'),
      ('1450','cmd_write_relationship_snapshot_runtime_v1'),
      ('1450','qry_latest_valid_relationship_snapshot_v1')
  ),
  snapshot as (
    select
      (select count(*) from source_versions s
       where not exists (
         select 1 from supabase_migrations.schema_migrations m
         where m.version = s.version
       )) as missing_early_versions,
      (select count(*) from later_versions s
       where exists (
         select 1 from supabase_migrations.schema_migrations m
         where m.version = s.version
       )) as applied_later_versions,
      (select count(*) from required_functions f
       where not exists (
         select 1 from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = f.function_name
       )) as missing_early_functions,
      exists (
        select 1 from supabase_migrations.schema_migrations m
        where m.version = '20261008090417'
          and m.name = 'seyeon_runtime_1460_1510_acl_before_owner_recovery'
      ) as incident_bundle_present,
      exists (
        select 1 from supabase_migrations.schema_migrations m
        where m.version = '20261008090417'
          and (m.name is distinct from
               'seyeon_runtime_1460_1510_acl_before_owner_recovery'
            or cardinality(m.statements) is distinct from 1
            or octet_length(convert_to(m.statements[1],'UTF8')) is distinct from 104021
            or encode(sha256(convert_to(m.statements[1],'UTF8')),'hex') is distinct from
               '4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894')
      ) as unexpected_bundle
  )
select case
  when applied_later_versions > 0 and missing_early_versions > 0
    then 'HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY'
  when unexpected_bundle
    then 'HOLD_UNRECOGNIZED_REMOTE_INCIDENT_HISTORY'
  when incident_bundle_present
    then 'HOLD_REMOTE_ONLY_INCIDENT_BUNDLE_REQUIRES_OWNER'
  when missing_early_versions = 0 and missing_early_functions > 0
    then 'HOLD_RELATIONSHIP_MIGRATION_CATALOG_DRIFT'
  else 'ALLOW_PRELIMINARY_HISTORY_CHECK'
end as admission_result
from snapshot;
