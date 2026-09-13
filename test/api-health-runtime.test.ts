import { describe, expect, it } from 'vitest';
import healthEndpoint from '../api/health.js';

function requestWithCancellation(
  cancel: () => void | PromiseLike<void>,
): Readonly<{
  request: Request;
  cancelCalls: () => number;
}> {
  let calls = 0;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      calls += 1;
      return cancel();
    },
  });

  return Object.freeze({
    request: new Request('https://myeongha.example/api/health', {
      method: 'PUT',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

describe('GET /api/health', () => {
  it('proves the executable API runtime without depending on user identity or DB state', async () => {
    const response = healthEndpoint.fetch(
      new Request('https://myeongha.example/api/health', { method: 'GET' }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns 405 without waiting for unused-body cancellation to settle', () => {
    const source = requestWithCancellation(() => new Promise<void>(() => undefined));

    const response = healthEndpoint.fetch(source.request);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(source.cancelCalls()).toBe(1);
  });

  it('keeps 405 authoritative when unused-body cancellation rejects', async () => {
    const source = requestWithCancellation(() =>
      Promise.reject(new Error('synthetic cancellation failure')),
    );

    const response = healthEndpoint.fetch(source.request);
    await Promise.resolve();

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(source.cancelCalls()).toBe(1);
  });

  it('keeps bodyless method rejection harmless', () => {
    const request = new Request('https://myeongha.example/api/health', {
      method: 'POST',
    });

    const response = healthEndpoint.fetch(request);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(request.body).toBeNull();
  });
});
