import { describe, expect, it } from 'vitest';

import type { CharacterGroundingUnitViewV1 } from './character-saju-insight-selector.js';
import type { CharacterReadingPerspectiveRefV1 } from './character-saju-reading-plan.js';
import {
  CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
  CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
  MEANING_PRESERVATION_FAILURE_CLASSES_V1,
  evaluateCharacterSajuSp2CorpusV1,
  guardCharacterSajuSp2EvaluationCandidateV1,
  hashCharacterSajuSp2CandidateV1,
  type CharacterSajuEvalCaseV1,
  type CharacterSajuSp2CandidateV1,
  type CharacterSajuSp2EvaluatorVerdictV1,
  type MeaningPreservationFailureClassV1,
} from './character-saju-sp2-evaluation.js';

const EVALUATOR_VERSION = 'fixture-semantic-evaluator-v1';

function unit(
  overrides: Partial<CharacterGroundingUnitViewV1> = {},
): CharacterGroundingUnitViewV1 {
  return {
    unitId: 'grounding_unit_' + '1'.repeat(24),
    domain: 'general',
    axis: 'responsibility',
    narrativeRole: 'primary',
    semanticKey: 'fixture-semantic-key',
    canonicalMeaning:
      '생각과 표현을 실제 결과물로 만들고 그 결과를 실질적 가치와 연결하려는 경향이 있다.',
    sourceBlockRefs: ['sections.0.blocks.0'],
    requiredCompanionUnitRefs: [],
    requiredDisclosureRefs: [],
    realizationPolicyRef: 'bounded_semantic_paraphrase_v1',
    ...overrides,
  };
}

function profileRef(): CharacterReadingPerspectiveRefV1 {
  return {
    characterId: 'taegyeom',
    perspectiveVersion: 'fixture-perspective-v1',
    sourceContentVersion: 'fixture-content-v1',
    sourceSajuProfileVersion: 'fixture-saju-profile-v1',
    profileHash: 'b'.repeat(64),
  };
}

function candidate(
  text: string,
  overrides: Partial<CharacterSajuSp2CandidateV1> = {},
): CharacterSajuSp2CandidateV1 {
  return {
    schemaVersion: CHARACTER_SAJU_SP2_CANDIDATE_SCHEMA_VERSION_V1,
    characterId: 'taegyeom',
    sourceUnitRefs: [unit().unitId],
    text,
    ...overrides,
  };
}

function verdict(input: {
  readonly candidate: CharacterSajuSp2CandidateV1;
  readonly groundingUnit?: CharacterGroundingUnitViewV1;
  readonly semanticPreserved?: boolean;
  readonly characterFidelityPreserved?: boolean;
  readonly failureClasses?: readonly MeaningPreservationFailureClassV1[];
  readonly evaluatorVersion?: string;
  readonly candidateHash?: string;
  readonly unitId?: string;
}): CharacterSajuSp2EvaluatorVerdictV1 {
  const groundingUnit = input.groundingUnit ?? unit();
  return {
    schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
    evaluatorVersion: input.evaluatorVersion ?? EVALUATOR_VERSION,
    candidateHash:
      input.candidateHash ?? hashCharacterSajuSp2CandidateV1(input.candidate),
    unitId: input.unitId ?? groundingUnit.unitId,
    semanticPreserved: input.semanticPreserved ?? true,
    characterFidelityPreserved: input.characterFidelityPreserved ?? true,
    failureClasses: input.failureClasses ?? [],
  };
}

function gate(input: {
  readonly text: string;
  readonly groundingUnit?: CharacterGroundingUnitViewV1;
  readonly evaluatorVerdict?: CharacterSajuSp2EvaluatorVerdictV1;
  readonly candidateOverrides?: Partial<CharacterSajuSp2CandidateV1>;
}) {
  const groundingUnit = input.groundingUnit ?? unit();
  const draft = candidate(input.text, {
    sourceUnitRefs: [groundingUnit.unitId],
    ...input.candidateOverrides,
  });
  const evaluatorVerdict =
    input.evaluatorVerdict ?? verdict({ candidate: draft, groundingUnit });
  return guardCharacterSajuSp2EvaluationCandidateV1({
    candidate: draft,
    groundingUnit,
    characterProfileRef: profileRef(),
    evaluatorVerdict,
    expectedEvaluatorVersion: EVALUATOR_VERSION,
  });
}

describe('Character Saju SP-2 evaluation gate v1', () => {
  it('accepts an evaluator-approved paraphrase only as evaluation material, not runtime reveal authority', () => {
    const result = gate({
      text: '생각에 머무르기보다 결과물로 만들고, 그걸 실제 가치로 이어가려는 쪽입니다.',
    });

    expect(result.mode).toBe('evaluation_accepted');
    if (result.mode !== 'evaluation_accepted') throw new Error('expected evaluation acceptance');
    expect(result.validationState).toBe('sp2_evaluation_validated');
    expect(result.sourceUnitId).toBe(unit().unitId);
    expect(result.revealState).toBe('evaluation_only_not_runtime_authorized');
    expect(result.candidate.sourceUnitRefs).toEqual([unit().unitId]);
  });

  it.each(MEANING_PRESERVATION_FAILURE_CLASSES_V1)(
    'fails closed for governed meaning-preservation failure class %s',
    (failureClass) => {
      const draft = candidate(`forbidden ${failureClass}`);
      const result = gate({
        text: draft.text,
        evaluatorVerdict: verdict({
          candidate: draft,
          semanticPreserved: false,
          characterFidelityPreserved: true,
          failureClasses: [failureClass],
        }),
      });

      expect(result.mode).toBe('protected_fallback');
      if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
      expect(result.reason).toBe('semantic_evaluator_failed');
      expect(result.failures).toContainEqual(
        expect.objectContaining({
          code: 'SEMANTIC_EVALUATION_FAILED',
          failureClasses: [failureClass],
        }),
      );
    },
  );

  it('keeps semantic preservation and Character fidelity as independent required axes', () => {
    const draft = candidate('의미는 보존하지만 캐릭터답지 않은 평문');
    const result = gate({
      text: draft.text,
      evaluatorVerdict: verdict({
        candidate: draft,
        semanticPreserved: true,
        characterFidelityPreserved: false,
      }),
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('character_fidelity_failed');
    expect(result.failures.map((item) => item.code)).toContain(
      'CHARACTER_FIDELITY_FAILED',
    );
  });

  it('rejects evaluator verdict replayed against a different candidate hash', () => {
    const draft = candidate('첫 후보');
    const wrong = candidate('다른 후보');
    const result = gate({
      text: draft.text,
      evaluatorVerdict: verdict({
        candidate: draft,
        candidateHash: hashCharacterSajuSp2CandidateV1(wrong),
      }),
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('candidate_guard_failed');
    expect(result.failures.map((item) => item.code)).toContain(
      'EVALUATOR_IDENTITY_MISMATCH',
    );
  });

  it('rejects evaluator-version and source-unit identity drift', () => {
    const groundingUnit = unit();
    const draft = candidate('후보', { sourceUnitRefs: [groundingUnit.unitId] });

    const wrongEvaluator = guardCharacterSajuSp2EvaluationCandidateV1({
      candidate: draft,
      groundingUnit,
      characterProfileRef: profileRef(),
      evaluatorVerdict: verdict({
        candidate: draft,
        groundingUnit,
        evaluatorVersion: 'other-evaluator-v1',
      }),
      expectedEvaluatorVersion: EVALUATOR_VERSION,
    });
    expect(wrongEvaluator.mode).toBe('protected_fallback');

    const wrongUnit = guardCharacterSajuSp2EvaluationCandidateV1({
      candidate: draft,
      groundingUnit,
      characterProfileRef: profileRef(),
      evaluatorVerdict: verdict({
        candidate: draft,
        groundingUnit,
        unitId: 'grounding_unit_' + '9'.repeat(24),
      }),
      expectedEvaluatorVersion: EVALUATOR_VERSION,
    });
    expect(wrongUnit.mode).toBe('protected_fallback');
    if (wrongUnit.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(wrongUnit.failures.map((item) => item.code)).toContain(
      'EVALUATOR_IDENTITY_MISMATCH',
    );
  });

  it('requires exactly one trace to the evaluated source unit', () => {
    const groundingUnit = unit();
    const base = candidate('trace mismatch', { sourceUnitRefs: [] });
    const result = guardCharacterSajuSp2EvaluationCandidateV1({
      candidate: base,
      groundingUnit,
      characterProfileRef: profileRef(),
      evaluatorVerdict: {},
      expectedEvaluatorVersion: EVALUATOR_VERSION,
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('candidate_guard_failed');
    expect(result.failures.map((item) => item.code)).toContain('SOURCE_TRACE_MISMATCH');
  });

  it('does not allow protected-only units into SP-2 evaluation', () => {
    const protectedUnit = unit({ realizationPolicyRef: 'protected_only_v1' });
    const draft = candidate('should not be paraphrased', {
      sourceUnitRefs: [protectedUnit.unitId],
    });
    const result = guardCharacterSajuSp2EvaluationCandidateV1({
      candidate: draft,
      groundingUnit: protectedUnit,
      characterProfileRef: profileRef(),
      evaluatorVerdict: verdict({ candidate: draft, groundingUnit: protectedUnit }),
      expectedEvaluatorVersion: EVALUATOR_VERSION,
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain('PROTECTED_ONLY_UNIT');
  });

  it('rejects internally contradictory semantic evaluator verdicts', () => {
    const draft = candidate('contradictory verdict');
    const result = gate({
      text: draft.text,
      evaluatorVerdict: verdict({
        candidate: draft,
        semanticPreserved: true,
        failureClasses: ['ADDED_CLAIM'],
      }),
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('candidate_guard_failed');
    expect(result.failures.map((item) => item.code)).toContain(
      'EVALUATOR_IDENTITY_MISMATCH',
    );
  });
});

describe('Character Saju SP-2 evaluation corpus v1', () => {
  function corpusCase(): CharacterSajuEvalCaseV1 {
    const failures = MEANING_PRESERVATION_FAILURE_CLASSES_V1.map(
      (failureClass) => ({
        text: `forbidden::${failureClass}`,
        failureClass,
      }),
    );
    return {
      caseId: 'general-responsibility-taegyeom-v1',
      groundingUnit: unit(),
      characterProfileRef: profileRef(),
      allowedExamples: [
        '생각을 결과물로 만들고 실제 가치로 잇는 쪽에 힘이 실립니다.',
        '머릿속에서 끝내기보다 만들어 내고, 그 결과를 현실의 가치로 연결하려는 흐름입니다.',
      ],
      forbiddenExamples: failures,
    };
  }

  function corpusEvaluator(input: {
    readonly candidate: CharacterSajuSp2CandidateV1;
    readonly candidateHash: string;
    readonly groundingUnit: CharacterGroundingUnitViewV1;
  }): CharacterSajuSp2EvaluatorVerdictV1 {
    const match = MEANING_PRESERVATION_FAILURE_CLASSES_V1.find((failureClass) =>
      input.candidate.text.endsWith(failureClass),
    );
    return {
      schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
      evaluatorVersion: EVALUATOR_VERSION,
      candidateHash: input.candidateHash,
      unitId: input.groundingUnit.unitId,
      semanticPreserved: match === undefined,
      characterFidelityPreserved: true,
      failureClasses: match === undefined ? [] : [match],
    };
  }

  it('runs allowed and forbidden examples through the same identity-bound gate', () => {
    const result = evaluateCharacterSajuSp2CorpusV1({
      cases: [corpusCase()],
      evaluatorVersion: EVALUATOR_VERSION,
      evaluator: corpusEvaluator,
    });

    expect(result.rolloutState).toBe('evaluation_only_not_runtime_authorized');
    expect(result.caseCount).toBe(1);
    expect(result.metrics).toEqual({
      totalExamples: 10,
      allowedExamples: 2,
      forbiddenExamples: 8,
      allowedPasses: 2,
      forbiddenDetections: 8,
      semanticPreservationPassRate: 1,
      characterFidelityPassRate: 1,
      fallbackRate: 0.8,
      unitTraceCoverage: 1,
      corpusPass: true,
    });
    expect(result.results.every((item) => item.expectationMet)).toBe(true);
  });

  it('fails corpus readiness when a forbidden semantic drift is missed', () => {
    const result = evaluateCharacterSajuSp2CorpusV1({
      cases: [corpusCase()],
      evaluatorVersion: EVALUATOR_VERSION,
      evaluator: (input) => ({
        schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
        evaluatorVersion: EVALUATOR_VERSION,
        candidateHash: input.candidateHash,
        unitId: input.groundingUnit.unitId,
        semanticPreserved: true,
        characterFidelityPreserved: true,
        failureClasses: [],
      }),
    });

    expect(result.metrics.corpusPass).toBe(false);
    expect(result.metrics.forbiddenDetections).toBe(0);
    expect(
      result.results.filter((item) => item.expectation === 'forbidden').every(
        (item) => item.expectationMet === false,
      ),
    ).toBe(true);
  });

  it('fails corpus readiness when allowed examples lose Character fidelity', () => {
    const result = evaluateCharacterSajuSp2CorpusV1({
      cases: [corpusCase()],
      evaluatorVersion: EVALUATOR_VERSION,
      evaluator: (input) => {
        const forbidden = MEANING_PRESERVATION_FAILURE_CLASSES_V1.find((failureClass) =>
          input.candidate.text.endsWith(failureClass),
        );
        return {
          schemaVersion: CHARACTER_SAJU_SP2_EVALUATOR_VERDICT_SCHEMA_VERSION_V1,
          evaluatorVersion: EVALUATOR_VERSION,
          candidateHash: input.candidateHash,
          unitId: input.groundingUnit.unitId,
          semanticPreserved: forbidden === undefined,
          characterFidelityPreserved: false,
          failureClasses: forbidden === undefined ? [] : [forbidden],
        };
      },
    });

    expect(result.metrics.corpusPass).toBe(false);
    expect(result.metrics.allowedPasses).toBe(0);
    expect(result.metrics.characterFidelityPassRate).toBe(0);
  });

  it('rejects corpus cases that cannot provide both positive and negative evaluation coverage', () => {
    const base = corpusCase();
    expect(() =>
      evaluateCharacterSajuSp2CorpusV1({
        cases: [{ ...base, forbiddenExamples: [] }],
        evaluatorVersion: EVALUATOR_VERSION,
        evaluator: corpusEvaluator,
      }),
    ).toThrow(/requires allowed and forbidden examples/u);
  });

  it('rejects duplicate corpus case identities and protected-only units', () => {
    const base = corpusCase();
    expect(() =>
      evaluateCharacterSajuSp2CorpusV1({
        cases: [base, base],
        evaluatorVersion: EVALUATOR_VERSION,
        evaluator: corpusEvaluator,
      }),
    ).toThrow(/duplicate caseId/u);

    expect(() =>
      evaluateCharacterSajuSp2CorpusV1({
        cases: [
          {
            ...base,
            caseId: 'protected-only-case',
            groundingUnit: unit({ realizationPolicyRef: 'protected_only_v1' }),
          },
        ],
        evaluatorVersion: EVALUATOR_VERSION,
        evaluator: corpusEvaluator,
      }),
    ).toThrow(/protected-only/u);
  });

  it('is deterministic for the same corpus and evaluator verdicts', () => {
    const input = {
      cases: [corpusCase()],
      evaluatorVersion: EVALUATOR_VERSION,
      evaluator: corpusEvaluator,
    };

    expect(evaluateCharacterSajuSp2CorpusV1(input)).toEqual(
      evaluateCharacterSajuSp2CorpusV1(input),
    );
  });
});
