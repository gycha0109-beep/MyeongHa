import { describe, expect, it } from 'vitest';
import { assertPrivacyReplayCanaryEvidenceV1 } from '../scripts/operations/assert-privacy-replay-canary-evidence.mjs';

const provenance = {
  canaryRunId: 40630000001,
  backupRunId: 40468157715,
  ledgerRunId: 40468500587,
};

const completed = {
  schema: 'myeongha-production-privacy-recovery-canary-evidence-v1',
  productionProjectRef: 'cnsfpcdiyofqvhpcegfc',
  governedBackupRunId: provenance.backupRunId,
  privacyRecoveryLedgerRunId: provenance.ledgerRunId,
  privacyRecoveryLedgerEventCount: 1,
  accountDeletionStartedEventCount: 1,
  workerStatus: 'completed',
  databaseFinalization: 'pass',
  completionAck: 'pass',
  personalizationNonResurrectionGuard: 'pass',
  commerceP5yRetentionGuard: 'retained-revoked-pass',
  outputContainsIdentifiers: false,
  outputContainsRowPayloads: false,
  authoritativePrivacyReconciliation: false,
  futureSafePrivacyReconciliation: false,
  drReady: false,
  canaryOperation: 'attest_completed',
  evidenceOrigin: 'read_only_completed_canary_attestation_v1',
  resumedFromCanaryRunId: 40468086758,
  hostedAuthDeletionInvoked: false,
  hostedAuthDeletionOutcome: 'already_absent_verified',
};

describe('restored-state provenance consumes completed case evidence without historical success forgery', () => {
  it('accepts only the new separately successful protected proof, not the original failed run', () => {
    expect(assertPrivacyReplayCanaryEvidenceV1(completed, provenance))
      .toBe('READ_ONLY_COMPLETED_CASE_SCOPED_ONLY');
    expect(() => assertPrivacyReplayCanaryEvidenceV1(completed, {
      ...provenance, canaryRunId: 40468086758,
    })).toThrow('COMPLETED_ATTESTATION_REPLAY_PROVENANCE_INVALID');
  });

  it('rejects unrelated backup and ledger or a swapped original incident', () => {
    for (const [evidence, source] of [
      [completed, { ...provenance, backupRunId: 9 }],
      [{ ...completed, governedBackupRunId: 9 }, provenance],
      [completed, { ...provenance, ledgerRunId: 9 }],
      [{ ...completed, resumedFromCanaryRunId: 40468086759 }, provenance],
      [{ ...completed, evidenceOrigin: 'unknown' }, provenance],
    ]) expect(() => assertPrivacyReplayCanaryEvidenceV1(evidence, source)).toThrow();
  });

  it('fails if the attestation claims to have performed Hosted Auth deletion or DR promotion', () => {
    for (const evidence of [
      { ...completed, hostedAuthDeletionInvoked: true },
      { ...completed, drReady: true },
      { ...completed, outputContainsIdentifiers: true },
      { ...completed, databaseFinalization: 'unknown' },
    ]) expect(() => assertPrivacyReplayCanaryEvidenceV1(evidence, provenance)).toThrow();
  });

  it('preserves existing successful fresh/resume canary paths without reinterpreting them', () => {
    const fresh = { ...completed, canaryOperation: 'fresh',
      resumedFromCanaryRunId: null, hostedAuthDeletionInvoked: true,
      hostedAuthDeletionOutcome: 'deleted' };
    delete fresh.evidenceOrigin;
    expect(assertPrivacyReplayCanaryEvidenceV1(fresh, provenance))
      .toBe('EXISTING_DESTRUCTIVE_CANARY_PROOF');
    expect(assertPrivacyReplayCanaryEvidenceV1({ ...fresh, canaryOperation: 'resume' }, provenance))
      .toBe('EXISTING_DESTRUCTIVE_CANARY_PROOF');
    expect(() => assertPrivacyReplayCanaryEvidenceV1({
      ...fresh, evidenceOrigin: 'read_only_completed_canary_attestation_v1',
    }, provenance)).toThrow('PRIVACY_REPLAY_CANARY_ORIGIN_DRIFT');
  });
});
