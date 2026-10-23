import type {SajuBridgeReviewPacketV1, SajuBridgeSubmissionClaimV1} from './saju-bridge-review-packet-v1.mjs';

export declare const SAJU_BRIDGE_SYNTHETIC_ATTESTATION_VERSION_V1:
  'myeongha-saju-synthetic-ed25519-hold-v1';

export interface SajuBridgeSyntheticSignerV1 {
  readonly type: SajuBridgeSubmissionClaimV1['type'];
  readonly sourceId: string;
  readonly publicKeySpkiDerBase64: string;
}

export interface SajuBridgeSyntheticAttestationHoldV1 {
  readonly version: typeof SAJU_BRIDGE_SYNTHETIC_ATTESTATION_VERSION_V1;
  readonly classification: string;
  readonly signatureVerification: 'NOT_PERFORMED' | 'REJECTED' | 'SYNTHETIC_ONLY_VERIFIED';
  readonly keyCustodyAuthority: 'NOT_ESTABLISHED';
  readonly independentSourceAuthority: 'NOT_ESTABLISHED';
  readonly sameLogicalAttempt: 'NOT_PROVEN';
  readonly globalCommitOrder: 'NOT_PROVEN';
  readonly manualReviewAdmissibility: 'NOT_ADMISSIBLE';
  readonly decision: 'HOLD_MANUAL_REVIEW';
  readonly canExecute: false;
  readonly canPublish: false;
  readonly canSell: false;
  readonly automaticRetry: false;
  readonly automaticCompensation: false;
}
export declare function makeSajuBridgeSyntheticAttestationMessageV1(
  packet: SajuBridgeReviewPacketV1 | unknown,
  claim: SajuBridgeSubmissionClaimV1 | unknown,
): Buffer | null;
export declare function assessSajuBridgeSyntheticAttestationV1(
  packet: SajuBridgeReviewPacketV1 | unknown,
  nowMs: number,
  registry: readonly SajuBridgeSyntheticSignerV1[] | unknown,
): Readonly<SajuBridgeSyntheticAttestationHoldV1>;
