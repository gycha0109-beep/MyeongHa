export interface SajuBridgeCrossRunReviewHoldV1 {
  readonly version: 'myeongha-saju-cross-run-review-hold-v1';
  readonly classification: string;
  readonly replayRegistry: 'NOT_AVAILABLE';
  readonly crossRunLinkage: 'NOT_PROVEN';
  readonly independentAuthority: 'NOT_ATTESTED';
  readonly manualReviewAdmissibility: 'NOT_ADMISSIBLE';
  readonly decision: 'HOLD_MANUAL_REVIEW';
  readonly canExecute: false;
  readonly canPublish: false;
  readonly canSell: false;
  readonly automaticRetry: false;
  readonly automaticCompensation: false;
}
export declare function assessSajuBridgeCrossRunReviewV1(
  current: unknown, previous: unknown, nowMs: number,
): Readonly<SajuBridgeCrossRunReviewHoldV1>;
