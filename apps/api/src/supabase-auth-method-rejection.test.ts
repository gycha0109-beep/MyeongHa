import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleSupabaseAuthRequestV1,
  type SupabaseAuthActionV1,
} from './supabase-auth-http.js';

const actions: readonly SupabaseAuthActionV1[] = [
  'sign-in',
  'sign-up',
  'refresh',
  'sign-out',
];
const invalidEnv = {} as Parameters<typeof handleSupabaseAuthRequestV1>[0]['env'];

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
    request: new Request('https://myeongha.example/api/auth/sign-in', {
      method: 'PUT',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancelCalls: () => calls,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase Auth terminal method rejection', () => {
  it.each(actions)(
    'returns %s 405 without cancelling the runtime-owned request body',
    async (action) => {
      const source = requestWithCancellation(() => new Promise<void>(() => undefined));
      const upstream = vi.fn();
      vi.stubGlobal('fetch', upstream);

      const response = await handleSupabaseAuthRequestV1({
        request: source.request,
        env: invalidEnv,
        action,
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
      expect(source.cancelCalls()).toBe(0);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it('does not invoke an unused-body cancellation hook that would reject', async () => {
    const source = requestWithCancellation(() =>
      Promise.reject(new Error('synthetic cancellation rejection')),
    );

    const response = await handleSupabaseAuthRequestV1({
      request: source.request,
      env: invalidEnv,
      action: 'sign-in',
    });
    await Promise.resolve();

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(source.cancelCalls()).toBe(0);
  });

  it('does not invoke an unused-body cancellation hook that would throw synchronously', async () => {
    const request = new Request('https://myeongha.example/api/auth/refresh', {
      method: 'PUT',
      body: new ReadableStream<Uint8Array>(),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const cancel = vi.spyOn(request.body!, 'cancel').mockImplementation(() => {
      throw new Error('synthetic synchronous cancellation failure');
    });

    const response = await handleSupabaseAuthRequestV1({
      request,
      env: invalidEnv,
      action: 'refresh',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('keeps bodyless method rejection harmless', async () => {
    const request = new Request('https://myeongha.example/api/auth/sign-out', {
      method: 'GET',
    });

    const response = await handleSupabaseAuthRequestV1({
      request,
      env: invalidEnv,
      action: 'sign-out',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(request.body).toBeNull();
  });
});
