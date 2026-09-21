import { describe, expect, it, vi } from 'vitest';
import {
  ApiCommandError,
  resolveCharacterStandardReadingKnowledgeV1,
  type CharacterStandardReadingAccessAuthorityPortV1,
  type CharacterStandardReadingArtifactAuthorityPortV1,
} from '../apps/api/src/index.js';

const EFFECTIVE_AT = '2026-09-21T00:00:00.000Z';

function accessRow(overrides: Partial<{
  subjectId: string;
  readingId: string;
  readerCharacterId: string;
  readerContentBundleId: string;
}> = {}) {
  return {
    subjectId: overrides.subjectId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    readingId: overrides.readingId ?? '11111111-1111-4111-8111-111111111111',
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: '33333333-3333-4333-8333-333333333333',
    readerCharacterId: overrides.readerCharacterId ?? 'baekheon',
    readerContentBundleId:
      overrides.readerContentBundleId ?? '55555555-5555-4555-8555-555555555555',
    topicKey: 'general',
    sajuDomain: 'general',
    readingPeriod: 'original',
    readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    productSpecVersion: 'standard-reading-v1',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: 'product-reading-response-v1',
    sajuEngineVersion: 'saju-engine-v1',
    responseHash: 'sha256:v1:official-reading-hash',
  };
}

function artifactRow(overrides: Partial<{
  readingId: string;
  readerCharacterId: string;
  productId: string;
  readingContractVersion: string;
  responseHash: string;
}> = {}) {
  return {
    readingId: overrides.readingId ?? '11111111-1111-4111-8111-111111111111',
    productId: overrides.productId ?? '33333333-3333-4333-8333-333333333333',
    readerCharacterId: overrides.readerCharacterId ?? 'baekheon',
    readingContractVersion:
      overrides.readingContractVersion ?? 'product-reading-response-v1',
    productResponseState: 'complete',
    responseSnapshotJsonb: {
      schemaVersion: 'product-reading-response-v1',
      sections: [{ title: '핵심', blocks: [{ type: 'paragraph', text: '공식 풀이' }] }],
    },
    responseHash: overrides.responseHash ?? 'sha256:v1:official-reading-hash',
    completedAt: '2026-09-20T23:00:00.000Z',
  };
}

function ports(input?: {
  accessRows?: ReturnType<typeof accessRow>[];
  artifactRows?: ReturnType<typeof artifactRow>[];
}) {
  const accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1 = {
    readAccessibleReadings: vi.fn(async () => input?.accessRows ?? [accessRow()]),
  };
  const artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1 = {
    readArtifactSource: vi.fn(async () => input?.artifactRows ?? [artifactRow()]),
  };
  return { accessAuthorityPort, artifactAuthorityPort };
}

async function resolveWith(
  authorityPorts: ReturnType<typeof ports>,
  overrides: Partial<{
    resolvedSubjectId: string;
    readerCharacterId: string;
    readingId: string;
    effectiveAt: string;
  }> = {},
) {
  return resolveCharacterStandardReadingKnowledgeV1({
    resolvedSubjectId:
      overrides.resolvedSubjectId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    readerCharacterId: overrides.readerCharacterId ?? 'baekheon',
    readingId: overrides.readingId ?? '11111111-1111-4111-8111-111111111111',
    effectiveAt: overrides.effectiveAt ?? EFFECTIVE_AT,
    ...authorityPorts,
  });
}

describe('Character Standard Reading Reader Knowledge source', () => {
  it('admits one exact Reader-authorized official Reading and its server-side artifact', async () => {
    const authorityPorts = ports();

    const result = await resolveWith(authorityPorts);

    expect(result).toMatchObject({
      readingId: '11111111-1111-4111-8111-111111111111',
      readerCharacterId: 'baekheon',
      readerContentBundleId: '55555555-5555-4555-8555-555555555555',
      topicKey: 'general',
      sajuDomain: 'general',
      readingPeriod: 'original',
      productResponseState: 'complete',
      responseHash: 'sha256:v1:official-reading-hash',
    });
    expect(result.responseSnapshotJsonb).toEqual(artifactRow().responseSnapshotJsonb);
    expect(authorityPorts.accessAuthorityPort.readAccessibleReadings).toHaveBeenCalledWith({
      subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      readerCharacterId: 'baekheon',
      effectiveAt: EFFECTIVE_AT,
    });
    expect(authorityPorts.artifactAuthorityPort.readArtifactSource).toHaveBeenCalledWith({
      subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      readingId: '11111111-1111-4111-8111-111111111111',
      readerCharacterId: 'baekheon',
      effectiveAt: EFFECTIVE_AT,
    });
  });

  it('fails closed before raw artifact read when the Reader has no access to the requested Reading', async () => {
    const authorityPorts = ports({
      accessRows: [
        accessRow({ readingId: '99999999-9999-4999-8999-999999999999' }),
      ],
    });

    await expect(resolveWith(authorityPorts)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ApiCommandError>);
    expect(authorityPorts.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('fails closed when metadata authority returns a different Reader or subject', async () => {
    await expect(
      resolveWith(ports({ accessRows: [accessRow({ readerCharacterId: 'seyeon' })] })),
    ).rejects.toThrow(/metadata and artifact authorities disagree/u);

    await expect(
      resolveWith(
        ports({
          accessRows: [
            accessRow({ subjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
          ],
        }),
      ),
    ).rejects.toThrow(/metadata and artifact authorities disagree/u);
  });

  it('fails closed when a different Reader is returned by raw source authority', async () => {
    const authorityPorts = ports({
      artifactRows: [artifactRow({ readerCharacterId: 'seyeon' })],
    });

    await expect(resolveWith(authorityPorts)).rejects.toThrow(
      /metadata and artifact authorities disagree/u,
    );
  });

  it('fails closed when metadata and raw source hashes disagree', async () => {
    const authorityPorts = ports({
      artifactRows: [artifactRow({ responseHash: 'sha256:v1:different' })],
    });

    await expect(resolveWith(authorityPorts)).rejects.toThrow(
      /metadata and artifact authorities disagree/u,
    );
  });

  it('rejects duplicate access rows for the same official Reading', async () => {
    const authorityPorts = ports({
      accessRows: [accessRow(), accessRow()],
    });

    await expect(resolveWith(authorityPorts)).rejects.toThrow(
      /duplicate official Reading identity/u,
    );
    expect(authorityPorts.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects client-shaped topic/scope or Reading prose by not accepting them as inputs', async () => {
    const authorityPorts = ports();
    const input = {
      resolvedSubjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      readerCharacterId: 'baekheon',
      readingId: '11111111-1111-4111-8111-111111111111',
      effectiveAt: EFFECTIVE_AT,
      topic: 'money',
      scope: 'year',
      readingText: '클라이언트가 바꾼 사주 본문',
      ...authorityPorts,
    };

    const result = await resolveCharacterStandardReadingKnowledgeV1(input);
    expect(result.topicKey).toBe('general');
    expect(result.readingPeriod).toBe('original');
    expect(result.responseSnapshotJsonb).toEqual(artifactRow().responseSnapshotJsonb);
  });

  it('requires a server-resolved subject and valid timestamp', async () => {
    const authorityPorts = ports();

    await expect(
      resolveWith(authorityPorts, { resolvedSubjectId: '' }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' } satisfies Partial<ApiCommandError>);

    await expect(
      resolveWith(authorityPorts, { effectiveAt: 'not-a-time' }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' } satisfies Partial<ApiCommandError>);
  });
});
