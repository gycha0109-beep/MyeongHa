import assert from 'node:assert/strict';

import {
  PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1,
  PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1,
} from './build-postgres-privacy-recovery-ledger-manifest.mjs';
import {
  PRIVACY_RECOVERY_LEDGER_COVERAGE_SCHEMA_V1,
  validatePrivacyRecoveryLedgerCoverage,
} from './validate-postgres-privacy-recovery-ledger-coverage.mjs';

const summary = Object.freeze({
  schema: PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1,
  backupRunId: 35329018925,
  backupCompletedAt: '2026-09-18T09:23:19.000Z',
  capturedAt: '2026-09-18T10:23:19.000Z',
  sourceDigest: `sha256:${'a'.repeat(64)}`,
  eventCount: 1,
  eventTypeCounts: { ACCOUNT_DELETION_STARTED: 1 },
  replayPlannerAccepted: true,
  privacyReconciliationScope: 'post-backup-privacy-events',
  sourceAuthorityClass: 'AUTHORITATIVE_CAPTURED_WINDOW_V1',
  authoritativeCoverageThrough: '2026-09-18T10:23:19.000Z',
  serviceabilityCoverageRule:
    'incident_reference_must_not_exceed_authoritative_coverage_through',
  candidateSourceAuthority: false,
  authoritativePostBackupSource: true,
  authoritativePrivacyReconciliation: false,
  futureSafePrivacyReconciliation: false,
  drReady: false,
});

const covered = validatePrivacyRecoveryLedgerCoverage(
  summary,
  '2026-09-18T10:23:19.000Z',
);
assert.equal(covered.schema, PRIVACY_RECOVERY_LEDGER_COVERAGE_SCHEMA_V1);
assert.equal(covered.sourceAuthority, PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1);
assert.equal(covered.coverageStatus, 'covered');
assert.equal(covered.recoveryServiceabilityGate, 'pass');
assert.equal(covered.drReady, false);
assert.equal(covered.outputContainsIdentifiers, false);

assert.equal(
  validatePrivacyRecoveryLedgerCoverage(summary, '2026-09-18T09:23:20.000Z')
    .coverageStatus,
  'covered',
);

assert.throws(
  () =>
    validatePrivacyRecoveryLedgerCoverage(
      summary,
      '2026-09-18T10:23:19.001Z',
    ),
  /incident reference exceeds authoritative ledger coverage/u,
);
assert.throws(
  () =>
    validatePrivacyRecoveryLedgerCoverage(
      summary,
      '2026-09-18T09:23:18.999Z',
    ),
  /incident reference precedes governed backup completion/u,
);
assert.throws(
  () =>
    validatePrivacyRecoveryLedgerCoverage(
      { ...summary, authoritativePostBackupSource: false },
      '2026-09-18T10:00:00.000Z',
    ),
  /not an authoritative post-backup source/u,
);

const reportText = JSON.stringify(covered);
for (const forbidden of ['subjectId', 'authUserId', 'deletionJobId', 'outboxEventId']) {
  assert.equal(reportText.includes(forbidden), false);
}

console.log(
  'PostgreSQL privacy recovery ledger coverage PASS: captured-window authority is explicit and incident references beyond coverage fail closed.',
);
