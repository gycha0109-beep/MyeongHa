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
    gender: 'test-only authored gender',
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
    visual: {
      visualVersion: 'test-v1',
      visualDirection: 'test-only visual direction',
      silhouette: 'test-only distinct silhouette',
      palette: ['test-neutral'],
      motifs: ['test-motif'],
      costumeDirection: 'test-only costume direction',
      prohibitedTropes: ['test-cliche'],
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
  assetManifestHash: 'sha256:v1:4345e9deb0393f0beabfa4e22ae039a00a2860d6d240a7a90d0b420d29eb1ec1',
  cueSchemaVersion: 'cue-v1',
  minClientCapability: '1.0.0-test',
  characters: Array.from(
    { length: MIN_PRODUCTION_CHARACTER_ROSTER },
    (_, index) => authoredCharacter(`test-character-${index + 1}`),
  ),
} satisfies CharacterContentBundle;

function expectProductionFailureCode(
  bundle: CharacterContentBundle,
  expectedCode: ProductionCharacterContentValidationError['code'],
): void {
  try {
    validateProductionCharacterContentBundle(bundle);
    throw new Error(`expected Production validation to reject with ${expectedCode}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
    expect((error as ProductionCharacterContentValidationError).code).toBe(expectedCode);
  }
}

describe('Production Character content readiness', () => {
  it('rejects the development placeholder roster even when its count reaches the launch minimum', () => {
    expect(DEV_CHARACTER_CONTENT_BUNDLE.characters).toHaveLength(MIN_PRODUCTION_CHARACTER_ROSTER);
    expectProductionFailureCode(
      DEV_CHARACTER_CONTENT_BUNDLE,
      'DEVELOPMENT_PLACEHOLDER_FORBIDDEN',
    );
  });

  it('rejects a roster smaller than the source-backed Production launch minimum', () => {
    const undersized = {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      characters: DEV_CHARACTER_CONTENT_BUNDLE.characters.slice(
        0,
        MIN_PRODUCTION_CHARACTER_ROSTER - 1,
      ),
    } satisfies CharacterContentBundle;

    expectProductionFailureCode(undersized, 'PRODUCTION_ROSTER_TOO_SMALL');
  });

  it('rejects Production publication without versioned immutable asset manifest provenance', () => {
    const missingAssetProvenance = {
      ...AUTHORED_PRODUCTION_TEST_BUNDLE,
      assetManifestHash: '   ',
    } satisfies CharacterContentBundle;

    expectProductionFailureCode(
      missingAssetProvenance,
      'ASSET_MANIFEST_HASH_REQUIRED',
    );
  });

  it('rejects Production publication when real-roster gender canon is absent', () => {
    const [first, ...rest] = AUTHORED_PRODUCTION_TEST_BUNDLE.characters;
    if (first === undefined) throw new Error('test fixture requires a first character');
    const { gender: _gender, ...withoutGender } = first;
    const missingGender = {
      ...AUTHORED_PRODUCTION_TEST_BUNDLE,
      characters: [withoutGender, ...rest],
    } satisfies CharacterContentBundle;

    expectProductionFailureCode(
      missingGender,
      'CHARACTER_GENDER_CANON_REQUIRED',
    );
  });

  it('rejects Production publication when real-roster visual canon is absent', () => {
    const [first, ...rest] = AUTHORED_PRODUCTION_TEST_BUNDLE.characters;
    if (first === undefined) throw new Error('test fixture requires a first character');
    const { visual: _visual, ...withoutVisual } = first;
    const missingVisual = {
      ...AUTHORED_PRODUCTION_TEST_BUNDLE,
      characters: [withoutVisual, ...rest],
    } satisfies CharacterContentBundle;

    expectProductionFailureCode(
      missingVisual,
      'CHARACTER_VISUAL_CANON_REQUIRED',
    );
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
    expect(first.contentHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
  });
});
