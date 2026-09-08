import { describe, expect, it } from 'vitest';

import {
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
} from './immutable-authoring-v1.js';
import type {
  CharacterCanonCompletionV1,
  CharacterContentBundleCandidateMetadataV1,
  CharacterPublicationMaterialInputV1,
} from './content-candidate-assembler-v1.js';
import { inspectCharacterPublicationReadinessV1 } from './publication-readiness-v1.js';

const metadata: CharacterContentBundleCandidateMetadataV1 = {
  bundleId: 'fixture-character-candidate-v1',
  contentVersion: 'fixture-content-v1',
  assetManifestHash:
    'sha256:v1:4345e9deb0393f0beabfa4e22ae039a00a2860d6d240a7a90d0b420d29eb1ec1',
  cueSchemaVersion: 'fixture-cue-v1',
  minClientCapability: 'fixture-client-v1',
};

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

describe('Character publication readiness preflight v1', () => {
  it('reports every unresolved surface instead of inventing defaults', () => {
    const report = inspectCharacterPublicationReadinessV1();

    expect(report.ready).toBe(false);
    expect(report.missingMetadataFields).toEqual([
      'bundleId',
      'contentVersion',
      'assetManifestHash',
      'cueSchemaVersion',
      'minClientCapability',
    ]);
    expect(report.characters).toHaveLength(
      CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.length,
    );

    for (const character of report.characters) {
      expect(character.missingCanonFields).toEqual([
        'worldview.coreValues',
        'worldview.humanTheory',
        'worldview.agencyTheory',
        'worldview.truthTheory',
        'psychology.desire',
        'psychology.fear',
        'psychology.flaw',
        'psychology.contradiction',
        'psychology.hiddenMotivation',
      ]);
      expect(character.missingPublicationMaterialFields).toEqual([
        'assetRefs',
        'emotionIds',
        'animationCueIds',
      ]);
    }
  });

  it('reports only the material fields that are still blank for a supplied Character', () => {
    const firstId = CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS[0];
    expect(firstId).toBeDefined();
    if (firstId === undefined) throw new Error('fixture roster is empty');

    const report = inspectCharacterPublicationReadinessV1({
      metadata,
      canonCompletions,
      publicationMaterials: [
        {
          characterId: firstId,
          assetRefs: ['fixture://character/first/concept-art'],
          emotionIds: [],
          animationCueIds: ['   '],
        },
      ],
    });

    const first = report.characters.find(
      (entry) => entry.characterId === firstId,
    );
    expect(first?.missingCanonFields).toEqual([]);
    expect(first?.missingPublicationMaterialFields).toEqual([
      'emotionIds',
      'animationCueIds',
    ]);

    for (const character of report.characters.filter(
      (entry) => entry.characterId !== firstId,
    )) {
      expect(character.missingPublicationMaterialFields).toEqual([
        'assetRefs',
        'emotionIds',
        'animationCueIds',
      ]);
    }
  });

  it('rejects blank canon text as not ready even when the roster entry exists', () => {
    const first = canonCompletions[0];
    expect(first).toBeDefined();
    if (first === undefined) throw new Error('fixture roster is empty');

    const report = inspectCharacterPublicationReadinessV1({
      metadata,
      canonCompletions: [
        {
          ...first,
          psychology: {
            ...first.psychology,
            desire: '   ',
            contradiction: '',
          },
        },
        ...canonCompletions.slice(1),
      ],
      publicationMaterials,
    });

    expect(report.ready).toBe(false);
    expect(report.characters[0]?.missingCanonFields).toEqual([
      'psychology.desire',
      'psychology.contradiction',
    ]);
  });

  it('treats duplicate or unexpected roster entries as structural blockers', () => {
    const firstCanon = canonCompletions[0];
    const firstMaterial = publicationMaterials[0];
    expect(firstCanon).toBeDefined();
    expect(firstMaterial).toBeDefined();
    if (firstCanon === undefined || firstMaterial === undefined) {
      throw new Error('fixture roster is empty');
    }

    const report = inspectCharacterPublicationReadinessV1({
      metadata,
      canonCompletions: [
        ...canonCompletions,
        firstCanon,
        {
          ...firstCanon,
          characterId: 'unexpected' as typeof firstCanon.characterId,
        },
      ],
      publicationMaterials: [...publicationMaterials, firstMaterial],
    });

    expect(report.ready).toBe(false);
    expect(report.duplicateCanonCharacterIds).toEqual([firstCanon.characterId]);
    expect(report.unexpectedCanonCharacterIds).toEqual(['unexpected']);
    expect(report.duplicatePublicationMaterialCharacterIds).toEqual([
      firstMaterial.characterId,
    ]);
  });

  it('returns ready only when exact-nine canon, materials, and metadata are all present', () => {
    const report = inspectCharacterPublicationReadinessV1({
      metadata,
      canonCompletions,
      publicationMaterials,
    });

    expect(report.ready).toBe(true);
    expect(report.missingMetadataFields).toEqual([]);
    expect(report.duplicateCanonCharacterIds).toEqual([]);
    expect(report.unexpectedCanonCharacterIds).toEqual([]);
    expect(report.duplicatePublicationMaterialCharacterIds).toEqual([]);
    expect(report.unexpectedPublicationMaterialCharacterIds).toEqual([]);
    expect(
      report.characters.every(
        (entry) =>
          entry.missingCanonFields.length === 0 &&
          entry.missingPublicationMaterialFields.length === 0,
      ),
    ).toBe(true);
  });
});
