import type {
  CharacterSajuConsultationPrivateComparisonV1,
} from './character-saju-consultation-shadow-v1.js';
import type {
  ReaderSajuPrivatePairComparisonV1,
} from './reader-saju-private-pair-comparison-v1.js';

/**
 * Owner-entered, offline editorial comparison of identical official Saju source
 * readings. This is a first-unit trial, NOT a completed paid-product review.
 *
 * Model semantic review and human readability are different approvals. Neither
 * this module nor its caller can authorize new Saju claims, public reveal, or
 * additional billable model requests.
 */
export const READER_SAJU_CONSULTATION_EDITORIAL_SCHEMA_VERSION_V1 =
  'reader-saju-consultation-editorial-v1' as const;

export const READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1 = Object.freeze([
  'PERSONALIZED_OPENING',
  'CONCRETE_REQUEST_ANSWER',
  'EVIDENCE_TO_LIFE_LINK',
  'NATURAL_READER_VOICE',
  'NONREPETITIVE_SUBSTANCE',
] as const);

export type ReaderSajuConsultationEditorialCriterionV1 =
  (typeof READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1)[number];

export type ReaderSajuConsultationEditorialJudgementV1 =
  'pass' | 'fail' | 'not_reviewed';

export interface ReaderSajuConsultationEditorialCriterionInputV1 {
  readonly criterion: ReaderSajuConsultationEditorialCriterionV1;
  readonly judgement: ReaderSajuConsultationEditorialJudgementV1;
  /** Private owner/editor notes, not a published customer message. */
  readonly note: string;
}

export interface ReaderSajuConsultationEditorialReviewV1 {
  readonly characterId: string;
  readonly candidateHash: string;
  readonly evaluations: readonly ReaderSajuConsultationEditorialCriterionInputV1[];
}

export type ReaderSajuConsultationEditorialOutcomeV1 =
  | 'awaiting_owner_review'
  | 'failed_semantic_gate'
  | 'failed_editorial_review'
  | 'eligible_for_larger_offline_trial';

export interface ReaderSajuConsultationEditorialAssessmentV1 {
  readonly schemaVersion: typeof READER_SAJU_CONSULTATION_EDITORIAL_SCHEMA_VERSION_V1;
  readonly readingRef: string;
  readonly groundingHash: string;
  readonly sourceUnitId: string;
  readonly sourceBlockRefs: readonly string[];
  readonly coverageScope: 'single_official_unit_only';
  readonly outcome: ReaderSajuConsultationEditorialOutcomeV1;
  readonly first: Readonly<{
    characterId: string;
    candidateHash: string;
    semanticGate: 'accepted' | 'rejected';
    evaluatedCriteria: number;
    passedCriteria: number;
    failedCriteria: readonly ReaderSajuConsultationEditorialCriterionV1[];
    pendingCriteria: readonly ReaderSajuConsultationEditorialCriterionV1[];
  }>;
  readonly second: ReaderSajuConsultationEditorialAssessmentV1['first'];
  readonly fullProductQualityProven: false;
  readonly publicRevealAuthorized: false;
}

function assertReview(
  evidence: CharacterSajuConsultationPrivateComparisonV1,
  review: ReaderSajuConsultationEditorialReviewV1 | undefined,
): Readonly<{
  characterId: string;
  candidateHash: string;
  semanticGate: 'accepted' | 'rejected';
  evaluatedCriteria: number;
  passedCriteria: number;
  failedCriteria: readonly ReaderSajuConsultationEditorialCriterionV1[];
  pendingCriteria: readonly ReaderSajuConsultationEditorialCriterionV1[];
}> {
  const failedCriteria: ReaderSajuConsultationEditorialCriterionV1[] = [];
  const pendingCriteria: ReaderSajuConsultationEditorialCriterionV1[] = [];
  let passedCriteria = 0;
  if (review !== undefined) {
    if (review.characterId !== evidence.characterId ||
        review.candidateHash !== evidence.candidateHash ||
        review.evaluations.length !== READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.length ||
        new Set(review.evaluations.map((x) => x.criterion)).size !==
          READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.length) {
      throw new TypeError('Owner editorial review does not match the guarded candidate.');
    }
    for (const criterion of review.evaluations) {
      if (!READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.includes(criterion.criterion) ||
          !['pass', 'fail', 'not_reviewed'].includes(criterion.judgement) ||
          typeof criterion.note !== 'string' || criterion.note.length > 2_000 ||
          (criterion.judgement === 'fail' && !criterion.note.trim())) {
        throw new TypeError('Owner editorial review requires a valid recorded judgement.');
      }
    }
  }
  for (const key of READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1) {
    const item = review?.evaluations.find((x) => x.criterion === key);
    if (item?.judgement === 'pass') passedCriteria += 1;
    else if (item?.judgement === 'fail') failedCriteria.push(key);
    else pendingCriteria.push(key);
  }
  const accepted = evidence.evaluation === 'accepted' &&
    evidence.failureCodes.length === 0;
  return Object.freeze({
    characterId: evidence.characterId,
    candidateHash: evidence.candidateHash,
    semanticGate: accepted ? 'accepted' as const : 'rejected' as const,
    evaluatedCriteria: passedCriteria + failedCriteria.length,
    passedCriteria,
    failedCriteria: Object.freeze(failedCriteria),
    pendingCriteria: Object.freeze(pendingCriteria),
  });
}

export function assessReaderSajuPrivateConsultationPairV1(input: Readonly<{
  pair: ReaderSajuPrivatePairComparisonV1;
  reviews: readonly ReaderSajuConsultationEditorialReviewV1[];
}>): ReaderSajuConsultationEditorialAssessmentV1 {
  if (input.pair.status !== 'ready_for_private_review') {
    throw new TypeError('Cannot assess two Readers without identical verified official Saju source.');
  }
  // Capture the narrowed discriminated union before entering array callbacks.
  // TypeScript does not retain a mutable object property's narrowing in lambdas.
  const pair = input.pair;
  if (input.reviews.length > 2 ||
      new Set(input.reviews.map((x) => x.characterId)).size !== input.reviews.length) {
    throw new TypeError('Duplicate or unexpected owner reviews.');
  }
  if (input.reviews.some((x) =>
    x.characterId !== pair.first.characterId &&
    x.characterId !== pair.second.characterId)) {
    throw new TypeError('Owner review has no matching source-bound Reader.');
  }

  const first = assertReview(
    pair.first,
    input.reviews.find((r) => r.characterId === pair.first.characterId),
  );
  const second = assertReview(
    pair.second,
    input.reviews.find((r) => r.characterId === pair.second.characterId),
  );

  let outcome: ReaderSajuConsultationEditorialOutcomeV1 = 'awaiting_owner_review';
  if (first.semanticGate !== 'accepted' || second.semanticGate !== 'accepted') {
    outcome = 'failed_semantic_gate';
  } else if (first.failedCriteria.length || second.failedCriteria.length) {
    outcome = 'failed_editorial_review';
  } else if (first.pendingCriteria.length === 0 && second.pendingCriteria.length === 0) {
    // Only merits another offline trial with more admitted official units.
    outcome = 'eligible_for_larger_offline_trial';
  }

  return Object.freeze({
    schemaVersion: READER_SAJU_CONSULTATION_EDITORIAL_SCHEMA_VERSION_V1,
    readingRef: pair.readingRef,
    groundingHash: pair.groundingHash,
    sourceUnitId: pair.sourceUnitId,
    sourceBlockRefs: Object.freeze([...pair.officialSourceRefs]),
    coverageScope: 'single_official_unit_only' as const,
    outcome,
    first,
    second,
    fullProductQualityProven: false as const,
    publicRevealAuthorized: false as const,
  });
}
