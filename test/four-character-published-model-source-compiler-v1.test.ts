import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assembleCharacterPublicationLaneCandidateV1,
  type CharacterCanonCompletionV1,
  type CharacterContentBundleCandidateMetadataV1,
  type CharacterPublicationMaterialInputV1,
} from '../packages/character-content/src/content-candidate-assembler-v1.js';
import {
  buildProductionCharacterPublicationLaneManifestV1,
} from '../packages/character-content/src/production-character-lane-v1.js';
import {
  createFourCharacterPublishedModelSourceCompilerV1,
  FOUR_CHARACTER_PUBLISHED_MODEL_ARTIFACT_SCHEMA_V1,
} from '../apps/api/src/four-character-published-model-source-compiler-v1.js';
import {
  FourCharacterPublishedArtifactUnavailableV1,
  type FourCharacterPublishedArtifactEvidenceV1,
} from '../apps/api/src/postgres-four-character-publication-evidence-v1.js';
import type {
  FourIndependentChatTargetV1,
} from '../apps/api/src/four-character-production-chat-executor-v1.js';

const targets = ['baekheon', 'yeoul', 'rahyeon', 'taegyeom'] as const;
const metadata: CharacterContentBundleCandidateMetadataV1 = {
  bundleId: 'fixture-four-character-lane-v1',
  contentVersion: 'fixture-four-character-content-v1',
  assetManifestHash: 'sha256:v1:' + 'a'.repeat(64),
  cueSchemaVersion: 'character-static-presentation-v1',
  minClientCapability: 'character-chat-v1',
};
const sourceAuthority = {
  approvalStatus: 'approved',
  bibleSourceRef: 'docs/character/fixture-character-bible.md',
  runtimeSourceRef: 'docs/character/fixture-character-runtime.md',
  approvalRef: 'docs/source-authority-decisions/fixture-character-approval.md',
  sourceCommit: 'b'.repeat(40),
};
const hash = (bytes: Uint8Array) =>
  'sha256:v1:' + createHash('sha256').update(bytes).digest('hex');

function laneBundle(characterId: FourIndependentChatTargetV1) {
  const canonCompletion: CharacterCanonCompletionV1 = {
    characterId,
    worldview: {
      coreValues: ['fixture agency'],
      humanTheory: 'fixture human theory',
      agencyTheory: 'fixture agency theory',
      truthTheory: 'fixture truth theory',
    },
    psychology: {
      desire: 'fixture desire',
      fear: 'fixture fear',
      flaw: 'fixture flaw',
      contradiction: 'fixture contradiction',
      hiddenMotivation: 'fixture hidden motivation',
    },
  };
  const publicationMaterial: CharacterPublicationMaterialInputV1 = {
    characterId,
    assetRefs: [`fixture://${characterId}/portrait`],
    emotionIds: ['neutral'],
    animationCueIds: ['static'],
  };
  return assembleCharacterPublicationLaneCandidateV1({
    characterId,
    metadata: {
      ...metadata,
      bundleId: `fixture-${characterId}-bundle-v1`,
      contentVersion: `fixture-${characterId}-content-v1`,
    },
    canonCompletion,
    publicationMaterial,
  });
}

function artifactFor(
  characterId: FourIndependentChatTargetV1,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const contentBundle = laneBundle(characterId);
  const manifest = buildProductionCharacterPublicationLaneManifestV1(contentBundle);
  const artifact = {
    schemaVersion: FOUR_CHARACTER_PUBLISHED_MODEL_ARTIFACT_SCHEMA_V1,
    characterId,
    contentVersion: contentBundle.contentVersion,
    bundleMetadata: {
      minClientCapability: contentBundle.minClientCapability,
      assetManifestHash: contentBundle.assetManifestHash,
      cueSchemaVersion: contentBundle.cueSchemaVersion,
    },
    contentBundleHash: manifest.contentHash,
    sourceAuthority,
    contentBundle,
    ...overrides,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(artifact));
  const evidence: FourCharacterPublishedArtifactEvidenceV1 = {
    characterId,
    releaseId: '11111111-1111-4111-8111-111111111111',
    bundleId: contentBundle.bundleId,
    contentVersion: contentBundle.contentVersion,
    contentHash: hash(bytes),
    artifactRef: `docs/character/publication-artifacts/${characterId}.json`,
    artifactSchemaVersion: FOUR_CHARACTER_PUBLISHED_MODEL_ARTIFACT_SCHEMA_V1,
    minClientCapability: contentBundle.minClientCapability,
    assetManifestHash: contentBundle.assetManifestHash,
    cueSchemaVersion: contentBundle.cueSchemaVersion,
  };
  return { artifact, bytes, evidence, contentBundle };
}

describe('four-Character published model source compiler v1', () => {
  it.each(targets)(
    'compiles only the exact approved immutable/runtime source for %s',
    async characterId => {
      const h = artifactFor(characterId);
      const result = await createFourCharacterPublishedModelSourceCompilerV1()
        .compile({ characterId, evidence: h.evidence, artifactBytes: h.bytes });
      expect(result.bibleSourceRef).toBe(sourceAuthority.bibleSourceRef);
      expect(result.runtimeSourceRef).toBe(sourceAuthority.runtimeSourceRef);
      const context = JSON.parse(result.canonicalContext);
      expect(context.schemaVersion).toBe('four-character-canonical-context-v1');
      expect(context.characterId).toBe(characterId);
      expect(context.character.characterId).toBeUndefined();
      expect(context.character.persona).toBeDefined();
      expect(context.character.canon.worldview).toBeDefined();
      expect(context.character.assetRefs).toBeUndefined();
    },
  );

  it('rejects a draft or unapproved source-authority declaration', async () => {
    const h = artifactFor('baekheon', {
      sourceAuthority: { ...sourceAuthority, approvalStatus: 'draft' },
    });
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'baekheon', evidence: h.evidence, artifactBytes: h.bytes,
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });

  it('rejects immutable identity drift even when the artifact bundle hash is recomputed', async () => {
    const h = artifactFor('yeoul');
    const alteredBundle = {
      ...h.contentBundle,
      characters: [{
        ...h.contentBundle.characters[0],
        personalityTraits: ['unapproved replacement personality'],
      }],
    };
    const manifest = buildProductionCharacterPublicationLaneManifestV1(alteredBundle);
    const artifact = {
      ...h.artifact,
      contentBundle: alteredBundle,
      contentBundleHash: manifest.contentHash,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(artifact));
    const evidence = { ...h.evidence, contentHash: hash(bytes) };
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'yeoul', evidence, artifactBytes: bytes,
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });

  it('rejects runtime Persona drift even when the artifact and bundle hashes are valid', async () => {
    const h = artifactFor('rahyeon');
    const original = h.contentBundle.characters[0];
    if (original === undefined || original.persona === undefined) {
      throw new Error('fixture runtime source is required');
    }
    const alteredBundle = {
      ...h.contentBundle,
      characters: [{
        ...original,
        persona: {
          ...original.persona,
          communication: {
            ...original.persona.communication,
            register: 'unapproved replacement voice',
          },
        },
      }],
    };
    const manifest = buildProductionCharacterPublicationLaneManifestV1(alteredBundle);
    const artifact = {
      ...h.artifact,
      contentBundle: alteredBundle,
      contentBundleHash: manifest.contentHash,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(artifact));
    const evidence = { ...h.evidence, contentHash: hash(bytes) };
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'rahyeon', evidence, artifactBytes: bytes,
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });

  it('rejects missing Production publication material instead of filling defaults', async () => {
    const h = artifactFor('taegyeom');
    const alteredBundle = {
      ...h.contentBundle,
      characters: [{
        ...h.contentBundle.characters[0],
        assetRefs: [],
      }],
    };
    const artifact = { ...h.artifact, contentBundle: alteredBundle };
    const bytes = new TextEncoder().encode(JSON.stringify(artifact));
    const evidence = { ...h.evidence, contentHash: hash(bytes) };
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'taegyeom', evidence, artifactBytes: bytes,
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });

  it('rejects an incorrect one-Character bundle hash and metadata envelope', async () => {
    const h = artifactFor('baekheon');
    const wrongHashArtifact = {
      ...h.artifact, contentBundleHash: 'sha256:v1:' + '0'.repeat(64),
    };
    const wrongHashBytes = new TextEncoder().encode(JSON.stringify(wrongHashArtifact));
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'baekheon',
      evidence: { ...h.evidence, contentHash: hash(wrongHashBytes) },
      artifactBytes: wrongHashBytes,
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);

    const wrongMetadataArtifact = {
      ...h.artifact,
      bundleMetadata: { ...h.artifact.bundleMetadata, cueSchemaVersion: 'forged' },
    };
    const wrongMetadataBytes = new TextEncoder().encode(JSON.stringify(wrongMetadataArtifact));
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'baekheon',
      evidence: { ...h.evidence, contentHash: hash(wrongMetadataBytes) },
      artifactBytes: wrongMetadataBytes,
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });

  it('rejects unbound or corrupted artifact bytes before compiling context', async () => {
    const h = artifactFor('taegyeom');
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'taegyeom',
      evidence: h.evidence,
      artifactBytes: new TextEncoder().encode('{"forged":true}'),
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });

  it('rejects a non-four-Character target without a Se-yeon fallback', async () => {
    const h = artifactFor('baekheon');
    await expect(createFourCharacterPublishedModelSourceCompilerV1().compile({
      characterId: 'seyeon' as never,
      evidence: h.evidence,
      artifactBytes: h.bytes,
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });
});
