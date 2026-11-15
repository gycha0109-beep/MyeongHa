import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createFourCharacterPublishedModelSourcePortV1,
} from '../apps/api/src/four-character-published-model-source-v1.js';
import {
  FourCharacterPublishedArtifactUnavailableV1,
  type FourCharacterPublishedArtifactEvidenceV1,
} from '../apps/api/src/postgres-four-character-publication-evidence-v1.js';
import {
  FOUR_INDEPENDENT_CHAT_TARGETS_V1,
  type FourIndependentChatTargetV1,
} from '../apps/api/src/four-character-production-chat-executor-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const releaseId = '33333333-3333-4333-8333-333333333333';
const bundleId = '44444444-4444-4444-8444-444444444444';
const metadata = Object.freeze({
  minClientCapability: 'character-chat-v1',
  assetManifestHash: 'sha256:v1:' + '0'.repeat(64),
  cueSchemaVersion: 'static-cue-v1',
});
const artifactJson = (id: FourIndependentChatTargetV1) => ({
  schemaVersion: 'fixture-publication-v1',
  characterId: id,
  contentVersion: 'fixture-source-v1',
  sourceAuthority: { runtimeDecision: 'fixture-only' },
  bundleMetadata: metadata,
});
const bytesOf = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));
const hash = (bytes: Uint8Array): string =>
  'sha256:v1:' + createHash('sha256').update(bytes).digest('hex');
const input = (id: FourIndependentChatTargetV1) => ({
  subjectId, threadId, characterId: id, releaseId, bundleId,
  contentVersion: 'fixture-source-v1',
});
function harness(id: FourIndependentChatTargetV1, artifact = bytesOf(artifactJson(id))) {
  const evidence: FourCharacterPublishedArtifactEvidenceV1 = {
    characterId: id, releaseId, bundleId, contentVersion: 'fixture-source-v1',
    contentHash: hash(artifact),
    artifactRef: 'docs/character/'+id+'-approved-artifact.json',
    artifactSchemaVersion: 'fixture-publication-v1',
    ...metadata,
  };
  const dbRead = vi.fn(async () => evidence);
  const artifactRead = vi.fn(async () => artifact as Uint8Array | null);
  const compile = vi.fn(async () => ({
    bibleSourceRef: 'fixture-bible-'+id,
    runtimeSourceRef: 'fixture-runtime-'+id,
    canonicalContext: 'fixture-canonical-'+id,
  }));
  const port = createFourCharacterPublishedModelSourcePortV1({
    dbEvidence: { readPublishedArtifact: dbRead },
    artifacts: { loadByApprovedRef: artifactRead },
    compiler: { compile },
  });
  return { evidence, dbRead, artifactRead, compile, port };
}

describe('published four-Character artifact -> verified model context', () => {
  it.each(FOUR_INDEPENDENT_CHAT_TARGETS_V1)(
    'requires exact DB evidence and matching immutable %s artifact hash',
    async characterId => {
      const h = harness(characterId);
      const result = await h.port.readPublishedSource(input(characterId));
      expect(h.dbRead).toHaveBeenCalledWith({
        subjectId, threadId, characterId, releaseId, bundleId,
      });
      expect(h.artifactRead).toHaveBeenCalledWith(h.evidence.artifactRef);
      expect(h.compile).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        status: 'published', characterId, releaseId, bundleId,
        sourceDigest: h.evidence.contentHash,
        canonicalContext: 'fixture-canonical-'+characterId,
      });
    },
  );

  it('never compiles bytes when the published DB SHA-256 does not match', async () => {
    const h = harness('baekheon');
    h.artifactRead.mockResolvedValueOnce(bytesOf({ forged: true }));
    await expect(h.port.readPublishedSource(input('baekheon')))
      .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    expect(h.compile).not.toHaveBeenCalled();
  });

  it('rejects an independently rehashed but wrong-Character publication artifact', async () => {
    const bytes = bytesOf(artifactJson('rahyeon'));
    const h = harness('yeoul', bytes);
    await expect(h.port.readPublishedSource(input('yeoul')))
      .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    expect(h.compile).not.toHaveBeenCalled();
  });

  it('rejects mismatched client-asset/cue declarations even after hash verification', async () => {
    for (const field of ['assetManifestHash','cueSchemaVersion','minClientCapability'] as const) {
      const blob = artifactJson('taegyeom');
      const artifact = bytesOf({
        ...blob,
        bundleMetadata: { ...blob.bundleMetadata, [field]: 'forged' },
      });
      const h = harness('taegyeom', artifact);
      await expect(h.port.readPublishedSource(input('taegyeom')))
        .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
      expect(h.compile).not.toHaveBeenCalled();
    }
  });

  it('rejects missing approval provenance and failed canonical source compilation', async () => {
    const h = harness('rahyeon', bytesOf({
      ...artifactJson('rahyeon'), sourceAuthority: null,
    }));
    await expect(h.port.readPublishedSource(input('rahyeon')))
      .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    expect(h.compile).not.toHaveBeenCalled();

    const held = harness('rahyeon');
    held.compile.mockResolvedValueOnce(null as never);
    await expect(held.port.readPublishedSource(input('rahyeon')))
      .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
  });

  it('rejects foreign DB release or bundle even when artifact bytes are valid', async () => {
    const h = harness('baekheon');
    const bad = {
      ...h.evidence, releaseId: '55555555-5555-4555-8555-555555555555',
    };
    h.dbRead.mockResolvedValueOnce(bad);
    await expect(h.port.readPublishedSource(input('baekheon')))
      .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    expect(h.artifactRead).not.toHaveBeenCalled();
    expect(h.compile).not.toHaveBeenCalled();
  });

  it('fails closed on missing immutable artifact data', async () => {
    const h = harness('yeoul');
    h.artifactRead.mockResolvedValueOnce(null);
    await expect(h.port.readPublishedSource(input('yeoul')))
      .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    expect(h.compile).not.toHaveBeenCalled();
  });
});
