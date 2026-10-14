import type { SajuBridgeDisposableReviewPacketV1 } from './saju-bridge-provenance-review-v1.mjs';

export declare const SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1:
  'myeongha-saju-review-submission-hold-v1';
export declare const SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1: readonly [
  'INDEPENDENT_SOURCE_ATTESTATION',
  'SAME_LOGICAL_ATTEMPT_AUTHORITY',
  'CAUSAL_COMMIT_ORDER_EVIDENCE',
  'INDEPENDENT_MANUAL_REVIEW_APPROVAL',
  'DOCUMENTED_RECOVERY_AND_ROLLBACK_POLICY',
];
export type SajuBridgeProofTypeV1 =
  typeof SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1[number];
export interface SajuBridgeSubmissionClaimV1 {
  readonly type: SajuBridgeProofTypeV1;
  readonly sourceId: string;
  readonly statementDigestSha256: string;
  readonly evidenceDigestSha256: string;
  readonly submittedAtMs: number;
  readonly signatureClaimBase64url: string;
}
export interface SajuBridgeReviewPacketV1 {
  readonly version: typeof SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1;
  readonly scope: 'DISPOSABLE_DOCKER_ONLY';
  readonly runId: string;
  readonly evidence: SajuBridgeDisposableReviewPacketV1;
  readonly evidenceDigestSha256: string;
  readonly submissions: readonly SajuBridgeSubmissionClaimV1[];
}
export interface SajuBridgeReviewPacketHoldV1 {
  readonly version: typeof SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1;
  readonly classification: string;
  readonly evidenceAuthority: 'NOT_ATTESTED';
  readonly signatureVerification: 'NOT_PERFORMED';
  readonly logicalAttemptBinding: 'NOT_PROVEN';
  readonly globalCommitOrder: 'NOT_PROVEN';
  readonly independentReviewerApproval: 'NOT_OBTAINED';
  readonly manualReviewAdmissibility: 'NOT_ADMISSIBLE';
  readonly missingProofTypes: readonly SajuBridgeProofTypeV1[];
  readonly decision: 'HOLD_MANUAL_REVIEW';
  readonly canExecute: false;
  readonly canPublish: false;
  readonly canSell: false;
  readonly automaticRetry: false;
  readonly automaticCompensation: false;
}
export declare function fingerprintSajuBridgeReviewEvidenceV1(
  runId: string,
  evidence: SajuBridgeDisposableReviewPacketV1 | unknown,
): string | null;
export declare function assessSajuBridgeReviewSubmissionV1(
  packet: SajuBridgeReviewPacketV1 | unknown,
  nowMs: number,
): Readonly<SajuBridgeReviewPacketHoldV1>;
