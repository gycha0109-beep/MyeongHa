import { describe, expect, it } from 'vitest';

import {
  CharacterContentCandidateAssemblyError,
  assembleCharacterContentBundleCandidateV1,
  assembleCharacterPublicationLaneCandidateV1,
  type CharacterCanonCompletionV1,
  type CharacterContentBundleCandidateInputV1,
  type CharacterPublicationLaneCandidateInputV1,
  type CharacterPublicationMaterialInputV1,
} from './content-candidate-assembler-v1.js';
import {
  CHARACTER_IMMUTABLE_AUTHORING_V1,
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
} from './immutable-authoring-v1.js';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from './runtime-authoring-v1.js';
import { validateProductionCharacterPublicationLaneBundleV1 } from './production-character-lane-v1.js';

const canonCompletions: readonly CharacterCanonCompletionV1[] =
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.map((characterId) => ({
    characterId,
    worldview: {
      coreValues: [`fixture-core-value-${characterId}`],
      humanTheory: `fixture human theory for ${characterId}`,
      agencyTheory: `fixture agency theory for ${characterId}`,
      truthTheory: `fixture truth theory for ${characterId}`,
    },
    psychology: {
      desire: `fixture desire for ${characterId}`,
      fear: `fixture fear for ${characterId}`,
      flaw: `fixture flaw for ${characterId}`,
      contradiction: `fixture contradiction for ${characterId}`,
      hiddenMotivation: `fixture hidden motivation for ${characterId}`,
    },
  }));

const publicationMaterials: readonly CharacterPublicationMaterialInputV1[] =
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.map((characterId) => ({
    characterId,
    assetRefs: [`fixture://character/${characterId}/concept-art`],
    emotionIds: ['neutral'],
    animationCueIds: ['idle'],
  }));

function fixtureInput(
  overrides: Partial<CharacterContentBundleCandidateInputV1> = {},
): CharacterContentBundleCandidateInputV1 {
  return {
    metadata: {
      bundleId: 'fixture-character-candidate-v1',
      contentVersion: 'fixture-content-v1',
      assetManifestHash:
        'sha256:v1:4345e9deb0393f0beabfa4e22ae039a00a2860d6d240a7a90d0b420d29eb1ec1',
      cueSchemaVersion: 'fixture-cue-v1',
      minClientCapability: 'fixture-client-v1',
    },
    canonCompletions,
    publicationMaterials,
    ...overrides,
  };
}

function expectAssemblyError(
  input: CharacterContentBundleCandidateInputV1,
  code:
    | 'CANON_COMPLETION_ROSTER_MISMATCH'
    | 'PUBLICATION_MATERIAL_ROSTER_MISMATCH',
): void {
  try {
    assembleCharacterContentBundleCandidateV1(input);
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CharacterContentCandidateAssemblyError);
    expect((error as CharacterContentCandidateAssemblyError).code).toBe(code);
  }
}

describe('Character content candidate assembler v1', () => {
  it('joins immutable and runtime authoring without replacing explicit unresolved inputs', () => {
    const bundle = assembleCharacterContentBundleCandidateV1(fixtureInput());

    expect(bundle.characters).toHaveLength(
      CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.length,
    );
    expect(bundle.characters.map((character) => character.characterId)).toEqual(
      CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
    );

    for (const character of bundle.characters) {
      const immutable = CHARACTER_IMMUTABLE_AUTHORING_V1.find(
        (entry) => entry.characterId === character.characterId,
      );
      const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
        (entry) => entry.characterId === character.characterId,
      );
      const completion = canonCompletions.find(
        (entry) => entry.characterId === character.characterId,
      );
      const material = publicationMaterials.find(
        (entry) => entry.characterId === character.characterId,
      );

      expect(immutable).toBeDefined();
      expect(runtime).toBeDefined();
      expect(completion).toBeDefined();
      expect(material).toBeDefined();

      expect(character.displayName).toBe(immutable?.displayName);
      expect(character.gender).toBe(immutable?.gender);
      expect(character.visual).toEqual(immutable?.visual);
      expect(character.speech).toEqual(runtime?.speech);
      expect(character.persona).toEqual(runtime?.persona);
      expect(character.behavior).toEqual(runtime?.behavior);
      expect(character.sajuProfile).toEqual(runtime?.sajuProfile);
      expect(character.relationshipBehavior).toEqual(
        runtime?.relationshipBehavior,
      );
      expect(character.canon?.worldview).toEqual(completion?.worldview);
      expect(character.canon?.psychology).toEqual(completion?.psychology);
      expect(character.assetRefs).toEqual(material?.assetRefs);
      expect(character.emotionIds).toEqual(material?.emotionIds);
      expect(character.animationCueIds).toEqual(material?.animationCueIds);
    }
  });

  it('refuses to infer a missing canon completion', () => {
    expectAssemblyError(
      fixtureInput({ canonCompletions: canonCompletions.slice(1) }),
      'CANON_COMPLETION_ROSTER_MISMATCH',
    );
  });

  it('refuses to fabricate missing publication material', () => {
    expectAssemblyError(
      fixtureInput({ publicationMaterials: publicationMaterials.slice(0, -1) }),
      'PUBLICATION_MATERIAL_ROSTER_MISMATCH',
    );
  });

  it('refuses duplicate canon completion entries even when the list length is nine', () => {
    const duplicate = [
      ...canonCompletions.slice(0, -1),
      canonCompletions[0],
    ].filter((entry): entry is CharacterCanonCompletionV1 => entry !== undefined);

    expectAssemblyError(
      fixtureInput({ canonCompletions: duplicate }),
      'CANON_COMPLETION_ROSTER_MISMATCH',
    );
  });
});


describe('independent Character publication-lane candidate assembler v1', () => {
  const targetIds = ['baekheon', 'yeoul', 'rahyeon', 'taegyeom'] as const;

  function laneInput(
    characterId: (typeof targetIds)[number],
    overrides: Partial<CharacterPublicationLaneCandidateInputV1> = {},
  ): CharacterPublicationLaneCandidateInputV1 {
    const canonCompletion = canonCompletions.find(
      (entry) => entry.characterId === characterId,
    );
    const publicationMaterial = publicationMaterials.find(
      (entry) => entry.characterId === characterId,
    );
    if (canonCompletion === undefined || publicationMaterial === undefined) {
      throw new Error('lane fixtures are required');
    }
    return {
      characterId,
      metadata: {
        ...fixtureInput().metadata,
        bundleId: `fixture-${characterId}-lane-v1`,
        contentVersion: `fixture-${characterId}-content-v1`,
      },
      canonCompletion,
      publicationMaterial,
      ...overrides,
    };
  }

  it.each(targetIds)(
    'assembles %s alone from its exact immutable/runtime source and explicit completion',
    (characterId) => {
      const candidate = assembleCharacterPublicationLaneCandidateV1(
        laneInput(characterId),
      );
      expect(candidate.characters).toHaveLength(1);
      expect(candidate.characters[0]?.characterId).toBe(characterId);
      expect(candidate.bundleId).toBe(`fixture-${characterId}-lane-v1`);
      expect(candidate.contentVersion).toBe(`fixture-${characterId}-content-v1`);
      expect(
        validateProductionCharacterPublicationLaneBundleV1(candidate),
      ).toBe(candidate);
    },
  );

  it('does not allow another Character canon to be attached to the selected lane', () => {
    const wrongCanon = canonCompletions.find(
      (entry) => entry.characterId === 'seyeon',
    );
    if (wrongCanon === undefined) throw new Error('wrong-canon fixture is required');
    expect(() => assembleCharacterPublicationLaneCandidateV1(
      laneInput('baekheon', { canonCompletion: wrongCanon }),
    )).toThrow('Lane canon completion must belong to the selected Character.');
  });

  it('does not allow another Character renderer material to be attached to the selected lane', () => {
    const wrongMaterial = publicationMaterials.find(
      (entry) => entry.characterId === 'seyeon',
    );
    if (wrongMaterial === undefined) throw new Error('wrong-material fixture is required');
    expect(() => assembleCharacterPublicationLaneCandidateV1(
      laneInput('yeoul', { publicationMaterial: wrongMaterial }),
    )).toThrow('Lane publication material must belong to the selected Character.');
  });

  it('keeps incomplete renderer material non-publishing and rejects it at production validation', () => {
    const candidate = assembleCharacterPublicationLaneCandidateV1(
      laneInput('rahyeon', {
        publicationMaterial: {
          characterId: 'rahyeon',
          assetRefs: [],
          emotionIds: ['neutral'],
          animationCueIds: ['idle'],
        },
      }),
    );

    expect(candidate.characters).toHaveLength(1);
    expect(() => validateProductionCharacterPublicationLaneBundleV1(candidate))
      .toThrow('rahyeon.assetRefs must not be empty');
  });
});
