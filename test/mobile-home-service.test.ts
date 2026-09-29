import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileHomeServiceV1 } from '../apps/mobile/src/features/home/mobile-home-service.js';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-home' } },
    { status: 200 },
  );
}

describe('mobile Home service', () => {
  it('uses existing source-backed endpoints and requests only one recent Reading', async () => {
    const requested: string[] = [];
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer guest-token');
        const url = new URL(String(input));
        requested.push(url.pathname + url.search);

        if (url.pathname === '/api/me') {
          return success({
            subjectId: 'subject-1',
            subjectKind: 'guest',
            subjectStatus: 'active',
            profile: null,
          });
        }
        if (url.pathname === '/api/me/birth-profile') {
          return success({ birthProfile: null });
        }
        if (url.pathname === '/api/readings') {
          return success({
            readings: [],
            pagination: { pageSize: 1, hasMore: false, nextCursor: null },
          });
        }
        return success({
          calculation: {
            schemaVersion: 'calc.v1',
            kind: 'saju_calculation_evidence',
            semanticAuthority: 'calculation_only',
            interpretationAuthorized: false,
            birthRevisionRef: 'revision-1',
            snapshot: {
              snapshotId: 'snapshot-1',
              schemaVersion: 'snapshot.v1',
              calculationHash: 'hash-1',
              createdAt: '2026-09-29T00:00:00.000Z',
              pillars: {
                year: { status: 'unavailable', reasonCode: 'test' },
                month: { status: 'unavailable', reasonCode: 'test' },
                day: { status: 'unavailable', reasonCode: 'test' },
                hour: { status: 'unavailable', reasonCode: 'test' },
              },
              completeness: {
                birthTimeKnown: false,
                fullyResolved: false,
                resolvedPaths: [],
                ambiguousPaths: [],
                unavailablePaths: ['pillars'],
              },
            },
          },
        });
      },
    });
    let sessionCalls = 0;
    const service = createMobileHomeServiceV1({
      client,
      session: {
        async withGuestBearer(operation) {
          sessionCalls += 1;
          return operation('guest-token');
        },
      },
    });

    await service.readProfile();
    await service.readBirth();
    await service.readLatestReading();
    await service.calculateCurrentSaju();

    expect(sessionCalls).toBe(4);
    expect(requested).toEqual([
      '/api/me',
      '/api/me/birth-profile',
      '/api/readings?pageSize=1',
      '/api/me/saju/calculation',
    ]);
  });
});
