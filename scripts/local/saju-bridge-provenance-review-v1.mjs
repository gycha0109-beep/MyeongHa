// Phase 4E: strict, sanitized, READ-ONLY analysis of disposable evidence.
// NOT an operator attestation, permission, trusted source or recovery plan.
// Deliberately no DB/HTTP/Runner/Permit writer implementation.
export const SAJU_BRIDGE_PROVENANCE_REVIEW_VERSION_V1 =
  'myeongha-saju-provenance-review-hold-v1';

const requiredProofs = Object.freeze([
  'INDEPENDENT_SOURCE_ATTESTATION',
  'SAME_LOGICAL_ATTEMPT_AUTHORITY',
  'CAUSAL_COMMIT_ORDER_EVIDENCE',
  'INDEPENDENT_MANUAL_REVIEW_APPROVAL',
  'DOCUMENTED_RECOVERY_AND_ROLLBACK_POLICY',
]);

const requiredCases = Object.freeze([
  'NONCE_ONLY', 'PERMIT_ONLY', 'REVOKED_WITH_NONCE',
]);

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function validObservation(value) {
  return exactKeys(value, ['subject', 'nonce', 'permit'])
    && value.subject === 'PRESENT'
    && ['CLAIMED', 'ABSENT'].includes(value.nonce)
    && ['ISSUED', 'CONSUMED', 'REVOKED', 'MISSING'].includes(value.permit);
}

function validPeer(value, name) {
  return exactKeys(value, ['database', 'tlsVerified', 'readOnlyVerified'])
    && value.database === name && value.tlsVerified === true
    && value.readOnlyVerified === true;
}

function validTable(value, database, keyColumn) {
  return exactKeys(value, [
    'database', 'tlsVerified', 'readOnlyVerified', 'forcedRls',
    'identityColumn', 'sharedAttemptColumn',
  ]) && value.database === database
    && value.tlsVerified === true
    && value.readOnlyVerified === true
    && value.forcedRls === true
    && value.identityColumn === keyColumn
    && value.sharedAttemptColumn === false;
}

/**
 * NO supplied proof can remove these HOLDs. Caller-controlled "approved",
 * identical timestamps, sameAttempt, signatures, hash labels, and attestations
 * are explicitly not trusted and may not be forwarded into the result.
 */
export function assessSajuBridgeProvenanceReviewV1(packet) {
  let classification = 'UNKNOWN_HOLD';
  if (packet !== null && typeof packet === 'object'
    && !Array.isArray(packet)
    && Object.keys(packet).some(key =>
      !['version', 'scope', 'peers', 'cases'].includes(key))) {
    classification = 'UNTRUSTED_AUTHORITY_CLAIM_HOLD';
  } else if (exactKeys(packet, ['version', 'scope', 'peers', 'cases'])
    && packet.version === 'myeongha-saju-disposable-evidence-v1'
    && packet.scope === 'DISPOSABLE_DOCKER_ONLY'
    && exactKeys(packet.peers, ['subject', 'nonce', 'admission'])
    && validPeer(packet.peers.subject, 'myeongha_saju_subject_local_verify')
    && validTable(packet.peers.nonce, 'myeongha_saju_nonce_local_verify',
      'replay_key_digest')
    && validTable(packet.peers.admission, 'myeongha_saju_admission_local_verify',
      'permit_id')
    && exactKeys(packet.cases, requiredCases)
    && requiredCases.every(id => validObservation(packet.cases[id]))) {
    classification = 'UNLINKED_DISPOSABLE_EVIDENCE_HOLD';
  } else if (packet?.peers?.nonce?.sharedAttemptColumn === true
    || packet?.peers?.admission?.sharedAttemptColumn === true) {
    classification = 'UNVERIFIED_LINKAGE_CLAIM_HOLD';
  }
  return Object.freeze({
    version: SAJU_BRIDGE_PROVENANCE_REVIEW_VERSION_V1,
    classification,
    provenance: 'DISPOSABLE_OBSERVATION_NOT_INDEPENDENT_AUTHORITY',
    sameLogicalAttempt: 'NOT_PROVEN',
    globalCommitOrder: 'NOT_PROVEN',
    manualReviewAdmissibility: 'NOT_ADMISSIBLE',
    missingAuthorityProofs: requiredProofs,
    decision: 'HOLD_MANUAL_REVIEW',
    canExecute: false, canPublish: false, canSell: false,
    automaticRetry: false, automaticCompensation: false,
  });
}
