import { describe, expect, it } from 'vitest';

import type {
  CharacterContentBundle,
  CharacterContentDefinition,
} from './schema.js';
import {
  buildProductionCharacterPublicationLaneManifestV1,
  ProductionCharacterPublicationLaneValidationErrorV1,
  validateProductionCharacterPublicationLaneBundleV1,
} from './production-character-lane-v1.js';
import {
  ProductionCharacterContentValidationError,
  validateProductionCharacterContentBundle,
} from './production.js';

const CONTENT_VERSION = 'fixture-seyeon-lane-v1';

function relationshipMode() {
  return {
    distance: 'baseline',
    questionDepth: 'baseline',
    selfDisclosure: 'baseline',
    humorIntensity: 'baseline',
    directness: 'baseline',
    memoryReferenceFrequency: 'baseline',
    nicknameBehavior: 'baseline',
    conflictSensitivity: 'baseline',
  } as const;
}

function authoredCharacter(
  overrides: Partial<CharacterContentDefinition> = {},
): CharacterContentDefinition {
  return {
    characterId: 'seyeon',
    contentVersion: CONTENT_VERSION,
    displayName: '세연',
    gender: 'female',
    deityProxyLabel: '결의 대리자',
    shortDescriptor: 'fixture source-complete Character lane',
    personalityTraits: ['deliberate'],
    flaws: ['over-retention'],
    values: ['agency'],
    speech: {
      register: 'measured',
      sentenceRhythm: 'steady',
      directness: 'medium',
      warmth: 'medium',
      profanity: 'none',
      forbiddenBehaviors: ['alter_saju_semantics'],
    },
    capabilities: [
      {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'fixture-capability-v1',
      },
    ],
    assetRefs: ['fixture://character/seyeon/portrait'],
    emotionIds: ['neutral'],
    animationCueIds: ['idle'],
    canon: {
      worldRole: 'fixture role',
      origin: 'fixture origin',
      apparentAgeBand: 'adult',
      deityBond: {
        deityId: 'deity_gyeol',
        representationRole: 'fixture representative',
        oath: 'preserve boundaries',
        acceptedDoctrine: ['agency'],
        resistedDoctrine: ['fatalism'],
      },
      worldview: {
        coreValues: ['agency'],
        humanTheory: 'people retain agency',
        agencyTheory: 'choices remain meaningful',
        truthTheory: 'claims require evidence',
      },
      psychology: {
        desire: 'clarity',
        fear: 'false certainty',
        flaw: 'over-analysis',
        contradiction: 'holds context while permitting change',
        hiddenMotivation: 'protect agency',
      },
    },
    visual: {
      visualVersion: 'visual-v1',
      visualDirection: 'fixture visual direction',
      silhouette: 'fixture silhouette',
      palette: ['fixture-neutral'],
      motifs: ['fixture-motif'],
      costumeDirection: 'fixture costume',
      prohibitedTropes: ['fixture-cliche'],
    },
    persona: {
      communication: {
        register: 'measured',
        sentenceRhythm: 'steady',
        verbosity: 'medium',
        humorStyle: 'dry',
        metaphorStyle: 'sparse',
        profanityIntensity: 'none',
        politenessStyle: 'respectful',
      },
      cognition: {
        thinkingTempo: 'deliberate',
        ambiguityTolerance: 'high',
        conclusionStyle: 'qualified',
        contradictionSensitivity: 'high',
      },
      questioning: {
        preferredStrategies: ['clarify'],
        avoidedStrategies: [],
        followUpDepth: 'medium',
      },
      emotion: {
        expressiveness: 'medium',
        empathyStyle: 'reflective',
        angerStyle: 'contained',
        embarrassmentStyle: 'reserved',
      },
      conflict: {
        confrontationStyle: 'direct',
        apologyStyle: 'specific',
        withdrawalStyle: 'temporary',
      },
      intimacy: {
        pace: 'gradual',
        selfDisclosure: 'bounded',
        boundaryStyle: 'explicit',
        attachmentExpression: 'consistent',
      },
    },
    behavior: {
      policyVersion: 'fixture-behavior-v1',
      questionPriorities: ['clarify'],
      supportPriorities: ['reflect'],
      rules: [
        {
          ruleKey: 'clarify-before-claim',
          triggerKey: 'ambiguous-input',
          priority: 100,
          preferredResponse: 'ask for context',
          avoid: ['invent facts'],
        },
      ],
    },
    sajuProfile: {
      profileVersion: 'fixture-saju-v1',
      attentionAxes: ['structure'],
      followUpQuestionStrategies: ['clarify'],
      framingStyle: 'bounded',
      uncertaintyResponseStyle: 'explicit',
      insufficientEvidenceResponseStyle: 'ask',
      referralBehavior: {
        maySuggestAnotherCharacter: false,
        conditions: [],
      },
    },
    relationshipBehavior: {
      behaviorVersion: 'fixture-relationship-v1',
      defaultMode: relationshipMode(),
      rules: [
        {
          ruleKey: 'stranger-baseline',
          priority: 100,
          when: { stageKeys: ['stranger'] },
          mode: relationshipMode(),
        },
      ],
    },
    ...overrides,
  };
}

function bundle(
  characters: readonly CharacterContentDefinition[] = [authoredCharacter()],
): CharacterContentBundle {
  return {
    bundleId: 'fixture-seyeon-lane-bundle-v1',
    contentVersion: CONTENT_VERSION,
    assetManifestHash:
      'sha256:v1:4345e9deb0393f0beabfa4e22ae039a00a2860d6d240a7a90d0b420d29eb1ec1',
    cueSchemaVersion: 'fixture-cue-v1',
    minClientCapability: 'fixture-client-v1',
    characters,
  };
}

function expectLaneCode(
  candidate: CharacterContentBundle,
  code: ProductionCharacterPublicationLaneValidationErrorV1['code'],
): void {
  try {
    validateProductionCharacterPublicationLaneBundleV1(candidate);
    throw new Error('expected Character lane validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(
      ProductionCharacterPublicationLaneValidationErrorV1,
    );
    expect(
      (error as ProductionCharacterPublicationLaneValidationErrorV1).code,
    ).toBe(code);
  }
}

describe('parallel Production Character publication lane v1', () => {
  it('accepts one fully authored approved Character without requiring the other eight', () => {
    const candidate = bundle();

    expect(
      validateProductionCharacterPublicationLaneBundleV1(candidate),
    ).toBe(candidate);

    const manifest =
      buildProductionCharacterPublicationLaneManifestV1(candidate);
    expect(manifest.characterId).toBe('seyeon');
    expect(manifest.displayName).toBe('세연');
    expect(manifest.characterIds).toEqual(['seyeon']);
    expect(manifest.contentHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
  });

  it('keeps the existing exact-nine aggregate Launch gate unchanged', () => {
    try {
      validateProductionCharacterContentBundle(bundle());
      throw new Error('expected exact-nine Production validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(
        ProductionCharacterContentValidationError,
      );
      expect(
        (error as ProductionCharacterContentValidationError).code,
      ).toBe('PRODUCTION_ROSTER_COUNT_MISMATCH');
    }
  });

  it('rejects more than one Character in a single independent lane', () => {
    expectLaneCode(
      bundle([
        authoredCharacter(),
        authoredCharacter({
          characterId: 'yeoul',
          displayName: '여울',
        }),
      ]),
      'CHARACTER_LANE_EXACTLY_ONE_CHARACTER_REQUIRED',
    );
  });

  it('rejects an identity outside approved immutable authoring', () => {
    expectLaneCode(
      bundle([
        authoredCharacter({
          characterId: 'not-approved',
          displayName: '세연',
        }),
      ]),
      'CHARACTER_LANE_CHARACTER_ID_NOT_APPROVED',
    );
  });

  it('rejects a display name that does not match the approved Character identity', () => {
    expectLaneCode(
      bundle([
        authoredCharacter({
          displayName: '세연-대체',
        }),
      ]),
      'CHARACTER_LANE_DISPLAY_NAME_MISMATCH',
    );
  });
});
