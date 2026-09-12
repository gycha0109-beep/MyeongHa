import { describe, expect, it } from 'vitest';
import { isGuestPromotionEmptyRequestBodyV1 } from '../apps/api/src/guest-promotion-request-body.js';

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

  it('does not let cancellation failure replace an already-decided invalid result', async () => {
    const input = streamRequest(['['], {
      cancel: () => Promise.reject(new Error('cancel failed')),
    });

    await expect(isGuestPromotionEmptyRequestBodyV1(input.request)).resolves.toBe(false);
    expect(input.stream.locked).toBe(false);
  });
});
