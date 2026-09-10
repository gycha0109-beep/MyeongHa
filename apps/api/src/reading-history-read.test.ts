import { describe, expect, it } from 'vitest';
import {
  getReadingHistory,
  ReadingHistoryReadAuthorityPortErrorV1,
  type ReadingHistoryAuthorityRowV1,
  type ReadingHistoryReadAuthorityPortV1,
} from './reading-history-read.js';

const NEWER: ReadingHistoryAuthorityRowV1 = Object.freeze({
  readingId: '00000000-0000-4000-8000-000000000002',
  readingSessionId: '10000000-0000-4000-8000-000000000002',
  sajuDomain: 'career',
  readingContractVersion: 'product-reading.v1',
  productResponseState: 'complete',
  createdAt: '2026-09-09T09:00:00.000Z',
  completedAt: '2026-09-09T09:01:00.000Z',
});

const OLDER: ReadingHistoryAuthorityRowV1 = Object.freeze({
  readingId: '00000000-0000-4000-8000-000000000001',
  readingSessionId: '10000000-0000-4000-8000-000000000001',
  sajuDomain: 'general',
  readingContractVersion: 'product-reading.v1',
  productResponseState: 'complete',
  createdAt: '2026-09-08T09:00:00.000Z',
  completedAt: '2026-09-08T09:01:00.000Z',
});

function port(rows: readonly ReadingHistoryAuthorityRowV1[]): ReadingHistoryReadAuthorityPortV1 {
  return { readHistory: async () => rows };
}

describe('Reading History read contract', () => {
  it('projects owner authority rows without inventing ProductReadingResponse body fields', async () => {
    const result = await getReadingHistory({
      resolvedSubjectId: '20000000-0000-4000-8000-000000000001',
      authorityPort: port([NEWER, OLDER]),
    });

    expect(result.readings).toEqual([NEWER, OLDER]);
    expect(result.readings[0]).not.toHaveProperty('responseSnapshotJsonb');
    expect(result.readings[0]).not.toHaveProperty('summary');
    expect(result.readings[0]).not.toHaveProperty('score');
  });

  it('fails closed when the authority loses newest-first deterministic order', async () => {
    await expect(getReadingHistory({
      resolvedSubjectId: '20000000-0000-4000-8000-000000000001',
      authorityPort: port([OLDER, NEWER]),
    })).rejects.toThrow('non-deterministic history order');
  });

  it('fails closed on duplicate Reading identity', async () => {
    await expect(getReadingHistory({
      resolvedSubjectId: '20000000-0000-4000-8000-000000000001',
      authorityPort: port([NEWER, { ...OLDER, readingId: NEWER.readingId }]),
    })).rejects.toThrow('duplicate Reading identity');
  });

  it('fails closed on malformed stored timestamps', async () => {
    await expect(getReadingHistory({
      resolvedSubjectId: '20000000-0000-4000-8000-000000000001',
      authorityPort: port([{ ...NEWER, completedAt: 'not-a-timestamp' }]),
    })).rejects.toThrow('invalid completed timestamp');
  });

  it('requires a resolved canonical subject before touching authority', async () => {
    let called = false;
    await expect(getReadingHistory({
      authorityPort: { readHistory: async () => { called = true; return []; } },
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(called).toBe(false);
  });

  it('maps rejected authority input to the public invalid-request contract', async () => {
    await expect(getReadingHistory({
      resolvedSubjectId: '20000000-0000-4000-8000-000000000001',
      authorityPort: {
        readHistory: async () => {
          throw new ReadingHistoryReadAuthorityPortErrorV1(
            'INVALID_INPUT',
            'Reading History read input is invalid.',
          );
        },
      },
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});