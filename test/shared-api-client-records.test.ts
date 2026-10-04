import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  readLifeRecordPageV1,
  readMemoryPageV1,
  readReadingHistoryPageV1,
} from '../packages/api-client/src/index.js';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } },
    { status: 200 },
  );
}

const terminalPagination = Object.freeze({
  pageSize: 20,
  hasMore: false,
  nextCursor: null,
});

describe('shared Records API client', () => {
  it('builds an opaque cursor request without decoding the cursor', async () => {
    let requested = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input) => {
        requested = String(input);
        return success({ facts: [], pagination: terminalPagination });
      },
    });

    await readLifeRecordPageV1(client, 'opaque-token', {
      pageSize: 20,
      cursor: 'opaque+/cursor==',
    });

    const url = new URL(requested);
    expect(url.pathname).toBe('/api/life-record');
    expect(url.searchParams.get('pageSize')).toBe('20');
    expect(url.searchParams.get('cursor')).toBe('opaque+/cursor==');
  });

  it('parses Life Record facts while preserving stored JSON and revocation state', async () => {
    const valueJsonb = { employer: 'MyeongHa' };
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () =>
        success({
          facts: [{
            lifeFactId: 'fact-1',
            factType: 'employment',
            schemaVersion: 'employment.v1',
            valueJsonb,
            validFrom: null,
            validTo: null,
            sourceKind: 'chat',
            sourceMessageId: null,
            sourceMergeActionId: null,
            supersedesFactId: null,
            confirmedAt: '2026-09-28T01:00:00.000Z',
            revokedAt: '2026-09-29T01:00:00.000Z',
            createdAt: '2026-09-28T01:00:00.000Z',
          }],
          pagination: terminalPagination,
        }),
    });

    const page = await readLifeRecordPageV1(client, 'opaque-token');
    expect(page.facts[0]?.valueJsonb).toEqual(valueJsonb);
    expect(page.facts[0]?.revokedAt).toBe('2026-09-29T01:00:00.000Z');
  });

  it('parses Reading and Memory collections independently', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === '/api/readings') {
          return success({
            readings: [{
              readingId: 'reading-1',
              readingSessionId: 'session-1',
              sajuDomain: 'general',
              readingContractVersion: 'v1',
              productResponseState: 'delivered',
              readerCharacterIds: ['character-a'],
              createdAt: '2026-09-28T01:00:00.000Z',
              completedAt: '2026-09-28T01:01:00.000Z',
            }],
            pagination: terminalPagination,
          });
        }
        return success({
          memories: [{
            memoryItemId: 'memory-1',
            memoryType: 'conversation',
            schemaVersion: 'memory.v1',
            contentJsonb: { topic: 'career' },
            createdByCharacterId: null,
            createdAt: '2026-09-28T01:00:00.000Z',
          }],
          pagination: terminalPagination,
        });
      },
    });

    await expect(readReadingHistoryPageV1(client, 'opaque-token')).resolves.toMatchObject({
      readings: [{ readingId: 'reading-1', sajuDomain: 'general' }],
    });
    await expect(readMemoryPageV1(client, 'opaque-token')).resolves.toMatchObject({
      memories: [{ memoryItemId: 'memory-1', memoryType: 'conversation' }],
    });
  });

  it('rejects malformed pagination and duplicate canonical ids', async () => {
    const badPagination = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () =>
        success({
          memories: [],
          pagination: { pageSize: 20, hasMore: true, nextCursor: null },
        }),
    });
    await expect(readMemoryPageV1(badPagination, 'opaque-token')).rejects.toMatchObject({
      code: 'API_RECORDS_RESPONSE_INVALID',
    });

    const duplicateReadings = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () =>
        success({
          readings: [
            {
              readingId: 'reading-1',
              readingSessionId: 'session-1',
              sajuDomain: 'general',
              readingContractVersion: 'v1',
              productResponseState: 'delivered',
              readerCharacterIds: [],
              createdAt: '2026-09-28T01:00:00.000Z',
              completedAt: '2026-09-28T01:01:00.000Z',
            },
            {
              readingId: 'reading-1',
              readingSessionId: 'session-2',
              sajuDomain: 'career',
              readingContractVersion: 'v1',
              productResponseState: 'delivered',
              readerCharacterIds: [],
              createdAt: '2026-09-27T01:00:00.000Z',
              completedAt: '2026-09-27T01:01:00.000Z',
            },
          ],
          pagination: terminalPagination,
        }),
    });
    await expect(readReadingHistoryPageV1(duplicateReadings, 'opaque-token')).rejects.toMatchObject({
      code: 'API_RECORDS_RESPONSE_INVALID',
    });
  });

  it('rejects client page sizes outside the server contract', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({ facts: [], pagination: terminalPagination }),
    });
    await expect(
      readLifeRecordPageV1(client, 'opaque-token', { pageSize: 51 }),
    ).rejects.toMatchObject({ code: 'CLIENT_RECORDS_PAGE_INVALID' });
  });
});
