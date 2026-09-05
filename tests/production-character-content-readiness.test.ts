import { describe, expect, it } from 'vitest';
import type {
  CharacterContentBundle,
  CharacterContentDefinition,
} from '../packages/character-content/src/index.js';
import {
  buildProductionCharacterContentManifest,
  MIN_PRODUCTION_CHARACTER_ROSTER,
  ProductionCharacterContentValidationError,
  validateProductionCharacterContentBundle,
} from '../packages/character-content/src/index.js';
import { DEV_CHARACTER_CONTENT_BUNDLE } from '../packages/test-fixtures/src/dev-content.js';

const CONTENT_VERSION = '1.0.0-test';

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

function authoredCharacter(characterId: string): CharacterContentDefinition {
  return {
    characterId,
    contentVersion: CONTENT_VERSION,
    displayName: `Test ${characterId}`,
    deityProxyLabel: 'authored representative',
    shortDescriptor: 'test-only fully authored production-boundary fixture',
    personalityTraits: ['deliberate'],
    flaws: ['overthinks'],
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
        capabilityVersion: 'test-v1',
      },
    ],
    assetRefs: [],
    emotionIds: ['neutral'],
    animationCueIds: [],
    canon: {
      worldRole: 'test representative',
      origin: 'test fixture only',
      apparentAgeBand: 'adult',
      deityBond: {
        deityId: `deity-${characterId}`,
        representationRole: 'representative',
        oath: 'preserve authority boundaries',
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
        contradiction: 'seeks clarity while tolerating ambiguity',
        hiddenMotivation: 'protect user agency',
      },
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
      policyVersion: 'test-v1',
      questionPriorities: ['clarify'],
      supportPriorities: ['reflect'],
      rules: [
        {
          ruleKey: 'clarify-before-claim',
          triggerKey: 'ambiguous-input',
          priority: 100,
          preferredResponse: 'ask for the missing context',
          avoid: ['invent facts'],
        },
      ],
    },
    sajuProfile: {
      profileVersion: 'test-v1',
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
      behaviorVersion: 'test-v1',
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
  };
}

const AUTHORED_PRODUCTION_TEST_BUNDLE = {
  bundleId: 'production-character-readiness-test-bundle',
  contentVersion: CONTENT_VERSION,
  assetManifestHash: 'test-asset-manifest-hash-v1',
  cueSchemaVersion: 'cue-v1',
  minClientCapability: '1.0.0-test',
  characters: Array.from(
    { length: MIN_PRODUCTION_CHARACTER_ROSTER },
    (_, index) => authoredCharacter(`test-character-${index + 1}`),
  ),
} satisfies CharacterContentBundle;

describe('Production Character content readiness', () => {
  it('rejects the development placeholder roster even when its count reaches the launch minimum', () => {
    expect(DEV_CHARACTER_CONTENT_BUNDLE.characters).toHaveLength(MIN_PRODUCTION_CHARACTER_ROSTER);

    try {
      validateProductionCharacterContentBundle(DEV_CHARACTER_CONTENT_BUNDLE);
      throw new Error('expected Production validation to reject development placeholders');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
      expect((error as ProductionCharacterContentValidationError).code).toBe(
        'DEVELOPMENT_PLACEHOLDER_FORBIDDEN',
      );
    }
  });

  it('rejects a roster smaller than the source-backed Production launch minimum', () => {
    const undersized = {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      characters: DEV_CHARACTER_CONTENT_BUNDLE.characters.slice(
        0,
        MIN_PRODUCTION_CHARACTER_ROSTER - 1,
      ),
    } satisfies CharacterContentBundle;

    try {
      validateProductionCharacterContentBundle(undersized);
      throw new Error('expected Production validation to reject undersized roster');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
      expect((error as ProductionCharacterContentValidationError).code).toBe(
        'PRODUCTION_ROSTER_TOO_SMALL',
      );
    }
  });

  it('rejects Production publication without immutable asset manifest provenance', () => {
    const missingAssetProvenance = {
      ...AUTHORED_PRODUCTION_TEST_BUNDLE,
      assetManifestHash: '   ',
    } satisfies CharacterContentBundle;

    try {
      validateProductionCharacterContentBundle(missingAssetProvenance);
      throw new Error('expected Production validation to reject missing asset provenance');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
      expect((error as ProductionCharacterContentValidationError).code).toBe(
        'ASSET_MANIFEST_HASH_REQUIRED',
      );
    }
  });

  it('builds a deterministic immutable manifest only after the Production boundary passes', () => {
    expect(
      validateProductionCharacterContentBundle(AUTHORED_PRODUCTION_TEST_BUNDLE),
    ).toBe(AUTHORED_PRODUCTION_TEST_BUNDLE);

    const first = buildProductionCharacterContentManifest(
      AUTHORED_PRODUCTION_TEST_BUNDLE,
    );
    const second = buildProductionCharacterContentManifest(
      AUTHORED_PRODUCTION_TEST_BUNDLE,
    );

    expect(first).toEqual(second);
    expect(first.assetManifestHash).toBe(AUTHORED_PRODUCTION_TEST_BUNDLE.assetManifestHash);
    expect(first.characterIds).toEqual([
      'test-character-1',
      'test-character-2',
      'test-character-3',
      'test-character-4',
      'test-character-5',
    ]);
    expect(first.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
