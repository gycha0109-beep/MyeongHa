import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';

const MAX_AUTH_BODY_BYTES = 16_384;
const encoder = new TextEncoder();
const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};

function signInBodyWithExactBytes(byteLength: number): string {
  const prefix = '{"email":"person@example.com","password":"test-password","padding":"';
  const suffix = '"}';
  const fixedBytes = encoder.encode(`${prefix}${suffix}`).byteLength;
  if (byteLength < fixedBytes) throw new Error('Requested body length is too small.');
  const body = `${prefix}${'x'.repeat(byteLength - fixedBytes)}${suffix}`;
  expect(encoder.encode(body).byteLength).toBe(byteLength);
  return body;
}

function streamRequest(input: {
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly keepOpen?: boolean;
  readonly cancelError?: Error;
}): {
  readonly request: Request;
  readonly wasCancelled: () => boolean;
  readonly abortForTestCleanup: () => void;
} {
  let cancelled = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(currentController) {
      controller = currentController;
      currentController.enqueue(encoder.encode(input.body));
      if (input.keepOpen !== true) currentController.close();
    },
    cancel() {
      cancelled = true;
      if (input.cancelError !== undefined) throw input.cancelError;
    },
  });

  const request = new Request('https://myeongha.example/api/auth/sign-in', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.headers ?? {}),
    },
    body: stream,
    duplex: 'half' as const,
  } as RequestInit & { duplex: 'half' });

  return {
    request,
    wasCancelled: () => cancelled,
    abortForTestCleanup: () => {
      try {
        controller?.error(new Error('test cleanup'));
      } catch {
        // The stream was already cancelled or closed by the handler.
      }
    },
  };
}

function successfulSignInUpstream() {
  return vi.fn(async () => Response.json({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'person@example.com' },
  }));
}

async function expectInvalidRequest(request: Request, upstream: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', upstream);
  const response = await handleSupabaseAuthRequestV1({
    request,
    env,
    action: 'sign-in',
  });
  const payload = await response.json() as any;

  expect(response.status).toBe(400);
  expect(payload.error.code).toBe('INVALID_REQUEST');
  expect(upstream).not.toHaveBeenCalled();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase auth actual request-body byte limit', () => {
  it('rejects an oversized streamed body when Content-Length is absent', async () => {
    const input = streamRequest({
      body: signInBodyWithExactBytes(MAX_AUTH_BODY_BYTES + 1),
    });

    expect(input.request.headers.has('content-length')).toBe(false);
    await expectInvalidRequest(input.request, vi.fn());
  });

  it('rejects an oversized streamed body when Content-Length is underreported', async () => {
    const input = streamRequest({
      body: signInBodyWithExactBytes(MAX_AUTH_BODY_BYTES + 1),
      headers: { 'Content-Length': '10' },
    });

    expect(input.request.headers.get('content-length')).toBe('10');
    await expectInvalidRequest(input.request, vi.fn());
  });

  it('cancels a non-closing body when Content-Length already proves oversize', async () => {
    const upstream = vi.fn();
    const input = streamRequest({
      body: '{"email":"person@example.com"}',
      headers: { 'Content-Length': String(MAX_AUTH_BODY_BYTES + 1) },
      keepOpen: true,
    });

    await expectInvalidRequest(input.request, upstream);

    expect(input.wasCancelled()).toBe(true);
  });

  it('keeps the declared-oversize mapping when request-body cancellation rejects', async () => {
    const upstream = vi.fn();
    const input = streamRequest({
      body: '{"email":"person@example.com"}',
      headers: { 'Content-Length': String(MAX_AUTH_BODY_BYTES + 1) },
      keepOpen: true,
      cancelError: new Error('cancel failed'),
    });

    await expectInvalidRequest(input.request, upstream);

    expect(input.wasCancelled()).toBe(true);
  });

  it('allows an exact 16,384-byte body through the size layer', async () => {
    const upstream = successfulSignInUpstream();
    vi.stubGlobal('fetch', upstream);
    const input = streamRequest({
      body: signInBodyWithExactBytes(MAX_AUTH_BODY_BYTES),
    });

    const response = await handleSupabaseAuthRequestV1({
      request: input.request,
      env,
      action: 'sign-in',
    });

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects and cancels a non-closing stream immediately after the byte limit is exceeded', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const input = streamRequest({
      body: signInBodyWithExactBytes(MAX_AUTH_BODY_BYTES + 1),
      keepOpen: true,
    });
    const responsePromise = handleSupabaseAuthRequestV1({
      request: input.request,
      env,
      action: 'sign-in',
    });

    const outcome = await Promise.race([
      responsePromise.then((response) => ({ kind: 'response' as const, response })),
      new Promise<{ readonly kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' as const }), 250);
      }),
    ]);

    if (outcome.kind === 'timeout') {
      input.abortForTestCleanup();
      await responsePromise;
    }

    expect(outcome.kind).toBe('response');
    if (outcome.kind === 'response') {
      const payload = await outcome.response.json() as any;
      expect(outcome.response.status).toBe(400);
      expect(payload.error.code).toBe('INVALID_REQUEST');
    }
    expect(input.wasCancelled()).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
  });
});
