import { createHash } from 'node:crypto';

import type { CharacterGroundingUnitViewV1 } from './character-saju-insight-selector.js';
import type { CharacterReadingPerspectiveRefV1 } from './character-saju-reading-plan.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_SAJU_SP2_EVALUATION_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-sp2-evaluation-v1' as const;
export const CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-sp2-candidate-v1' as const;
export const CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-sp2-evaluator-verdict-v1' as const;

export const MEANING_PRESERVATION_FAILURE_CLASSES_V1 = Object.freeze([
  'ADDED_CLAIM',
  'STRENGTHENED_CERTAINTY',
  'DROPPED_QUALIFIER',
  'AMBIGUITY_FLATTENED',
  'DOMAIN_ESCALATION',
  'TEMPORAL_INVENTION',
  'PERSONAL_FACT_INVENTION',
  'MEANING_REVERSAL',
] as const);

export type MeaningPreservationFailureClassV1 =
  (typeof MEANING_PRESERVATION_FAILURE_CLASSES_V1)[number];

export interface CharacterSajuSp2CandidateV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1;
  readonly characterId: string;
  readonly sourceUnitRefs: readonly string[];
  readonly text: string;
}

export interface CharacterSajuSp2EvaluatorVerdictV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1;
  readonly evaluatorVersion: string;
  readonly candidateHash: string;
  readonly unitId: string;
  readonly semanticPreserved: boolean;
  readonly characterFidelityPreserved: boolean;
  readonly failureClasses: readonly MeaningPreservationFailureClassV1[];
}

export interface CharacterSajuEvalForbiddenExampleV1 {
  readonly text: string;
  readonly failureClass: MeaningPreservationFailureClassV1;
}

export interface CharacterSajuEvalCaseV1 {
  readonly caseId: string;
  readonly groundingUnit: CharacterGroundingUnitViewV1;
  readonly characterProfileRef: CharacterReadingPerspectiveRefV1;
  readonly allowedExamples: readonly string[];
  readonly forbiddenExamples: readonly CharacterSajuEvalForbiddenExampleV1[];
}

export type CharacterSajuSp2GateFailureCodeV1 =
  | 'CANDIDATE_STRUCTURE_INVALID'
  | 'SOURCE_TRACE_MISMATCH'
  | 'PROTECTED_ONLY_UNIT'
  | 'EVALUATOR_IDENTITY_MISMATCH'
  | 'SEMANTIC_EVALUATION_FAILED'
  | 'CHARACTER_FIDELITY_FAILED';

export interface CharacterSajuSp2GateFailureV1 {
  readonly code: CharacterSajuSp2GateFailureCodeV1;
  readonly detail: string;
  readonly failureClasses?: readonly MeaningPreservationFailureClassV1[];
}

export type CharacterSajuSp2GateDecisionV1 =
  | {
      readonly mode: 'evaluation_accepted';
      readonly validationState: 'sp2_evaluation_validated';
      readonly candidate: CharacterSajuSp2CandidateV1;
      readonly candidateHash: string;
      readonly evaluatorVersion: string;
      readonly sourceUnitId: string;
      readonly revealState: 'evaluation_only_not_runtime_authorized';
    }
  | {
      readonly mode: 'protected_fallback';
      readonly validationState: 'fallback_used';
      readonly reason:
        | 'candidate_guard_failed'
        | 'semantic_evaluator_failed'
        | 'character_fidelity_failed';
      readonly failures: readonly CharacterSajuSp2GateFailureV1[];
    };

export interface CharacterSajuSp2CorpusExampleResultV1 {
  readonly caseId: string;
  readonly expectation: 'allowed' | 'forbidden';
  readonly text: string;
  readonly expectedFailureClass?: MeaningPreservationFailureClassV1;
  readonly decision: CharacterSajuSp2GateDecisionV1;
  readonly expectationMet: boolean;
}

export interface CharacterSajuSp2CorpusMetricsV1 {
  readonly totalExamples: number;
  readonly allowedExamples: number;
  readonly forbiddenExamples: number;
  readonly allowedPasses: number;
  readonly forbiddenDetections: number;
  readonly semanticPreservationPassRate: number;
  readonly characterFidelityPassRate: number;
  readonly fallbackRate: number;
  readonly unitTraceCoverage: number;
  readonly corpusPass: boolean;
}

export interface CharacterSajuSp2CorpusEvaluationV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_SP2_EVALUATION_SCHEMA_VERSION_V1;
  readonly evaluatorVersion: string;
  readonly caseCount: number;
  readonly results: readonly CharacterSajuSp2CorpusExampleResultV1[];
  readonly metrics: CharacterSajuSp2CorpusMetricsV1;
  readonly rolloutState: 'evaluation_only_not_runtime_authorized';
}

export type CharacterSajuSp2EvaluatorV1 = (input: {
  readonly candidate: CharacterSajuSp2CandidateV1;
  readonly candidateHash: string;
  readonly groundingUnit: CharacterGroundingUnitViewV1;
  readonly characterProfileRef: CharacterReadingPerspectiveRefV1;
}) => CharacterSajuSp2EvaluatorVerdictV1;

export class CharacterSajuSp2EvaluationErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterSajuSp2EvaluationErrorV1';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CharacterSajuSp2EvaluationErrorV1(`${path} must be a non-empty string.`);
  }
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function isFailureClass(value: unknown): value is MeaningPreservationFailureClassV1 {
  return (
    typeof value === 'string' &&
    (MEANING_PRESERVATION_FAILURE_CLASSES_V1 as readonly string[]).includes(value)
  );
}

function failure(
  code: CharacterSajuSp2GateFailureCodeV1,
  detail: string,
  failureClasses?: readonly MeaningPreservationFailureClassV1[],
): CharacterSajuSp2GateFailureV1 {
  return Object.freeze({
    code,
    detail,
    ...(failureClasses === undefined
      ? {}
      : { failureClasses: Object.freeze([...failureClasses]) }),
  });
}

export function hashCharacterSajuSp2CandidateV1(
  candidate: CharacterSajuSp2CandidateV1,
): string {
  return hash({
    schemaVersion: candidate.schemaVersion,
    characterId: candidate.characterId,
    sourceUnitRefs: candidate.sourceUnitRefs,
    text: candidate.text,
  });
}

function admitCandidate(input: {
  readonly candidate: unknown;
  readonly groundingUnit: CharacterGroundingUnitViewV1;
  readonly characterProfileRef: CharacterReadingPerspectiveRefV1;
}): CharacterSajuSp2CandidateV1 | CharacterSajuSp2GateFailureV1 {
  if (!isRecord(input.candidate)) {
    return failure('CANDIDATE_STRUCTURE_INVALID', 'SP-2 candidate must be an object.');
  }
  const allowedKeys = new Set(['schemaVersion', 'characterId', 'sourceUnitRefs', 'text']);
  const unexpected = Object.keys(input.candidate).find((key) => !allowedKeys.has(key));
  if (unexpected !== undefined) {
    return failure(
      'CANDIDATE_STRUCTURE_INVALID',
      `SP-2 candidate contains unexpected field: ${unexpected}.`,
    );
  }
  if (input.candidate.schemaVersion !== CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1) {
    return failure(
      'CANDIDATE_STRUCTURE_INVALID',
      'SP-2 candidate schemaVersion is unsupported.',
    );
  }
  if (
    typeof input.candidate.characterId !== 'string' ||
    input.candidate.characterId !== input.characterProfileRef.characterId
  ) {
    return failure(
      'CANDIDATE_STRUCTURE_INVALID',
      'SP-2 candidate Character identity must match the pinned perspective profile.',
    );
  }
  if (
    !Array.isArray(input.candidate.sourceUnitRefs) ||
    input.candidate.sourceUnitRefs.length !== 1 ||
    input.candidate.sourceUnitRefs[0] !== input.groundingUnit.unitId
  ) {
    return failure(
      'SOURCE_TRACE_MISMATCH',
      'SP-2 semantic candidate must trace to exactly the evaluated source grounding unit.',
    );
  }
  if (
    typeof input.candidate.text !== 'string' ||
    input.candidate.text.trim().length === 0 ||
    input.candidate.text.length > 4000
  ) {
    return failure(
      'CANDIDATE_STRUCTURE_INVALID',
      'SP-2 candidate text must be non-empty and at most 4000 characters.',
    );
  }
  if (input.groundingUnit.realizationPolicyRef === 'protected_only_v1') {
    return failure(
      'PROTECTED_ONLY_UNIT',
      'Protected-only grounding units are not eligible for SP-2 paraphrase evaluation.',
    );
  }

  return Object.freeze({
    schemaVersion: CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
    characterId: input.candidate.characterId,
    sourceUnitRefs: Object.freeze([input.groundingUnit.unitId]),
    text: input.candidate.text,
  });
}

function admitVerdict(input: {
  readonly verdict: unknown;
  readonly expectedEvaluatorVersion: string;
  readonly candidateHash: string;
  readonly unitId: string;
}): CharacterSajuSp2EvaluatorVerdictV1 | CharacterSajuSp2GateFailureV1 {
  if (!isRecord(input.verdict)) {
    return failure(
      'EVALUATOR_IDENTITY_MISMATCH',
      'SP-2 evaluator verdict must be an object.',
    );
  }
  const allowedKeys = new Set([
    'schemaVersion',
    'evaluatorVersion',
    'candidateHash',
    'unitId',
    'semanticPreserved',
    'characterFidelityPreserved',
    'failureClasses',
  ]);
  const unexpected = Object.keys(input.verdict).find((key) => !allowedKeys.has(key));
  if (unexpected !== undefined) {
    return failure(
      'EVALUATOR_IDENTITY_MISMATCH',
      `SP-2 evaluator verdict contains unexpected field: ${unexpected}.`,
    );
  }
  if (
    input.verdict.schemaVersion !==
      CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1 ||
    input.verdict.evaluatorVersion !== input.expectedEvaluatorVersion ||
    input.verdict.candidateHash !== input.candidateHash ||
    input.verdict.unitId !== input.unitId
  ) {
    return failure(
      'EVALUATOR_IDENTITY_MISMATCH',
      'SP-2 evaluator verdict is not bound to the expected evaluator, candidate, and source unit.',
    );
  }
  if (
    typeof input.verdict.semanticPreserved !== 'boolean' ||
    typeof input.verdict.characterFidelityPreserved !== 'boolean' ||
    !Array.isArray(input.verdict.failureClasses) ||
    input.verdict.failureClasses.some((item) => !isFailureClass(item))
  ) {
    return failure(
      'EVALUATOR_IDENTITY_MISMATCH',
      'SP-2 evaluator verdict contains invalid decision fields.',
    );
  }
  const failureClasses = input.verdict
    .failureClasses as readonly MeaningPreservationFailureClassV1[];
  if (new Set(failureClasses).size !== failureClasses.length) {
    return failure(
      'EVALUATOR_IDENTITY_MISMATCH',
      'SP-2 evaluator failure classes must not contain duplicates.',
    );
  }
  if (!input.verdict.semanticPreserved && failureClasses.length === 0) {
    return failure(
      'EVALUATOR_IDENTITY_MISMATCH',
      'A semantic-preservation failure must name at least one governed failure class.',
    );
  }
  if (input.verdict.semanticPreserved && failureClasses.length > 0) {
    return failure(
      'EVALUATOR_IDENTITY_MISMATCH',
      'A semantic-preservation PASS cannot carry meaning-preservation failure classes.',
    );
  }

  return Object.freeze({
    schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
    evaluatorVersion: input.verdict.evaluatorVersion as string,
    candidateHash: input.verdict.candidateHash as string,
    unitId: input.verdict.unitId as string,
    semanticPreserved: input.verdict.semanticPreserved,
    characterFidelityPreserved: input.verdict.characterFidelityPreserved,
    failureClasses: Object.freeze([...failureClasses]),
  });
}

export function guardCharacterSajuSp2EvaluationCandidateV1(input: {
  readonly candidate: unknown;
  readonly groundingUnit: CharacterGroundingUnitViewV1;
  readonly characterProfileRef: CharacterReadingPerspectiveRefV1;
  readonly evaluatorVerdict: unknown;
  readonly expectedEvaluatorVersion: string;
}): CharacterSajuSp2GateDecisionV1 {
  const expectedEvaluatorVersion = nonEmptyString(
    input.expectedEvaluatorVersion,
    'expectedEvaluatorVersion',
  );
  const candidate = admitCandidate(input);
  if ('code' in candidate) {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      validationState: 'fallback_used' as const,
      reason: 'candidate_guard_failed' as const,
      failures: Object.freeze([candidate]),
    });
  }

  const candidateHash = hashCharacterSajuSp2CandidateV1(candidate);
  const verdict = admitVerdict({
    verdict: input.evaluatorVerdict,
    expectedEvaluatorVersion,
    candidateHash,
    unitId: input.groundingUnit.unitId,
  });
  if ('code' in verdict) {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      validationState: 'fallback_used' as const,
      reason: 'candidate_guard_failed' as const,
      failures: Object.freeze([verdict]),
    });
  }

  if (!verdict.semanticPreserved) {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      validationState: 'fallback_used' as const,
      reason: 'semantic_evaluator_failed' as const,
      failures: Object.freeze([
        failure(
          'SEMANTIC_EVALUATION_FAILED',
          'SP-2 semantic evaluator rejected the candidate.',
          verdict.failureClasses,
        ),
      ]),
    });
  }
  if (!verdict.characterFidelityPreserved) {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      validationState: 'fallback_used' as const,
      reason: 'character_fidelity_failed' as const,
      failures: Object.freeze([
        failure(
          'CHARACTER_FIDELITY_FAILED',
          'SP-2 Character-fidelity evaluation rejected the candidate.',
        ),
      ]),
    });
  }

  return Object.freeze({
    mode: 'evaluation_accepted' as const,
    validationState: 'sp2_evaluation_validated' as const,
    candidate,
    candidateHash,
    evaluatorVersion: verdict.evaluatorVersion,
    sourceUnitId: input.groundingUnit.unitId,
    revealState: 'evaluation_only_not_runtime_authorized' as const,
  });
}

function assertCorpus(cases: readonly CharacterSajuEvalCaseV1[]): void {
  if (cases.length === 0) {
    throw new CharacterSajuSp2EvaluationErrorV1(
      'SP-2 evaluation corpus must contain at least one case.',
    );
  }
  const caseIds = new Set<string>();
  for (const item of cases) {
    const caseId = nonEmptyString(item.caseId, 'caseId');
    if (caseIds.has(caseId)) {
      throw new CharacterSajuSp2EvaluationErrorV1(
        `SP-2 evaluation corpus contains duplicate caseId: ${caseId}.`,
      );
    }
    caseIds.add(caseId);
    if (item.groundingUnit.realizationPolicyRef === 'protected_only_v1') {
      throw new CharacterSajuSp2EvaluationErrorV1(
        `SP-2 evaluation case ${caseId} cannot target a protected-only unit.`,
      );
    }
    if (item.allowedExamples.length === 0 || item.forbiddenExamples.length === 0) {
      throw new CharacterSajuSp2EvaluationErrorV1(
        `SP-2 evaluation case ${caseId} requires allowed and forbidden examples.`,
      );
    }
    const texts = [
      ...item.allowedExamples.map((text) => nonEmptyString(text, `${caseId}.allowed`)),
      ...item.forbiddenExamples.map((example) =>
        nonEmptyString(example.text, `${caseId}.forbidden`),
      ),
    ];
    if (new Set(texts).size !== texts.length) {
      throw new CharacterSajuSp2EvaluationErrorV1(
        `SP-2 evaluation case ${caseId} must not contain duplicate example text.`,
      );
    }
    for (const example of item.forbiddenExamples) {
      if (!isFailureClass(example.failureClass)) {
        throw new CharacterSajuSp2EvaluationErrorV1(
          `SP-2 evaluation case ${caseId} contains an unsupported failure class.`,
        );
      }
    }
  }
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

export function evaluateCharacterSajuSp2CorpusV1(input: {
  readonly cases: readonly CharacterSajuEvalCaseV1[];
  readonly evaluatorVersion: string;
  readonly evaluator: CharacterSajuSp2EvaluatorV1;
}): CharacterSajuSp2CorpusEvaluationV1 {
  assertCorpus(input.cases);
  const evaluatorVersion = nonEmptyString(input.evaluatorVersion, 'evaluatorVersion');
  if (typeof input.evaluator !== 'function') {
    throw new CharacterSajuSp2EvaluationErrorV1('SP-2 evaluator must be callable.');
  }

  const results: CharacterSajuSp2CorpusExampleResultV1[] = [];
  let allowedSemanticPasses = 0;
  let allowedFidelityPasses = 0;
  let tracePasses = 0;

  const run = (
    item: CharacterSajuEvalCaseV1,
    text: string,
    expectation: 'allowed' | 'forbidden',
    expectedFailureClass?: MeaningPreservationFailureClassV1,
  ): void => {
    const candidate = Object.freeze({
      schemaVersion: CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
      characterId: item.characterProfileRef.characterId,
      sourceUnitRefs: Object.freeze([item.groundingUnit.unitId]),
      text,
    });
    const candidateHash = hashCharacterSajuSp2CandidateV1(candidate);
    const verdict = input.evaluator({
      candidate,
      candidateHash,
      groundingUnit: item.groundingUnit,
      characterProfileRef: item.characterProfileRef,
    });
    if (expectation === 'allowed' && verdict.semanticPreserved) {
      allowedSemanticPasses += 1;
    }
    if (expectation === 'allowed' && verdict.characterFidelityPreserved) {
      allowedFidelityPasses += 1;
    }
    if (
      candidate.sourceUnitRefs.length === 1 &&
      candidate.sourceUnitRefs[0] === item.groundingUnit.unitId
    ) {
      tracePasses += 1;
    }

    const decision = guardCharacterSajuSp2EvaluationCandidateV1({
      candidate,
      groundingUnit: item.groundingUnit,
      characterProfileRef: item.characterProfileRef,
      evaluatorVerdict: verdict,
      expectedEvaluatorVersion: evaluatorVersion,
    });
    const expectationMet =
      expectation === 'allowed'
        ? decision.mode === 'evaluation_accepted'
        : decision.mode === 'protected_fallback' &&
          decision.failures.some((itemFailure) =>
            itemFailure.failureClasses?.includes(expectedFailureClass!),
          );

    results.push(
      Object.freeze({
        caseId: item.caseId,
        expectation,
        text,
        ...(expectedFailureClass === undefined ? {} : { expectedFailureClass }),
        decision,
        expectationMet,
      }),
    );
  };

  for (const item of input.cases) {
    item.allowedExamples.forEach((text: string) => run(item, text, 'allowed'));
    item.forbiddenExamples.forEach((example: CharacterSajuEvalForbiddenExampleV1) =>
      run(item, example.text, 'forbidden', example.failureClass),
    );
  }

  const allowed = results.filter((result) => result.expectation === 'allowed');
  const forbidden = results.filter((result) => result.expectation === 'forbidden');
  const allowedPasses = allowed.filter((result) => result.expectationMet).length;
  const forbiddenDetections = forbidden.filter((result) => result.expectationMet).length;
  const fallbackCount = results.filter(
    (result) => result.decision.mode === 'protected_fallback',
  ).length;
  const metrics = Object.freeze({
    totalExamples: results.length,
    allowedExamples: allowed.length,
    forbiddenExamples: forbidden.length,
    allowedPasses,
    forbiddenDetections,
    semanticPreservationPassRate: rate(allowedSemanticPasses, allowed.length),
    characterFidelityPassRate: rate(allowedFidelityPasses, allowed.length),
    fallbackRate: rate(fallbackCount, results.length),
    unitTraceCoverage: rate(tracePasses, results.length),
    corpusPass:
      allowedPasses === allowed.length &&
      forbiddenDetections === forbidden.length &&
      tracePasses === results.length,
  });

  return Object.freeze({
    schemaVersion: CHARACTER_SAJU_SP2_EVALUATION_SCHEMA_VERSION_V1,
    evaluatorVersion,
    caseCount: input.cases.length,
    results: Object.freeze(results),
    metrics,
    rolloutState: 'evaluation_only_not_runtime_authorized' as const,
  });
}
