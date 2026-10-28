import assert from 'node:assert/strict';

import { buildPrivacyRecoveryLedgerManifest } from './build-postgres-privacy-recovery-ledger-manifest.mjs';
import { validatePrivacyLedgerSnapshotOverlap } from './validate-postgres-privacy-ledger-snapshot-overlap.mjs';

const BACKUP = '2026-09-18T09:23:19Z';
const ACCOUNT = {
  occurredAt: '2026-09-18T09:23:20Z',
  type: 'ACCOUNT_DELETION_STARTED',
  deletionJobId: '10000000-0000-0000-0000-000000000001',
  outboxEventId: '20000000-0000-0000-0000-000000000001',
  requestDedupeKey: 'delete-account-1',
  subjectId: '30000000-0000-0000-0000-000000000001',
};
const REVOKE = {
  occurredAt: '2026-09-18T09:23:21Z',
  type: 'MEMORY_ITEM_REVOKED',
  memoryItemId: '60000000-0000-0000-0000-000000000001',
  subjectId: ACCOUNT.subjectId,
};
const NEW_REVOKE = {
  ...REVOKE,
  memoryItemId: '60000000-0000-0000-0000-000000000002',
  occurredAt: '2026-09-18T09:24:10Z',
};
function manifest(events, opts = {}) {
  return buildPrivacyRecoveryLedgerManifest({
    rawSource: {
      events,
      unsupported: {
        accountDeletionWithoutExactOutboxCount: 0,
        nonAccountDeletionJobCount: 0,
        unsupportedSubjectLifecycleCount: 0,
      },
    },
    backupRunId: opts.backupRunId ?? 123,
    backupCompletedAt: opts.backupAt ?? BACKUP,
    capturedAt: opts.capturedAt ?? '2026-09-18T09:24:00Z',
  }).manifest;
}
const first = manifest([ACCOUNT, REVOKE]);
const second = manifest([NEW_REVOKE, REVOKE, ACCOUNT], {
  capturedAt: '2026-09-18T09:25:00Z',
});
const clean = validatePrivacyLedgerSnapshotOverlap(first, second);
assert.equal(clean.snapshotOverlapStatus, 'OVERLAPPING_CAPTURED_EVENTS_PRESERVED');
assert.equal(clean.overlapEventCount, 2);
assert.equal(clean.currentEventCount, 3);
assert.equal(clean.sourceContinuityProven, false);
assert.equal(clean.futureSafePrivacyReconciliation, false);
assert.equal(clean.drReady, false);
assert.equal(clean.outputContainsIdentifiers, false);
assert.equal(JSON.stringify(clean).includes(ACCOUNT.subjectId), false);

// Even a valid, self-consistent next snapshot is rejected if it drops an
// already-captured event while the governed backup cutoff is unchanged.
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(
    first, manifest([REVOKE, NEW_REVOKE], { capturedAt: '2026-09-18T09:25:00Z' })),
  /previously captured post-backup privacy event absent/u,
);

assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(first, manifest(
    [ACCOUNT], { capturedAt: '2026-09-18T09:25:00Z' },
  )),
  /previously captured post-backup privacy event absent/u,
);

// Snapshot after a new backup cutoff need not carry events already absorbed
// by that backup, but this alone does not prove the restored backup state.
const advanced = manifest([], {
  backupRunId: 124,
  backupAt: '2026-09-18T09:24:30Z',
  capturedAt: '2026-09-18T09:25:00Z',
});
assert.equal(
  validatePrivacyLedgerSnapshotOverlap(first, advanced).snapshotOverlapStatus,
  'BACKUP_ADVANCED_WITHOUT_OVERLAP_PROOF',
);
assert.equal(
  validatePrivacyLedgerSnapshotOverlap(first, advanced).sourceContinuityProven,
  false,
);
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(advanced, first),
  /current capturedAt must advance/u,
);
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(first, {
    ...second, sourceDigest: 'sha256:' + '0'.repeat(64),
  }),
  /source digest differs/u,
);
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(first, {
    ...second, backupCompletedAt: '2026-09-18T09:23:18.000Z',
  }),
  /current backup cutoff moved backward/u,
);
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(first, {
    ...second, backupCompletedAt: '2026-09-18T09:23:18.000Z',
    backupRunId: 123,
  }),
  /current backup cutoff moved backward/u,
);
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(first, {
    ...second, sourceAuthority: 'unknown',
  }),
  /authority does not match/u,
);
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(first, {
    ...second, incidentReferenceUtc: first.incidentReferenceUtc,
  }),
  /current capturedAt must advance/u,
);
assert.throws(
  () => validatePrivacyLedgerSnapshotOverlap(first, {
    ...second, events: second.events.slice(0, 1),
  }),
  /source digest differs/u,
);

// Zero-event snapshots are valid only for their actual captured windows.
const emptyPrev = manifest([]);
const emptyNext = manifest([], { capturedAt: '2026-09-18T09:25:00Z' });
const empty = validatePrivacyLedgerSnapshotOverlap(emptyPrev, emptyNext);
assert.equal(empty.overlapEventCount, 0);
assert.equal(empty.sourceContinuityProven, false);

console.log('PostgreSQL privacy ledger snapshot overlap PASS: captured events cannot disappear silently; all future-safe/DR claims remain false.');
