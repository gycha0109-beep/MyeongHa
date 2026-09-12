import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';
import {
  SupabaseMemberIdentityEvidenceVerifierV1,
} from './supabase-member-identity-verifier.js';

const authEnv = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};
const memberOrigin = 'https://example.supabase.co';
const memberApiKey = 'test-publishable-key-that-is-long-enough';

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

function memberRequest(): Request {
  return new Request('https://myeongha.example/api/me', {
    headers: { Authorization: 'Bearer header.payload.signature' },
  });
}

function nonClosingJsonResponse(signal: AbortSignal | null | undefined, status = 200): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    },
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase Auth response body deadline', () => {
  it('maps a non-closing successful Auth proxy response body to 503 at the governed deadline', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return nonClosingJsonResponse(init?.signal);
    }));

    const pending = handleSupabaseAuthRequestV1({
      request: signInRequest(),
      env: authEnv,
      action: 'sign-in',
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    const payload = await response.json() as any;

    expect(observedSignal?.aborted).toBe(true);
    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      retryable: true,
    });
  });

  it('classifies a non-closing successful Member response body as upstream failure', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const verifier = new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin: memberOrigin,
      supabaseApiKey: memberApiKey,
      timeoutMs: 25,
      fetchImpl: vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        return nonClosingJsonResponse(init?.signal);
      }),
    });

    const pending = verifier.verifyRequestIdentity(memberRequest());
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'SupabaseMemberIdentityVerifierErrorV1',
      code: 'SUPABASE_MEMBER_VERIFIER_UPSTREAM_FAILED',
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(observedSignal?.aborted).toBe(true);
  });

  it('releases the Member deadline on a status-only invalid-identity response', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const verifier = new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin: memberOrigin,
      supabaseApiKey: memberApiKey,
      timeoutMs: 25,
      fetchImpl: vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        return nonClosingJsonResponse(init?.signal, 401);
      }),
    });

    await expect(verifier.verifyRequestIdentity(memberRequest())).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(25);

    expect(observedSignal?.aborted).toBe(false);
  });
});
