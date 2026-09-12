import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';

const encoder = new TextEncoder();
const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};

function signOutRequest(input: {
  readonly authorization?: string;
  readonly cancelError?: Error;
}): {
  readonly request: Request;
  readonly wasCancelled: () => boolean;
} {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"unused":true}'));
    },
    cancel() {
      cancelled = true;
      if (input.cancelError !== undefined) throw input.cancelError;
    },
  });

  const request = new Request('https://myeongha.example/api/auth/sign-out', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.authorization === undefined
        ? {}
        : { Authorization: input.authorization }),
    },
    body: stream,
    duplex: 'half' as const,
  } as RequestInit & { duplex: 'half' });

  return {
    request,
    wasCancelled: () => cancelled,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase Auth sign-out unused request-body cleanup', () => {
  it('cancels a non-closing unauthorized sign-out body without calling upstream', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const input = signOutRequest({});

    const response = await handleSupabaseAuthRequestV1({
      request: input.request,
      env,
      action: 'sign-out',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(input.wasCancelled()).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('cancels before authorized logout and ignores cancellation failure', async () => {
    const input = signOutRequest({
      authorization: 'Bearer test-access-token',
      cancelError: new Error('cancel failed'),
    });
    const upstream = vi.fn(async (_request: string | URL | Request, init?: RequestInit) => {
      expect(input.wasCancelled()).toBe(true);
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-access-token' });
      expect(init?.body).toBe('{}');
      return Response.json({});
    });
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: input.request,
      env,
      action: 'sign-out',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, data: { signedOut: true } });
    expect(input.wasCancelled()).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
