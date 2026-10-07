import { describe, expect, it } from 'vitest';

import {
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
  CharacterFaceGovernedInterpretationAdmissionErrorV1,
  admitCharacterFaceGovernedInterpretationHandoffV1,
  buildCharacterFaceProtectedInterpretationSegmentsV1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  selectCharacterFaceGovernedInterpretationsV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
} from './character-face-governed-interpretation.js';

const expectedSource: CharacterFaceGovernedInterpretationSourceBindingV1 =
  Object.freeze({
    sourceContractVersion: 'face-product-interpretation-v1',
    sourceAuthorityRef: 'face-authority:product-reading:2026-10-07',
    sourceResultHash: 'face-result:abc123',
    topicKey: 'face.discover.extended',
  });

const requiredProhibitions = Object.freeze([
  ...CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1,
].sort());

function unit(overrides: Record<string, unknown> = {}) {
  return {
    interpretationId: 'interpretation:wealth:1',
    lensKey: 'wealth',
    direction: 'favorable',
    evidenceStatus: 'direct_evidence',
    protectedMeaningText: '코 쪽에서는 재물 흐름을 좋게 보는 직접 근거가 잡혀요.',
    observationRefs: ['observation:nose:1'],
    bindingRefs: ['binding:nose:wealth:1'],
    evidenceRefs: ['evidence:traditional:wealth:1'],
    sourceRefs: ['source:scan:1'],
    conditions: [],
    qualifiers: ['historical_traditional_reading'],
    prohibitedExtensions: requiredProhibitions,
    ...overrides,
  };
}

function candidate(
  units: readonly Record<string, unknown>[] = [
    unit(),
    unit({
      interpretationId: 'interpretation:relations:1',
      lensKey: 'interpersonal_relations',
      direction: 'source_conflict',
      evidenceStatus: 'source_conflict',
      protectedMeaningText:
        '눈 쪽 대인관계는 좋은 근거와 주의해서 볼 근거가 함께 잡혀요.',
      observationRefs: ['observation:eye:1'],
      bindingRefs: ['binding:eye:relations:1'],
      evidenceRefs: [
        'evidence:traditional:relations:challenging',
        'evidence:traditional:relations:favorable',
      ],
      sourceRefs: ['source:scan:2'],
      conditions: ['same_lens_opposing_direct_evidence'],
    }),
  ],
) {
  const withoutHash = {
    schemaVersion:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
    sourceContractVersion: expectedSource.sourceContractVersion,
    sourceAuthorityRef: expectedSource.sourceAuthorityRef,
    sourceResultHash: expectedSource.sourceResultHash,
    topicKey: expectedSource.topicKey,
    authorizationState:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
    authorizationScope:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
    authorizationReceiptRef: 'authorization:face-reading:1',
    units,
  };

  return {
    ...withoutHash,
    handoffHash:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1 +
      hashCharacterFaceGovernedInterpretationMaterialV1(withoutHash),
  };
}

describe('Character Face governed interpretation handoff V1', () => {
  it('admits only a trusted product-authorized interpretation handoff', () => {
    const admitted = admitCharacterFaceGovernedInterpretationHandoffV1({
      candidate: candidate(),
      expectedSource,
    });

    expect(admitted.authorizationState).toBe('product_authorized');
    expect(admitted.authorizationScope).toBe('character_public_reading');
    expect(admitted.units).toHaveLength(2);
    expect(admitted.units[0]?.lensKey).toBe('wealth');
    expect(admitted.units[1]?.direction).toBe('source_conflict');
  });

  it('rejects research-only or caller-shaped output that has no product authorization contract', () => {
    expect(() =>
      admitCharacterFaceGovernedInterpretationHandoffV1({
        candidate: {
          contractVersion: 'fr311o-v1',
          productPredictionAuthorized: false,
          evidenceSections: {},
        },
        expectedSource,
      }),
    ).toThrow(CharacterFaceGovernedInterpretationAdmissionErrorV1);
  });

  it('rejects a handoff that self-asserts another upstream authority', () => {
    const forged = {
      ...candidate(),
      sourceAuthorityRef: 'caller:forged-authority',
    };

    expect(() =>
      admitCharacterFaceGovernedInterpretationHandoffV1({
        candidate: forged,
        expectedSource,
      }),
    ).toThrow(/trusted upstream binding/);
  });

  it('rejects removal of a required semantic prohibition', () => {
    const weakened = unit({
      prohibitedExtensions: requiredProhibitions.filter(
        (value) => value !== 'no_topic_remapping',
      ),
    });

    expect(() =>
      admitCharacterFaceGovernedInterpretationHandoffV1({
        candidate: candidate([weakened]),
        expectedSource,
      }),
    ).toThrow(/removed required prohibition/);
  });

  it('rejects handoff hash tampering', () => {
    const forged = {
      ...candidate(),
      handoffHash:
        CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1 +
        '0'.repeat(64),
    };

    expect(() =>
      admitCharacterFaceGovernedInterpretationHandoffV1({
        candidate: forged,
        expectedSource,
      }),
    ).toThrow(/hash does not match/);
  });

  it('keeps conflict direction and evidence status aligned', () => {
    const invalid = unit({
      direction: 'source_conflict',
      evidenceStatus: 'direct_evidence',
    });

    expect(() =>
      admitCharacterFaceGovernedInterpretationHandoffV1({
        candidate: candidate([invalid]),
        expectedSource,
      }),
    ).toThrow(/source_conflict direction and evidenceStatus aligned/);
  });

  it('selects only existing governed lenses and preserves protected meaning exactly', () => {
    const admitted = admitCharacterFaceGovernedInterpretationHandoffV1({
      candidate: candidate(),
      expectedSource,
    });

    const selection = selectCharacterFaceGovernedInterpretationsV1({
      handoff: admitted,
      preferredLensOrder: ['interpersonal_relations', 'wealth', 'career'],
      maxUnits: 2,
    });

    expect(selection.orderedInterpretationIds).toEqual([
      'interpretation:relations:1',
      'interpretation:wealth:1',
    ]);
    expect(selection.selectedLensKeys).toEqual([
      'interpersonal_relations',
      'wealth',
    ]);
    expect(selection.unavailablePreferredLensKeys).toEqual(['career']);

    const segments = buildCharacterFaceProtectedInterpretationSegmentsV1({
      handoff: admitted,
      selection,
    });

    expect(segments.map((segment) => segment.text)).toEqual([
      '눈 쪽 대인관계는 좋은 근거와 주의해서 볼 근거가 함께 잡혀요.',
      '코 쪽에서는 재물 흐름을 좋게 보는 직접 근거가 잡혀요.',
    ]);
    expect(segments[0]?.direction).toBe('source_conflict');
    expect(segments[0]?.conditions).toEqual([
      'same_lens_opposing_direct_evidence',
    ]);
  });
});
