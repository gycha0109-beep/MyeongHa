import { describe, expect, it } from 'vitest';

import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
} from './character-output-guard.js';
import { hashProtectedSajuTextV1 } from './character-runtime-context.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  type CharacterRuntimeContextWithGroundingV1,
} from './character-saju-grounding-admission.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import type { CharacterReadingPerspectiveRefV1 } from './character-saju-reading-plan.js';
import {
  CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
  CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
  evaluateCharacterSajuSp2CorpusV1,
  guardCharacterSajuSp2EvaluationCandidateV1,
  hashCharacterSajuSp2CandidateV1,
} from './character-saju-sp2-evaluation.js';
import {
  CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1,
  authorizeCharacterSajuSp2ControlledRolloutV1,
} from './character-saju-sp2-rollout.js';

const EVALUATOR_VERSION = 'fixture-sp2-evaluator-v1';
const CHARACTER_ID = 'taegyeom';
const COHORT_KEY = 'internal_beta';

function makeBundle(): CharacterSajuGroundingBundleViewV1 {
  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: 'reading-sp2-rollout-1',
    productResponseVersion: 'product-reading-response-v1',
    engineVersion: 'saju-engine-v1',
    readingDomain: 'general' as const,
    sourceResponseHash: 'a'.repeat(64),
    units: [
      {
        unitId: 'grounding_unit_' + '1'.repeat(24),
        domain: 'general' as const,
        axis: 'responsibility' as const,
        narrativeRole: 'primary' as const,
        semanticKey: 'general_responsibility',
        canonicalMeaning: '결과를 만들면 그 이후의 관리와 책임까지 신경 쓰는 경향이 있다.',
        sourceBlockRefs: ['sections.0.blocks.0'],
        qualifiers: ['경향'],
        prohibitedExtensions: ['guaranteed_success'],
        ambiguityRef: 'grounding_ambiguity_1',
        requiredCompanionUnitRefs: [],
        requiredDisclosureRefs: ['grounding_disclosure_1'],
        realizationPolicyRef: 'bounded_semantic_paraphrase_v1' as const,
      },
    ],
    disclosures: [
      {
        disclosureRef: 'grounding_disclosure_1',
        type: 'scope_limitation' as const,
        text: '이 해석은 확정적 결과를 보장하지 않습니다.',
        sourceDisclosureIndex: 0,
      },
    ],
    ambiguities: [
      {
        ambiguityRef: 'grounding_ambiguity_1',
        kind: 'reading_block' as const,
        sourceRef: 'sections.0.blocks.0',
        summary: '세부 강도는 다른 구조와 함께 확인해야 합니다.',
      },
    ],
  };
  return {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
}

function protectedText(
  readingRef: string,
  segmentId: string,
  sourceRef: string,
  text: string,
) {
  return {
    segmentId,
    sourceReadingRef: readingRef,
    sourceRef,
    contentHash: hashProtectedSajuTextV1(text),
    text,
  };
}

function context(bundle = makeBundle()): CharacterRuntimeContextWithGroundingV1 {
  const speech = {
    register: 'measured',
    sentenceRhythm: 'short',
    directness: 'high',
    warmth: 'medium',
    profanity: 'none',
    forbiddenBehaviors: [],
  } as const;
  const communication = {
    register: 'measured',
    sentenceRhythm: 'short',
    verbosity: 'medium',
    humorStyle: 'dry',
    metaphorStyle: 'none',
    profanityIntensity: 'none',
    politenessStyle: 'reserved',
  } as const;

  return {
    schemaVersion: 'v1',
    characterId: CHARACTER_ID,
    contentBundleId: 'fixture-content-bundle-v1',
    contentVersion: 'fixture-content-v1',
    speech,
    voiceAuthority: {
      characterId: CHARACTER_ID,
      surface: 'saju_product',
      source: 'published_character_content',
      contentVersion: 'fixture-content-v1',
      speech,
      communication,
    },
    canon: {},
    persona: { communication },
    behavior: {},
    sajuProfile: {
      profileVersion: 'fixture-saju-profile-v1',
      attentionAxes: ['responsibility'],
      followUpQuestionStrategies: ['current_context'],
      safeFraming: {
        schemaVersion: 'v1',
        catalogVersion: 'fixture-safe-framing-v1',
        before: [
          {
            key: 'record_first',
            text: '기록을 기준으로 보겠습니다.',
            purpose: 'record_transition',
          },
        ],
        after: [
          {
            key: 'ask_current_context',
            text: '지금 현실에서는 어떻게 느껴집니까?',
            purpose: 'relationship_transition',
          },
        ],
      },
    },
    relationship: {
      schemaVersion: 'v1',
      relationshipRevision: 1,
      relationshipPolicyVersion: 'relationship-policy-v1',
      projectionPolicyVersion: 'relationship-projection-v1',
      behaviorVersion: 'relationship-behavior-v1',
      matchedBehaviorRuleKey: null,
      stageKey: 'acquainted',
      closenessBand: 'medium',
      trustBand: 'medium',
      frictionBand: 'low',
      recentEventKeys: [],
      mode: {},
    },
    rendererPolicy: {
      allowedEmotionIds: ['serious'],
      allowedAnimationCueIds: ['look_aside'],
    },
    worldRelations: [],
    lifeFacts: [],
    memories: [],
    recentMessages: [],
    saju: {
      readingRef: bundle.readingRef,
      domain: 'general',
      coverageState: 'complete',
      protectedSegments: [
        protectedText(
          bundle.readingRef,
          'protected-general-1',
          'product-block:general:0',
          '보호된 사주 기준 문장입니다.',
        ),
      ],
      disclosures: [
        protectedText(
          bundle.readingRef,
          'protected-disclosure-1',
          'product-disclosure:general:0',
          '이 해석은 확정적 결과를 보장하지 않습니다.',
        ),
      ],
      ambiguity: ['reading_block_variation'],
      capability: {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'capability-v1',
      },
      groundingRef: {
        schemaVersion: bundle.schemaVersion,
        groundingProjectionVersion: bundle.groundingProjectionVersion,
        axisRegistryVersion: bundle.axisRegistryVersion,
        readingRef: bundle.readingRef,
        productResponseVersion: bundle.productResponseVersion,
        engineVersion: bundle.engineVersion,
        readingDomain: bundle.readingDomain,
        sourceResponseHash: bundle.sourceResponseHash,
        groundingHash: bundle.groundingHash,
      },
    },
  } as unknown as CharacterRuntimeContextWithGroundingV1;
}

function profileRef(): CharacterReadingPerspectiveRefV1 {
  return {
    characterId: CHARACTER_ID,
    perspectiveVersion: 'fixture-perspective-v1',
    sourceContentVersion: 'fixture-content-v1',
    sourceSajuProfileVersion: 'fixture-saju-profile-v1',
    profileHash: 'b'.repeat(64),
  };
}

function acceptedEvaluation(bundle = makeBundle()) {
  const sourceUnit = bundle.units[0]!;
  const candidate = {
    schemaVersion: CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
    characterId: CHARACTER_ID,
    sourceUnitRefs: [sourceUnit.unitId],
    text: '결과를 내는 것에서 끝내지 않고, 그 뒤의 관리와 책임까지 챙기는 쪽입니다.',
  };
  const candidateHash = hashCharacterSajuSp2CandidateV1(candidate);
  return guardCharacterSajuSp2EvaluationCandidateV1({
    candidate,
    groundingUnit: sourceUnit,
    characterProfileRef: profileRef(),
    evaluatorVerdict: {
      schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
      evaluatorVersion: EVALUATOR_VERSION,
      candidateHash,
      unitId: sourceUnit.unitId,
      semanticPreserved: true,
      characterFidelityPreserved: true,
      failureClasses: [],
    },
    expectedEvaluatorVersion: EVALUATOR_VERSION,
  });
}

function passingCorpus(bundle = makeBundle()) {
  const sourceUnit = bundle.units[0]!;
  return evaluateCharacterSajuSp2CorpusV1({
    cases: [
      {
        caseId: 'rollout-eval-case-v1',
        groundingUnit: sourceUnit,
        characterProfileRef: profileRef(),
        allowedExamples: ['결과 이후의 관리와 책임까지 챙기는 흐름입니다.'],
        forbiddenExamples: [
          {
            text: '반드시 큰 성공을 거둡니다.',
            failureClass: 'ADDED_CLAIM',
          },
        ],
      },
    ],
    evaluatorVersion: EVALUATOR_VERSION,
    evaluator: (input) => {
      const forbidden = input.candidate.text === '반드시 큰 성공을 거둡니다.';
      return {
        schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
        evaluatorVersion: EVALUATOR_VERSION,
        candidateHash: input.candidateHash,
        unitId: input.groundingUnit.unitId,
        semanticPreserved: !forbidden,
        characterFidelityPreserved: true,
        failureClasses: forbidden ? ['ADDED_CLAIM'] : [],
      };
    },
  });
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: CHARACTER_SAJU_SP2_ROLLOUT_POLICY_SCHEMA_VERSION_V1,
    policyVersion: 'sp2-internal-beta-v1',
    mode: 'controlled_reveal',
    allowedCharacterIds: [CHARACTER_ID],
    allowedDomains: ['general'],
    allowedEvaluatorVersions: [EVALUATOR_VERSION],
    allowedCohortKeys: [COHORT_KEY],
    minimumAllowedExamples: 1,
    minimumForbiddenExamples: 1,
    ...overrides,
  };
}

function safeRendererOutput(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'v1',
    framingBeforeKey: 'record_first',
    framingAfterKey: 'ask_current_context',
    emotion: 'serious',
    animationCue: 'look_aside',
    memoryProposals: [],
    relationshipEventProposals: [],
    suggestedActions: [],
    ...overrides,
  };
}

function authorize(overrides: {
  evaluationDecision?: ReturnType<typeof acceptedEvaluation>;
  corpusEvidence?: ReturnType<typeof passingCorpus>;
  rolloutPolicy?: unknown;
  cohortKey?: string;
  context?: CharacterRuntimeContextWithGroundingV1;
  grounding?: unknown;
  characterProfileRef?: CharacterReadingPerspectiveRefV1;
  safeRendererOutput?: unknown;
} = {}) {
  const bundle = makeBundle();
  return authorizeCharacterSajuSp2ControlledRolloutV1({
    evaluationDecision: overrides.evaluationDecision ?? acceptedEvaluation(bundle),
    corpusEvidence: overrides.corpusEvidence ?? passingCorpus(bundle),
    rolloutPolicy: overrides.rolloutPolicy ?? policy(),
    cohortKey: overrides.cohortKey ?? COHORT_KEY,
    context: overrides.context ?? context(bundle),
    grounding: overrides.grounding ?? bundle,
    characterProfileRef: overrides.characterProfileRef ?? profileRef(),
    safeRendererOutput: overrides.safeRendererOutput ?? safeRendererOutput(),
    allowedSuggestedActionKeys: [],
  });
}

describe('Character Saju SP-2 controlled rollout v1', () => {
  it('authorizes only a pre-evaluated candidate and keeps reveal forbidden until atomic commit', () => {
    const result = authorize();

    expect(result.mode).toBe('controlled_reveal_candidate');
    if (result.mode !== 'controlled_reveal_candidate') {
      throw new Error('expected controlled reveal candidate');
    }
    expect(result.revealState).toBe('requires_atomic_commit');
    expect(result.artifactCandidate.commitState).toBe('requires_atomic_commit');
    expect(result.artifactCandidate.revealState).toBe('forbidden_before_commit');
    expect(result.artifactCandidate.outputGuardVersion).toBe(
      CHARACTER_OUTPUT_GUARD_VERSION_V1,
    );
    expect(result.artifactCandidate.controlledReveal.semanticRealization.text).toBe(
      '결과를 내는 것에서 끝내지 않고, 그 뒤의 관리와 책임까지 챙기는 쪽입니다.',
    );
    expect(
      result.artifactCandidate.controlledReveal.semanticRealization.sourceUnitRefs,
    ).toEqual([makeBundle().units[0]!.unitId]);
  });

  it('preserves authoritative grounding disclosure and ambiguity in controlled reveal material', () => {
    const result = authorize();
    if (result.mode !== 'controlled_reveal_candidate') {
      throw new Error('expected controlled reveal candidate');
    }

    expect(result.artifactCandidate.controlledReveal.protectedSajuDisclosures).toEqual(
      makeBundle().disclosures,
    );
    expect(result.artifactCandidate.controlledReveal.groundingAmbiguity).toEqual(
      makeBundle().ambiguities[0],
    );
    expect(result.artifactCandidate.controlledReveal.calculationAmbiguity).toEqual([
      'reading_block_variation',
    ]);
    expect(result.artifactCandidate.protectedFallbackEnvelope.protectedSajuSegments[0]?.text).toBe(
      '보호된 사주 기준 문장입니다.',
    );
  });

  it.each([
    ['off', 'ROLLOUT_DISABLED'],
    ['shadow', 'ROLLOUT_SHADOW_ONLY'],
  ] as const)('fails to protected fallback when rollout mode is %s', (mode, code) => {
    const result = authorize({ rolloutPolicy: policy({ mode }) });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.fallbackRequired).toBe(true);
    expect(result.revealState).toBe('forbidden');
    expect(result.failures.map((item) => item.code)).toContain(code);
  });

  it.each([
    [
      'character',
      policy({ allowedCharacterIds: ['baekheon'] }),
      COHORT_KEY,
      'CHARACTER_NOT_ALLOWED',
    ],
    [
      'domain',
      policy({ allowedDomains: ['career'] }),
      COHORT_KEY,
      'DOMAIN_NOT_ALLOWED',
    ],
    [
      'evaluator',
      policy({ allowedEvaluatorVersions: ['other-evaluator-v1'] }),
      COHORT_KEY,
      'EVALUATOR_NOT_ALLOWED',
    ],
    [
      'cohort',
      policy(),
      'public-unapproved',
      'COHORT_NOT_ALLOWED',
    ],
  ] as const)(
    'fails closed when %s allowlist does not admit the request',
    (_label, rolloutPolicy, cohortKey, code) => {
      const result = authorize({ rolloutPolicy, cohortKey });
      expect(result.mode).toBe('protected_fallback');
      if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
      expect(result.failures.map((item) => item.code)).toContain(code);
    },
  );

  it('requires exact passing offline corpus evidence for the active evaluator', () => {
    const corpus = passingCorpus();
    const result = authorize({
      corpusEvidence: {
        ...corpus,
        metrics: {
          ...corpus.metrics,
          corpusPass: false,
          forbiddenDetections: 0,
        },
      },
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('corpus_evidence_failed');
    expect(result.failures.map((item) => item.code)).toContain(
      'CORPUS_EVIDENCE_INVALID',
    );
  });

  it('does not promote a CSR-11 fallback decision into rollout authority', () => {
    const bundle = makeBundle();
    const sourceUnit = bundle.units[0]!;
    const candidate = {
      schemaVersion: CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
      characterId: CHARACTER_ID,
      sourceUnitRefs: [sourceUnit.unitId],
      text: '반드시 큰 성공을 거둡니다.',
    };
    const candidateHash = hashCharacterSajuSp2CandidateV1(candidate);
    const rejected = guardCharacterSajuSp2EvaluationCandidateV1({
      candidate,
      groundingUnit: sourceUnit,
      characterProfileRef: profileRef(),
      evaluatorVerdict: {
        schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
        evaluatorVersion: EVALUATOR_VERSION,
        candidateHash,
        unitId: sourceUnit.unitId,
        semanticPreserved: false,
        characterFidelityPreserved: true,
        failureClasses: ['ADDED_CLAIM'],
      },
      expectedEvaluatorVersion: EVALUATOR_VERSION,
    });

    const result = authorize({ evaluationDecision: rejected });
    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain(
      'EVALUATION_NOT_ACCEPTED',
    );
  });

  it('re-admits the source grounding at rollout time instead of trusting candidate lineage alone', () => {
    const bundle = makeBundle();
    const forged = { ...bundle, groundingHash: 'f'.repeat(64) };
    const result = authorize({ grounding: forged });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('identity_check_failed');
    expect(result.failures.map((item) => item.code)).toContain(
      'GROUNDING_IDENTITY_MISMATCH',
    );
  });

  it('fails closed on stale Character perspective identity', () => {
    const result = authorize({
      characterProfileRef: {
        ...profileRef(),
        sourceContentVersion: 'stale-content-v0',
      },
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain(
      'PROFILE_IDENTITY_MISMATCH',
    );
  });

  it('runs the existing Output Guard after semantic evaluation and rejects unsafe renderer output', () => {
    const result = authorize({
      safeRendererOutput: safeRendererOutput({
        framingBefore: 'provider-authored free Saju framing',
      }),
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('output_guard_failed');
    expect(result.failures.map((item) => item.code)).toContain(
      'OUTPUT_GUARD_FAILED',
    );
  });

  it('rejects malformed controlled rollout policy instead of guessing defaults', () => {
    const result = authorize({
      rolloutPolicy: {
        ...policy(),
        unexpectedAuthority: true,
      },
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain(
      'ROLLOUT_POLICY_INVALID',
    );
  });

  it('is deterministic for identical rollout authority inputs', () => {
    const first = authorize();
    const second = authorize();
    expect(first).toEqual(second);
    if (
      first.mode !== 'controlled_reveal_candidate' ||
      second.mode !== 'controlled_reveal_candidate'
    ) {
      throw new Error('expected controlled reveal candidates');
    }
    expect(first.artifactCandidate.artifactId).toBe(
      second.artifactCandidate.artifactId,
    );
  });
});
