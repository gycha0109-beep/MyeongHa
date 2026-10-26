import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCloudflareHostedAuthOriginV1,
  resolveWebSocialAuthCallbackUriV1,
} from '../apps/web/social-auth-callback-origin.js';
import { cloudflareAuthRoute, handleCloudflareAuthRequest } from '../cloudflare/member-auth-worker.mjs';
import worker from '../cloudflare/myeongha-worker.mjs';

afterEach(() => vi.unstubAllGlobals());

const CUSTOM = 'https://app.myeongha-release.dev';
const LEGACY = 'https://myeongha.vercel.app';
const CANONICAL = 'https://myeongha.gycha0109.workers.dev';
const approved = () => ({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: CUSTOM,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
  MYEONGHA_CLOUDFLARE_OAUTH_CALLBACK_ORIGIN: CUSTOM,
  MYEONGHA_AUTH_RATE_LIMIT_SECRET: 'r'.repeat(64),
  AUTH_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
});
const req = (origin, path = '/api/auth/sign-in') =>
  new Request(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: '{}',
  });

describe('Vercel exit: exact callback origin and native Worker admission', () => {
  it('preserves Vercel production/preview callbacks without cross-host migration', () => {
    for (const origin of [LEGACY, 'https://myeongha-git-main-johnny-self.vercel.app']) {
      expect(isCloudflareHostedAuthOriginV1(origin)).toBe(false);
      expect(resolveWebSocialAuthCallbackUriV1(origin))
        .toBe(LEGACY + '/auth.html?social=callback');
    }
    for (const origin of ['http://localhost:3000', 'not-an-origin', 'https://unapproved.vercel.app']) {
      expect(resolveWebSocialAuthCallbackUriV1(origin)).toBeNull();
    }
  });

  it('keeps canonical Cloudflare sign-in and uses the current custom HTTPS origin', () => {
    for (const origin of [CANONICAL, 'https://myeongha-web.gycha0109.workers.dev', CUSTOM]) {
      expect(isCloudflareHostedAuthOriginV1(origin)).toBe(true);
      expect(resolveWebSocialAuthCallbackUriV1(origin))
        .toBe(origin + '/auth.html?social=callback');
    }
  });

  it('does not treat arbitrary Workers aliases or reserved/unsafe hosts as approved', () => {
    for (const origin of [
      'https://other.gycha0109.workers.dev',
      'https://app.example.com',
      'https://other.example.test',
      'https://127.0.0.1',
      'https://localhost',
      'https://app.myeongha-release.dev:8443',
      'https://app.myeongha-release.dev/path',
      'http://app.myeongha-release.dev',
    ]) {
      expect(isCloudflareHostedAuthOriginV1(origin)).toBe(false);
    }
  });

  it('allows a custom host only with the exact Auth/DB gate and keeps other hosts held', () => {
    expect(cloudflareAuthRoute(req(CUSTOM), approved())).toBe('sign-in');
    expect(cloudflareAuthRoute(req(CUSTOM, '/api/auth/social/start'), approved())).toBe('social-start');
    expect(cloudflareAuthRoute(req(CUSTOM, '/api/auth/refresh?__myeongha_social_complete=1'), approved()))
      .toBe('social-complete');
    expect(cloudflareAuthRoute(req(CANONICAL), {})).toBe('sign-in');
    for (const env of [
      undefined,
      { ...approved(), MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: undefined },
      { ...approved(), MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: undefined },
      { ...approved(), MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: 'https://other.myeongha-release.dev' },
    ]) {
      expect(cloudflareAuthRoute(req(CUSTOM), env)).toBeNull();
    }
    expect(cloudflareAuthRoute(req('https://evil.myeongha-release.dev'), approved())).toBeNull();
    expect(cloudflareAuthRoute(req('https://other.gycha0109.workers.dev'), approved())).toBeNull();
    expect(cloudflareAuthRoute(req(CUSTOM, '/api/auth/social/start'), {
      ...approved(), MYEONGHA_CLOUDFLARE_OAUTH_CALLBACK_ORIGIN: LEGACY,
    })).toBeNull();
  });

  it('keeps confirmation sign-up on the admitted custom host, not Vercel', async () => {
    let signupUrl;
    vi.stubGlobal('fetch', async input => {
      const url = String(input);
      if (url.startsWith('https://api.pwnedpasswords.com/range/')) {
        return new Response('00000000000000000000000000000000000:1\n', { status: 200 });
      }
      if (url.includes('/auth/v1/signup?')) {
        signupUrl = url;
        return Response.json({ user: { id: 'synthetic-subject', email: 'test@example.org' } });
      }
      throw Error('Unexpected network target');
    });
    const bindings = {
      ...approved(),
      MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
      MYEONGHA_SUPABASE_API_KEY: 'a'.repeat(40),
    };
    const response = await handleCloudflareAuthRequest(new Request(CUSTOM + '/api/auth/sign-up', {
      method: 'POST',
      headers: { Origin: CUSTOM, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.org', password: 'synthetic-nonreal-password',
        next: 'chat.html',
      }),
    }), bindings);
    expect(response.status).toBe(200);
    expect(signupUrl).toBeDefined();
    const redirect = new URL(new URL(signupUrl).searchParams.get('redirect_to'));
    expect(redirect.origin).toBe(CUSTOM);
    expect(redirect.pathname).toBe('/auth.html');
    expect(redirect.searchParams.get('next')).toBe('chat.html');
    expect(redirect.searchParams.get('confirmed')).toBe('1');
  });

  it('starts OAuth on an admitted custom host and never redirects to Vercel', async () => {
    const bindings = { ...approved(), MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED: 'true' };
    const start = redirectUri => new Request(CUSTOM + '/api/auth/social/start', {
      method: 'POST',
      headers: { Origin: CUSTOM, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google', redirectUri }),
    });
    const callback = CUSTOM + '/auth.html?social=callback';
    const response = await handleCloudflareAuthRequest(start(callback), bindings);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    const authorize = new URL(payload.data.authorizationUrl);
    const redirect = new URL(authorize.searchParams.get('redirect_to'));
    expect(redirect.origin).toBe(CUSTOM);
    expect(redirect.pathname).toBe('/auth.html');
    expect(redirect.searchParams.get('social')).toBe('callback');
    expect(redirect.searchParams.get('state')).toBe(payload.data.state);
    const fallback = await handleCloudflareAuthRequest(
      start(LEGACY + '/auth.html?social=callback'), bindings,
    );
    expect(fallback.status).toBe(400);
    expect((await fallback.json()).error.code).toBe('INVALID_REQUEST');
  });

  it('routes admitted custom Member requests through the native Worker, not Vercel', async () => {
    const bindings = approved();
    const enabled = await worker.fetch(req(CUSTOM), bindings);
    expect(bindings.AUTH_RATE_LIMITER.limit).toHaveBeenCalledTimes(1);
    expect(enabled.status).toBe(503); // No upstream credentials; fail closed.
    expect(enabled.headers.get('cache-control')).toBe('no-store');
    const denied = await worker.fetch(req(CUSTOM), {});
    expect(denied.status).toBe(404);
    expect(denied.headers.get('set-cookie')).toBeNull();
  });
});
