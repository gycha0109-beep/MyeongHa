-- Watchtower-Track: ops
-- Exact 2026-11-14 Production baseline observation before any proposed
-- 2360 -> 2370 -> 2380 shared-memory forward migration.
-- Read only: no user rows, source SQL, identifiers, DDL, DML, or history repair.
-- REVIEW_ONLY is not approval to execute a Production change.
with facts as (
  select
    (select count(*) from supabase_migrations.schema_migrations) as migration_count,
    (select max(version) from supabase_migrations.schema_migrations) as frontier,
    (select count(*) from supabase_migrations.schema_migrations
       where version in ('2360','2370','2380')) as chain_history_count,
    (select count(*) from supabase_migrations.schema_migrations
       where version in ('20261008090417','20261028011357')) as historical_remote_count,
    (select count(*) from supabase_migrations.schema_migrations
       where version='20261028110500') as unapproved_kcp_history_count,
    (to_regclass('public.subject_shared_memory_items_v1') is null) as items_absent,
    (to_regclass('public.subject_shared_memory_delete_events_v1') is null) as events_absent,
    (to_regprocedure('public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz)') is null) as replay_absent,
    (to_regclass('public.subjects') is not null) as subjects_present,
    (to_regclass('public.data_deletion_jobs') is not null) as deletion_jobs_present,
    (to_regprocedure('public.current_myeongha_subject_id()') is not null) as subject_context_present,
    (select pg_get_userbyid(proowner)
       from pg_catalog.pg_proc
       where oid=to_regprocedure('public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)')) as finalizer_owner,
    (select not rolsuper and not rolbypassrls
       from pg_catalog.pg_roles where rolname='myeongha_api_executor') as api_non_bypass_rls
)
select jsonb_build_object(
  'schemaVersion','ops-shared-memory-production-readonly-preflight-v1',
  'migrationCount',migration_count,
  'migrationFrontier',frontier,
  'missingChainHistoryCount',3-chain_history_count,
  'historicalRemoteVersionsPreserved',historical_remote_count=2,
  'kcpRepoAliasStillUnrecorded',unapproved_kcp_history_count=0,
  'originalSharedMemoryObjectsAbsent',items_absent and events_absent and replay_absent,
  'baseSubjectsAndDeletionJobsPresent',subjects_present and deletion_jobs_present,
  'subjectContextFunctionPresent',subject_context_present,
  'existingFinalizerOwnerIsPostgres',finalizer_owner='postgres',
  'apiRoleNonBypassRls',coalesce(api_non_bypass_rls,false),
  'baselineMatchesExpected',
    migration_count=245 and frontier='20261113062455'
    and chain_history_count=0 and historical_remote_count=2
    and unapproved_kcp_history_count=0
    and items_absent and events_absent and replay_absent
    and subjects_present and deletion_jobs_present and subject_context_present
    and finalizer_owner='postgres' and coalesce(api_non_bypass_rls,false),
  'productionSqlExecutedByThisPreflight',false,
  'productionChangeApprovedByThisPreflight',false,
  'drReady',false,
  'serviceResumptionAllowed',false
) as preflight_evidence
from facts;
