// Type contract for the dormant, pure Phase 4C-3 observation module.
// All states remain HOLD regardless of durable evidence.
export declare const SAJU_BRIDGE_CROSS_DB_OBSERVATION_VERSION_V1:
  'myeongha-saju-cross-db-observation-hold-v1';
export interface SajuBridgeCrossDbEvidenceV1 {
  readonly subject?: 'PRESENT' | 'MISSING' | 'UNKNOWN' | string;
  readonly nonce?: 'CLAIMED' | 'ABSENT' | 'UNKNOWN' | string;
  readonly permit?: 'ISSUED' | 'CONSUMED' | 'REVOKED' | 'MISSING' | 'UNKNOWN' | string;
}
export interface SajuBridgeCrossDbHoldDecisionV1 {
  readonly version: typeof SAJU_BRIDGE_CROSS_DB_OBSERVATION_VERSION_V1;
  readonly classification: string;
  readonly decision: 'HOLD_MANUAL_REVIEW';
  readonly canExecute: false;
  readonly canPublish: false;
  readonly canSell: false;
  readonly automaticRetry: false;
  readonly automaticCompensation: false;
}
export declare function classifySajuBridgeCrossDbObservationV1(
  evidence: SajuBridgeCrossDbEvidenceV1 | null | undefined,
): Readonly<SajuBridgeCrossDbHoldDecisionV1>;

export declare function assessSajuBridgeCrossDbSnapshotRaceV1(
  before: Readonly<Record<'NONCE_ONLY' | 'PERMIT_ONLY' | 'REVOKED_WITH_NONCE', SajuBridgeCrossDbEvidenceV1>> | unknown,
  after: Readonly<Record<'NONCE_ONLY' | 'PERMIT_ONLY' | 'REVOKED_WITH_NONCE', SajuBridgeCrossDbEvidenceV1>> | unknown,
): Readonly<Omit<SajuBridgeCrossDbHoldDecisionV1, 'version'> & {
  readonly version: 'myeongha-saju-cross-db-snapshot-race-hold-v1';
}>;
