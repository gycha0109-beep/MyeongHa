#!/usr/bin/env bash
# Protected one-shot test against an isolated copy. Never writes Production.
# Watchtower-Track: ops
set -euo pipefail
umask 077
fail() { echo "HOLD_DISPOSABLE_SHARED_MEMORY_REHEARSAL" >&2; exit 1; }

[[ "$GITHUB_ACTIONS" == true && "$GITHUB_EVENT_NAME" == workflow_dispatch &&
   "$GITHUB_REF" == refs/heads/main ]] || fail
[[ "$BACKUP_RUN_ID" == 43424903445 &&
   "$EXPECTED_SOURCE_SHA" == 6eab97337811128282f5f5ec6320e4608d5f9c09 &&
   "$INCIDENT_REFERENCE_UTC" == 2026-11-13T12:29:12Z ]] || fail
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ &&
   "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ ]] || fail
[[ "$RESTORE_EVIDENCE_PATH" == "$RUNNER_TEMP/"* &&
   "$REHEARSAL_EVIDENCE_PATH" == "$RUNNER_TEMP/"* ]] || fail
[[ "$PGHOST" == 127.0.0.1 && "$PGPORT" == 5432 &&
   "$PGUSER" == supabase_admin && "$PGDATABASE" == postgres ]] || fail
for tool in jq psql git; do command -v "$tool" >/dev/null || fail; done

# This is the evidence for the ORIGINAL, unmodified restored DB.
jq -e '.restore_target == "github-actions-loopback-supabase-postgres"
  and (.backup_migration_frontier | tostring) == "20261113062455"
  and .dr_ready == false' "$RESTORE_EVIDENCE_PATH" >/dev/null || fail
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "select current_user = 'supabase_admin' and rolsuper
   from pg_catalog.pg_roles where rolname = current_user")" == t ]] || fail
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select (to_regclass('public.subject_shared_memory_items_v1') is null)::int
    || '|' || (to_regclass('public.subject_shared_memory_delete_events_v1') is null)::int
    || '|' || (to_regprocedure('public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz)') is null)::int")" == "1|1|1" ]] || fail

# Git objects are pinned to the reviewed migration contents.
f1=supabase/migrations/2360_subject_shared_memory_owner_managed_v1.sql
f2=supabase/migrations/2370_subject_shared_memory_account_finalization_erasure_v1.sql
f3=supabase/migrations/2380_subject_shared_memory_note_deletion_recovery_v1.sql
[[ "$(git hash-object -- "$f1")" == ddf51632a08735042adb0cff1bdbbf1b64e7c65a &&
   "$(git hash-object -- "$f2")" == 90848c31cd5dfc0de1ffb0b30cb46c95ef5c0710 &&
   "$(git hash-object -- "$f3")" == 3cafb2d702bb17b6677ae550bd8b540d3e884158 ]] || fail

# Atomic transaction. Apply ONLY to the disposable GitHub loopback target.
psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
  --file "$f1" --file "$f2" --file "$f3" >/dev/null || fail

# Metadata and privilege check; never read recovered user rows or secrets.
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select (
    (select relrowsecurity and relforcerowsecurity
     from pg_catalog.pg_class where oid = to_regclass('public.subject_shared_memory_items_v1'))
    and to_regclass('public.subject_shared_memory_delete_events_v1') is not null
    and to_regprocedure('public.tr_erase_shared_memory_on_account_finalization_v1()') is not null
    and to_regprocedure('public.internal_record_shared_memory_note_deletion_v1(uuid,uuid)') is not null
    and to_regprocedure('public.tr_record_shared_memory_note_deletion_v1()') is not null
    and to_regprocedure('public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz)') is not null
    and not has_table_privilege('anon','public.subject_shared_memory_items_v1','SELECT')
    and not has_table_privilege('authenticated','public.subject_shared_memory_items_v1','SELECT')
    and not has_table_privilege('myeongha_api_executor','public.subject_shared_memory_delete_events_v1','SELECT')
    and has_column_privilege('myeongha_api_executor','public.subject_shared_memory_items_v1','body_text','SELECT')
    and not has_function_privilege('anon',
      'public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated',
      'public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz)','EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz)','EXECUTE')
    and (select count(*) from pg_catalog.pg_trigger
      where tgrelid=to_regclass('public.subject_shared_memory_items_v1')
      and tgname='record_shared_memory_note_deletion_v1' and not tgisinternal)=1
    and (select count(*) from pg_catalog.pg_trigger
      where tgrelid=to_regclass('public.subjects')
      and tgname='erase_shared_memory_on_account_finalization_v1' and not tgisinternal)=1
  )::int")" == 1 ]] || fail

jq -n --arg sha "$GITHUB_SHA" --argjson run "$GITHUB_RUN_ID" '{
  schemaVersion: "ops-disposable-shared-memory-privacy-forward-chain-v1",
  restoreWorkflowRunId: $run,
  exactRestoreWorkflowCommitSha: $sha,
  sourceBackupRunId: 43424903445,
  sourceBackupSha: "6eab97337811128282f5f5ec6320e4608d5f9c09",
  sourceMigrationFrontier: "20261113062455",
  sourceMigrationCount: 245,
  forwardMigrationsAppliedOnlyToClone: ["2360","2370","2380"],
  forwardMigrationsInSingleTransaction: true,
  cloneMetadataAndPrivilegePreflightPassed: true,
  syntheticPrivacyValidationPendingFollowingStep: true,
  productionSchemaIncludesForwardMigrations: false,
  cloneStillMatchesOriginalProductionSchema: false,
  productionDatabaseChanged: false,
  hostedAuthStorageRestoreProven: false,
  authoritativePrivacyReconciliationProven: false,
  drReady: false,
  serviceResumptionAllowed: false,
  verdict: "ISOLATED_FORWARD_CHAIN_SCHEMA_PASS__PRODUCTION_GAP__DR_HOLD"
}' > "$REHEARSAL_EVIDENCE_PATH" || fail
chmod 600 "$REHEARSAL_EVIDENCE_PATH"
echo 'ISOLATED_SHARED_MEMORY_FORWARD_CHAIN_PRESENT__PRIVACY_PENDING__DR_HOLD'
