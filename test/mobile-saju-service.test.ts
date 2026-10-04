import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileSajuServiceV1 } from '../apps/mobile/src/features/saju/mobile-saju-service.js';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } },
    { status: 200 },
  );
}

const resolvedPillar = {
  status: 'resolved',
  value: {
    stem: { value: '갑', hanja: '甲', element: '목', yinYang: '양' },
    branch: { value: '자', hanja: '子', element: '수', yinYang: '양' },
  },
};

const calculation = {
  schemaVersion: 'myeongha-saju-production-calculation-ingress-v1',
  kind: 'saju_calculation_evidence',
  semanticAuthority: 'calculation_only',
  interpretationAuthorized: false,
  birthRevisionRef: 'revision-1',
  snapshot: {
    snapshotId: 'snapshot-1',
    schemaVersion: 'snapshot-v1',
    calculationHash: 'hash-1',
    createdAt: '2026-09-29T00:00:00.000Z',
    pillars: {
      year: resolvedPillar,
      month: resolvedPillar,
      day: resolvedPillar,
      hour: resolvedPillar,
    },
    completeness: {
      birthTimeKnown: true,
      fullyResolved: true,
      resolvedPaths: ['year', 'month', 'day', 'hour'],
      ambiguousPaths: [],
      unavailablePaths: [],
    },
  },
};

describe('mobile Saju service', () => {
  it('routes calculation through the subject session bearer and sends no body', async () => {
    let body: BodyInit | null | undefined = 'unexpected';
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_url, init) => {
        body = init?.body;
        authorization = new Headers(init?.headers).get('Authorization');
        return success({ calculation });
      },
    });
    let sessionCalls = 0;
    const service = createMobileSajuServiceV1({
      client,
      session: {
        async withActiveBearer(operation) {
          sessionCalls += 1;
          return operation('opaque-mobile-token');
        },
      },
    });

    const result = await service.calculateCurrent();

    expect(sessionCalls).toBe(1);
    expect(authorization).toBe('Bearer opaque-mobile-token');
    expect(body).toBeUndefined();
    expect(result.semanticAuthority).toBe('calculation_only');
  });
});
