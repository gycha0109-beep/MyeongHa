import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleSupabaseAuthRequestV1,
  type SupabaseAuthActionV1,
} from './supabase-auth-http.js';

const authEnv = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};

function requestFor(action: SupabaseAuthActionV1): Request {
  const url = `https://myeongha.example/api/auth/${action}`;
  if (action === 'sign-out') {
    return new Request(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer header.payload.signature' },
    });
  }
  if (action === 'refresh') {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'refresh-token' }),
    });
  }
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'person@example.com',
      password: 'secret-password',
    }),
  });
}

function nonClosingResponse(input: {
  readonly status: number;
  readonly onCancel: () => void;
  readonly cancelError?: Error;
}): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      cancel() {
        input.onCancel();
        if (input.cancelError !== undefined) throw input.cancelError;
      },
    }),
    {
      status: input.status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

async function readErrorCode(response: Response): Promise<string> {
  const payload = await response.json() as { error?: { code?: unknown } };
  return typeof payload.error?.code === 'string' ? payload.error.code : '';
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase Auth unused non-success response bodies', () => {
  it.each([
    { action: 'sign-in' as const, status: 401, expectedStatus: 401, expectedCode: 'INVALID_CREDENTIALS' },
    { action: 'sign-up' as const, status: 409, expectedStatus: 422, expectedCode: 'SIGN_UP_REJECTED' },
    { action: 'refresh' as const, status: 401, expectedStatus: 401, expectedCode: 'SESSION_EXPIRED' },
    { action: 'sign-out' as const, status: 403, expectedStatus: 401, expectedCode: 'SESSION_EXPIRED' },
    { action: 'sign-in' as const, status: 429, expectedStatus: 429, expectedCode: 'RATE_LIMITED' },
    { action: 'sign-in' as const, status: 500, expectedStatus: 503, expectedCode: 'AUTH_UPSTREAM_UNAVAILABLE' },
  ])(
    'maps $action upstream $status without waiting for the unused body',
    async ({ action, status, expectedStatus, expectedCode }) => {
      vi.useFakeTimers();
      let cancelled = false;
      let observedSignal: AbortSignal | undefined;

      vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        return nonClosingResponse({
          status,
          onCancel() {
            cancelled = true;
          },
        });
      }));

      const response = await handleSupabaseAuthRequestV1({
        request: requestFor(action),
        env: authEnv,
        action,
      });

      expect(response.status).toBe(expectedStatus);
      expect(await readErrorCode(response)).toBe(expectedCode);
      expect(cancelled).toBe(true);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(observedSignal?.aborted).toBe(false);
    },
  );

  it('preserves the status mapping when unused-body cancellation rejects', async () => {
    let cancelled = false;
    vi.stubGlobal('fetch', vi.fn(async () => nonClosingResponse({
      status: 429,
      onCancel() {
        cancelled = true;
      },
      cancelError: new Error('cancel failed'),
    })));

    const response = await handleSupabaseAuthRequestV1({
      request: requestFor('sign-in'),
      env: authEnv,
      action: 'sign-in',
    });

    expect(cancelled).toBe(true);
    expect(response.status).toBe(429);
    expect(await readErrorCode(response)).toBe('RATE_LIMITED');
  });
});
