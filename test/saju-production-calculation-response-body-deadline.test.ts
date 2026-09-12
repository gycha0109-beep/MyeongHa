import { describe, expect, it, vi } from 'vitest';
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

function response(
  status: number,
  contentType: string,
  text: () => Promise<string>,
): SajuProductionCalculationHttpResponseV1 {
  return {
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? contentType : null;
      },
    },
    text,
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
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      let bodyStarted = false;
      const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (_url, init) => {
        signal = init.signal;
        return response(200, 'application/json', () => {
          bodyStarted = true;
          return new Promise<string>((_resolve, reject) => {
            if (init.signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            init.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
        });
      };
      const adapter = createSajuProductionCalculationHttpAdapterV1({
        baseUrl: 'https://saju.example',
        bearerToken: 'deadline-test-secret',
        timeoutMs: 25,
        fetchImpl,
      });

      const result = adapter.calculate(BIRTH_REVISION).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(bodyStarted).toBe(true);
      expect(signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(24);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const error = await result;
      expect(error).toBeInstanceOf(SajuProductionCalculationHttpAdapterErrorV1);
      expect((error as SajuProductionCalculationHttpAdapterErrorV1).code).toBe('TIMEOUT');
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the deadline on status and content-type rejection without consuming the body', async () => {
    vi.useFakeTimers();
    try {
      for (const testCase of [
        { status: 400, contentType: 'application/json', code: 'HTTP_4XX' as const },
        { status: 200, contentType: 'text/plain', code: 'INVALID_CONTENT_TYPE' as const },
      ]) {
        let signal: AbortSignal | undefined;
        let bodyReads = 0;
        const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (_url, init) => {
          signal = init.signal;
          return response(testCase.status, testCase.contentType, async () => {
            bodyReads += 1;
            return '{}';
          });
        };
        const adapter = createSajuProductionCalculationHttpAdapterV1({
          baseUrl: 'https://saju.example',
          bearerToken: 'deadline-test-secret',
          timeoutMs: 25,
          fetchImpl,
        });

        const error = await settledError(adapter.calculate(BIRTH_REVISION));
        expect(error.code).toBe(testCase.code);
        expect(bodyReads).toBe(0);
        expect(signal?.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(100);
        expect(signal?.aborted).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the deadline after a completed response body read', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      let bodyReads = 0;
      const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (_url, init) => {
        signal = init.signal;
        return response(200, 'application/json; charset=utf-8', async () => {
          bodyReads += 1;
          return '{broken-json';
        });
      };
      const adapter = createSajuProductionCalculationHttpAdapterV1({
        baseUrl: 'https://saju.example',
        bearerToken: 'deadline-test-secret',
        timeoutMs: 25,
        fetchImpl,
      });

      const error = await settledError(adapter.calculate(BIRTH_REVISION));
      expect(error.code).toBe('INVALID_JSON');
      expect(bodyReads).toBe(1);
      expect(signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(100);
      expect(signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
