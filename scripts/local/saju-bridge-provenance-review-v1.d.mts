// The verified interface is deliberately non-authorizing and local-test only.
export declare const SAJU_BRIDGE_PROVENANCE_REVIEW_VERSION_V1:
  'myeongha-saju-provenance-review-hold-v1';
export type SajuBridgeCaseIdV1 =
  'NONCE_ONLY' | 'PERMIT_ONLY' | 'REVOKED_WITH_NONCE';
export interface SajuBridgeDisposableReviewPacketV1 {
  readonly version: 'myeongha-saju-disposable-evidence-v1';
  readonly scope: 'DISPOSABLE_DOCKER_ONLY';
  readonly peers: Readonly<{
    subject: Readonly<{database: string; tlsVerified: boolean; readOnlyVerified: boolean}>;
    nonce: Readonly<{
      database: string; tlsVerified: boolean; readOnlyVerified: boolean;
      forcedRls: boolean; identityColumn: string; sharedAttemptColumn: boolean;
    }>;
    admission: Readonly<{
      database: string; tlsVerified: boolean; readOnlyVerified: boolean;
      forcedRls: boolean; identityColumn: string; sharedAttemptColumn: boolean;
    }>;
  }>;
  readonly cases: Readonly<Record<SajuBridgeCaseIdV1, Readonly<{
    subject: string; nonce: string; permit: string;
  }>>>;
}
export interface SajuBridgeProvenanceReviewHoldV1 {
  readonly version: typeof SAJU_BRIDGE_PROVENANCE_REVIEW_VERSION_V1;
  readonly classification: string;
  readonly provenance: 'DISPOSABLE_OBSERVATION_NOT_INDEPENDENT_AUTHORITY';
  readonly sameLogicalAttempt: 'NOT_PROVEN';
  readonly globalCommitOrder: 'NOT_PROVEN';
  readonly manualReviewAdmissibility: 'NOT_ADMISSIBLE';
  readonly missingAuthorityProofs: readonly string[];
  readonly decision: 'HOLD_MANUAL_REVIEW';
  readonly canExecute: false;
  readonly canPublish: false;
  readonly canSell: false;
  readonly automaticRetry: false;
  readonly automaticCompensation: false;
}
export declare function assessSajuBridgeProvenanceReviewV1(
  packet: SajuBridgeDisposableReviewPacketV1 | unknown,
): Readonly<SajuBridgeProvenanceReviewHoldV1>;
