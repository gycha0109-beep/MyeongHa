import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGuestPromotionEmptyRequestBodyV1 } from '../apps/api/src/guest-promotion-request-body.js';
import {
  INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from '../apps/api/src/ingress-request-body-deadline.js';

const encoder = new TextEncoder();

function streamRequest(
  chunks: readonly string[],
  options: Readonly<{
    close?: boolean;
    cancel?: () => void | Promise<void>;
  }> = {},
): { request: Request; stream: ReadableStream<Uint8Array> } {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (options.close === true) controller.close();
    },
    ...(options.cancel === undefined ? {} : { cancel: options.cancel }),
  });
  const request = new Request('https://myeongha.example/api/auth/promote-guest', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return { request, stream };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Guest promotion streaming request-body validation', () => {
  it('accepts omitted, explicit-empty, and JS-trim-whitespace-only bodies', async () => {
    const omitted = new Request('https://myeongha.example/api/auth/promote-guest', {
      method: 'POST',
    });
    await expect(isGuestPromotionEmptyRequestBodyV1(omitted)).resolves.toBe(true);

    const empty = streamRequest([], { close: true });
    await expect(isGuestPromotionEmptyRequestBodyV1(empty.request)).resolves.toBe(true);
    expect(empty.stream.locked).toBe(false);

    const whitespace = new Request('https://myeongha.example/api/auth/promote-guest', {
      method: 'POST',
      body: '\u00a0\t\r\n ',
    });
    await expect(isGuestPromotionEmptyRequestBodyV1(whitespace)).resolves.toBe(true);
  });

  it('accepts a JSON empty object split across chunks with JSON whitespace', async () => {
    const input = streamRequest([' \n{', '\t\r', '} \n'], { close: true });

    await expect(isGuestPromotionEmptyRequestBodyV1(input.request)).resolves.toBe(true);
    expect(input.stream.locked).toBe(false);
  });

  it('preserves JSON.parse whitespace semantics for an object body', async () => {
    const leadingNbsp = new Request('https://myeongha.example/api/auth/promote-guest', {
      method: 'POST',
      body: '\u00a0{}',
    });
    const internalNbsp = new Request('https://myeongha.example/api/auth/promote-guest', {
      method: 'POST',
      body: '{\u00a0}',
    });
    const trailingNbsp = new Request('https://myeongha.example/api/auth/promote-guest', {
      method: 'POST',
      body: '{}\u00a0',
    });

    await expect(isGuestPromotionEmptyRequestBodyV1(leadingNbsp)).resolves.toBe(false);
    await expect(isGuestPromotionEmptyRequestBodyV1(internalNbsp)).resolves.toBe(false);
    await expect(isGuestPromotionEmptyRequestBodyV1(trailingNbsp)).resolves.toBe(false);
  });

  it('rejects and cancels a provably non-empty object without waiting for EOF', async () => {
    let cancelled = false;
    const input = streamRequest(['{"unexpected":'], {
      cancel() {
        cancelled = true;
      },
    });

    await expect(isGuestPromotionEmptyRequestBodyV1(input.request)).resolves.toBe(false);
    expect(cancelled).toBe(true);
    expect(input.stream.locked).toBe(false);
  });

  it('rejects arrays and primitives as soon as their first non-whitespace byte arrives', async () => {
    for (const value of ['[', '1', '"']) {
      let cancelled = false;
      const input = streamRequest([value], {
        cancel() {
          cancelled = true;
        },
      });

      await expect(isGuestPromotionEmptyRequestBodyV1(input.request)).resolves.toBe(false);
      expect(cancelled).toBe(true);
      expect(input.stream.locked).toBe(false);
    }
  });

  it('rejects and cancels trailing garbage after a complete empty object', async () => {
    let cancelled = false;
    const input = streamRequest(['{}x'], {
      cancel() {
        cancelled = true;
      },
    });

    await expect(isGuestPromotionEmptyRequestBodyV1(input.request)).resolves.toBe(false);
    expect(cancelled).toBe(true);
    expect(input.stream.locked).toBe(false);
  });

  it('rejects a provably invalid stream without waiting for cancellation settlement', async () => {
    let cancelCalls = 0;
    const input = streamRequest(['['], {
      cancel() {
        cancelCalls += 1;
        return new Promise<void>(() => undefined);
      },
    });

    await expect(isGuestPromotionEmptyRequestBodyV1(input.request)).resolves.toBe(false);
    expect(cancelCalls).toBe(1);
    expect(input.stream.locked).toBe(false);
  });

  it('does not let cancellation failure replace an already-decided invalid result', async () => {
    let cancelCalls = 0;
    const input = streamRequest(['['], {
      cancel() {
        cancelCalls += 1;
        return Promise.reject(new Error('cancel failed'));
      },
    });

    await expect(isGuestPromotionEmptyRequestBodyV1(input.request)).resolves.toBe(false);
    await Promise.resolve();
    expect(cancelCalls).toBe(1);
    expect(input.stream.locked).toBe(false);
  });

  it.each([
    ['complete empty object', ['{}']],
    ['accepted whitespace prefix', [' \t\n']],
    ['zero-length chunks', ['', '', '']],
  ] as const)('expires a non-closing %s at the governed absolute deadline', async (_name, chunks) => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const input = streamRequest(chunks, {
      cancel() {
        cancelCalls += 1;
      },
    });

    const result = isGuestPromotionEmptyRequestBodyV1(input.request);
    const rejection = expect(result).rejects.toBeInstanceOf(
      IngressRequestBodyCompletionDeadlineExceededV1,
    );
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    await rejection;

    expect(cancelCalls).toBe(1);
    expect(input.stream.locked).toBe(false);
  });

  it('uses one absolute deadline that incoming chunks cannot reset', async () => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        setTimeout(() => controller.enqueue(encoder.encode('{')), 1_000);
        setTimeout(() => controller.enqueue(encoder.encode('}')), 2_000);
        setTimeout(() => controller.enqueue(encoder.encode(' ')), 2_900);
      },
      cancel() {
        cancelCalls += 1;
      },
    });
    const request = new Request('https://myeongha.example/api/auth/promote-guest', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const result = isGuestPromotionEmptyRequestBodyV1(request);
    const rejection = expect(result).rejects.toBeInstanceOf(
      IngressRequestBodyCompletionDeadlineExceededV1,
    );
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    await rejection;

    expect(cancelCalls).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it('rejects delayed trailing non-whitespace before the completion deadline', async () => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{}'));
        setTimeout(() => controller.enqueue(encoder.encode('x')), 1_000);
      },
      cancel() {
        cancelCalls += 1;
      },
    });
    const request = new Request('https://myeongha.example/api/auth/promote-guest', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const result = isGuestPromotionEmptyRequestBodyV1(request);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toBe(false);
    expect(cancelCalls).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it('does not await non-settling cancellation after the deadline fires', async () => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const input = streamRequest(['{}'], {
      cancel() {
        cancelCalls += 1;
        return new Promise<void>(() => undefined);
      },
    });

    const result = isGuestPromotionEmptyRequestBodyV1(input.request);
    const rejection = expect(result).rejects.toBeInstanceOf(
      IngressRequestBodyCompletionDeadlineExceededV1,
    );
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    await rejection;

    expect(cancelCalls).toBe(1);
    expect(input.stream.locked).toBe(false);
  });

  it('does not let cancellation rejection replace the deadline error', async () => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const input = streamRequest(['{}'], {
      cancel() {
        cancelCalls += 1;
        return Promise.reject(new Error('cancel failed'));
      },
    });

    const result = isGuestPromotionEmptyRequestBodyV1(input.request);
    const rejection = expect(result).rejects.toBeInstanceOf(
      IngressRequestBodyCompletionDeadlineExceededV1,
    );
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    await rejection;
    await Promise.resolve();

    expect(cancelCalls).toBe(1);
    expect(input.stream.locked).toBe(false);
  });
});
