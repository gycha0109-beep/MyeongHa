import { describe, expect, it } from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';

// These tests never connect to a database, Supabase or a real Auth origin.
// Positive paths are only activated on a separately approved exact host.
const PRIVATE_ORIGIN = 'https://auth.myeongha.example.test';
const ENABLED = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: PRIVATE_ORIGIN,
});

async function get(path, bindings, method = 'GET', base = PRIVATE_ORIGIN, headers = {}) {
  return worker.fetch(new Request(base + path, { method, headers }), bindings);
}

describe('Cloudflare Auth/DB admission is fail-closed until explicit host and secrets', () => {
  it('returns original 404 for all protected paths when no approval binding exists', async () => {
    for (const [path, method] of [
      ['/api/auth/sign-in', 'POST'],
      ['/api/auth/sign-up', 'POST'],
      ['/api/auth/refresh', 'POST'],
      ['/api/auth/sign-out', 'POST'],
      ['/api/auth/promote-guest', 'POST'],
      ['/api/auth/social/start', 'POST'],
      ['/api/auth/social/naver/authorize', 'GET'],
      ['/api/auth/social/naver/callback', 'GET'],
      ['/api/auth/social/naver/token', 'POST'],
      ['/api/auth/social/naver/userinfo', 'GET'],
      ['/api/session/bootstrap', 'POST'],
      ['/api/me', 'GET'],
      ['/api/me/birth-profile', 'GET'],
      ['/api/birth-profiles', 'POST'],
      ['/api/birth-profiles/00000000-0000-4000-8000-000000000001', 'GET'],
    ]) {
      const response = await get(path, undefined, method);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  });

  it('rejects Workers Preview and Vercel hosts even if a mode binding is supplied', async () => {
    for (const origin of [
      'https://trial.example.workers.dev',
      'https://myeongha.vercel.app',
    ]) {
      const response = await get('/api/auth/sign-in', {
        ...ENABLED,
        MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
      }, 'POST', origin);
      expect(response.status).toBe(404);
    }
  });

  it('does not reach an upstream when approved host lacks DB/auth secrets', async () => {
    const response = await get('/api/auth/sign-in', ENABLED, 'POST');
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('set-cookie')).toBeNull();
    const body = await response.json();
    expect(body.error.code).toBe('AUTH_UPSTREAM_UNAVAILABLE');
  });

  it('rejects cross-origin and rewrite marker bypass before checking any secret', async () => {
    const origins = [
      await get('/api/auth/refresh?__myeongha_social_complete=1', ENABLED, 'POST'),
      await get('/api/me?__myeongha_chat_open=1', ENABLED),
      await get('/api/auth/sign-in', ENABLED, 'POST', PRIVATE_ORIGIN, {
        Origin: 'https://attacker.example.test',
      }),
      await get('/api/session/bootstrap', ENABLED, 'POST', PRIVATE_ORIGIN, {
        'Sec-Fetch-Site': 'cross-site',
      }),
    ];
    for (const response of origins) expect(response.status).toBe(404);
  });

  it('restricts methods and preserves the independent Seyeon HOLD', async () => {
    expect((await get('/api/auth/sign-in', ENABLED)).status).toBe(405);
    expect((await get('/api/me', ENABLED, 'POST')).status).toBe(405);
    expect((await get('/api/me/birth-profile', ENABLED, 'POST')).status).toBe(405);
    expect((await get('/api/auth/social/naver/authorize', ENABLED, 'POST')).status).toBe(405);
    expect((await get('/api/birth-profiles', ENABLED, 'GET')).status).toBe(405);
    const seyeon = await get('/api/chat/synthetic-thread/turns', ENABLED, 'POST');
    expect(seyeon.status).toBe(503);
    expect((await seyeon.json()).error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
  });
});
