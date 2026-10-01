import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileMyServiceV1 } from '../apps/mobile/src/features/my/mobile-my-service.js';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } },
    { status: 200 },
  );
}

describe('mobile My service', () => {
  it('routes Profile and Birth reads through the subject session boundary', async () => {
    const paths: string[] = [];
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer guest-token');
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path === '/api/me') {
          return success({
            subjectId: 'subject-1',
            subjectKind: 'guest',
            subjectStatus: 'active',
            profile: null,
          });
        }
        return success({ birthProfile: null });
      },
    });
    let sessionCalls = 0;
    const service = createMobileMyServiceV1({
      client,
      session: {
        async withActiveBearer(operation) {
          sessionCalls += 1;
          return operation('guest-token');
        },
      },
    });

    await service.readProfile();
    await service.readBirth();

    expect(sessionCalls).toBe(2);
    expect(paths).toEqual(['/api/me', '/api/me/birth-profile']);
  });
});
