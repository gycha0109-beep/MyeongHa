import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudflareAuthRoute, handleCloudflareAuthRequest } from '../cloudflare/member-auth-worker.mjs';
import mainWorker from '../cloudflare/myeongha-worker.mjs';

const cloudflare = 'https://myeongha.gycha0109.workers.dev';
const web = 'https://myeongha-web.gycha0109.workers.dev';
const env = () => ({
  MYEONGHA_AUTH_RATE_LIMIT_SECRET: 'x'.repeat(64),
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'a'.repeat(40),
  AUTH_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
});
const post = (url, data = {}, headers = {}) => new Request(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-MyeongHa-Auth-Transport': 'web-cookie-v1',
    ...headers,
  },
  body: JSON.stringify(data),
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Cloudflare owned Member login', () => {
  it('resolves only exact approved login routes and rejects arbitrary query aliases', () => {
    expect(cloudflareAuthRoute(post(cloudflare + '/api/auth/sign-in'))).toBe('sign-in');
    expect(cloudflareAuthRoute(post(web + '/api/auth/refresh?__myeongha_social_complete=1'))).toBe('social-complete');
    expect(cloudflareAuthRoute(post(web + '/api/auth/refresh?__myeongha_social_complete=0'))).toBe('invalid-query');
    expect(cloudflareAuthRoute(post(cloudflare + '/api/chat'))).toBeNull();
    expect(cloudflareAuthRoute(post('https://evil.example/api/auth/sign-in'))).toBeNull();
    expect(cloudflareAuthRoute(post(cloudflare + '/api/auth/sign-in/'))).toBeNull();
  });

  it('returns 405 on GET and blocks cross-origin browser login', async () => {
    const get = await handleCloudflareAuthRequest(new Request(cloudflare + '/api/auth/sign-in'), env());
    expect(get.status).toBe(405);
    const invalid = await handleCloudflareAuthRequest(post(cloudflare + '/api/auth/sign-in', {}, { Origin: 'https://evil.example' }), env());
    expect(invalid.status).toBe(403);
  });

  it('requires active rate limiting and does not leak a secret on failure', async () => {
    const res = await handleCloudflareAuthRequest(post(cloudflare + '/api/auth/sign-in'), {});
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('MYEONGHA_AUTH_RATE_LIMIT_SECRET');
  });

  it('parses invalid credentials input as 400 after passing Cloudflare admission', async () => {
    const res = await handleCloudflareAuthRequest(post(cloudflare + '/api/auth/sign-in'), env());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_REQUEST');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('uses the existing guarded Supabase password login and HttpOnly cookie', async () => {
    const calls = [];
    vi.stubGlobal('fetch', async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://api.pwnedpasswords.com/range/')) {
        return new Response('00000000000000000000000000000000000:1\n', { status: 200 });
      }
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return Response.json({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          user: { id: 'user1', email: 'login@example.org' },
        });
      }
      throw new Error('Unexpected upstream path');
    });
    const r = await handleCloudflareAuthRequest(post(cloudflare + '/api/auth/sign-in', {
      email: 'login@example.org', password: 'synthetic-nonreal-password',
    }), env());
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.data.status).toBe('authenticated');
    expect(data.data.session.accessToken).toBe('test-access-token');
    expect(data.data.session.refreshToken).toBeUndefined();
    expect(r.headers.get('set-cookie')).toContain('HttpOnly');
    expect(r.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect(calls.some(x => x.includes('/auth/v1/token?grant_type=password'))).toBe(true);
  });

  it('keeps sign-up confirmation on the Cloudflare origin', async () => {
    const calls = [];
    vi.stubGlobal('fetch', async (input) => {
      const url = String(input); calls.push(url);
      if (url.startsWith('https://api.pwnedpasswords.com/range/')) {
        return new Response('00000000000000000000000000000000000:1\n', { status: 200 });
      }
      if (url.includes('/auth/v1/signup?')) {
        return Response.json({ user: { email: 'new@example.org', id: 'new1' } }, { status: 200 });
      }
      throw new Error('Unexpected upstream path');
    });
    const r = await handleCloudflareAuthRequest(post(cloudflare + '/api/auth/sign-up', {
      email: 'new@example.org', password: 'synthetic-nonreal-password', next: 'chat.html',
    }), env());
    expect(r.status).toBe(200);
    const signup = calls.find(x => x.includes('/auth/v1/signup?'));
    expect(signup).toBeDefined();
    const redirect = new URL(new URL(signup).searchParams.get('redirect_to'));
    expect(redirect.origin).toBe(cloudflare);
    expect(redirect.pathname).toBe('/auth.html');
    expect(redirect.searchParams.get('next')).toBe('chat.html');
  });

  it('keeps chat room creation behind the existing authenticated server authority', async () => {
    const res = await mainWorker.fetch(post(cloudflare + '/api/chat'), {});
    expect(res.status).not.toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
