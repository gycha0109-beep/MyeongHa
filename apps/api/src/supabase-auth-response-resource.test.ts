import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1,
} from './upstream-json-response-resource.js';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';

const authEnv = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};

const clearPasswordGuard = Object.freeze({
  async check() {
    return Object.freeze({ status: 'clear' as const });
  },
});

function signInRequest(): Request {
  return new Request('https://myeongha.example/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'person@example.com',
      password: 'secret-password',
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase Auth upstream response resource boundary', () => {
  it('maps an over-limit successful Auth JSON response to AUTH_UPSTREAM_MALFORMED 502 before parsing', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const response = await handleSupabaseAuthRequestV1({
      request: signInRequest(),
      env: authEnv,
      action: 'sign-in',
      passwordCompromiseGuard: clearPasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(502);
    expect(payload.error).toMatchObject({
      code: 'AUTH_UPSTREAM_MALFORMED',
      retryable: true,
    });
    expect(cancelled).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('secret-password');
  });
});
