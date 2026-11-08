import {
  READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1,
  type ReaderSajuConsultationEditorialCriterionV1,
  type ReaderSajuConsultationEditorialJudgementV1,
} from './reader-saju-consultation-editorial-evaluation-v1.js';
import type {
  ReaderSajuPrivateMultiUnitPairResultV1,
} from './reader-saju-private-multi-unit-pair-v1.js';

export const READER_SAJU_MULTI_UNIT_EDITORIAL_VERSION_V1 =
  'reader-saju-multi-unit-editorial-v1' as const;

type ReadyPair = Extract<ReaderSajuPrivateMultiUnitPairResultV1, {
  status: 'ready_for_private_review';
}>;
type BatchUnit = ReadyPair['first']['units'][number];
type Judgement = ReaderSajuConsultationEditorialJudgementV1;
type Criterion = ReaderSajuConsultationEditorialCriterionV1;

export interface ReaderSajuMultiUnitEditorialUnitReviewV1 {
  readonly characterId: string;
  readonly sourceUnitId: string;
  readonly candidateHash: string;
  readonly evaluations: readonly Readonly<{
    criterion: Criterion;
    judgement: Judgement;
    note: string;
  }>[];
}
export interface ReaderSajuMultiUnitEditorialFlowReviewV1 {
  readonly characterId: string;
  readonly judgement: Judgement;
  readonly note: string;
}
export interface ReaderSajuMultiUnitEditorialVoiceComparisonV1 {
  readonly judgement: Judgement;
  readonly note: string;
}
type Summary = Readonly<{
  characterId: string;
  candidateHash: string;
  semanticAccepted: boolean;
  passedCriteria: number;
  failedCriteria: readonly Criterion[];
  pendingCriteria: readonly Criterion[];
}>;
export interface ReaderSajuMultiUnitEditorialAssessmentV1 {
  readonly schemaVersion: typeof READER_SAJU_MULTI_UNIT_EDITORIAL_VERSION_V1;
  readonly readingRef: string;
  readonly groundingHash: string;
  readonly coverageScope: 'three_to_four_official_units_only';
  readonly units: readonly Readonly<{
    sourceUnitId: string;
    sourceBlockRefs: readonly string[];
    first: Summary;
    second: Summary;
  }>[];
  readonly flow: Readonly<{ first: Judgement; second: Judgement }>;
  readonly readerVoiceDifference: Judgement;
  readonly outcome: 'failed_semantic_gate' | 'failed_editorial_review' |
    'awaiting_owner_review' | 'offline_editorial_pass_only';
  readonly fullProductQualityProven: false;
  readonly realModelQualityProven: false;
  readonly publicRevealAuthorized: false;
}

function checkJudgement(judgement: Judgement, note: string): void {
  if (!['pass', 'fail', 'not_reviewed'].includes(judgement) ||
      typeof note !== 'string' || note.length > 2000 ||
      (judgement === 'fail' && !note.trim())) {
    throw new TypeError('Offline owner review requires a valid judgement and failure note.');
  }
}

function summarize(characterId: string, unit: BatchUnit,
  review: ReaderSajuMultiUnitEditorialUnitReviewV1 | undefined): Summary {
  if (review !== undefined) {
    if (review.characterId !== characterId ||
        review.sourceUnitId !== unit.sourceUnitId ||
        review.candidateHash !== unit.candidateHash ||
        review.evaluations.length !== READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.length ||
        new Set(review.evaluations.map((item) => item.criterion)).size !==
          READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.length) {
      throw new TypeError('Owner review has incorrect official unit or candidate hash.');
    }
    for (const item of review.evaluations) {
      if (!READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.includes(item.criterion)) {
        throw new TypeError('Unknown owner editorial criterion.');
      }
      checkJudgement(item.judgement, item.note);
    }
  }
  const failedCriteria: Criterion[] = [];
  const pendingCriteria: Criterion[] = [];
  let passedCriteria = 0;
  for (const criterion of READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1) {
    const value = review?.evaluations.find((item) => item.criterion === criterion)?.judgement;
    if (value === 'pass') passedCriteria += 1;
    else if (value === 'fail') failedCriteria.push(criterion);
    else pendingCriteria.push(criterion);
  }
  return Object.freeze({
    characterId, candidateHash: unit.candidateHash,
    semanticAccepted: unit.evaluation === 'accepted' && unit.failureCodes.length === 0,
    passedCriteria,
    failedCriteria: Object.freeze(failedCriteria),
    pendingCriteria: Object.freeze(pendingCriteria),
  });
}

/** Offline editorial evidence only. No model call, database write or public reveal. */
export function assessReaderSajuPrivateMultiUnitConsultationV1(input: Readonly<{
  pair: ReaderSajuPrivateMultiUnitPairResultV1;
  unitReviews: readonly ReaderSajuMultiUnitEditorialUnitReviewV1[];
  flowReviews: readonly ReaderSajuMultiUnitEditorialFlowReviewV1[];
  voiceComparison?: ReaderSajuMultiUnitEditorialVoiceComparisonV1;
}>): ReaderSajuMultiUnitEditorialAssessmentV1 {
  if (input.pair.status !== 'ready_for_private_review' ||
      input.pair.publicRevealAuthorized !== false) {
    throw new TypeError('Matching private official Saju sources are required.');
  }
  const pair = input.pair;
  const characters = [pair.first.characterId, pair.second.characterId];
  if (characters[0] === characters[1] ||
      pair.unitIds.length < 3 || pair.unitIds.length > 4 ||
      input.unitReviews.length > pair.unitIds.length * 2 ||
      input.flowReviews.length > 2) {
    throw new TypeError('Invalid multi-unit Reader comparison scope.');
  }
  for (const [index, review] of input.unitReviews.entries()) {
    const record = review.characterId === pair.first.characterId ? pair.first :
      review.characterId === pair.second.characterId ? pair.second : null;
    if (record === null ||
        !record.units.some((unit) => unit.sourceUnitId === review.sourceUnitId &&
          unit.candidateHash === review.candidateHash) ||
        input.unitReviews.slice(0, index).some((previous) =>
          previous.characterId === review.characterId &&
          previous.sourceUnitId === review.sourceUnitId)) {
      throw new TypeError('Duplicate, unrelated or stale multi-unit owner review.');
    }
  }
  for (const [index, flow] of input.flowReviews.entries()) {
    if (!characters.includes(flow.characterId) ||
        input.flowReviews.slice(0, index).some((previous) =>
          previous.characterId === flow.characterId)) {
      throw new TypeError('Duplicate or unrelated Reader flow review.');
    }
    checkJudgement(flow.judgement, flow.note);
  }
  if (input.voiceComparison !== undefined) {
    checkJudgement(input.voiceComparison.judgement, input.voiceComparison.note);
  }
  const secondById = new Map(pair.second.units.map((unit) => [unit.sourceUnitId, unit]));
  const units = pair.first.units.map((firstUnit) => {
    const secondUnit = secondById.get(firstUnit.sourceUnitId);
    if (!secondUnit ||
        firstUnit.baselineText !== secondUnit.baselineText ||
        firstUnit.sourceBlockRefs.join('\0') !== secondUnit.sourceBlockRefs.join('\0')) {
      throw new TypeError('Official baseline changed between Reader candidates.');
    }
    return Object.freeze({
      sourceUnitId: firstUnit.sourceUnitId,
      sourceBlockRefs: Object.freeze([...firstUnit.sourceBlockRefs]),
      first: summarize(pair.first.characterId, firstUnit, input.unitReviews.find((r) =>
        r.characterId === pair.first.characterId && r.sourceUnitId === firstUnit.sourceUnitId)),
      second: summarize(pair.second.characterId, secondUnit, input.unitReviews.find((r) =>
        r.characterId === pair.second.characterId && r.sourceUnitId === secondUnit.sourceUnitId)),
    });
  });
  const flow = Object.freeze({
    first: input.flowReviews.find((r) => r.characterId === pair.first.characterId)?.judgement ?? 'not_reviewed',
    second: input.flowReviews.find((r) => r.characterId === pair.second.characterId)?.judgement ?? 'not_reviewed',
  });
  const sameWording = pair.first.units.every((firstUnit) =>
    firstUnit.candidateText.trim() === secondById.get(firstUnit.sourceUnitId)?.candidateText.trim());
  const voice = sameWording ? 'fail' as const :
    input.voiceComparison?.judgement ?? 'not_reviewed';
  const ratings = units.flatMap((unit) => [unit.first, unit.second]);
  const semanticAccepted = pair.allSemanticEvaluationsAccepted &&
    ratings.every((rating) => rating.semanticAccepted);
  const editorialFailed = ratings.some((rating) => rating.failedCriteria.length > 0) ||
    flow.first === 'fail' || flow.second === 'fail' || voice === 'fail';
  const pending = ratings.some((rating) => rating.pendingCriteria.length > 0) ||
    flow.first === 'not_reviewed' || flow.second === 'not_reviewed' || voice === 'not_reviewed';
  return Object.freeze({
    schemaVersion: READER_SAJU_MULTI_UNIT_EDITORIAL_VERSION_V1,
    readingRef: pair.readingRef,
    groundingHash: pair.groundingHash,
    coverageScope: 'three_to_four_official_units_only' as const,
    units: Object.freeze(units), flow, readerVoiceDifference: voice,
    outcome: !semanticAccepted ? 'failed_semantic_gate' as const :
      editorialFailed ? 'failed_editorial_review' as const :
      pending ? 'awaiting_owner_review' as const : 'offline_editorial_pass_only' as const,
    fullProductQualityProven: false as const,
    realModelQualityProven: false as const,
    publicRevealAuthorized: false as const,
  });
}
