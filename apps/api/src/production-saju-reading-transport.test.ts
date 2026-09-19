import { describe, expect, it, vi } from 'vitest';
import {
  createProductionSajuReadingTransportV1,
} from './production-saju-reading-transport.js';
import type { SajuProductionCalculationHttpRequestInitV1 } from './saju-production-calculation-http-adapter.js';
import {
  buildSajuProductionReadingRequestV1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
} from './saju-production-reading-http-adapter.js';

const ENV = Object.freeze({
  MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.example.test',
  MYEONGHA_SAJU_SERVICE_BEARER: 'server-owned-reading-credential',
});

const BIRTH_REVISION = Object.freeze({
  birthRevisionRef: 'revision-1',
  calendarType: 'solar' as const,
  birthDate: '2000-01-02',
  birthTime: null,
  timeKnown: false,
  isLeapMonth: false,
  sex: 'male' as const,
});

function attestedResponse(body: unknown) {
  return {
    status: 200,
    headers: {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === 'content-type') return 'application/json';
        if (normalized === SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1) {
          return SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1;
        }
        return null;
      },
    },
    body: null,
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe('production Saju Product Reading transport composition', () => {
  it('uses only server-owned Saju origin/credential and accepts source-attested output', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: SajuProductionCalculationHttpRequestInitV1) =>
      attestedResponse({
        responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
        state: 'temporarily_unavailable',
      }),
    );

    const transport = createProductionSajuReadingTransportV1({
      env: ENV,
      sajuFetchImpl: fetchImpl,
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '전체 사주',
    });

    await expect(transport.requestReading(request)).resolves.toMatchObject({
      responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
      state: 'temporarily_unavailable',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://saju.example.test/api/readings');
    expect(init?.headers.authorization).toBe('Bearer server-owned-reading-credential');
  });

  it('fails closed when the authenticated Saju service omits source admission attestation', async () => {
    const transport = createProductionSajuReadingTransportV1({
      env: ENV,
      sajuFetchImpl: async () => ({
        status: 200,
        headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
        body: null,
        async text() {
          return JSON.stringify({ state: 'delivered' });
        },
      }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '직업운',
    });

    await expect(transport.requestReading(request)).rejects.toMatchObject({
      code: 'RESPONSE_ADMISSION_ATTESTATION_REJECTED',
    });
  });
});
