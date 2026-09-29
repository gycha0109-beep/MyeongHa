import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  type BirthProfileCreateRequestV1,
} from '../packages/api-client/src/index.js';
import { createMobileBirthServiceV1 } from '../apps/mobile/src/features/birth/mobile-birth-service.js';

function success(data: unknown, status = 200): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } },
    { status },
  );
}

describe('mobile Birth service', () => {
  it('routes Birth reads and creates through the subject session bearer boundary', async () => {
    const observed: Array<{ url: string; method: string; authorization: string | null }> = [];
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (url, init) => {
        observed.push({
          url: String(url),
          method: init?.method ?? '',
          authorization: new Headers(init?.headers).get('Authorization'),
        });
        if (init?.method === 'GET') return success({ birthProfile: null });
        return success(
          { birthProfileId: 'birth-1', revisionId: 'revision-1', revisionNo: 1 },
          201,
        );
      },
    });
    let sessionCalls = 0;
    const service = createMobileBirthServiceV1({
      client,
      session: {
        async withGuestBearer(operation) {
          sessionCalls += 1;
          return operation('opaque-mobile-token');
        },
      },
    });

    await expect(service.readCurrent()).resolves.toBeNull();

    const request: BirthProfileCreateRequestV1 = {
      label: null,
      input: {
        calendarType: 'solar',
        birthDate: '1995-08-17',
        birthTime: null,
        timeKnown: false,
        isLeapMonth: false,
        sex: null,
      },
    };
    await expect(service.create(request)).resolves.toMatchObject({
      birthProfileId: 'birth-1',
      revisionNo: 1,
    });

    expect(sessionCalls).toBe(2);
    expect(observed).toEqual([
      {
        url: 'https://myeongha.test/api/me/birth-profile',
        method: 'GET',
        authorization: 'Bearer opaque-mobile-token',
      },
      {
        url: 'https://myeongha.test/api/birth-profiles',
        method: 'POST',
        authorization: 'Bearer opaque-mobile-token',
      },
    ]);
  });
});
