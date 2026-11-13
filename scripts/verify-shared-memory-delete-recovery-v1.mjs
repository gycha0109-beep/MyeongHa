import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPrivacyReconciliationPlan } from './build-postgres-privacy-reconciliation-plan.mjs';
import { buildPrivacyRecoveryLedgerManifest } from './build-postgres-privacy-recovery-ledger-manifest.mjs';

const [migration, exporter, ownerTest, route, workflow] = await Promise.all([
  'supabase/migrations/2380_subject_shared_memory_note_deletion_recovery_v1.sql',
  'scripts/operations/export-production-postgres-privacy-recovery-ledger.sh',
  'test/db/subject_shared_memory_owner_rls_v1.sql',
  'api/me/shared-memory.ts',
  '.github/workflows/production-postgres-privacy-recovery-ledger.yml',
].map(path => readFile(path, 'utf8')));
for (const fragment of [
  'after delete on public.subject_shared_memory_items_v1',
  'security definer', 'security invoker',
  'pg_catalog.pg_trigger_depth() < 1',
  'grant execute on function public.internal_record_shared_memory_note_deletion_v1(uuid,uuid)',
  'subject_shared_memory_delete_events_v1',
  'internal_replay_shared_memory_note_deletion_v1',
  'revoke all on function', 'get diagnostics v_count = row_count',
]) assert.ok(migration.includes(fragment), 'Missing atomic deletion or restricted replay contract');
assert.match(
  migration,
  /grant execute on function public\.internal_record_shared_memory_note_deletion_v1\(uuid,uuid\)\s+to myeongha_api_executor;/i,
  'Private deletion recorder must not expand the system executor allowlist',
);
assert.ok(!migration.includes('body_text text'), 'Recovery ledger must not store personal text');
assert.ok(exporter.includes('from public.subject_shared_memory_delete_events_v1 ev'));
assert.ok(exporter.includes("'SHARED_MEMORY_NOTE_DELETED'"));
assert.ok(exporter.includes('begin transaction read only;'));
assert.ok(ownerTest.includes('Cross-owner replay bypassed'));
assert.ok(route.includes("MYEONGHA_SHARED_MEMORY_ENABLED === '1'"));
assert.ok(workflow.includes('retention-days: 30'));
const event = {
  occurredAt:'2026-10-01T00:00:03.000Z',
  type:'SHARED_MEMORY_NOTE_DELETED',
  subjectId:'c1200000-0000-4000-8000-000000000001',
  sharedMemoryItemId:'c1300000-0000-4000-8000-000000000007',
};
const source={events:[event], unsupported:{
  accountDeletionWithoutExactOutboxCount:0,
  nonAccountDeletionJobCount:0,
  unsupportedSubjectLifecycleCount:0,
}};
const build=(rawSource=source)=>buildPrivacyRecoveryLedgerManifest({
  rawSource,
  backupRunId:42585925479,
  backupCompletedAt:'2026-10-01T00:00:00.000Z',
  capturedAt:'2026-10-01T00:00:10.000Z',
});
const {manifest,summary}=build();
assert.equal(summary.eventCount,1);
assert.equal(summary.eventTypeCounts.SHARED_MEMORY_NOTE_DELETED,1);
assert.equal(summary.replayPlannerAccepted,true);
assert.equal(summary.drReady,false);
assert.equal(summary.futureSafePrivacyReconciliation,false);
const {sql,report}=buildPrivacyReconciliationPlan(manifest);
assert.equal(report.eventTypeCounts.SHARED_MEMORY_NOTE_DELETED,1);
assert.match(sql,/public\.internal_replay_shared_memory_note_deletion_v1/);
assert.match(sql,/shared-memory note deletion recovery did not establish non-resurrection/);
assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
assert.doesNotMatch(sql,/\binsert\s+into\b/i);
assert.doesNotMatch(JSON.stringify(summary),/c1300000-0000-4000-8000-000000000007/);
assert.deepEqual(buildPrivacyReconciliationPlan(manifest),{sql,report});
assert.throws(()=>build({...source,events:[{...event,bodyText:'original private content'}]}),/unsupported fields/);
assert.throws(()=>buildPrivacyReconciliationPlan({...manifest,events:[
  {...manifest.events[0],subjectId:'not-a-uuid'},
]}),/must be a UUID/);
assert.throws(()=>build({...source,events:[
  {...event,occurredAt:'2026-09-30T23:59:59.000Z'},
]}),/after backup completion/);
assert.throws(()=>build({...source,events:[
  {...event,occurredAt:'2026-10-01T00:00:11.000Z'},
]}),/must not exceed capturedAt/);
console.log('Owner-shared note deletion encrypted-ledger replay contract PASS');
