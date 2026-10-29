import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PINNED = Object.freeze({
  source: 40468086758,
  backup: 40468157715,
  ledger: 40468500587,
});

function reject(code) {
  throw new Error(code);
}

/**
 * The restore source gate separately checks that the proof came from one
 * successful, protected main-branch workflow with its sole public artifact.
 * This adds incident/operation semantics; it is not a replacement for that gate.
 */
export function assertPrivacyReplayCanaryEvidenceV1(evidence, provenance) {
  if (evidence?.schema !== 'myeongha-production-privacy-recovery-canary-evidence-v1'
      || evidence.productionProjectRef !== 'cnsfpcdiyofqvhpcegfc'
      || evidence.governedBackupRunId !== provenance?.backupRunId
      || evidence.privacyRecoveryLedgerRunId !== provenance?.ledgerRunId
      || evidence.workerStatus !== 'completed'
      || evidence.databaseFinalization !== 'pass'
      || evidence.completionAck !== 'pass'
      || evidence.personalizationNonResurrectionGuard !== 'pass'
      || evidence.commerceP5yRetentionGuard !== 'retained-revoked-pass'
      || evidence.outputContainsIdentifiers !== false
      || evidence.outputContainsRowPayloads !== false
      || evidence.authoritativePrivacyReconciliation !== false
      || evidence.futureSafePrivacyReconciliation !== false
      || evidence.drReady !== false) {
    reject('PRIVACY_REPLAY_CANARY_EVIDENCE_INVALID');
  }
  if (evidence.canaryOperation === 'attest_completed') {
    if (provenance.canaryRunId === PINNED.source
        || provenance.backupRunId !== PINNED.backup
        || provenance.ledgerRunId !== PINNED.ledger
        || evidence.evidenceOrigin !== 'read_only_completed_canary_attestation_v1'
        || evidence.resumedFromCanaryRunId !== PINNED.source
        || evidence.hostedAuthDeletionInvoked !== false
        || evidence.hostedAuthDeletionOutcome !== 'already_absent_verified') {
      reject('COMPLETED_ATTESTATION_REPLAY_PROVENANCE_INVALID');
    }
    return 'READ_ONLY_COMPLETED_CASE_SCOPED_ONLY';
  }
  if (evidence.canaryOperation !== 'fresh' && evidence.canaryOperation !== 'resume') {
    reject('PRIVACY_REPLAY_CANARY_OPERATION_UNKNOWN');
  }
  if (evidence.evidenceOrigin !== undefined) {
    reject('PRIVACY_REPLAY_CANARY_ORIGIN_DRIFT');
  }
  return 'EXISTING_DESTRUCTIVE_CANARY_PROOF';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const [evidencePath, backupId, ledgerId, canaryId] = process.argv.slice(2);
    if (!/^\d+$/.test(backupId ?? '')
        || !/^\d+$/.test(ledgerId ?? '')
        || !/^\d+$/.test(canaryId ?? '')) reject('PRIVACY_REPLAY_CANARY_RUN_IDS_INVALID');
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    const status = assertPrivacyReplayCanaryEvidenceV1(evidence, {
      backupRunId: Number(backupId),
      ledgerRunId: Number(ledgerId),
      canaryRunId: Number(canaryId),
    });
    console.log(status);
  } catch (error) {
    console.error('PRIVACY_REPLAY_PROOF_REJECTED: ' + (error?.message || 'INVALID'));
    process.exitCode = 1;
  }
}
