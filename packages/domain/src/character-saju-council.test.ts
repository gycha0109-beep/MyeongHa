import { describe, expect, it } from 'vitest';

import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  type CharacterRuntimeContextWithGroundingV1,
} from './character-saju-grounding-admission.js';
import {
  CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
  type CharacterPerspectiveGroundingAxisKeyV1,
  type CharacterPerspectiveProfileV1,
} from './character-saju-perspective.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterGroundingUnitViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import {
  directCharacterSajuCouncilV1,
  guardCharacterSajuCouncilConsistencyV1,
  type CharacterSajuCouncilTranscriptV1,
} from './character-saju-council.js';

const SOURCE_HASH = 'a'.repeat(64);

function unitId(hex: string): string {
  return `grounding_unit_${hex.repeat(24)}`;
}

function makeUnit(
  hex: string,
  axis: CharacterPerspectiveGroundingAxisKeyV1,
  overrides: Partial<CharacterGroundingUnitViewV1> = {},
): CharacterGroundingUnitViewV1 {
  return {
    unitId: unitId(hex),
    domain: 'general',
    axis,
    narrativeRole: 'primary',
    semanticKey: `semantic-${hex}`,
    canonicalMeaning: `source canonical meaning ${hex}`,
    sourceBlockRefs: [`sections.0.blocks.${hex}`],
    requiredCompanionUnitRefs: [],
    requiredDisclosureRefs: [],
    realizationPolicyRef: 'bounded_semantic_paraphrase_v1',
    ...overrides,
  };
}

function makeBundle(input: {
  readonly units: readonly CharacterGroundingUnitViewV1[];
  readonly disclosures?: CharacterSajuGroundingBundleViewV1['disclosures'];
}): CharacterSajuGroundingBundleViewV1 {
  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: 'reading-council-001',
    productResponseVersion: 'product-reading-response-v1',
    engineVersion: 'saju-engine-v1',
    readingDomain: 'general' as const,
    sourceResponseHash: SOURCE_HASH,
    units: input.units,
    disclosures: input.disclosures ?? [],
    ambiguities: [],
  };
  return {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
}

function makeContext(
  characterId: string,
  bundle: CharacterSajuGroundingBundleViewV1,
  authoredAxis: string,
): CharacterRuntimeContextWithGroundingV1 {
  const speech = {
    register: `${characterId} register`,
    sentenceRhythm: 'fixture rhythm',
    directness: 'medium',
    warmth: 'medium',
    profanity: 'none',
    forbiddenBehaviors: [],
  } as const;
  const communication = {
    register: `${characterId} register`,
    sentenceRhythm: 'fixture rhythm',
    verbosity: 'medium',
    humorStyle: 'none',
    metaphorStyle: 'none',
    profanityIntensity: 'none',
    politenessStyle: 'respectful',
  } as const;

  return {
    schemaVersion: 'v1',
    characterId,
    contentBundleId: 'fixture-bundle-v1',
    contentVersion: 'fixture-content-v1',
    speech,
    voiceAuthority: {
      characterId,
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
      attentionAxes: [authoredAxis],
      followUpQuestionStrategies: ['authored_strategy'],
      safeFraming: {
        schemaVersion: 'v1',
        catalogVersion: 'fixture-safe-framing-v1',
        before: [
          {
            key: 'fixture_record_transition',
            text: 'fixture record transition',
            purpose: 'record_transition',
          },
          {
            key: 'fixture_current_life_question',
            text: 'fixture current-life question',
            purpose: 'current_life_question',
          },
        ],
        after: [
          {
            key: 'fixture_uncertainty_transition',
            text: 'fixture uncertainty transition',
            purpose: 'uncertainty_transition',
          },
          {
            key: 'fixture_relationship_transition',
            text: 'fixture relationship transition',
            purpose: 'relationship_transition',
          },
        ],
      },
    },
    relationship: {
      schemaVersion: 'v1',
      relationshipRevision: 7,
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
    rendererPolicy: { allowedEmotionIds: [], allowedAnimationCueIds: [] },
    worldRelations: [],
    lifeFacts: [],
    memories: [],
    recentMessages: [],
    saju: {
      readingRef: bundle.readingRef,
      domain: 'general',
      coverageState: 'complete',
      protectedSegments: [],
      disclosures: [],
      ambiguity: [],
      capability: {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'fixture-capability-v1',
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

function makePerspective(
  characterId: string,
  authoredAxis: string,
  groundingAxis: CharacterPerspectiveGroundingAxisKeyV1,
): CharacterPerspectiveProfileV1 {
  return {
    schemaVersion: CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion: `fixture-perspective-${characterId}-v1`,
    characterId,
    sourceContentVersion: 'fixture-content-v1',
    sourceSajuProfileVersion: 'fixture-saju-profile-v1',
    groundingAxisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    attentionBindings: [{ authoredAttentionAxis: authoredAxis, groundingAxis }],
    attentionOrder: [groundingAxis],
    preferredNarrativeRoles: ['primary'],
    selection: {
      maxPrimaryUnits: 1,
      maxSupportingUnits: 0,
      maxTensionUnits: 0,
      maxLimitationUnits: 0,
      avoidSameAxisRepetition: true,
    },
    interpretationBehavior: {
      contradictionHandling: 'lead_with_it',
      uncertaintyHandling: 'state_directly',
      adviceStyle: 'action_first',
    },
    deliveryAuthority: {
      speech: 'published_character_speech',
      communication: 'published_character_persona_communication',
      relationship: 'active_relationship_projection',
    },
  };
}

function participant(
  characterId: string,
  authoredAxis: string,
  groundingAxis: CharacterPerspectiveGroundingAxisKeyV1,
  bundle: CharacterSajuGroundingBundleViewV1,
) {
  return {
    context: makeContext(characterId, bundle, authoredAxis),
    perspective: makePerspective(characterId, authoredAxis, groundingAxis),
  };
}

describe('finite Character Saju Council v1', () => {
  it('uses one shared grounding identity and returns only output-guard-pending transcript material', () => {
    const bundle = makeBundle({
      units: [
        makeUnit('1', 'responsibility'),
        makeUnit('2', 'timing'),
        makeUnit('3', 'boundary'),
      ],
    });
    const result = directCharacterSajuCouncilV1({
      participants: [
        participant('taegyeom', 'responsibility', 'responsibility', bundle),
        participant('baekheon', 'long_cycle', 'timing', bundle),
      ],
      grounding: bundle,
      requestedDomain: 'general',
      maxTurns: 3,
    });

    expect(result.mode).toBe('council');
    if (result.mode !== 'council') throw new Error('expected Council result');
    expect(result.transcript.readingRef).toBe(bundle.readingRef);
    expect(result.transcript.groundingHash).toBe(bundle.groundingHash);
    expect(result.transcript.turns).toHaveLength(2);
    expect(result.transcript.revealState).toBe('requires_existing_output_guard');
    expect(result.consistencyEvidence).toEqual(
      expect.objectContaining({
        sameReadingRef: true,
        sameGroundingHash: true,
        noPerCharacterRecalculation: true,
        finiteTurns: true,
        semanticTraceComplete: true,
        requiresExistingOutputGuard: true,
      }),
    );

    for (const turn of result.transcript.turns) {
      for (const segment of turn.utterance.segments) {
        if (segment.kind !== 'semantic_realization') continue;
        expect(segment.sourceUnitRefs).toHaveLength(1);
        const source = bundle.units.find((unit) => unit.unitId === segment.sourceUnitRefs[0]);
        expect(source).toBeDefined();
        expect(segment.text).toBe(source?.canonicalMeaning);
      }
    }
  });

  it('keeps the lead fixed and prioritizes a later Character with uncovered source units', () => {
    const bundle = makeBundle({
      units: [
        makeUnit('1', 'responsibility'),
        makeUnit('2', 'timing'),
      ],
    });
    const result = directCharacterSajuCouncilV1({
      participants: [
        participant('lead', 'responsibility', 'responsibility', bundle),
        participant('repeat', 'responsibility', 'responsibility', bundle),
        participant('novel', 'long_cycle', 'timing', bundle),
      ],
      grounding: bundle,
      requestedDomain: 'general',
      maxTurns: 3,
    });

    expect(result.mode).toBe('council');
    if (result.mode !== 'council') throw new Error('expected Council result');
    expect(result.transcript.participantCharacterIds).toEqual(['lead', 'novel', 'repeat']);
    expect(result.transcript.turns[0]?.noveltyUnitIds).toEqual([unitId('1')]);
    expect(result.transcript.turns[1]?.noveltyUnitIds).toEqual([unitId('2')]);
    expect(result.transcript.turns[2]?.repeatedUnitIds).toEqual([unitId('1')]);
  });

  it('enforces 2-3 participants and a finite 3-5 max-turn bound', () => {
    const bundle = makeBundle({ units: [makeUnit('1', 'responsibility')] });
    const one = participant('only', 'responsibility', 'responsibility', bundle);

    expect(() =>
      directCharacterSajuCouncilV1({
        participants: [one],
        grounding: bundle,
        requestedDomain: 'general',
        maxTurns: 3,
      }),
    ).toThrow(/2 or 3/u);

    expect(() =>
      directCharacterSajuCouncilV1({
        participants: [
          one,
          participant('second', 'responsibility', 'responsibility', bundle),
        ],
        grounding: bundle,
        requestedDomain: 'general',
        maxTurns: 6,
      }),
    ).toThrow(/between 3 and 5/u);
  });

  it('rejects mixed grounding identity instead of permitting per-Character recalculation', () => {
    const bundle = makeBundle({ units: [makeUnit('1', 'responsibility')] });
    const other = {
      ...makeBundle({ units: [makeUnit('2', 'timing')] }),
      readingRef: 'reading-council-002',
    };
    const otherRehashed = {
      ...other,
      groundingHash: hashCharacterSajuGroundingBundleMaterialV1({
        schemaVersion: other.schemaVersion,
        groundingProjectionVersion: other.groundingProjectionVersion,
        axisRegistryVersion: other.axisRegistryVersion,
        readingRef: other.readingRef,
        productResponseVersion: other.productResponseVersion,
        engineVersion: other.engineVersion,
        readingDomain: other.readingDomain,
        sourceResponseHash: other.sourceResponseHash,
        units: other.units,
        disclosures: other.disclosures,
        ambiguities: other.ambiguities,
      }),
    };

    expect(() =>
      directCharacterSajuCouncilV1({
        participants: [
          participant('one', 'responsibility', 'responsibility', bundle),
          participant('two', 'long_cycle', 'timing', otherRehashed),
        ],
        grounding: bundle,
        requestedDomain: 'general',
        maxTurns: 3,
      }),
    ).toThrow(/same admitted Saju grounding identity/u);
  });

  it('falls back when any selected unit requires protected-only rendering', () => {
    const bundle = makeBundle({
      units: [
        makeUnit('1', 'responsibility', {
          realizationPolicyRef: 'protected_only_v1',
        }),
      ],
    });
    const result = directCharacterSajuCouncilV1({
      participants: [
        participant('one', 'responsibility', 'responsibility', bundle),
        participant('two', 'responsibility', 'responsibility', bundle),
      ],
      grounding: bundle,
      requestedDomain: 'general',
      maxTurns: 3,
    });

    expect(result).toEqual(
      expect.objectContaining({
        mode: 'protected_fallback',
        reason: 'participant_protected_fallback',
      }),
    );
  });

  it('detects transcript-level semantic divergence after individual turn validation', () => {
    const bundle = makeBundle({
      units: [
        makeUnit('1', 'responsibility'),
        makeUnit('2', 'timing'),
      ],
    });
    const result = directCharacterSajuCouncilV1({
      participants: [
        participant('one', 'responsibility', 'responsibility', bundle),
        participant('two', 'long_cycle', 'timing', bundle),
      ],
      grounding: bundle,
      requestedDomain: 'general',
      maxTurns: 3,
    });
    if (result.mode !== 'council') throw new Error('expected Council result');

    const turns = result.transcript.turns.map((turn, index) =>
      index !== 1
        ? turn
        : {
            ...turn,
            utterance: {
              ...turn.utterance,
              segments: turn.utterance.segments.map((segment) =>
                segment.kind === 'semantic_realization'
                  ? { ...segment, text: 'invented contradictory meaning' }
                  : segment,
              ),
            },
          },
    );
    const transcript = {
      ...result.transcript,
      turns,
    } as CharacterSajuCouncilTranscriptV1;
    const checked = guardCharacterSajuCouncilConsistencyV1({
      transcript,
      grounding: bundle,
    });

    expect(checked.failures.map((item) => item.code)).toContain(
      'CROSS_TURN_SEMANTIC_CONTRADICTION',
    );
  });

  it('detects removal of a disclosure required by a rendered source unit', () => {
    const disclosureRef = 'grounding_disclosure_council';
    const bundle = makeBundle({
      units: [
        makeUnit('1', 'responsibility', {
          requiredDisclosureRefs: [disclosureRef],
        }),
      ],
      disclosures: [
        {
          disclosureRef,
          type: 'scope_limitation',
          text: 'source disclosure text',
          sourceDisclosureIndex: 0,
        },
      ],
    });
    const result = directCharacterSajuCouncilV1({
      participants: [
        participant('one', 'responsibility', 'responsibility', bundle),
        participant('two', 'responsibility', 'responsibility', bundle),
      ],
      grounding: bundle,
      requestedDomain: 'general',
      maxTurns: 3,
    });
    if (result.mode !== 'council') throw new Error('expected Council result');

    const first = result.transcript.turns[0]!;
    const turns = [
      {
        ...first,
        utterance: {
          ...first.utterance,
          segments: first.utterance.segments.filter(
            (segment) => segment.kind !== 'protected_disclosure',
          ),
        },
      },
      ...result.transcript.turns.slice(1),
    ];
    const checked = guardCharacterSajuCouncilConsistencyV1({
      transcript: { ...result.transcript, turns } as CharacterSajuCouncilTranscriptV1,
      grounding: bundle,
    });

    expect(checked.failures.map((item) => item.code)).toContain(
      'REQUIRED_DISCLOSURE_MISSING',
    );
  });

  it('is deterministic for the same participants, grounding, domain, and turn bound', () => {
    const bundle = makeBundle({
      units: [
        makeUnit('1', 'responsibility'),
        makeUnit('2', 'timing'),
      ],
    });
    const input = {
      participants: [
        participant('one', 'responsibility', 'responsibility', bundle),
        participant('two', 'long_cycle', 'timing', bundle),
      ],
      grounding: bundle,
      requestedDomain: 'general' as const,
      maxTurns: 3,
    };

    expect(directCharacterSajuCouncilV1(input)).toEqual(
      directCharacterSajuCouncilV1(input),
    );
  });
});
