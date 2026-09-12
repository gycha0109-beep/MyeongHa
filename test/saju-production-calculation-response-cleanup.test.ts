import { describe, expect, it, vi } from 'vitest';
import type { SajuBirthRevisionBindingV1 } from '../packages/domain/src/index.js';
import {
  SajuProductionCalculationHttpAdapterErrorV1,
  createSajuProductionCalculationHttpAdapterV1,
  type SajuProductionCalculationHttpFetchV1,
  type SajuProductionCalculationHttpResponseV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';

const BEARER_TOKEN = 'test-saju-service-bearer-secret';

const BIRTH_REVISION = {
  birthRevisionRef: 'birth-revision:response-cleanup:1',
  calendarType: 'solar',
  birthDate: '2001-07-14',
  birthTime: '15:20:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
} as const satisfies SajuBirthRevisionBindingV1;

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

function adapterForResponse(response: SajuProductionCalculationHttpResponseV1) {
  const fetchImpl: SajuProductionCalculationHttpFetchV1 = async () => response;
  return createSajuProductionCalculationHttpAdapterV1({
    baseUrl: 'https://saju.example',
    bearerToken: BEARER_TOKEN,
    fetchImpl,
    timeoutMs: 100,
  });
}

function responseWithCancellation(input: {
  readonly status: number;
  readonly contentType: string;
  readonly cancel: () => Promise<void>;
  readonly text?: string;
}): {
  readonly response: SajuProductionCalculationHttpResponseV1;
  readonly text: ReturnType<typeof vi.fn>;
} {
  const text = vi.fn(async () => input.text ?? '{}');
  return {
    response: {
      status: input.status,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? input.contentType : null),
      },
      body: { cancel: input.cancel },
      text,
    },
    text,
  };
}

describe('Saju production calculation rejected-response cleanup', () => {
  it.each([
    [422, 'application/json', 'HTTP_4XX'],
    [503, 'application/json', 'HTTP_5XX'],
    [302, 'application/json', 'HTTP_UNEXPECTED_STATUS'],
    [200, 'text/plain', 'INVALID_CONTENT_TYPE'],
  ] as const)(
    'initiates non-blocking body cancellation for rejected response status=%s content-type=%s',
    async (status, contentType, expectedCode) => {
      const cancel = vi.fn(() => new Promise<void>(() => undefined));
      const fixture = responseWithCancellation({ status, contentType, cancel });
      const adapter = adapterForResponse(fixture.response);

      const error = await expectAdapterError(
        () => adapter.calculate(BIRTH_REVISION),
        expectedCode,
      );

      expect(error.httpStatus).toBe(status);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fixture.text).not.toHaveBeenCalled();
    },
  );

  it('does not let rejected body cancellation mask the established status error', async () => {
    const cancel = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const fixture = responseWithCancellation({
      status: 503,
      contentType: 'application/json',
      cancel,
    });
    const adapter = adapterForResponse(fixture.response);

    const error = await expectAdapterError(
      () => adapter.calculate(BIRTH_REVISION),
      'HTTP_5XX',
    );

    expect(error.httpStatus).toBe(503);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fixture.text).not.toHaveBeenCalled();
  });

  it('does not let a synchronous cancellation failure mask the established content-type error', async () => {
    const cancel = vi.fn((): Promise<void> => {
      throw new Error('synchronous cleanup failure');
    });
    const fixture = responseWithCancellation({
      status: 200,
      contentType: 'text/plain',
      cancel,
    });
    const adapter = adapterForResponse(fixture.response);

    const error = await expectAdapterError(
      () => adapter.calculate(BIRTH_REVISION),
      'INVALID_CONTENT_TYPE',
    );

    expect(error.httpStatus).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fixture.text).not.toHaveBeenCalled();
  });

  it('does not cancel a consumed application/json response body', async () => {
    const cancel = vi.fn(async () => undefined);
    const fixture = responseWithCancellation({
      status: 200,
      contentType: 'application/json',
      cancel,
      text: '{broken-json',
    });
    const adapter = adapterForResponse(fixture.response);

    const error = await expectAdapterError(
      () => adapter.calculate(BIRTH_REVISION),
      'INVALID_JSON',
    );

    expect(error.httpStatus).toBe(200);
    expect(fixture.text).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
