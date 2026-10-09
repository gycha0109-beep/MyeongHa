import { describe, expect, it, vi } from 'vitest';
import type { ContentReleaseRuntime } from '../packages/world-content/src/index.js';
import type {
  CharacterStandardReadingServerContextInputV1,
} from '../apps/api/src/character-standard-reading-server-runtime-authority.js';
import {
  runThreadBoundReaderInterpretationPreviewV1,
} from '../apps/api/src/reader-interpretation-preview-runtime-v1.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const READING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const READER = 'seyeon';
const BUNDLE = 'bundle-a2gamma-v1';
const RELEASE = 'release-a2gamma-v1';
const TIME = '2026-10-09T08:00:00.000Z';

function fixture(input: { policy?: 'withheld' | 'throw'; access?: 'valid' | 'missing' } = {}) {
  const calls: string[] = [];
  const readRuntimeBinding = vi.fn(async () => {
    calls.push('thread');
    return [{
      threadId: THREAD,
      status: 'active',
      activeContentReleaseId: RELEASE,
      activeContentBundleId: BUNDLE,
      contentRevision: 1,
      participantCharacterIds: [READER],
    }];
  });
  const readAccessibleReadings = vi.fn(async () => {
    calls.push('access');
    return input.access === 'missing' ? [] : [{
      subjectId: SUBJECT,
      readingId: READING,
      readingSessionId: 'session',
      productId: 'synthetic-product-id',
      readerCharacterId: READER,
      readerContentBundleId: BUNDLE,
      topicKey: 'general',
      sajuDomain: 'general',
      readingPeriod: 'original',
      readingVariant: 'standard',
      sourceBirthRevisionId: 'revision',
      productSpecVersion: 'synthetic-spec-v1',
      domainCapabilityVersion: 'general-v1',
      readingContractVersion: 'myeonghwa-product-reading-response-v2',
      sajuEngineVersion: 'saju-engine-v1',
      responseHash: 'sha256:synthetic-source',
    }];
  });
  const readApprovedRule = vi.fn(async () => {
    calls.push('policy');
    if (input.policy === 'throw') throw new Error('Product policy unavailable');
    return { status: 'withheld' as const, reason: 'unclassified' as const };
  });
  const readArtifactSource = vi.fn(async () => {
    calls.push('artifact');
    return [];
  });
  const projectGrounding = vi.fn(async () => {
    calls.push('saju');
    return {};
  });
  const ports = {
    resolvedSubjectId: SUBJECT,
    threadId: THREAD,
    officialReadingId: READING,
    effectiveAt: TIME,
    contentReleaseRuntime: {
      resolvePinned: vi.fn(() => ({
        release: { releaseId: RELEASE, bundleId: BUNDLE },
        characters: { characters: [{ characterId: READER }] },
      })),
    } as unknown as ContentReleaseRuntime,
    contextInput: {} as CharacterStandardReadingServerContextInputV1,
    threadBindingAuthorityPort: { readRuntimeBinding },
    accessAuthorityPort: { readAccessibleReadings },
    artifactAuthorityPort: { readArtifactSource },
    productReaderEligibilityAuthorityPort: { readApprovedRule },
    relationshipAuthorityPort: {} as never,
    memoryItemsAuthorityPort: {} as never,
    memoryGrantsAuthorityPort: {} as never,
    nonMemoryContextAuthorityPort: {} as never,
    groundingProjectionPort: { projectGrounding },
  };
  return { ports, calls, readAccessibleReadings, readApprovedRule, readArtifactSource, projectGrounding };
}

describe('A2-gamma Reader Preview admission wiring (public OFF)', () => {
  it('fails closed without an approved Product authority before exact Reader access or Saju', async () => {
    const f = fixture();
    const { productReaderEligibilityAuthorityPort: _unused, ...withoutPolicy } = f.ports;
    await expect(runThreadBoundReaderInterpretationPreviewV1(withoutPolicy))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.calls).toEqual(['thread']);
    expect(f.readAccessibleReadings).not.toHaveBeenCalled();
    expect(f.readArtifactSource).not.toHaveBeenCalled();
    expect(f.projectGrounding).not.toHaveBeenCalled();
  });

  it('rejects missing Reader Grant before consulting Product policy or raw artifact', async () => {
    const f = fixture({ access: 'missing' });
    await expect(runThreadBoundReaderInterpretationPreviewV1(f.ports))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.calls).toEqual(['thread', 'thread', 'access']);
    expect(f.readApprovedRule).not.toHaveBeenCalled();
    expect(f.readArtifactSource).not.toHaveBeenCalled();
    expect(f.projectGrounding).not.toHaveBeenCalled();
  });

  it.each(['withheld', 'throw'] as const)(
    'blocks %s Product authority before official source and Saju transport', async (policy) => {
      const f = fixture({ policy });
      await expect(runThreadBoundReaderInterpretationPreviewV1(f.ports))
        .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      expect(f.calls).toEqual(['thread', 'thread', 'access', 'policy']);
      expect(f.readArtifactSource).not.toHaveBeenCalled();
      expect(f.projectGrounding).not.toHaveBeenCalled();
    },
  );

  it('rejects Reader outside server cohort before access or Product query', async () => {
    const f = fixture();
    const admitServerReader = vi.fn(() => { throw new Error('out of cohort'); });
    await expect(runThreadBoundReaderInterpretationPreviewV1({
      ...f.ports, admitServerReader,
    })).rejects.toThrow('out of cohort');
    expect(admitServerReader).toHaveBeenCalledWith(READER);
    expect(f.calls).toEqual(['thread']);
    expect(f.readAccessibleReadings).not.toHaveBeenCalled();
    expect(f.readApprovedRule).not.toHaveBeenCalled();
    expect(f.readArtifactSource).not.toHaveBeenCalled();
    expect(f.projectGrounding).not.toHaveBeenCalled();
  });
});
