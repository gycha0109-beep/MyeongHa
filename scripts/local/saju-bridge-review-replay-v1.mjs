// Phase 4G: stateless, read-only cross-run comparison of untrusted packets.
// This NEVER acts as a trusted replay registry, key authority, or permission.
import { assessSajuBridgeReviewSubmissionV1, fingerprintSajuBridgeReviewEvidenceV1 } from './saju-bridge-review-packet-v1.mjs';

export function assessSajuBridgeCrossRunReviewV1(current, previous, nowMs) {
  const a = assessSajuBridgeReviewSubmissionV1(current, nowMs);
  const b = assessSajuBridgeReviewSubmissionV1(previous, nowMs);
  let classification = 'UNKNOWN_OR_MALFORMED_HOLD';
  const valid = x => x.classification === 'STRUCTURALLY_COMPLETE_UNVERIFIED_HOLD';
  if (valid(a) && valid(b)) {
    if (current.runId === previous.runId
      && current.evidenceDigestSha256 === previous.evidenceDigestSha256) {
      classification = 'IDENTICAL_RUN_REPLAY_HOLD';
    } else if (current.runId === previous.runId) {
      classification = 'SAME_RUN_CONFLICT_HOLD';
    } else if (fingerprintSajuBridgeReviewEvidenceV1(current.runId, current.evidence)
      === fingerprintSajuBridgeReviewEvidenceV1(current.runId, previous.evidence)) {
      classification = 'CROSS_RUN_DIGEST_REUSE_HOLD';
    } else {
      classification = 'DISTINCT_UNVERIFIED_RUNS_HOLD';
    }
  } else if (!valid(a) || !valid(b)) {
    classification = 'UNVERIFIED_PACKET_PAIR_HOLD';
  }
  return Object.freeze({
    version: 'myeongha-saju-cross-run-review-hold-v1',
    classification,
    replayRegistry: 'NOT_AVAILABLE',
    crossRunLinkage: 'NOT_PROVEN',
    independentAuthority: 'NOT_ATTESTED',
    manualReviewAdmissibility: 'NOT_ADMISSIBLE',
    decision: 'HOLD_MANUAL_REVIEW',
    canExecute: false, canPublish: false, canSell: false,
    automaticRetry: false, automaticCompensation: false,
  });
}
