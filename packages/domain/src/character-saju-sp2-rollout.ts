import { createHash } from 'node:crypto';

import type { SajuDomain } from '../../contracts/src/index.js';
import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  type CharacterDialogueEnvelopeV1,
  type CharacterMemoryProposalDraftV1,
  type CharacterSuggestedActionV1,
} from './character-output-guard.js';
import type { CharacterRuntimeContextWithGroundingV1 } from './character-saju-grounding-admission.js';
import {
  admitCharacterSajuGroundingBundleViewV1,
  type CharacterGroundingAmbiguityViewV1,
  type CharacterGroundingDisclosureViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import type { CharacterReadingPerspectiveRefV1 } from './character-saju-reading-plan.js';
import {
  CHARACTER_SAJU_SP2_EVALUATION_SCHEMA_VERSION_V1,
  hashCharacterSajuSp2CandidateV1,
  type CharacterSajuSp2CorpusEvaluationV1,
  type CharacterSajuSp2GateDecisionV1,
} from './character-saju-sp2-evaluation.js';
import { guardCharacterSajuSafeRendererOutput } from './character-saju-safe-renderer.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-sp2-rollout-policy-v1' as const;
export const CHARACTER_SAJU_SP2_CONTROLLED_ROLLOUT_VERSION_V1 =
  'myeongha-character-saju-sp2-controlled-rollout-v1' as const;
export const CHARACTER_SAJU_SP2_READING_ARTIFACT_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-sp2-reading-artifact-v1' as const;

export type CharacterSajuSp2RolloutModeV1 =
  | 'off'
  | 'shadow'
  | 'controlled_reveal';

export interface CharacterSajuSp2RolloutPolicyV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1;
  readonly policyVersion: string;
  readonly mode: CharacterSajuSp2RolloutModeV1;
  readonly allowedCharacterIds: readonly string[];
  readonly allowedDomains: readonly SajuDomain[];
  readonly allowedEvaluatorVersions: readonly string[];
  readonly allowedCohortKeys: readonly string[];
  readonly minimumAllowedExamples: number;
  readonly minimumForbiddenExamples: number;
}

export interface CharacterSajuSp2RolloutEvidenceRefV1 {
  readonly evaluationSchemaVersion: typeof CHARACTER_SAJU_SP2_EVALUATION_SCHEMA_VERSION_V1;
  readonly evaluatorVersion: string;
  readonly caseCount: number;
  readonly allowedExamples: number;
  readonly forbiddenExamples: number;
  readonly semanticPreservationPassRate: 1;
  readonly characterFidelityPassRate: 1;
  readonly unitTraceCoverage: 1;
  readonly corpusPass: true;
  readonly evidenceHash: string;
}

export interface CharacterSajuSp2ControlledSemanticSegmentV1 {
  readonly kind: 'semantic_realization';
  readonly text: string;
  readonly sourceUnitRefs: readonly string[];
}

export interface CharacterSajuSp2ControlledRevealV1 {
  readonly framingBefore: string | null;
  readonly semanticRealization: CharacterSajuSp2ControlledSemanticSegmentV1;
  readonly protectedSajuDisclosures: readonly CharacterGroundingDisclosureViewV1[];
  readonly groundingAmbiguity: CharacterGroundingAmbiguityViewV1 | null;
  readonly calculationAmbiguity: readonly string[];
  readonly framingAfter: string | null;
  readonly emotion: string;
  readonly animationCue: string | null;
  readonly memoryProposals: readonly CharacterMemoryProposalDraftV1[];
  readonly relationshipEventProposals: CharacterDialogueEnvelopeV1['relationshipEventProposals'];
  readonly suggestedActions: readonly CharacterSuggestedActionV1[];
}

export interface CharacterSajuSp2ReadingArtifactCandidateV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_SP2_READING_ARTIFACT_SCHEMA_VERSION_V1;
  readonly artifactId: string;
  readonly rolloutVersion: typeof CHARACTER_SAJU_SP2_CONTROLLED_ROLLOUT_VERSION_V1;
  readonly rolloutPolicyVersion: string;
  readonly cohortKey: string;
  readonly readingRef: string;
  readonly sourceResponseHash: string;
  readonly groundingHash: string;
  readonly characterId: string;
  readonly domain: SajuDomain;
  readonly sourceUnitId: string;
  readonly candidateHash: string;
  readonly evaluatorVersion: string;
  readonly outputGuardVersion: typeof CHARACTER_OUTPUT_GUARD_VERSION_V1;
  readonly rolloutEvidence: CharacterSajuSp2RolloutEvidenceRefV1;
  readonly controlledReveal: CharacterSajuSp2ControlledRevealV1;
  readonly protectedFallbackEnvelope: CharacterDialogueEnvelopeV1;
  readonly validationState: 'semantic_validated';
  readonly commitState: 'requires_atomic_commit';
  readonly revealState: 'forbidden_before_commit';
}

export const CHARACTER_SAJU_SP2_ROLLOUT_FAILURE_CODES_V1 = Object.freeze([
  'ROLLOUT_POLICY_INVALID',
  'ROLLOUT_DISABLED',
  'ROLLOUT_SHADOW_ONLY',
  'EVALUATION_NOT_ACCEPTED',
  'CORPUS_EVIDENCE_INVALID',
  'CHARACTER_NOT_ALLOWED',
  'DOMAIN_NOT_ALLOWED',
  'EVALUATOR_NOT_ALLOWED',
  'COHORT_NOT_ALLOWED',
  'GROUNDING_IDENTITY_MISMATCH',
  'PROFILE_IDENTITY_MISMATCH',
  'CANDIDATE_IDENTITY_MISMATCH',
  'OUTPUT_GUARD_FAILED',
] as const);

export type CharacterSajuSp2RolloutFailureCodeV1 =
  (typeof CHARACTER_SAJU_SP2_ROLLOUT_FAILURE_CODES_V1)[number];

export interface CharacterSajuSp2RolloutFailureV1 {
  readonly code: CharacterSajuSp2RolloutFailureCodeV1;
  readonly detail: string;
}

export type CharacterSajuSp2ControlledRolloutDecisionV1 =
  | {
      readonly mode: 'controlled_reveal_candidate';
      readonly validationState: 'sp2_controlled_rollout_validated';
      readonly artifactCandidate: CharacterSajuSp2ReadingArtifactCandidateV1;
      readonly revealState: 'requires_atomic_commit';
    }
  | {
      readonly mode: 'protected_fallback';
      readonly validationState: 'fallback_used';
      readonly reason:
        | 'rollout_not_authorized'
        | 'evaluation_not_accepted'
        | 'corpus_evidence_failed'
        | 'identity_check_failed'
        | 'output_guard_failed';
      readonly failures: readonly CharacterSajuSp2RolloutFailureV1[];
      readonly fallbackRequired: true;
      readonly revealState: 'forbidden';
    };

const SAJU_DOMAINS = Object.freeze([
  'general',
  'family',
  'relationship',
  'compatibility',
  'career',
  'business',
  'wealth',
  'life_stage',
  'question_specific',
] as const satisfies readonly SajuDomain[]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  code: CharacterSajuSp2RolloutFailureCodeV1,
  detail: string,
): CharacterSajuSp2RolloutFailureV1 {
  return Object.freeze({ code, detail });
}

function fallback(
  reason: Extract<
    CharacterSajuSp2ControlledRolloutDecisionV1,
    { mode: 'protected_fallback' }
  >['reason'],
  failures: readonly CharacterSajuSp2RolloutFailureV1[],
): CharacterSajuSp2ControlledRolloutDecisionV1 {
  return Object.freeze({
    mode: 'protected_fallback' as const,
    validationState: 'fallback_used' as const,
    reason,
    failures: Object.freeze([...failures]),
    fallbackRequired: true as const,
    revealState: 'forbidden' as const,
  });
}

function nonEmptyString(value: unknown, path: string, maxLength = 256): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TypeError(`${path} is outside the supported bounds.`);
  }
  return normalized;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100000) {
    throw new TypeError(`${path} must be an integer between 1 and 100000.`);
  }
  return value as number;
}

function uniqueStringArray(
  value: unknown,
  path: string,
  maxLength = 128,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new TypeError(`${path} must be an array of at most ${maxLength} items.`);
  }
  const result = value.map((item, index) =>
    nonEmptyString(item, `${path}[${index}]`, 256),
  );
  if (new Set(result).size !== result.length) {
    throw new TypeError(`${path} must not contain duplicates.`);
  }
  return Object.freeze(result);
}

function domainArray(value: unknown): readonly SajuDomain[] {
  const raw = uniqueStringArray(value, 'allowedDomains');
  const domains = raw.map((item) => {
    if (!SAJU_DOMAINS.includes(item as SajuDomain)) {
      throw new TypeError('allowedDomains contains an unsupported Saju domain.');
    }
    return item as SajuDomain;
  });
  return Object.freeze(domains);
}

function admitRolloutPolicy(
  candidate: unknown,
): CharacterSajuSp2RolloutPolicyV1 | CharacterSajuSp2RolloutFailureV1 {
  try {
    if (!isRecord(candidate)) {
      throw new TypeError('SP-2 rollout policy must be an object.');
    }
    const allowedKeys = new Set([
      'schemaVersion',
      'policyVersion',
      'mode',
      'allowedCharacterIds',
      'allowedDomains',
      'allowedEvaluatorVersions',
      'allowedCohortKeys',
      'minimumAllowedExamples',
      'minimumForbiddenExamples',
    ]);
    const unexpected = Object.keys(candidate).find((key) => !allowedKeys.has(key));
    if (unexpected !== undefined) {
      throw new TypeError(`SP-2 rollout policy contains unexpected field: ${unexpected}.`);
    }
    if (candidate.schemaVersion !== CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1) {
      throw new TypeError('SP-2 rollout policy schemaVersion is unsupported.');
    }
    if (
      candidate.mode !== 'off' &&
      candidate.mode !== 'shadow' &&
      candidate.mode !== 'controlled_reveal'
    ) {
      throw new TypeError('SP-2 rollout policy mode is unsupported.');
    }

    const admitted = Object.freeze({
      schemaVersion: CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1,
      policyVersion: nonEmptyString(candidate.policyVersion, 'policyVersion'),
      mode: candidate.mode,
      allowedCharacterIds: uniqueStringArray(
        candidate.allowedCharacterIds,
        'allowedCharacterIds',
      ),
      allowedDomains: domainArray(candidate.allowedDomains),
      allowedEvaluatorVersions: uniqueStringArray(
        candidate.allowedEvaluatorVersions,
        'allowedEvaluatorVersions',
      ),
      allowedCohortKeys: uniqueStringArray(
        candidate.allowedCohortKeys,
        'allowedCohortKeys',
      ),
      minimumAllowedExamples: positiveInteger(
        candidate.minimumAllowedExamples,
        'minimumAllowedExamples',
      ),
      minimumForbiddenExamples: positiveInteger(
        candidate.minimumForbiddenExamples,
        'minimumForbiddenExamples',
      ),
    }) satisfies CharacterSajuSp2RolloutPolicyV1;

    if (
      admitted.mode === 'controlled_reveal' &&
      (admitted.allowedCharacterIds.length === 0 ||
        admitted.allowedDomains.length === 0 ||
        admitted.allowedEvaluatorVersions.length === 0 ||
        admitted.allowedCohortKeys.length === 0)
    ) {
      throw new TypeError(
        'controlled_reveal rollout policy requires explicit non-empty allowlists.',
      );
    }

    return admitted;
  } catch (error) {
    return failure(
      'ROLLOUT_POLICY_INVALID',
      error instanceof Error ? error.message : 'SP-2 rollout policy is invalid.',
    );
  }
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function corpusEvidenceRef(
  corpus: CharacterSajuSp2CorpusEvaluationV1,
): CharacterSajuSp2RolloutEvidenceRefV1 {
  const material = {
    evaluationSchemaVersion: corpus.schemaVersion,
    evaluatorVersion: corpus.evaluatorVersion,
    caseCount: corpus.caseCount,
    allowedExamples: corpus.metrics.allowedExamples,
    forbiddenExamples: corpus.metrics.forbiddenExamples,
    semanticPreservationPassRate: corpus.metrics.semanticPreservationPassRate,
    characterFidelityPassRate: corpus.metrics.characterFidelityPassRate,
    unitTraceCoverage: corpus.metrics.unitTraceCoverage,
    corpusPass: corpus.metrics.corpusPass,
  };
  return Object.freeze({
    ...material,
    semanticPreservationPassRate: 1 as const,
    characterFidelityPassRate: 1 as const,
    unitTraceCoverage: 1 as const,
    corpusPass: true as const,
    evidenceHash: sha256Json(material),
  });
}

function validateCorpusEvidence(input: {
  readonly corpus: CharacterSajuSp2CorpusEvaluationV1;
  readonly evaluatorVersion: string;
  readonly policy: CharacterSajuSp2RolloutPolicyV1;
}):
  | { readonly ok: true; readonly evidence: CharacterSajuSp2RolloutEvidenceRefV1 }
  | { readonly ok: false; readonly failure: CharacterSajuSp2RolloutFailureV1 } {
  const metrics = input.corpus.metrics;
  const totalsConsistent =
    metrics.totalExamples === metrics.allowedExamples + metrics.forbiddenExamples;
  const exactPositivePass =
    metrics.allowedPasses === metrics.allowedExamples &&
    metrics.semanticPreservationPassRate === 1 &&
    metrics.characterFidelityPassRate === 1;
  const exactNegativeDetection =
    metrics.forbiddenDetections === metrics.forbiddenExamples;
  const exactTrace = metrics.unitTraceCoverage === 1;

  if (
    input.corpus.schemaVersion !== CHARACTER_SAJU_SP2_EVALUATION_SCHEMA_VERSION_V1 ||
    input.corpus.rolloutState !== 'evaluation_only_not_runtime_authorized' ||
    input.corpus.evaluatorVersion !== input.evaluatorVersion ||
    input.corpus.caseCount < 1 ||
    !metrics.corpusPass ||
    !totalsConsistent ||
    !exactPositivePass ||
    !exactNegativeDetection ||
    !exactTrace ||
    metrics.allowedExamples < input.policy.minimumAllowedExamples ||
    metrics.forbiddenExamples < input.policy.minimumForbiddenExamples
  ) {
    return Object.freeze({
      ok: false as const,
      failure: failure(
        'CORPUS_EVIDENCE_INVALID',
        'SP-2 controlled reveal requires exact passing corpus evidence for the active evaluator and policy thresholds.',
      ),
    });
  }

  return Object.freeze({
    ok: true as const,
    evidence: corpusEvidenceRef(input.corpus),
  });
}

function findAuthoritativeSourceUnit(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly grounding: unknown;
  readonly sourceUnitId: string;
}):
  | {
      readonly ok: true;
      readonly grounding: CharacterSajuGroundingBundleViewV1;
      readonly sourceUnit: CharacterSajuGroundingBundleViewV1['units'][number];
    }
  | { readonly ok: false; readonly failure: CharacterSajuSp2RolloutFailureV1 } {
  const saju = input.context.saju;
  if (saju === null || saju.groundingRef === null) {
    return Object.freeze({
      ok: false as const,
      failure: failure(
        'GROUNDING_IDENTITY_MISMATCH',
        'SP-2 controlled reveal requires an admitted Saju grounding identity.',
      ),
    });
  }

  try {
    const grounding = admitCharacterSajuGroundingBundleViewV1({
      candidate: input.grounding,
      expectedRef: saju.groundingRef,
    });
    const sourceUnit = grounding.units.find((unit) => unit.unitId === input.sourceUnitId);
    if (sourceUnit === undefined) {
      return Object.freeze({
        ok: false as const,
        failure: failure(
          'GROUNDING_IDENTITY_MISMATCH',
          'SP-2 source unit is not present in the admitted grounding bundle.',
        ),
      });
    }
    if (
      grounding.readingRef !== saju.readingRef ||
      grounding.readingDomain !== saju.domain ||
      sourceUnit.domain !== saju.domain ||
      sourceUnit.realizationPolicyRef === 'protected_only_v1'
    ) {
      return Object.freeze({
        ok: false as const,
        failure: failure(
          'GROUNDING_IDENTITY_MISMATCH',
          'SP-2 source unit is not eligible under the active admitted Saju grounding.',
        ),
      });
    }
    return Object.freeze({ ok: true as const, grounding, sourceUnit });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      failure: failure(
        'GROUNDING_IDENTITY_MISMATCH',
        error instanceof Error
          ? error.message
          : 'SP-2 grounding admission failed.',
      ),
    });
  }
}

function requiredDisclosureViews(input: {
  readonly grounding: CharacterSajuGroundingBundleViewV1;
  readonly sourceUnit: CharacterSajuGroundingBundleViewV1['units'][number];
}): readonly CharacterGroundingDisclosureViewV1[] {
  const byRef = new Map(
    input.grounding.disclosures.map((item) => [item.disclosureRef, item]),
  );
  return Object.freeze(
    input.sourceUnit.requiredDisclosureRefs.map((disclosureRef) => {
      const disclosure = byRef.get(disclosureRef);
      if (disclosure === undefined) {
        throw new TypeError(
          'Admitted SP-2 source unit is missing a required grounding disclosure.',
        );
      }
      return Object.freeze({ ...disclosure });
    }),
  );
}

function groundingAmbiguityView(input: {
  readonly grounding: CharacterSajuGroundingBundleViewV1;
  readonly sourceUnit: CharacterSajuGroundingBundleViewV1['units'][number];
}): CharacterGroundingAmbiguityViewV1 | null {
  if (input.sourceUnit.ambiguityRef === undefined) return null;
  const ambiguity = input.grounding.ambiguities.find(
    (item) => item.ambiguityRef === input.sourceUnit.ambiguityRef,
  );
  if (ambiguity === undefined) {
    throw new TypeError(
      'Admitted SP-2 source unit is missing its required grounding ambiguity.',
    );
  }
  return Object.freeze({ ...ambiguity });
}

function artifactId(
  material: Omit<
    CharacterSajuSp2ReadingArtifactCandidateV1,
    'artifactId'
  >,
): string {
  return `character_saju_sp2_artifact_${sha256Json(material).slice(0, 24)}`;
}

export function authorizeCharacterSajuSp2ControlledRolloutV1(input: {
  readonly evaluationDecision: CharacterSajuSp2GateDecisionV1;
  readonly corpusEvidence: CharacterSajuSp2CorpusEvaluationV1;
  readonly rolloutPolicy: unknown;
  readonly cohortKey: string;
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly grounding: unknown;
  readonly characterProfileRef: CharacterReadingPerspectiveRefV1;
  readonly safeRendererOutput: unknown;
  readonly allowedSuggestedActionKeys: readonly string[];
}): CharacterSajuSp2ControlledRolloutDecisionV1 {
  const policy = admitRolloutPolicy(input.rolloutPolicy);
  if ('code' in policy) {
    return fallback('rollout_not_authorized', [policy]);
  }

  if (policy.mode === 'off') {
    return fallback('rollout_not_authorized', [
      failure('ROLLOUT_DISABLED', 'SP-2 rollout policy is disabled.'),
    ]);
  }
  if (policy.mode === 'shadow') {
    return fallback('rollout_not_authorized', [
      failure(
        'ROLLOUT_SHADOW_ONLY',
        'SP-2 rollout policy is shadow-only and cannot authorize user-visible reveal.',
      ),
    ]);
  }

  if (input.evaluationDecision.mode !== 'evaluation_accepted') {
    return fallback('evaluation_not_accepted', [
      failure(
        'EVALUATION_NOT_ACCEPTED',
        'SP-2 candidate did not pass the evaluation gate.',
      ),
    ]);
  }
  const decision = input.evaluationDecision;

  if (
    hashCharacterSajuSp2CandidateV1(decision.candidate) !== decision.candidateHash ||
    decision.candidate.sourceUnitRefs.length !== 1 ||
    decision.candidate.sourceUnitRefs[0] !== decision.sourceUnitId ||
    decision.revealState !== 'evaluation_only_not_runtime_authorized'
  ) {
    return fallback('identity_check_failed', [
      failure(
        'CANDIDATE_IDENTITY_MISMATCH',
        'SP-2 evaluation decision candidate identity is internally inconsistent.',
      ),
    ]);
  }

  const contextSaju = input.context.saju;
  if (
    contextSaju === null ||
    input.context.characterId !== decision.candidate.characterId ||
    input.characterProfileRef.characterId !== input.context.characterId ||
    input.characterProfileRef.sourceContentVersion !== input.context.contentVersion ||
    input.characterProfileRef.sourceSajuProfileVersion !==
      input.context.sajuProfile.profileVersion
  ) {
    return fallback('identity_check_failed', [
      failure(
        'PROFILE_IDENTITY_MISMATCH',
        'SP-2 candidate/profile identity does not match the active Character context.',
      ),
    ]);
  }

  const source = findAuthoritativeSourceUnit({
    context: input.context,
    grounding: input.grounding,
    sourceUnitId: decision.sourceUnitId,
  });
  if (!source.ok) {
    return fallback('identity_check_failed', [source.failure]);
  }

  if (!policy.allowedCharacterIds.includes(input.context.characterId)) {
    return fallback('rollout_not_authorized', [
      failure(
        'CHARACTER_NOT_ALLOWED',
        'Active Character is not admitted by the SP-2 controlled rollout policy.',
      ),
    ]);
  }
  if (!policy.allowedDomains.includes(contextSaju.domain)) {
    return fallback('rollout_not_authorized', [
      failure(
        'DOMAIN_NOT_ALLOWED',
        'Active Saju domain is not admitted by the SP-2 controlled rollout policy.',
      ),
    ]);
  }
  if (!policy.allowedEvaluatorVersions.includes(decision.evaluatorVersion)) {
    return fallback('rollout_not_authorized', [
      failure(
        'EVALUATOR_NOT_ALLOWED',
        'SP-2 evaluator version is not admitted by the controlled rollout policy.',
      ),
    ]);
  }

  let cohortKey: string;
  try {
    cohortKey = nonEmptyString(input.cohortKey, 'cohortKey', 128);
  } catch (error) {
    return fallback('rollout_not_authorized', [
      failure(
        'COHORT_NOT_ALLOWED',
        error instanceof Error ? error.message : 'SP-2 cohort key is invalid.',
      ),
    ]);
  }
  if (!policy.allowedCohortKeys.includes(cohortKey)) {
    return fallback('rollout_not_authorized', [
      failure(
        'COHORT_NOT_ALLOWED',
        'SP-2 cohort is not admitted by the controlled rollout policy.',
      ),
    ]);
  }

  const evidence = validateCorpusEvidence({
    corpus: input.corpusEvidence,
    evaluatorVersion: decision.evaluatorVersion,
    policy,
  });
  if (!evidence.ok) {
    return fallback('corpus_evidence_failed', [evidence.failure]);
  }

  let envelope: CharacterDialogueEnvelopeV1;
  try {
    envelope = guardCharacterSajuSafeRendererOutput({
      rawOutput: input.safeRendererOutput,
      context: input.context,
      allowedSuggestedActionKeys: input.allowedSuggestedActionKeys,
    });
  } catch (error) {
    return fallback('output_guard_failed', [
      failure(
        'OUTPUT_GUARD_FAILED',
        error instanceof Error
          ? error.message
          : 'Existing MyeongHa Output Guard rejected the controlled rollout candidate.',
      ),
    ]);
  }

  const controlledReveal = Object.freeze({
    framingBefore: envelope.framingBefore,
    semanticRealization: Object.freeze({
      kind: 'semantic_realization' as const,
      text: decision.candidate.text,
      sourceUnitRefs: Object.freeze([...decision.candidate.sourceUnitRefs]),
    }),
    protectedSajuDisclosures: requiredDisclosureViews({
      grounding: source.grounding,
      sourceUnit: source.sourceUnit,
    }),
    groundingAmbiguity: groundingAmbiguityView({
      grounding: source.grounding,
      sourceUnit: source.sourceUnit,
    }),
    calculationAmbiguity: Object.freeze([...envelope.calculationAmbiguity]),
    framingAfter: envelope.framingAfter,
    emotion: envelope.emotion,
    animationCue: envelope.animationCue,
    memoryProposals: Object.freeze([...envelope.memoryProposals]),
    relationshipEventProposals: Object.freeze([
      ...envelope.relationshipEventProposals,
    ]),
    suggestedActions: Object.freeze([...envelope.suggestedActions]),
  }) satisfies CharacterSajuSp2ControlledRevealV1;

  const material = Object.freeze({
    schemaVersion: CHARACTER_SAJU_SP2_READING_ARTIFACT_SCHEMA_VERSION_V1,
    rolloutVersion: CHARACTER_SAJU_SP2_CONTROLLED_ROLLOUT_VERSION_V1,
    rolloutPolicyVersion: policy.policyVersion,
    cohortKey,
    readingRef: source.grounding.readingRef,
    sourceResponseHash: source.grounding.sourceResponseHash,
    groundingHash: source.grounding.groundingHash,
    characterId: input.context.characterId,
    domain: contextSaju.domain,
    sourceUnitId: source.sourceUnit.unitId,
    candidateHash: decision.candidateHash,
    evaluatorVersion: decision.evaluatorVersion,
    outputGuardVersion: CHARACTER_OUTPUT_GUARD_VERSION_V1,
    rolloutEvidence: evidence.evidence,
    controlledReveal,
    protectedFallbackEnvelope: envelope,
    validationState: 'semantic_validated' as const,
    commitState: 'requires_atomic_commit' as const,
    revealState: 'forbidden_before_commit' as const,
  });

  const artifactCandidate = Object.freeze({
    ...material,
    artifactId: artifactId(material),
  }) satisfies CharacterSajuSp2ReadingArtifactCandidateV1;

  return Object.freeze({
    mode: 'controlled_reveal_candidate' as const,
    validationState: 'sp2_controlled_rollout_validated' as const,
    artifactCandidate,
    revealState: 'requires_atomic_commit' as const,
  });
}
