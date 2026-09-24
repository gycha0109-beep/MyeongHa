import { afterEach, describe, expect, it, vi } from 'vitest';
import { INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1 } from './ingress-request-body-deadline.js';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';

const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};
const encoder = new TextEncoder();

const clearPasswordGuard = Object.freeze({
  async check() {
    return Object.freeze({ status: 'clear' as const });
  },
});
const compromisedPasswordGuard = Object.freeze({
  async check() {
    return Object.freeze({ status: 'compromised' as const, occurrenceCount: 42 });
  },
});
const unavailablePasswordGuard = Object.freeze({
  async check() {
    return Object.freeze({ status: 'unavailable' as const });
  },
});

function request(body: unknown): Request {
  return new Request('https://myeongha.example/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function streamRequest(stream: ReadableStream<Uint8Array>): Request {
  return new Request('https://myeongha.example/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function nonClosingStream(input: {
  readonly chunks: readonly Uint8Array[];
  readonly onCancel?: () => void | Promise<void>;
}): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of input.chunks) controller.enqueue(chunk);
    },
    cancel() {
      return input.onCancel?.();
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Supabase auth HTTP proxy', () => {
  it('returns a sanitized member session for password sign-in', async () => {
    const upstream = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ apikey: env.MYEONGHA_SUPABASE_API_KEY });
      expect(String(init?.body)).toContain('secret-password');
      return Response.json({
        access_token: 'header.payload.signature',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'person@example.com' },
      });
    });
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({ email: ' Person@Example.com ', password: 'secret-password' }),
      env,
      action: 'sign-in',
      passwordCompromiseGuard: clearPasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.ok).toBe(true);
    expect(payload.data.status).toBe('authenticated');
    expect(payload.data.session.accessToken).toBe('header.payload.signature');
    expect(payload.data.session.refreshToken).toBe('refresh-token');
    expect(payload.data.session.user.email).toBe('person@example.com');
    expect(JSON.stringify(payload)).not.toContain(env.MYEONGHA_SUPABASE_API_KEY);
    expect(JSON.stringify(payload)).not.toContain('secret-password');
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['non-closing empty stream', []],
    ['repeated zero-length chunks', [new Uint8Array(0), new Uint8Array(0)]],
    [
      'valid JSON body without EOF',
      [encoder.encode('{"email":"person@example.com","password":"secret-password"}')],
    ],
  ] as const)('times out a %s at the governed absolute ingress deadline', async (_name, chunks) => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const authRequest = streamRequest(nonClosingStream({
      chunks,
      onCancel() {
        cancelCalls += 1;
      },
    }));

    const responsePromise = handleSupabaseAuthRequestV1({
      request: authRequest,
      env,
      action: 'sign-in',
      passwordCompromiseGuard: clearPasswordGuard,
    });
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    const response = await responsePromise;
    const payload = await response.json() as any;

    expect(response.status).toBe(408);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error).toEqual({
      code: 'REQUEST_BODY_TIMEOUT',
      messageKey: 'auth.request_body_timeout',
      retryable: false,
    });
    expect(cancelCalls).toBe(1);
    expect(authRequest.body?.locked).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not reset the absolute ingress deadline when later chunks arrive', async () => {
    vi.useFakeTimers();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const authRequest = streamRequest(new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
        value.enqueue(encoder.encode('{"email":"person@example.com",'));
      },
    }));

    const responsePromise = handleSupabaseAuthRequestV1({
      request: authRequest,
      env,
      action: 'sign-in',
      passwordCompromiseGuard: clearPasswordGuard,
    });
    await vi.advanceTimersByTimeAsync(2_500);
    controller?.enqueue(encoder.encode('"password":"secret-password"}'));
    await vi.advanceTimersByTimeAsync(500);
    const response = await responsePromise;

    expect(response.status).toBe(408);
    expect(authRequest.body?.locked).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('accepts a valid streamed JSON body that reaches EOF before the deadline', async () => {
    const upstream = vi.fn(async () => Response.json({
      access_token: 'header.payload.signature',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'person@example.com' },
    }));
    vi.stubGlobal('fetch', upstream);
    const authRequest = streamRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"email":"person@example.com",'));
        controller.enqueue(encoder.encode('"password":"secret-password"}'));
        controller.close();
      },
    }));

    const response = await handleSupabaseAuthRequestV1({
      request: authRequest,
      env,
      action: 'sign-in',
      passwordCompromiseGuard: clearPasswordGuard,
    });

    expect(response.status).toBe(200);
    expect(authRequest.body?.locked).toBe(false);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('preserves the 16,384-byte actual-body ceiling and rejects overflow before upstream Auth work', async () => {
    let cancelCalls = 0;
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const authRequest = streamRequest(nonClosingStream({
      chunks: [new Uint8Array(16_385)],
      onCancel() {
        cancelCalls += 1;
      },
    }));

    const response = await handleSupabaseAuthRequestV1({
      request: authRequest,
      env,
      action: 'sign-in',
      passwordCompromiseGuard: clearPasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_REQUEST');
    expect(cancelCalls).toBe(1);
    expect(authRequest.body?.locked).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('preserves verification-required signup and binds confirmation to the governed auth page', async () => {
    const upstream = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/auth/v1/signup');
      expect(url.searchParams.get('redirect_to')).toBe(
        'https://myeongha.vercel.app/auth.html?confirmed=1&next=reading-detail.html%3Ftopic%3Dlove',
      );
      return Response.json({
        id: '22222222-2222-4222-8222-222222222222',
        email: 'new@example.com',
      });
    });
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({
        email: 'new@example.com',
        password: 'new-password',
        next: 'reading-detail.html?topic=love',
      }),
      env,
      action: 'sign-up',
      passwordCompromiseGuard: clearPasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      status: 'verification_required',
      email: 'new@example.com',
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Hall when signup tries to supply an off-origin confirmation destination', async () => {
    const upstream = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('redirect_to')).toBe(
        'https://myeongha.vercel.app/auth.html?confirmed=1&next=hall.html',
      );
      return Response.json({
        id: '22222222-2222-4222-8222-222222222222',
        email: 'new@example.com',
      });
    });
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({
        email: 'new@example.com',
        password: 'new-password',
        next: 'https://attacker.example/steal',
      }),
      env,
      action: 'sign-up',
      passwordCompromiseGuard: clearPasswordGuard,
    });

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects a compromised signup password before Supabase receives credentials', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({ email: 'new@example.com', password: 'compromised-password' }),
      env,
      action: 'sign-up',
      passwordCompromiseGuard: compromisedPasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('COMPROMISED_PASSWORD');
    expect(JSON.stringify(payload)).not.toContain('compromised-password');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('fails signup closed when the compromise provider is unavailable', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({ email: 'new@example.com', password: 'new-password' }),
      env,
      action: 'sign-up',
      passwordCompromiseGuard: unavailablePasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('PASSWORD_SECURITY_UNAVAILABLE');
    expect(payload.error.retryable).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('revokes and withholds a newly-created session when valid credentials use a compromised password', async () => {
    const upstream = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/logout') {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer header.payload.signature',
        });
        return Response.json({ ok: true });
      }
      return Response.json({
        access_token: 'header.payload.signature',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'person@example.com' },
      });
    });
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({ email: 'person@example.com', password: 'compromised-password' }),
      env,
      action: 'sign-in',
      passwordCompromiseGuard: compromisedPasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('COMPROMISED_PASSWORD');
    expect(JSON.stringify(payload)).not.toContain('header.payload.signature');
    expect(JSON.stringify(payload)).not.toContain('refresh-token');
    expect(JSON.stringify(payload)).not.toContain('compromised-password');
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('preserves established sign-in availability when the compromise provider is unavailable', async () => {
    const upstream = vi.fn(async () => Response.json({
      access_token: 'header.payload.signature',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'person@example.com' },
    }));
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({ email: 'person@example.com', password: 'secret-password' }),
      env,
      action: 'sign-in',
      passwordCompromiseGuard: unavailablePasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data.status).toBe('authenticated');
    expect(payload.data.passwordCompromiseCheck).toBe('unavailable');
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('maps rejected password sign-in to a source-safe public error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { msg: 'upstream secret detail' },
      { status: 400 },
    )));

    const response = await handleSupabaseAuthRequestV1({
      request: request({ email: 'person@example.com', password: 'wrong-password' }),
      env,
      action: 'sign-in',
      passwordCompromiseGuard: clearPasswordGuard,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(payload)).not.toContain('upstream secret detail');
  });

  it('maps a rejected refresh token to authoritative SESSION_EXPIRED 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { msg: 'refresh token rejected upstream' },
      { status: 401 },
    )));

    const response = await handleSupabaseAuthRequestV1({
      request: request({ refreshToken: 'expired-refresh-token' }),
      env,
      action: 'refresh',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.error).toMatchObject({
      code: 'SESSION_EXPIRED',
      retryable: false,
    });
    expect(JSON.stringify(payload)).not.toContain('refresh token rejected upstream');
  });

  it('maps a refresh upstream outage to retryable AUTH_UPSTREAM_UNAVAILABLE 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { msg: 'upstream unavailable detail' },
      { status: 500 },
    )));

    const response = await handleSupabaseAuthRequestV1({
      request: request({ refreshToken: 'still-valid-refresh-token' }),
      env,
      action: 'refresh',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      retryable: true,
    });
    expect(JSON.stringify(payload)).not.toContain('upstream unavailable detail');
  });

  it('maps a malformed successful refresh response to retryable AUTH_UPSTREAM_MALFORMED 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: 'header.payload.signature',
    })));

    const response = await handleSupabaseAuthRequestV1({
      request: request({ refreshToken: 'still-valid-refresh-token' }),
      env,
      action: 'refresh',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(502);
    expect(payload.error).toMatchObject({
      code: 'AUTH_UPSTREAM_MALFORMED',
      retryable: true,
    });
  });

  it('requires bearer authorization for sign-out before calling Supabase', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await handleSupabaseAuthRequestV1({
      request: request({}),
      env,
      action: 'sign-out',
    });

    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});