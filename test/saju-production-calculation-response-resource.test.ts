import { describe, expect, it } from 'vitest';
import type { SajuBirthRevisionBindingV1 } from '../packages/domain/src/index.js';
import {
  SajuProductionCalculationHttpAdapterErrorV1,
  createSajuProductionCalculationHttpAdapterV1,
  toSajuProductionCalculationApiErrorV1,
  type SajuProductionCalculationHttpFetchV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';
import { SAJU_CALCULATION_JSON_RESPONSE_MAXIMUM_BYTES_V1 } from '../apps/api/src/upstream-json-response-resource.js';

const BIRTH_REVISION = {
  birthRevisionRef: 'birth-revision:resource:1',
  calendarType: 'solar',
  birthDate: '2001-07-14',
  birthTime: '15:20:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
} as const satisfies SajuBirthRevisionBindingV1;

describe('Saju production calculation response resource boundary', () => {
  it('rejects an over-limit successful JSON response before semantic ingress and preserves public collapse', async () => {
    let cancelled = false;
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async () => ({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(SAJU_CALCULATION_JSON_RESPONSE_MAXIMUM_BYTES_V1 + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
    });

    const adapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.example',
      bearerToken: 'resource-test-secret',
      fetchImpl,
      timeoutMs: 1_000,
    });

    let error: unknown;
    try {
      await adapter.calculate(BIRTH_REVISION);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SajuProductionCalculationHttpAdapterErrorV1);
    const typed = error as SajuProductionCalculationHttpAdapterErrorV1;
    expect(typed.code).toBe('RESPONSE_TOO_LARGE');
    expect(typed.httpStatus).toBe(200);
    expect(cancelled).toBe(true);

    const apiError = toSajuProductionCalculationApiErrorV1(typed);
    expect(apiError.code).toBe('SAJU_TEMPORARILY_UNAVAILABLE');
    expect(apiError.message).toBe('Saju calculation is temporarily unavailable.');
  });
});
