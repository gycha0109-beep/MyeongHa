// Phase 4F: strict non-authorizing submission format verification ONLY.
// NEVER accepts a signature claim as cryptographic verification or a claimed
// role as an independently authenticated operator. No DB/Runner/writes.
import { createHash } from 'node:crypto';
import { assessSajuBridgeProvenanceReviewV1 } from './saju-bridge-provenance-review-v1.mjs';

export const SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1 =
  'myeongha-saju-review-submission-hold-v1';
export const SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1 = Object.freeze([
  'INDEPENDENT_SOURCE_ATTESTATION',
  'SAME_LOGICAL_ATTEMPT_AUTHORITY',
  'CAUSAL_COMMIT_ORDER_EVIDENCE',
  'INDEPENDENT_MANUAL_REVIEW_APPROVAL',
  'DOCUMENTED_RECOVERY_AND_ROLLBACK_POLICY',
]);

const cases = ['NONCE_ONLY', 'PERMIT_ONLY', 'REVOKED_WITH_NONCE'];
const peers = ['subject', 'nonce', 'admission'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const hex = /^[a-f0-9]{64}$/u;
const source = /^[A-Za-z0-9._:-]{3,64}$/u;
const b64url64 = /^[A-Za-z0-9_-]{86}$/u;
const receiptKeys = ['type', 'sourceId', 'statementDigestSha256',
  'evidenceDigestSha256', 'submittedAtMs', 'signatureClaimBase64url'];

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function strictEvidence(evidence) {
  return assessSajuBridgeProvenanceReviewV1(evidence).classification
    === 'UNLINKED_DISPOSABLE_EVIDENCE_HOLD';
}

// Fingerprint binds only three pre-agreed synthetic semantic states, NOT raw
// proof records, operator identity, cryptographic provenance or real attempts.
// The untrusted runId is domain separation only, never an anti-replay authority.
export function fingerprintSajuBridgeReviewEvidenceV1(runId, evidence) {
  if (typeof runId !== 'string' || !uuid.test(runId)
    || !strictEvidence(evidence)) return null;
  const p = evidence.peers;
  const normalized = [
    evidence.version, evidence.scope, runId,
    ...peers.map(key => {
      const x = p[key];
      return [x.database, x.tlsVerified, x.readOnlyVerified,
        ...(key === 'subject' ? [] : [
          x.forcedRls, x.identityColumn, x.sharedAttemptColumn,
        ])];
    }),
    ...cases.map(key => {
      const x = evidence.cases[key];
      return [key, x.subject, x.nonce, x.permit];
    }),
  ];
  return createHash('sha256')
    .update('myeongha/saju/disposable-review-evidence/v1\0')
    .update(JSON.stringify(normalized)).digest('hex');
}

function baseResult(classification, missingProofTypes) {
  return Object.freeze({
    version: SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1,
    classification,
    evidenceAuthority: 'NOT_ATTESTED',
    signatureVerification: 'NOT_PERFORMED',
    logicalAttemptBinding: 'NOT_PROVEN',
    globalCommitOrder: 'NOT_PROVEN',
    independentReviewerApproval: 'NOT_OBTAINED',
    manualReviewAdmissibility: 'NOT_ADMISSIBLE',
    missingProofTypes: Object.freeze(missingProofTypes),
    decision: 'HOLD_MANUAL_REVIEW',
    canExecute: false, canPublish: false, canSell: false,
    automaticRetry: false, automaticCompensation: false,
  });
}

export function assessSajuBridgeReviewSubmissionV1(packet, nowMs) {
  const all = [...SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1];
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return baseResult('UNKNOWN_HOLD', all);
  }
  if (!exactKeys(packet, ['version', 'scope', 'runId', 'evidence',
    'evidenceDigestSha256', 'submissions'])
    || packet.version !== SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1
    || packet.scope !== 'DISPOSABLE_DOCKER_ONLY'
    || typeof packet.runId !== 'string' || !uuid.test(packet.runId)
    || !Array.isArray(packet.submissions)
    || packet.submissions.length > all.length
    || !strictEvidence(packet.evidence)) {
    return baseResult('UNTRUSTED_SUBMISSION_HOLD', all);
  }
  const bound = fingerprintSajuBridgeReviewEvidenceV1(packet.runId,
    packet.evidence);
  if (!bound || typeof packet.evidenceDigestSha256 !== 'string'
    || !hex.test(packet.evidenceDigestSha256)
    || packet.evidenceDigestSha256 !== bound) {
    return baseResult('EVIDENCE_BINDING_MISMATCH_HOLD', all);
  }

  const seenTypes = new Set();
  const seenSources = new Set();
  let invalid = false;
  let collision = false;
  let stale = false;
  let unbound = false;
  for (const item of packet.submissions) {
    if (!exactKeys(item, receiptKeys)
      || !all.includes(item.type)
      || typeof item.sourceId !== 'string' || !source.test(item.sourceId)
      || typeof item.statementDigestSha256 !== 'string'
      || !hex.test(item.statementDigestSha256)
      || typeof item.evidenceDigestSha256 !== 'string'
      || !hex.test(item.evidenceDigestSha256)
      || typeof item.signatureClaimBase64url !== 'string'
      || !b64url64.test(item.signatureClaimBase64url)
      || !Number.isSafeInteger(item.submittedAtMs)) {
      invalid = true;
      continue;
    }
    if (seenTypes.has(item.type) || seenSources.has(item.sourceId)) {
      collision = true;
    }
    seenTypes.add(item.type);
    seenSources.add(item.sourceId);
    if (item.evidenceDigestSha256 !== bound) unbound = true;
    if (item.submittedAtMs > nowMs || nowMs - item.submittedAtMs > 300000
      || item.submittedAtMs < 0) stale = true;
  }
  const missing = all.filter(type => !seenTypes.has(type));
  // Priority prevents apparently complete malicious packets being mistaken
  // for admissible evidence. None of these classifications authorizes work.
  return baseResult(
    invalid ? 'UNTRUSTED_PROOF_SHAPE_HOLD'
      : collision ? 'DUPLICATE_OR_NONINDEPENDENT_SOURCE_HOLD'
        : unbound ? 'FOREIGN_EVIDENCE_REFERENCE_HOLD'
          : stale ? 'EXPIRED_OR_FUTURE_CLAIM_HOLD'
            : missing.length ? 'MISSING_REQUIRED_PROOF_HOLD'
              : 'STRUCTURALLY_COMPLETE_UNVERIFIED_HOLD',
    missing,
  );
}
