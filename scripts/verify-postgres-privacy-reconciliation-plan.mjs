import assert from 'node:assert/strict';
import { buildPrivacyReconciliationPlan } from './build-postgres-privacy-reconciliation-plan.mjs';

const digest = `sha256:${'a'.repeat(64)}`;

function manifest(events) {
  return {
    schema: 'myeongha-postgres-privacy-reconciliation-manifest-v1',
    manifestId: '10000000-0000-4000-8000-000000000001',
    backupRunId: 35260191079,
    backupCompletedAt: '2026-09-17T18:42:39.000Z',
    incidentReferenceUtc: '2026-09-17T19:00:00.000Z',
    sourceAuthority: 'synthetic-ci-fixture',
    sourceDigest: digest,
    events,
  };
}

const events = [
  {
    eventId: '20000000-0000-4000-8000-000000000008',
    sequence: 80,
    occurredAt: '2026-09-17T18:50:08.000Z',
    type: 'CHARACTER_RECORDS_FORGOTTEN',
    subjectId: '30000000-0000-4000-8000-000000000001',
    characterId: "baek'heon",
  },
  {
    eventId: '20000000-0000-4000-8000-000000000001',
    sequence: 10,
    occurredAt: '2026-09-17T18:50:01.000Z',
    type: 'SHARE_ARTIFACT_REVOKED',
    subjectId: '30000000-0000-4000-8000-000000000001',
    shareArtifactId: '40000000-0000-4000-8000-000000000001',
  },
  {
    eventId: '20000000-0000-4000-8000-000000000002',
    sequence: 20,
    occurredAt: '2026-09-17T18:50:02.000Z',
    type: 'DEVICE_INSTALLATION_REVOKED',
    subjectId: '30000000-0000-4000-8000-000000000001',
    installationId: '50000000-0000-4000-8000-000000000001',
  },
  {
    eventId: '20000000-0000-4000-8000-000000000003',
    sequence: 30,
    occurredAt: '2026-09-17T18:50:03.000Z',
    type: 'MEMORY_ITEM_REVOKED',
    subjectId: '30000000-0000-4000-8000-000000000001',
    memoryItemId: '60000000-0000-4000-8000-000000000001',
  },
  {
    eventId: '20000000-0000-4000-8000-000000000004',
    sequence: 40,
    occurredAt: '2026-09-17T18:50:04.000Z',
    type: 'LIFE_FACT_REVOKED',
    subjectId: '30000000-0000-4000-8000-000000000001',
    lifeFactId: '70000000-0000-4000-8000-000000000001',
  },
  {
    eventId: '20000000-0000-4000-8000-000000000005',
    sequence: 50,
    occurredAt: '2026-09-17T18:50:05.000Z',
    type: 'MEMORY_CHARACTER_GRANT_REVOKED',
    subjectId: '30000000-0000-4000-8000-000000000001',
    memoryItemId: '60000000-0000-4000-8000-000000000001',
    characterId: 'seorin',
  },
  {
    eventId: '20000000-0000-4000-8000-000000000006',
    sequence: 60,
    occurredAt: '2026-09-17T18:50:06.000Z',
    type: 'LIFE_FACT_CHARACTER_GRANT_REVOKED',
    subjectId: '30000000-0000-4000-8000-000000000001',
    lifeFactId: '70000000-0000-4000-8000-000000000001',
    characterId: 'taegyeom',
  },
  {
    eventId: '20000000-0000-4000-8000-000000000007',
    sequence: 70,
    occurredAt: '2026-09-17T18:50:07.000Z',
    type: 'ACCOUNT_DELETION_STARTED',
    subjectId: '30000000-0000-4000-8000-000000000001',
    deletionJobId: '80000000-0000-4000-8000-000000000001',
    requestDedupeKey: "restore-replay-'authority",
    outboxEventId: '90000000-0000-4000-8000-000000000001',
  },
];

const first = buildPrivacyReconciliationPlan(manifest(events));
const second = buildPrivacyReconciliationPlan(manifest(events));
assert.deepEqual(first, second, 'plan generation must be deterministic');
assert.equal(first.report.eventCount, 8);
assert.equal(first.report.drReady, false);
assert.equal(first.report.accountDeletionFinalization, 'blocked-by-P0-PR-01-and-issue-964');
assert.equal(first.report.commerceRetentionDecision, 'blocked-by-P0-PR-01-and-issue-964');
assert.equal(first.report.replayIdempotency, 'transactional-terminal-state-validated');
assert.equal(first.report.outputContainsIdentifiers, false);
assert.equal(first.report.outputContainsRowPayloads, false);
assert.equal(Object.hasOwn(first.report, 'manifestId'), false);

const commands = [
  'public.cmd_revoke_share_artifact_v1',
  'public.cmd_revoke_device_installation_v1',
  'public.cmd_revoke_memory_item_v1',
  'public.cmd_revoke_life_fact_v1',
  'public.cmd_revoke_memory_character_grant_v1',
  'public.cmd_revoke_life_fact_character_grant_v1',
  'public.cmd_start_account_deletion_v1',
  'public.cmd_forget_character_records_v1',
];
for (const command of commands) {
  assert.match(first.sql, new RegExp(command.replaceAll('.', '\\.'), 'g'));
}
assert.equal((first.sql.match(/applied_event_row_count/g) ?? []).length, 8);
assert.ok(
  first.sql.indexOf('cmd_revoke_share_artifact_v1') <
    first.sql.indexOf('cmd_start_account_deletion_v1'),
  'sequence order must be authoritative even when the input array is shuffled',
);
assert.match(first.sql, /restore-replay-''authority/);
assert.match(first.sql, /baek''heon/);
assert.match(first.sql, /v_subject_status = 'deletion_pending'/);
assert.match(first.sql, /account deletion start replay did not establish all required revocation postconditions/);
assert.match(first.sql, /not exists \(select 1 from public\.notifications/);
assert.match(first.sql, /public\.outbox_events/);
assert.match(first.sql, /for update;/);
assert.doesNotMatch(first.sql, /\bdelete\s+from\b/i);
assert.doesNotMatch(first.sql, /\btruncate\b/i);
assert.doesNotMatch(first.sql, /\bupdate\s+public\./i);
assert.doesNotMatch(first.sql, /\binsert\s+into\b/i);
assert.doesNotMatch(first.sql, /commerce|payment|purchase|entitlement/i);

const genericPostgresUuid = buildPrivacyReconciliationPlan({
  ...manifest([]),
  manifestId: '10000000-0000-0000-0000-000000000001',
});
assert.equal(genericPostgresUuid.report.eventCount, 0);

const empty = buildPrivacyReconciliationPlan(manifest([]));
assert.equal(empty.report.eventCount, 0);
assert.doesNotMatch(empty.sql, /cmd_/);

function mustReject(candidate, pattern) {
  assert.throws(() => buildPrivacyReconciliationPlan(candidate), pattern);
}

mustReject(
  manifest([
    {
      eventId: '20000000-0000-4000-8000-000000000010',
      sequence: 1,
      occurredAt: '2026-09-17T18:50:00.000Z',
      type: 'ACCOUNT_DELETION_FINALIZED',
      subjectId: '30000000-0000-4000-8000-000000000001',
    },
  ]),
  /unsupported: ACCOUNT_DELETION_FINALIZED/,
);
mustReject(
  manifest([
    {
      eventId: '20000000-0000-4000-8000-000000000011',
      sequence: 1,
      occurredAt: '2026-09-17T18:50:00.000Z',
      type: 'COMMERCE_RETENTION_APPLIED',
      subjectId: '30000000-0000-4000-8000-000000000001',
    },
  ]),
  /unsupported: COMMERCE_RETENTION_APPLIED/,
);
mustReject(
  manifest([
    {
      ...events[1],
      sequence: 1,
      occurredAt: '2026-09-17T18:42:39.000Z',
    },
  ]),
  /must be after backupCompletedAt/,
);
mustReject(
  manifest([
    {
      ...events[1],
      sequence: 1,
      occurredAt: '2026-09-17T19:00:00.001Z',
    },
  ]),
  /must not exceed incidentReferenceUtc/,
);
mustReject(
  manifest([
    { ...events[1], sequence: 1 },
    { ...events[2], eventId: events[1].eventId, sequence: 2 },
  ]),
  /duplicate eventId/,
);
mustReject(
  manifest([
    { ...events[1], sequence: 1 },
    { ...events[2], sequence: 1 },
  ]),
  /duplicate sequence/,
);
mustReject(
  {
    ...manifest([]),
    sourceDigest: 'sha256:not-a-digest',
  },
  /sourceDigest must be sha256/,
);
mustReject(
  manifest([
    {
      ...events[1],
      sequence: 1,
      retentionDays: 365,
    },
  ]),
  /unsupported fields: retentionDays/,
);

mustReject(
  manifest([
    {
      ...events[0],
      sequence: 1,
      characterId: 'bad-$myeongha_privacy_reconcile$-delimiter',
    },
  ]),
  /reserved reconciliation SQL delimiter/,
);
mustReject(
  manifest([
    {
      ...events[7],
      sequence: 1,
    },
    {
      ...events[7],
      eventId: '20000000-0000-4000-8000-000000000099',
      deletionJobId: '80000000-0000-4000-8000-000000000099',
      outboxEventId: '90000000-0000-4000-8000-000000000099',
      requestDedupeKey: 'second-account-start',
      sequence: 2,
    },
  ]),
  /multiple ACCOUNT_DELETION_STARTED events for subject/,
);

console.log(
  'PostgreSQL privacy reconciliation replay plan verification passed: authoritative revocation/start commands only; finalization and commerce retention fail closed.',
);
