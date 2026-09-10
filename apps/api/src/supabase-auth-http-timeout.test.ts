import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';
import { SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1 } from './supabase-auth-upstream-deadline.js';

const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};

function signInRequest(): Request {
  return new Request('https://myeongha.example/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.com', password: 'secret-password' }),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase auth HTTP timeout semantics', () => {
  it('maps an application-deadline abort to retryable AUTH_UPSTREAM_UNAVAILABLE 503', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    }));

    const pending = handleSupabaseAuthRequestV1({
      request: signInRequest(),
      env,
      action: 'sign-in',
    });

    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1);
    const response = await pending;
    const payload = await response.json() as any;

    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(true);
    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      retryable: true,
    });
    expect(JSON.stringify(payload)).not.toContain('secret-password');
    expect(JSON.stringify(payload)).not.toContain(env.MYEONGHA_SUPABASE_API_KEY);
  });
});
