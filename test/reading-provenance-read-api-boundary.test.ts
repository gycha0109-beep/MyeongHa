import { describe, expect, it, vi } from 'vitest';

import {
  getReadingProvenance,
  READING_PROVENANCE_READ_AUTHORITY_BINDING_V1,
  ReadingProvenanceReadAuthorityPortErrorV1,
  type ReadingProvenanceAuthorityRowV1,
  type ReadingProvenanceReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const BASE_ROW: ReadingProvenanceAuthorityRowV1 = {
  readingId: 'reading-1',
  readingSessionId: 'session-1',
  sajuDomain: 'general',
  domainCapabilityVersion: 'general-cap-v1',
  attemptNo: 1,
  parentReadingId: null,
  executionStatus: 'succeeded',
  requestContractVersion: 'reading-request-v1',
  sourceBirthProfileId: 'birth-source',
  sourceBirthRevisionId: 'source-r1',
  currentSourceBirthRevisionId: 'source-r1',
  targetBirthProfileId: null,
  targetBirthRevisionId: null,
  currentTargetBirthRevisionId: null,
  stale: false,
  sajuEngineKey: 'saju-public',
  sajuEngineVersion: 'engine-v1',
  readingContractVersion: 'product-reading-v1',
  productResponseState: 'delivered',
  createdAt: '2026-08-20T00:00:00.000Z',
  completedAt: '2026-08-20T00:00:02.000Z',
  provenanceCreatedAt: '2026-08-20T00:00:02.000Z',
};

function portWithRows(
  rows: readonly ReadingProvenanceAuthorityRowV1[],
): ReadingProvenanceReadAuthorityPortV1 {
  return { readReadingProvenance: vi.fn(async () => rows) };
}

describe('B131 Reading provenance/stale API boundary', () => {
  it('binds only to the verified Reading provenance/stale authority', () => {
    expect(READING_PROVENANCE_READ_AUTHORITY_BINDING_V1).toBe(
      'public.qry_reading_provenance_stale_v1',
    );
  });

  it('returns only the explicit lifecycle/version/stale projection', async () => {
    const injected = {
      ...BASE_ROW,
      responseSnapshotJsonb: { privateMarker: 'must-not-project' },
      requestSnapshotJsonb: { raw: true },
      externalReadingRef: 'external-reading-ref',
      externalRequestRef: 'external-request-ref',
      responseHash: 'sha256:v1:secret',
      semanticClaimsJsonb: [{ claim: 'hidden' }],
    } as ReadingProvenanceAuthorityRowV1;
    const port = portWithRows([injected]);

    const result = await getReadingProvenance({
      resolvedSubjectId: 'subject-1',
      readingId: 'reading-1',
      authorityPort: port,
    });

    expect(result).toEqual(BASE_ROW);
    for (const forbidden of [
      'responseSnapshotJsonb',
      'requestSnapshotJsonb',
      'externalReadingRef',
      'externalRequestRef',
      'responseHash',
      'semanticClaimsJsonb',
    ]) {
      expect(result).not.toHaveProperty(forbidden);
    }
    expect(port.readReadingProvenance).toHaveBeenCalledWith({
      subjectId: 'subject-1',
      readingId: 'reading-1',
    });
  });

  it('preserves source and target revision drift as authoritative stale state', async () => {
    const row = {
      ...BASE_ROW,
      sajuDomain: 'compatibility',
      domainCapabilityVersion: 'compat-v1',
      sourceBirthRevisionId: 'source-r1',
      currentSourceBirthRevisionId: 'source-r2',
      targetBirthProfileId: 'birth-target',
      targetBirthRevisionId: 'target-r1',
      currentTargetBirthRevisionId: 'target-r2',
      stale: true,
    } satisfies ReadingProvenanceAuthorityRowV1;

    const result = await getReadingProvenance({
      resolvedSubjectId: 'subject-1',
      readingId: 'reading-1',
      authorityPort: portWithRows([row]),
    });

    expect(result).toMatchObject({
      sourceBirthRevisionId: 'source-r1',
      currentSourceBirthRevisionId: 'source-r2',
      targetBirthRevisionId: 'target-r1',
      currentTargetBirthRevisionId: 'target-r2',
      stale: true,
    });
  });

  it('keeps pending Reading response provenance null instead of fabricating output', async () => {
    const row = {
      ...BASE_ROW,
      executionStatus: 'pending',
      sajuEngineKey: null,
      sajuEngineVersion: null,
      readingContractVersion: null,
      productResponseState: null,
      completedAt: null,
      provenanceCreatedAt: null,
    } satisfies ReadingProvenanceAuthorityRowV1;

    const result = await getReadingProvenance({
      resolvedSubjectId: 'guest-subject',
      readingId: 'reading-1',
      authorityPort: portWithRows([row]),
    });

    expect(result).toMatchObject({
      executionStatus: 'pending',
      sajuEngineKey: null,
      sajuEngineVersion: null,
      readingContractVersion: null,
      productResponseState: null,
      completedAt: null,
      provenanceCreatedAt: null,
    });
  });

  it('rejects missing trusted subject or blank Reading id before authority access', async () => {
    const readReadingProvenance = vi.fn(async () => [BASE_ROW]);
    const authorityPort = { readReadingProvenance };

    await expect(
      getReadingProvenance({ readingId: 'reading-1', authorityPort }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(
      getReadingProvenance({
        resolvedSubjectId: 'subject-1',
        readingId: '   ',
        authorityPort,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(readReadingProvenance).not.toHaveBeenCalled();
  });

  it('bounds authority errors and preserves infrastructure failures', async () => {
    for (const code of ['READING_UNAVAILABLE', 'SUBJECT_INELIGIBLE'] as const) {
      await expect(
        getReadingProvenance({
          resolvedSubjectId: 'subject-1',
          readingId: 'reading-1',
          authorityPort: {
            readReadingProvenance: async () => {
              throw new ReadingProvenanceReadAuthorityPortErrorV1(code, `raw ${code}`);
            },
          },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Reading is unavailable for the current subject.',
      });
    }

    await expect(
      getReadingProvenance({
        resolvedSubjectId: 'subject-1',
        readingId: 'reading-1',
        authorityPort: {
          readReadingProvenance: async () => {
            throw new ReadingProvenanceReadAuthorityPortErrorV1(
              'INVALID_INPUT',
              'invalid authority input',
            );
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'invalid authority input',
    });

    const infra = new Error('database unavailable');
    await expect(
      getReadingProvenance({
        resolvedSubjectId: 'subject-1',
        readingId: 'reading-1',
        authorityPort: {
          readReadingProvenance: async () => {
            throw infra;
          },
        },
      }),
    ).rejects.toBe(infra);
  });

  it('fails closed on zero/multiple rows or Reading identity mismatch', async () => {
    for (const rows of [[], [BASE_ROW, BASE_ROW]] as const) {
      await expect(
        getReadingProvenance({
          resolvedSubjectId: 'subject-1',
          readingId: 'reading-1',
          authorityPort: portWithRows(rows),
        }),
      ).rejects.toThrow('exactly one successful row');
    }

    await expect(
      getReadingProvenance({
        resolvedSubjectId: 'subject-1',
        readingId: 'reading-1',
        authorityPort: portWithRows([{ ...BASE_ROW, readingId: 'reading-other' }]),
      }),
    ).rejects.toThrow('different Reading identity');
  });

  it('fails closed on malformed target, partial provenance, or timestamp shapes', async () => {
    await expect(
      getReadingProvenance({
        resolvedSubjectId: 'subject-1',
        readingId: 'reading-1',
        authorityPort: portWithRows([
          { ...BASE_ROW, targetBirthProfileId: 'target-profile', targetBirthRevisionId: null },
        ]),
      }),
    ).rejects.toThrow('target metadata without a pinned target revision');

    await expect(
      getReadingProvenance({
        resolvedSubjectId: 'subject-1',
        readingId: 'reading-1',
        authorityPort: portWithRows([{ ...BASE_ROW, sajuEngineVersion: null }]),
      }),
    ).rejects.toThrow('partial successful response provenance projection');

    await expect(
      getReadingProvenance({
        resolvedSubjectId: 'subject-1',
        readingId: 'reading-1',
        authorityPort: portWithRows([{ ...BASE_ROW, createdAt: 'not-a-date' }]),
      }),
    ).rejects.toThrow('invalid createdAt');
  });
});
