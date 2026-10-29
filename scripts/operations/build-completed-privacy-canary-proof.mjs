import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/**
 * Public attestation evidence from the one approved, already-completed incident.
 * The separate protected workflow proves GitHub-run and ciphertext provenance.
 * No private row identifiers, decrypted data, or original-failure promotion.
 */
export function buildCompletedPrivacyCanaryPublicProofV1(state, pair) {
  const allowed = new Set([
    'schema', 'evidenceOrigin', 'productionProjectRef', 'fixtureClass',
    'canaryOperation', 'resumedFromCanaryRunId', 'commerceProvider',
    'accountDeletionStartAuthority', 'workerAuthority', 'workerStatus',
    'hostedAuthDeletionInvoked', 'hostedAuthDeletionOutcome',
    'databaseFinalization', 'completionAck',
    'personalizationNonResurrectionGuard', 'commerceP5yRetentionGuard',
    'outputContainsIdentifiers', 'outputContainsRowPayloads',
    'authoritativePrivacyReconciliation', 'futureSafePrivacyReconciliation', 'drReady',
  ]);
  if (!state || typeof state !== 'object' || Array.isArray(state)
      || Object.keys(state).some(key => !allowed.has(key))
      || state.schema !== 'myeongha-production-privacy-recovery-canary-evidence-v1'
      || state.evidenceOrigin !== 'read_only_completed_canary_attestation_v1'
      || state.productionProjectRef !== 'cnsfpcdiyofqvhpcegfc'
      || state.fixtureClass !== 'synthetic-disposable-member'
      || state.commerceProvider !== 'myeongha-privacy-canary-v1'
      || state.accountDeletionStartAuthority !== 'ephemeral-canary-login->myeongha_api_executor/cmd_start_account_deletion_runtime_v1'
      || state.workerAuthority !== 'myeongha_worker_runtime->myeongha_system_executor'
      || state.canaryOperation !== 'attest_completed'
      || state.resumedFromCanaryRunId !== 40468086758
      || state.workerStatus !== 'completed'
      || state.hostedAuthDeletionInvoked !== false
      || state.hostedAuthDeletionOutcome !== 'already_absent_verified'
      || state.databaseFinalization !== 'pass'
      || state.completionAck !== 'pass'
      || state.personalizationNonResurrectionGuard !== 'pass'
      || state.commerceP5yRetentionGuard !== 'retained-revoked-pass'
      || state.outputContainsIdentifiers !== false
      || state.outputContainsRowPayloads !== false
      || state.authoritativePrivacyReconciliation !== false
      || state.futureSafePrivacyReconciliation !== false
      || state.drReady !== false) {
    throw new Error('COMPLETED_CANARY_TERMINAL_PUBLIC_STATE_INVALID');
  }
  if (!pair || typeof pair !== 'object' || Array.isArray(pair)
      || pair.status !== 'PASS_PUBLIC_ARTIFACT_PAIR_INTEGRITY_ONLY'
      || pair.sourceCanaryRunId !== 40468086758
      || pair.sourceCanaryRunConclusion !== 'failure'
      || pair.governedBackupRunId !== 40468157715
      || pair.canonicalLedgerRunId !== 40468500587
      || pair.missingSuccessfulCanaryEvidenceArtifact !== true
      || pair.authoritativeRecoveredStateReplayed !== false
      || !Number.isSafeInteger(pair.ledgerEventCount)
      || pair.ledgerEventCount < 1
      || !Number.isSafeInteger(pair.accountDeletionStartedEventCount)
      || pair.accountDeletionStartedEventCount < 1
      || pair.accountDeletionStartedEventCount > pair.ledgerEventCount
      || pair.authoritativePrivacyReconciliation !== false
      || pair.futureSafePrivacyReconciliation !== false
      || pair.drReady !== false) {
    throw new Error('COMPLETED_CANARY_PUBLIC_ARTIFACT_PAIR_INVALID');
  }
  // Only approved state fields and two non-sensitive counts are emitted.
  return Object.freeze({
    ...state,
    governedBackupRunId: 40468157715,
    privacyRecoveryLedgerRunId: 40468500587,
    privacyRecoveryLedgerEventCount: pair.ledgerEventCount,
    accountDeletionStartedEventCount: pair.accountDeletionStartedEventCount,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const [statePath, pairPath, outputPath] = process.argv.slice(2);
    if (!statePath || !pairPath || !outputPath) {
      throw new Error('COMPLETED_CANARY_PROOF_PATHS_REQUIRED');
    }
    const [state, pair] = await Promise.all([
      readFile(statePath, 'utf8').then(JSON.parse),
      readFile(pairPath, 'utf8').then(JSON.parse),
    ]);
    const proof = buildCompletedPrivacyCanaryPublicProofV1(state, pair);
    await writeFile(outputPath, JSON.stringify(proof, null, 2) + '\n', {
      encoding: 'utf8', mode: 0o600, flag: 'wx',
    });
    console.log('PASS_READ_ONLY_COMPLETED_CANARY_IDENTIFIER_FREE_PROOF');
  } catch (error) {
    console.error('COMPLETED_CANARY_PUBLIC_PROOF_FAIL: ' + (error?.message || 'INVALID'));
    process.exitCode = 1;
  }
}
