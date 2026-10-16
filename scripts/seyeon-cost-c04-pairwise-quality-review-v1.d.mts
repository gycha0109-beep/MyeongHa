/** Review-only synthetic or unverified classifier evidence. */
export type SeyeonC04PairwiseVariantV1 = 'baseline' | 'compact';
export type SeyeonC04PairwiseTopicV1 =
  | 'family_emotional_history' | 'past_romance_surface'
  | 'past_romance_detail' | 'deep_vulnerability' | null;
export type SeyeonC04PairwiseKindV1 =
  | 'USER_SELF_REPORT' | 'CHARACTER_FACT_CLAIM' | 'SHARED_EVENT_CLAIM'
  | 'RELATIONSHIP_STATUS_CLAIM' | 'AUTHORITY_OVERRIDE' | 'META_INSTRUCTION';
export interface SeyeonC04PairwiseRowV1 {
  readonly caseId: string;
  readonly variant: SeyeonC04PairwiseVariantV1;
  readonly outcome: 'ok' | 'error';
  readonly topicKey: SeyeonC04PairwiseTopicV1;
  readonly claimKinds: readonly SeyeonC04PairwiseKindV1[];
  readonly serializedRequestBytes: number;
}
export interface SeyeonC04PairwiseReviewInputV1 {
  readonly scope: 'SYNTHETIC_OR_UNVERIFIED_CAPTURE';
  readonly rows: readonly SeyeonC04PairwiseRowV1[];
}
export declare const SEYEON_C04_PAIRWISE_SCORE_VERSION_V1:
  'seyeon-cost-c04-pairwise-quality-review-v1';
export declare const SEYEON_C04_PAIRWISE_VARIANTS_V1:
  readonly SeyeonC04PairwiseVariantV1[];
export declare function scoreSeyeonC04PairwiseOfflineV1(
  input: SeyeonC04PairwiseReviewInputV1,
): Readonly<{
  schemaVersion: string; scope: string; expectedCaseCount: number;
  observedRows: number;
  baseline: Record<string,unknown> & { readonly unreviewedClaimIds: readonly string[] };
  compact: Record<string,unknown> & { readonly unreviewedClaimIds: readonly string[] };
  disagreementIds: readonly string[]; regressionIds: readonly string[];
  baselineSerializedBytes: number|null; compactSerializedBytes: number|null;
  savedSerializedBytes: number|null; hardFailureCodes: readonly string[];
  offlineGoldAndByteChecksPass: boolean;
  realModelRecallVerified: false; realModelFalsePositiveRateVerified: false;
  providerReceiptsVerified: false; paidEvaluationPermitted: false;
  productionPromotionPermitted: false; verdict: 'HOLD_REAL_MODEL_AND_OWNER_REVIEW';
}>;
