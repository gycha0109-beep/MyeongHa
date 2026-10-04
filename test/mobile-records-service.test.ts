import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileRecordsServiceV1 } from '../apps/mobile/src/features/records/mobile-records-service.js';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } },
    { status: 200 },
  );
}

describe('mobile Records service', () => {
  it('routes every owner-scoped collection through the subject bearer boundary', async () => {
    const requests: string[] = [];
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer guest-token');
        requests.push(new URL(String(input)).pathname);
        const path = new URL(String(input)).pathname;
        if (path === '/api/life-record') {
          return success({ facts: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } });
        }
        if (path === '/api/readings') {
          return success({ readings: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } });
        }
        return success({ memories: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } });
      },
    });
    let sessionCalls = 0;
    const service = createMobileRecordsServiceV1({
      client,
      session: {
        async withActiveBearer(operation) {
          sessionCalls += 1;
          return operation('guest-token');
        },
      },
    });

    await service.readLifeRecordPage();
    await service.readReadingPage();
    await service.readMemoryPage();

    expect(sessionCalls).toBe(3);
    expect(requests).toEqual(['/api/life-record', '/api/readings', '/api/memories']);
  });
});


it('routes Official Reading reread through the active subject bearer', async () => {
  const readingId = '44444444-4444-4444-8444-444444444444';
  let authorization: string | null = null;
  let requested = '';
  const client = new MyeongHaApiClientV1({
    origin: 'https://myeongha.test',
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      requested = `${url.pathname}?${url.searchParams.toString()}`;
      authorization = new Headers(init?.headers).get('Authorization');
      return success({
        readingId,
        readingSessionId: '55555555-5555-4555-8555-555555555555',
        sajuDomain: 'career',
        readingContractVersion: 'myeonghwa-product-reading-response-v2',
        productResponseState: 'delivered',
        readerCharacterIds: ['seyeon'],
        completedAt: '2026-09-23T00:01:00.000Z',
        reading: {
          responseId: `reading_response_${'d'.repeat(24)}`,
          responseVersion: 'myeonghwa-product-reading-response-v2',
          state: 'delivered',
          messageCode: 'READING_DELIVERED',
          requiredAction: 'none',
          reading: {
            readingId,
            sections: [{
              sectionType: 'overview',
              title: '핵심',
              state: 'complete',
              blocks: [{ type: 'paragraph', text: '저장된 풀이' }],
            }],
            disclosures: [],
          },
        },
      });
    },
  });
  let sessionCalls = 0;
  const service = createMobileRecordsServiceV1({
    client,
    session: {
      async withActiveBearer(operation) {
        sessionCalls += 1;
        return operation('active-owner-token');
      },
    },
  });

  await expect(service.readOfficialReading(readingId)).resolves.toMatchObject({
    readingId,
    display: { kind: 'delivered' },
  });
  expect(sessionCalls).toBe(1);
  expect(authorization).toBe('Bearer active-owner-token');
  expect(requested).toBe(`/api/readings?readingId=${readingId}`);
});
