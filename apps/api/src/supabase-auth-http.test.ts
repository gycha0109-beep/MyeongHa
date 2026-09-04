import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';

const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
};

function request(body: unknown): Request {
  return new Request('https://myeongha.example/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
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

  it('preserves verification-required signup without inventing a member session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      id: '22222222-2222-4222-8222-222222222222',
      email: 'new@example.com',
    })));

    const response = await handleSupabaseAuthRequestV1({
      request: request({ email: 'new@example.com', password: 'new-password' }),
      env,
      action: 'sign-up',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      status: 'verification_required',
      email: 'new@example.com',
    });
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
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(payload)).not.toContain('upstream secret detail');
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
