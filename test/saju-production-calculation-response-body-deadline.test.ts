import { describe, expect, it } from 'vitest';
import type { SajuBirthRevisionBindingV1 } from '../packages/domain/src/index.js';
import {
  SajuProductionCalculationHttpAdapterErrorV1,
  createSajuProductionCalculationHttpAdapterV1,
  type SajuProductionCalculationHttpFetchV1,
  type SajuProductionCalculationHttpResponseV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';

const BIRTH_REVISION = {
  birthRevisionRef: 'birth-revision:deadline:1',
  calendarType: 'solar',
  birthDate: '2001-07-14',
  birthTime: '15:20:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
} as const satisfies SajuBirthRevisionBindingV1;

const encoder = new TextEncoder();

function response(
  status: number,
  contentType: string,
  body: ReadableStream<Uint8Array> | null,
): SajuProductionCalculationHttpResponseV1 {
  return {
    status,
    headers: new Headers({ 'Content-Type': contentType }),
    body,
  };
}

async function settledError(
  execute: Promise<unknown>,
): Promise<SajuProductionCalculationHttpAdapterErrorV1> {
  const error = await execute.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(SajuProductionCalculationHttpAdapterErrorV1);
  return error as SajuProductionCalculationHttpAdapterErrorV1;
}

describe('Saju production calculation response body deadline', () => {
  it('keeps the configured deadline active after headers arrive and maps a non-closing body to TIMEOUT', async () => {
    let signal: AbortSignal | undefined;
    let bodyStarted = false;
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (_url, init) => {
      signal = init.signal;
      return response(
        200,
        'application/json',
        new ReadableStream<Uint8Array>({
          start(controller) {
            bodyStarted = true;
            init.signal.addEventListener(
              'abort',
              () => controller.error(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          },
        }, { highWaterMark: 0 }),
      );
    };
    const adapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.example',
      bearerToken: 'deadline-test-secret',
      timeoutMs: 25,
      fetchImpl,
    });

    const error = await settledError(adapter.calculate(BIRTH_REVISION));

    expect(bodyStarted).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(error.code).toBe('TIMEOUT');
  });

  it('releases the deadline on status and content-type rejection without consuming the body', async () => {
    for (const testCase of [
      { status: 400, contentType: 'application/json', code: 'HTTP_4XX' as const },
      { status: 200, contentType: 'text/plain', code: 'INVALID_CONTENT_TYPE' as const },
    ]) {
      let signal: AbortSignal | undefined;
      let bodyPulls = 0;
      const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (_url, init) => {
        signal = init.signal;
        return response(
          testCase.status,
          testCase.contentType,
          new ReadableStream<Uint8Array>({
            pull(controller) {
              bodyPulls += 1;
              controller.enqueue(encoder.encode('{}'));
              controller.close();
            },
          }, { highWaterMark: 0 }),
        );
      };
      const adapter = createSajuProductionCalculationHttpAdapterV1({
        baseUrl: 'https://saju.example',
        bearerToken: 'deadline-test-secret',
        timeoutMs: 25,
        fetchImpl,
      });

      const error = await settledError(adapter.calculate(BIRTH_REVISION));
      expect(error.code).toBe(testCase.code);
      expect(bodyPulls).toBe(0);
      expect(signal?.aborted).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(signal?.aborted).toBe(false);
    }
  });

  it('releases the deadline after a completed response body read', async () => {
    let signal: AbortSignal | undefined;
    let bodyPulls = 0;
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (_url, init) => {
      signal = init.signal;
      return response(
        200,
        'application/json; charset=utf-8',
        new ReadableStream<Uint8Array>({
          pull(controller) {
            bodyPulls += 1;
            controller.enqueue(encoder.encode('{broken-json'));
            controller.close();
          },
        }, { highWaterMark: 0 }),
      );
    };
    const adapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: 'https://saju.example',
      bearerToken: 'deadline-test-secret',
      timeoutMs: 25,
      fetchImpl,
    });

    const error = await settledError(adapter.calculate(BIRTH_REVISION));
    expect(error.code).toBe('INVALID_JSON');
    expect(bodyPulls).toBe(1);
    expect(signal?.aborted).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal?.aborted).toBe(false);
  });
});
