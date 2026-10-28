import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildCompletedPrivacyCanaryPublicProofV1 } from '../scripts/operations/build-completed-privacy-canary-proof.mjs';
import { assertPrivacyReplayCanaryEvidenceV1 } from '../scripts/operations/assert-privacy-replay-canary-evidence.mjs';

const state = Object.freeze({
  schema: 'myeongha-production-privacy-recovery-canary-evidence-v1',
  evidenceOrigin: 'read_only_completed_canary_attestation_v1',
  productionProjectRef: 'cnsfpcdiyofqvhpcegfc',
  fixtureClass: 'synthetic-disposable-member',
  canaryOperation: 'attest_completed',
  resumedFromCanaryRunId: 40468086758,
  commerceProvider: 'myeongha-privacy-canary-v1',
  accountDeletionStartAuthority: 'ephemeral-canary-login->myeongha_api_executor/cmd_start_account_deletion_runtime_v1',
  workerAuthority: 'myeongha_worker_runtime->myeongha_system_executor',
  workerStatus: 'completed',
  hostedAuthDeletionInvoked: false,
  hostedAuthDeletionOutcome: 'already_absent_verified',
  databaseFinalization: 'pass',
  completionAck: 'pass',
  personalizationNonResurrectionGuard: 'pass',
  commerceP5yRetentionGuard: 'retained-revoked-pass',
  outputContainsIdentifiers: false,
  outputContainsRowPayloads: false,
  authoritativePrivacyReconciliation: false,
  futureSafePrivacyReconciliation: false,
  drReady: false,
});
const pair = Object.freeze({
  status: 'PASS_PUBLIC_ARTIFACT_PAIR_INTEGRITY_ONLY',
  sourceCanaryRunId: 40468086758,
  sourceCanaryRunConclusion: 'failure',
  governedBackupRunId: 40468157715,
  canonicalLedgerRunId: 40468500587,
  ledgerEventCount: 1,
  accountDeletionStartedEventCount: 1,
  missingSuccessfulCanaryEvidenceArtifact: true,
  authoritativeRecoveredStateReplayed: false,
  authoritativePrivacyReconciliation: false,
  futureSafePrivacyReconciliation: false,
  drReady: false,
});

describe('completed historical canary evidence builder', () => {
  it('makes the exact output expected by the existing restored-state proof consumer', () => {
    const proof = buildCompletedPrivacyCanaryPublicProofV1(state, pair);
    expect(proof).toMatchObject({
      governedBackupRunId: 40468157715,
      privacyRecoveryLedgerRunId: 40468500587,
      privacyRecoveryLedgerEventCount: 1,
      accountDeletionStartedEventCount: 1,
      hostedAuthDeletionInvoked: false,
      drReady: false,
    });
    expect(Object.keys(proof)).not.toContain('sourceCanaryRunConclusion');
    expect(assertPrivacyReplayCanaryEvidenceV1(proof, {
      backupRunId: 40468157715, ledgerRunId: 40468500587, canaryRunId: 40630000001,
    })).toBe('READ_ONLY_COMPLETED_CASE_SCOPED_ONLY');
    for (const forbidden of ['authUserId', 'subjectId', 'token', 'secret', 'passphrase', 'rowPayload']) {
      expect(Object.keys(proof)).not.toContain(forbidden);
    }
  });

  it('rejects tampering, unexpected keys, mismatched event counts and DR promotion', () => {
    for (const [s, p] of [
      [{ ...state, subjectId: 'private' }, pair],
      [{ ...state, canaryOperation: 'fresh' }, pair],
      [{ ...state, hostedAuthDeletionInvoked: true }, pair],
      [{ ...state, drReady: true }, pair],
      [{ ...state, commerceProvider: 'wrong' }, pair],
      [state, { ...pair, sourceCanaryRunConclusion: 'success' }],
      [state, { ...pair, canonicalLedgerRunId: 1 }],
      [state, { ...pair, accountDeletionStartedEventCount: 0 }],
      [state, { ...pair, accountDeletionStartedEventCount: 2 }],
      [state, { ...pair, ledgerEventCount: '1' }],
      [state, { ...pair, authoritativeRecoveredStateReplayed: true }],
    ]) expect(() => buildCompletedPrivacyCanaryPublicProofV1(s, p)).toThrow();
  });

  it('writes only the validated identifier-free public JSON and never overwrites evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myeongha-attest-'));
    try {
      const input = join(dir, 'input.json'), manifest = join(dir, 'manifest.json');
      const output = join(dir, 'production-privacy-canary-public-evidence.json');
      await Promise.all([writeFile(input, JSON.stringify(state)), writeFile(manifest, JSON.stringify(pair))]);
      const cmd = ['scripts/operations/build-completed-privacy-canary-proof.mjs', input, manifest, output];
      expect(execFileSync(process.execPath, cmd, {encoding:'utf8'})).toContain('PASS_READ_ONLY');
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(buildCompletedPrivacyCanaryPublicProofV1(state, pair));
      expect(() => execFileSync(process.execPath, cmd, {encoding:'utf8', stdio:'ignore'})).toThrow();
    } finally { await rm(dir, {recursive:true, force:true}); }
  });
});
