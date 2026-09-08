import { describe, expect, it } from 'vitest';
import type {
  CharacterContentBundle,
  CharacterContentDefinition,
} from '../packages/character-content/src/index.js';
import {
  buildProductionCharacterContentManifest,
  MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES,
  MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE,
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

function authoredCharacter(
  characterId: string,
  displayName: string,
): CharacterContentDefinition {
  return {
    characterId,
    contentVersion: CONTENT_VERSION,
    displayName,
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
    assetRefs: [`fixture://character/${characterId}/concept-art`],
    emotionIds: ['neutral'],
    animationCueIds: ['idle'],
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
  characters: MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES.map((displayName, index) =>
    authoredCharacter(`test-character-${index + 1}`, displayName),
  ),
} satisfies CharacterContentBundle;

const DEVELOPMENT_PLACEHOLDER_LAUNCH_BUNDLE = {
  ...DEV_CHARACTER_CONTENT_BUNDLE,
  characters: MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES.map((displayName, index) => {
    const template = DEV_CHARACTER_CONTENT_BUNDLE.characters[
      index % DEV_CHARACTER_CONTENT_BUNDLE.characters.length
    ];
    if (template === undefined) throw new Error('development fixture requires a Character');
    return {
      ...template,
      characterId: `development-placeholder-${index + 1}`,
      displayName,
    };
  }),
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
  it('rejects development placeholders even when the exact approved launch identity roster is present', () => {
    expect(DEVELOPMENT_PLACEHOLDER_LAUNCH_BUNDLE.characters).toHaveLength(
      MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE,
    );
    expectProductionFailureCode(
      DEVELOPMENT_PLACEHOLDER_LAUNCH_BUNDLE,
      'DEVELOPMENT_PLACEHOLDER_FORBIDDEN',
    );
  });

  it('rejects a roster whose cardinality differs from the exact approved Production launch roster', () => {
    const wrongCardinality = {
      ...AUTHORED_PRODUCTION_TEST_BUNDLE,
      characters: AUTHORED_PRODUCTION_TEST_BUNDLE.characters.slice(
        0,
        MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE - 1,
      ),
    } satisfies CharacterContentBundle;

    expectProductionFailureCode(wrongCardinality, 'PRODUCTION_ROSTER_COUNT_MISMATCH');
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

  it('rejects Production publication while concrete asset refs are absent', () => {
    const [first, ...rest] = AUTHORED_PRODUCTION_TEST_BUNDLE.characters;
    if (first === undefined) throw new Error('test fixture requires a first character');
    const missingAssetRefs = {
      ...AUTHORED_PRODUCTION_TEST_BUNDLE,
      characters: [{ ...first, assetRefs: [] }, ...rest],
    } satisfies CharacterContentBundle;

    expectProductionFailureCode(
      missingAssetRefs,
      'CHARACTER_ASSET_REFS_REQUIRED',
    );
  });

  it('rejects Production publication while animation cue IDs are absent', () => {
    const [first, ...rest] = AUTHORED_PRODUCTION_TEST_BUNDLE.characters;
    if (first === undefined) throw new Error('test fixture requires a first character');
    const missingAnimationCueIds = {
      ...AUTHORED_PRODUCTION_TEST_BUNDLE,
      characters: [{ ...first, animationCueIds: [] }, ...rest],
    } satisfies CharacterContentBundle;

    expectProductionFailureCode(
      missingAnimationCueIds,
      'CHARACTER_ANIMATION_CUE_IDS_REQUIRED',
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
    expect(first.characterIds).toEqual(
      MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES.map(
        (_, index) => `test-character-${index + 1}`,
      ),
    );
    expect(first.contentHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
  });
});
