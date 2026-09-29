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
        async withGuestBearer(operation) {
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
