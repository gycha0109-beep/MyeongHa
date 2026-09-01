import { describe, expect, it, vi } from 'vitest';
import type { SajuBirthRevisionBindingV1 } from '../packages/domain/src/index.js';
import {
  SAJU_PRODUCTION_CALCULATION_HTTP_PATH_V1,
  SajuProductionCalculationHttpAdapterErrorV1,
  buildSajuProductionCalculationRequestV1,
  createSajuProductionCalculationHttpAdapterV1,
  toSajuProductionCalculationApiErrorV1,
  type SajuProductionCalculationHttpFetchV1,
  type SajuProductionCalculationHttpResponseV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';

const BIRTH_REVISION = {
  birthRevisionRef: 'birth-revision:test:1',
  calendarType: 'solar',
  birthDate: '2001-07-14',
  birthTime: '15:20:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
} as const satisfies SajuBirthRevisionBindingV1;

const PILLAR = {
  stem: { value: '갑', hanja: '甲', element: '목', yinYang: '양' },
  branch: { value: '자', hanja: '子', element: '수', yinYang: '양' },
} as const;

function responseFixture(): Record<string, unknown> {
  return {
    responseSchemaVersion: 'myeonghwa-production-calculation-http-v1',
    runtimeVersion: 'myeonghwa-production-calculation-runtime-v1',
    authority: {
      calculationPolicyId: 'myeonghwa-production-civil-midnight-v1',
      authorizationId: 'myeonghwa-production-calculation-default-authorization-v1',
      authorityRecordRef: 'docs/decisions/ADR-0006-production-calculation-default-v1.md',
      policyVersion: 'myeonghwa-production-calculation-policy-v1',
      contentHash: 'authority-content-hash',
    },
    snapshot: {
      snapshotId: 'snapshot:test:1',
      schemaVersion: 'canonical-saju-snapshot-v1',
      calculationHash: 'calculation-hash',
      createdAt: '2026-09-01T22:00:00.000Z',
      input: {
        calendarType: 'solar',
        date: { year: 2001, month: 7, day: 14 },
        time: { known: true, hour: 15, minute: 20 },
        sexForTraditionalCalculation: 'unspecified',
      },
      policy: {
        policyId: 'myeonghwa/production/civil-midnight-v1',
        policyVersion: 'myeonghwa-production-calculation-policy-v1',
        dayBoundary: 'midnight',
        trueSolarTime: {
          enabled: false,
          longitudeSource: 'not-applicable',
          applyEquationOfTime: false,
          applyHistoricalDst: false,
        },
        timeZonePolicy: { source: 'service-default', timeZone: 'Asia/Seoul' },
        unknownBirthTimePolicy: 'preserve-unknown-and-enumerate-boundaries',
      },
      normalized: {},
      pillars: {
        year: { status: 'resolved', value: PILLAR },
        month: { status: 'resolved', value: PILLAR },
        day: { status: 'resolved', value: PILLAR },
        hour: { status: 'unavailable', reasonCode: 'TEST_HOUR_UNAVAILABLE' },
      },
      derivedFacts: {},
      luckCycle: { status: 'unavailable', reasonCode: 'TEST_LUCK_UNAVAILABLE' },
      completeness: {
        birthTimeKnown: true,
        fullyResolved: false,
        resolvedPaths: ['pillars.year', 'pillars.month', 'pillars.day'],
        ambiguousPaths: [],
        unavailablePaths: ['pillars.hour'],
      },
      provenance: {
        engine: {
          name: 'myeonghwa-saju-engine',
          version: 'engine-v1',
          sourceRepository: 'gycha0109-beep/Saju',
        },
        adapter: { name: 'manseryeok', version: '2.0.0' },
        policy: {
          id: 'myeonghwa/production/civil-midnight-v1',
          version: 'myeonghwa-production-calculation-policy-v1',
        },
        schema: { id: 'canonical-saju-snapshot', version: 'v1' },
        datasets: [],
      },
    },
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  contentType = 'application/json; charset=utf-8',
): SajuProductionCalculationHttpResponseV1 {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

async function expectAdapterError(
  execute: () => Promise<unknown>,
  code: SajuProductionCalculationHttpAdapterErrorV1['code'],
): Promise<SajuProductionCalculationHttpAdapterErrorV1> {
  try {
    await execute();
    throw new Error('Expected SajuProductionCalculationHttpAdapterErrorV1.');
  } catch (error) {
    expect(error).toBeInstanceOf(SajuProductionCalculationHttpAdapterErrorV1);
    const typed = error as SajuProductionCalculationHttpAdapterErrorV1;
    expect(typed.code).toBe(code);
    return typed;
  }
}

describe('Saju production calculation HTTP adapter v1', () => {
  it('maps a bound birth revision to the calculation-only request without policy or reading injection surface', () => {
    const request = buildSajuProductionCalculationRequestV1(BIRTH_REVISION);

    expect(request).toEqual({
      birth: {
        calendarType: 'solar',
        date: '2001-07-14',
        time: '15:20',
        sex: 'unspecified',
      },
    });
    expect(JSON.stringify(request)).not.toContain('calculationPolicyId');
    expect(JSON.stringify(request)).not.toContain('reading');
    expect(JSON.stringify(request)).not.toContain('interpretation');

    expect(
      buildSajuProductionCalculationRequestV1({
        ...BIRTH_REVISION,
        calendarType: 'lunar',
        isLeapMonth: true,
        birthTime: null,
        timeKnown: false,
        sex: null,
      }),
    ).toEqual({
      birth: {
        calendarType: 'lunar',
        date: '2001-07-14',
        time: null,
        isLeapMonth: true,
      },
    });
  });

  it('posts only to /api/calculations and forces every 200 response through the ingress boundary', async () => {
    const calls: Array<{ url: string; body: unknown; redirect: string; aborted: boolean }> = [];
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (url, init) => {
      calls.push({
        url,
        body: JSON.parse(init.body) as unknown,
        redirect: init.redirect,
        aborted: init.signal.aborted,
      });
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        accept: 'application/json',
        'content-type': 'application/json',
      });
      return jsonResponse(responseFixture());
    };

    const adapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.internal.example',
      fetchImpl,
      timeoutMs: 100,
    });
    const artifact = await adapter.calculate(BIRTH_REVISION);

    expect(calls).toEqual([
      {
        url: `https://saju.internal.example${SAJU_PRODUCTION_CALCULATION_HTTP_PATH_V1}`,
        body: {
          birth: {
            calendarType: 'solar',
            date: '2001-07-14',
            time: '15:20',
            sex: 'unspecified',
          },
        },
        redirect: 'manual',
        aborted: false,
      },
    ]);
    expect(artifact).toMatchObject({
      schemaVersion: 'myeongha-saju-production-calculation-ingress-v1',
      kind: 'saju_calculation_evidence',
      semanticAuthority: 'calculation_only',
      interpretationAuthorized: false,
      birthRevisionRef: 'birth-revision:test:1',
    });
  });

  it('fails closed on invalid endpoint configuration and invalid stored birth revision shape', async () => {
    expect(() =>
      createSajuProductionCalculationHttpAdapterV1({ baseUrl: 'file:///tmp/saju' }),
    ).toThrowError(SajuProductionCalculationHttpAdapterErrorV1);
    expect(() =>
      createSajuProductionCalculationHttpAdapterV1({ baseUrl: 'https://user:pass@saju.example' }),
    ).toThrowError(SajuProductionCalculationHttpAdapterErrorV1);
    expect(() =>
      createSajuProductionCalculationHttpAdapterV1({ baseUrl: 'https://saju.example/service' }),
    ).toThrowError(SajuProductionCalculationHttpAdapterErrorV1);
    expect(() =>
      createSajuProductionCalculationHttpAdapterV1({ baseUrl: 'https://saju.example', timeoutMs: 0 }),
    ).toThrowError(SajuProductionCalculationHttpAdapterErrorV1);

    const fetchImpl = vi.fn<SajuProductionCalculationHttpFetchV1>();
    const adapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.example',
      fetchImpl,
    });
    await expectAdapterError(
      () => adapter.calculate({ ...BIRTH_REVISION, birthTime: '15:20:01' }),
      'INVALID_BIRTH_REVISION',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('separates timeout, network, 4xx, 5xx, redirect/status, content-type, and JSON failures', async () => {
    const cases: readonly [
      string,
      SajuProductionCalculationHttpFetchV1,
      SajuProductionCalculationHttpAdapterErrorV1['code'],
      number | null,
    ][] = [
      [
        'network',
        async () => {
          throw new Error('socket reset');
        },
        'NETWORK_FAILURE',
        null,
      ],
      ['4xx', async () => jsonResponse({}, 400), 'HTTP_4XX', 400],
      ['5xx', async () => jsonResponse({}, 503), 'HTTP_5XX', 503],
      ['redirect', async () => jsonResponse({}, 302), 'HTTP_UNEXPECTED_STATUS', 302],
      ['content-type', async () => jsonResponse('{}', 200, 'text/plain'), 'INVALID_CONTENT_TYPE', 200],
      ['json', async () => jsonResponse('{broken-json', 200), 'INVALID_JSON', 200],
    ];

    for (const [, fetchImpl, expectedCode, expectedStatus] of cases) {
      const adapter = createSajuProductionCalculationHttpAdapterV1({
        baseUrl: 'https://saju.example',
        fetchImpl,
        timeoutMs: 100,
      });
      const error = await expectAdapterError(() => adapter.calculate(BIRTH_REVISION), expectedCode);
      expect(error.httpStatus).toBe(expectedStatus);
    }

    const timeoutAdapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.example',
      timeoutMs: 5,
      fetchImpl: async () => new Promise<SajuProductionCalculationHttpResponseV1>(() => undefined),
    });
    await expectAdapterError(() => timeoutAdapter.calculate(BIRTH_REVISION), 'TIMEOUT');
  });

  it('rejects a syntactically successful upstream response when ingress authority or birth binding fails', async () => {
    const unauthorized = responseFixture();
    (unauthorized.authority as Record<string, unknown>).calculationPolicyId = 'caller-selected-policy';
    const unauthorizedAdapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.example',
      fetchImpl: async () => jsonResponse(unauthorized),
    });
    const unauthorizedError = await expectAdapterError(
      () => unauthorizedAdapter.calculate(BIRTH_REVISION),
      'INGRESS_REJECTED',
    );
    expect(unauthorizedError.ingressCode).toBe('UNAUTHORIZED_CALCULATION');

    const mismatched = responseFixture();
    const snapshot = mismatched.snapshot as Record<string, unknown>;
    const input = snapshot.input as Record<string, unknown>;
    input.date = { year: 2001, month: 7, day: 15 };
    const mismatchedAdapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.example',
      fetchImpl: async () => jsonResponse(mismatched),
    });
    const mismatchedError = await expectAdapterError(
      () => mismatchedAdapter.calculate(BIRTH_REVISION),
      'INGRESS_REJECTED',
    );
    expect(mismatchedError.ingressCode).toBe('BIRTH_REVISION_MISMATCH');
  });

  it('collapses internal transport detail to the public SAJU_TEMPORARILY_UNAVAILABLE API code', () => {
    const internal = new SajuProductionCalculationHttpAdapterErrorV1(
      'HTTP_5XX',
      'upstream detail',
      503,
    );
    const apiError = toSajuProductionCalculationApiErrorV1(internal);

    expect(apiError.code).toBe('SAJU_TEMPORARILY_UNAVAILABLE');
    expect(apiError.message).toBe('Saju calculation is temporarily unavailable.');
    expect(apiError.message).not.toContain('503');
    expect(apiError.message).not.toContain('upstream detail');
  });
});
