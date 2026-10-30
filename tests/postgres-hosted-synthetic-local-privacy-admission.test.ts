import { describe, expect, it } from 'vitest';
import { assessSyntheticLocalRecoveryPrivacyAdmission } from '../scripts/assess-postgres-hosted-synthetic-local-privacy-admission.mjs';
import { PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1 } from '../scripts/build-postgres-privacy-recovery-ledger-manifest.mjs';

const postdelete = Object.freeze({
  schema: 'myeongha-dr-synthetic-local-postdelete-v1',
  target: 'local-loopback-synthetic-only',
  syntheticPrivateObjectBeforeDeletion: 'PASS',
  syntheticDeletion: 'PASS',
  newLoginDenied: 'PASS',
  refreshAfterDeletionDenied: 'PASS',
  revocationAppliedBeforeDeletion: true,
  revocationBeforeDeletionStorageDenied: 'PASS',
  localRevocationMarkerApplied: true,
  staleAccessTokenStorageDenied: 'PASS',
  independentPrivacyContinuityProven: false,
  hostedProviderRecoveryProven: false,
  providerManagedDataFullRestore: false,
  futureSafePrivacyReconciliation: false,
  drReady: false,
  gate: 'BLOCKED',
  serviceResumptionAllowed: false,
  outputContainsIdentifiers: false,
});
const ledger = Object.freeze({
  schema: PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1,
  backupRunId: 100,
  backupCompletedAt: '2026-10-30T01:00:00.000Z',
  capturedAt: '2026-10-30T02:00:00.000Z',
  authoritativeCoverageThrough: '2026-10-30T02:00:00.000Z',
  sourceDigest: 'sha256:' + 'a'.repeat(64),
  eventCount: 1,
  eventTypeCounts: { ACCOUNT_DELETION_STARTED: 1 },
  replayPlannerAccepted: true,
  sourceAuthorityClass: 'AUTHORITATIVE_CAPTURED_WINDOW_V1',
  serviceabilityCoverageRule: 'incident_reference_must_not_exceed_authoritative_coverage_through',
  candidateSourceAuthority: false,
  authoritativePostBackupSource: true,
  authoritativePrivacyReconciliation: false,
  futureSafePrivacyReconciliation: false,
  drReady: false,
});
const reference = '2026-10-30T02:00:00.000Z';
const run = (post = postdelete, summary = ledger, incident = reference) =>
  assessSyntheticLocalRecoveryPrivacyAdmission({
    localPostdeleteReport: post, ledgerSummary: summary, incidentReferenceUtc: incident,
  });

describe('Docker synthetic Auth/Storage captured-window privacy admission fence', () => {
  it('accepts bounded synthetic evidence but never enables DR/Hosted/S8 serving', () => {
    const report = run();
    expect(report).toMatchObject({
      localPostdeleteAcceptance: 'PASS',
      capturedWindowMetadataValidation: 'PASS',
      capturedWindowAuthorityOnly: true,
      independentSourceArtifactAuthenticated: false,
      independentPrivacyContinuityProven: false,
      providerManagedDataFullRestore: false,
      hostedProviderRecoveryProven: false,
      futureSafePrivacyReconciliation: false,
      s8ServingE2eProven: false,
      drReady: false, gate: 'BLOCKED', serviceResumptionAllowed: false,
      outputContainsIdentifiers: false,
    });
    expect(JSON.stringify(report)).not.toContain('ACCOUNT_DELETION_STARTED');
  });

  it('rejects incident after real capture, even by one millisecond', () => {
    expect(() => run(postdelete, ledger, '2026-10-30T02:00:00.001Z'))
      .toThrow('incident reference exceeds authoritative ledger coverage');
  });

  it('rejects forged extended coverage timestamp', () => {
    expect(() => run(postdelete, {
      ...ledger, authoritativeCoverageThrough: '2026-10-30T03:00:00.000Z',
    })).toThrow('authoritative coverage must exactly equal capturedAt');
  });

  it('rejects failed or absent local JWT revocation evidence', () => {
    for (const field of ['staleAccessTokenStorageDenied',
      'revocationBeforeDeletionStorageDenied', 'refreshAfterDeletionDenied']) {
      expect(() => run({ ...postdelete, [field]: 'FAIL' }))
        .toThrow('local revocation prerequisite failed');
    }
    expect(() => run(null)).toThrow('missing exact Docker-local post-deletion report');
  });

  it('rejects reclassified local reports and unsafe readiness promotion', () => {
    expect(() => run({ ...postdelete, target: 'hosted-service' }))
      .toThrow('missing exact Docker-local post-deletion report');
    for (const patch of [{ drReady: true }, { gate: 'OPEN' },
      { serviceResumptionAllowed: true }, { independentPrivacyContinuityProven: true },
      { hostedProviderRecoveryProven: true }, { revocationAppliedBeforeDeletion: false }]) {
      expect(() => run({ ...postdelete, ...patch }))
        .toThrow('local report tries to promote');
    }
  });

  it('rejects bogus authority or a missing ledger', () => {
    expect(() => run(postdelete, null)).toThrow('missing independent captured-window ledger summary');
    expect(() => run(postdelete, { ...ledger, sourceAuthorityClass: 'UNKNOWN' }))
      .toThrow('not captured-window authority');
    expect(() => run(postdelete, { ...ledger, replayPlannerAccepted: false }))
      .toThrow('source summary lacks accepted replay planner');
    expect(() => run(postdelete, { ...ledger, eventCount: 2 }))
      .toThrow('event type counts do not match eventCount');
  });
});
