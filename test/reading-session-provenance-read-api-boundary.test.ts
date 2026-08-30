import { describe, expect, it, vi } from 'vitest';

import {
  getReadingSessionProvenance,
  READING_SESSION_PROVENANCE_READ_AUTHORITY_BINDING_V1,
  ReadingSessionProvenanceReadAuthorityPortErrorV1,
  type ReadingSessionProvenanceAuthorityRowV1,
  type ReadingSessionProvenanceReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const BASE_ROW: ReadingSessionProvenanceAuthorityRowV1 = {
  readingSessionId: 'session-1',
  sajuDomain: 'general',
  domainCapabilityVersion: 'reading-session-general-v1',
  storedState: 'active',
  nextAttemptNo: 2,
  currentReadingId: 'reading-1',
  currentReadingAttemptNo: 1,
  currentReadingParentId: null,
  currentReadingExecutionStatus: 'succeeded',
  currentReadingRequestContractVersion: 'reading-request-v1',
  sourceBirthProfileId: 'birth-source',
  sourceBirthRevisionId: 'source-r1',
  currentSourceBirthRevisionId: 'source-r1',
  targetBirthProfileId: null,
  targetBirthRevisionId: null,
  currentTargetBirthRevisionId: null,
  stale: false,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:03.000Z',
};

function portWithRows(
  rows: readonly ReadingSessionProvenanceAuthorityRowV1[],
): ReadingSessionProvenanceReadAuthorityPortV1 {
  return {
    readReadingSessionProvenance: vi.fn(async () => rows),
  };
}

describe('B132 Reading Session provenance/stale API boundary', () => {
  it('binds only to the verified Reading Session provenance/stale authority', () => {
    expect(READING_SESSION_PROVENANCE_READ_AUTHORITY_BINDING_V1).toBe(
      'public.qry_reading_session_provenance_stale_v1',
    );
  });

  it('returns only the explicit aggregate/current-Reading provenance projection', async () => {
    const injected = {
      ...BASE_ROW,
      responseSnapshotJsonb: { privateMarker: 'must-not-project' },
      requestSnapshotJsonb: { raw: true },
      protectedBlocks: [{ hidden: true }],
      semanticPayload: { claim: 'hidden' },
      externalRequestRef: 'external-request',
      externalReadingRef: 'external-reading',
      responseHash: 'sha256:v1:hidden',
      providerMaterial: { provider: 'internal' },
    } as ReadingSessionProvenanceAuthorityRowV1;
    const port = portWithRows([injected]);

    const result = await getReadingSessionProvenance({
      resolvedSubjectId: 'subject-1',
      readingSessionId: 'session-1',
      authorityPort: port,
    });

    expect(result).toEqual(BASE_ROW);
    for (const forbidden of [
      'responseSnapshotJsonb',
      'requestSnapshotJsonb',
      'protectedBlocks',
      'semanticPayload',
      'externalRequestRef',
      'externalReadingRef',
      'responseHash',
      'providerMaterial',
    ]) {
      expect(result).not.toHaveProperty(forbidden);
    }
    expect(port.readReadingSessionProvenance).toHaveBeenCalledWith({
      subjectId: 'subject-1',
      readingSessionId: 'session-1',
    });
  });

  it('preserves storedState even when the current Reading succeeded', async () => {
    const result = await getReadingSessionProvenance({
      resolvedSubjectId: 'subject-1',
      readingSessionId: 'session-1',
      authorityPort: portWithRows([BASE_ROW]),
    });

    expect(result.storedState).toBe('active');
    expect(result.currentReadingExecutionStatus).toBe('succeeded');
    expect(result).not.toHaveProperty('completed');
    expect(result).not.toHaveProperty('effectiveState');
  });

  it('preserves source and target revision drift as authoritative stale state', async () => {
    const row = {
      ...BASE_ROW,
      sajuDomain: 'compatibility',
      domainCapabilityVersion: 'reading-session-compat-v1',
      currentReadingExecutionStatus: 'pending',
      sourceBirthRevisionId: 'source-r1',
      currentSourceBirthRevisionId: 'source-r2',
      targetBirthProfileId: 'birth-target',
      targetBirthRevisionId: 'target-r1',
      currentTargetBirthRevisionId: 'target-r2',
      stale: true,
    } satisfies ReadingSessionProvenanceAuthorityRowV1;

    const result = await getReadingSessionProvenance({
      resolvedSubjectId: 'subject-1',
      readingSessionId: 'session-1',
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

  it('allows the same owner-scoped projection for an active canonical guest', async () => {
    const row = {
      ...BASE_ROW,
      currentReadingExecutionStatus: 'pending',
      stale: false,
    } satisfies ReadingSessionProvenanceAuthorityRowV1;

    const result = await getReadingSessionProvenance({
      resolvedSubjectId: 'guest-subject',
      readingSessionId: 'session-1',
      authorityPort: portWithRows([row]),
    });

    expect(result.storedState).toBe('active');
    expect(result.currentReadingExecutionStatus).toBe('pending');
  });

  it('rejects missing trusted subject or blank session id before authority access', async () => {
    const readReadingSessionProvenance = vi.fn(async () => [BASE_ROW]);
    const authorityPort = { readReadingSessionProvenance };

    await expect(
      getReadingSessionProvenance({
        readingSessionId: 'session-1',
        authorityPort,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

    await expect(
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: '   ',
        authorityPort,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect(readReadingSessionProvenance).not.toHaveBeenCalled();
  });

  it('bounds unavailable/ineligible authority errors and preserves infrastructure failures', async () => {
    for (const code of ['READING_SESSION_UNAVAILABLE', 'SUBJECT_INELIGIBLE'] as const) {
      await expect(
        getReadingSessionProvenance({
          resolvedSubjectId: 'subject-1',
          readingSessionId: 'session-1',
          authorityPort: {
            readReadingSessionProvenance: async () => {
              throw new ReadingSessionProvenanceReadAuthorityPortErrorV1(
                code,
                `raw ${code}`,
              );
            },
          },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Reading Session is unavailable for the current subject.',
      });
    }

    await expect(
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: 'session-1',
        authorityPort: {
          readReadingSessionProvenance: async () => {
            throw new ReadingSessionProvenanceReadAuthorityPortErrorV1(
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
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: 'session-1',
        authorityPort: {
          readReadingSessionProvenance: async () => {
            throw infra;
          },
        },
      }),
    ).rejects.toBe(infra);
  });

  it('fails closed on zero/multiple rows or session identity mismatch', async () => {
    for (const rows of [[], [BASE_ROW, BASE_ROW]] as const) {
      await expect(
        getReadingSessionProvenance({
          resolvedSubjectId: 'subject-1',
          readingSessionId: 'session-1',
          authorityPort: portWithRows(rows),
        }),
      ).rejects.toThrow('exactly one successful row');
    }

    await expect(
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: 'session-1',
        authorityPort: portWithRows([
          { ...BASE_ROW, readingSessionId: 'session-other' },
        ]),
      }),
    ).rejects.toThrow('different Reading Session identity');
  });

  it('fails closed on malformed current Reading, target, counters, or timestamps', async () => {
    await expect(
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: 'session-1',
        authorityPort: portWithRows([
          { ...BASE_ROW, currentReadingExecutionStatus: null },
        ]),
      }),
    ).rejects.toThrow('without execution status');

    await expect(
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: 'session-1',
        authorityPort: portWithRows([
          { ...BASE_ROW, targetBirthProfileId: 'target-profile' },
        ]),
      }),
    ).rejects.toThrow('target metadata without a pinned target revision');

    await expect(
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: 'session-1',
        authorityPort: portWithRows([{ ...BASE_ROW, nextAttemptNo: 0 }]),
      }),
    ).rejects.toThrow('invalid nextAttemptNo');

    await expect(
      getReadingSessionProvenance({
        resolvedSubjectId: 'subject-1',
        readingSessionId: 'session-1',
        authorityPort: portWithRows([{ ...BASE_ROW, updatedAt: 'not-a-date' }]),
      }),
    ).rejects.toThrow('invalid updatedAt');
  });
});
