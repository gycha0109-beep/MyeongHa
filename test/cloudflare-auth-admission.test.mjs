import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { handleNaverOAuthBridgeRequestV1 } from '../apps/api/src/naver-oauth-bridge-http.ts';
import worker, { cloudflareEmergencyHoldEnabledV1 } from '../workers/cloudflare-static-preview.mjs';
import {
  approvedCloudflareSameOriginPostV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflareNaverRedirectV1,
  approvedCloudflareAuthCookieV1,
  allowedCloudflareNaverQueryV1,
  fenceCloudflareApprovedAuthResponseV1,
} from '../workers/cloudflare-auth-db-api.mjs';

// These tests never connect to a database, Supabase or a real Auth origin.
// Positive paths are only activated on a separately approved exact host.
const PRIVATE_ORIGIN = 'https://auth.myeongha.example.test';
const ENABLED = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: PRIVATE_ORIGIN,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_OAUTH_CALLBACK_ORIGIN: PRIVATE_ORIGIN,
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

  it('requires independent DB TLS/RLS and OAuth callback owner admissions before secrets', async () => {
    expect(approvedCloudflareStage5HandoffV1(ENABLED, PRIVATE_ORIGIN, true)).toBe(true);
    for (const dbApproval of [undefined, 'true', 'approved-nonisolated-v1']) {
      const env = { ...ENABLED, MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: dbApproval };
      for (const [path, method] of [
        ['/api/auth/sign-in', 'POST'],
        ['/api/me', 'GET'],
        ['/api/auth/social/start', 'POST'],
        ['/api/auth/social/naver/callback', 'GET'],
      ]) {
        const denied = await get(path, env, method);
        expect(denied.status).toBe(404);
        expect(await denied.text()).toBe('');
      }
    }
    for (const callback of [undefined, 'https://myeongha.vercel.app',
      PRIVATE_ORIGIN + '/', 'https://callback.example.test']) {
      const env = { ...ENABLED, MYEONGHA_CLOUDFLARE_OAUTH_CALLBACK_ORIGIN: callback };
      for (const [path, method] of [
        ['/api/auth/social/start', 'POST'],
        ['/api/auth/social/naver/authorize', 'GET'],
        ['/api/auth/social/naver/callback', 'GET'],
        ['/api/auth/refresh?__myeongha_social_complete=1', 'POST'],
      ]) {
        const denied = await get(path, env, method);
        expect(denied.status).toBe(404);
      }
      // Ordinary Member access is not silently granted by callback approval:
      // it still requires its own DB TLS/RLS gate and source credentials.
      const member = await get('/api/me', env);
      expect(member.status).toBe(503);
    }
    const secretsPoison = new Proxy({
      MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'false',
      MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
      MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: PRIVATE_ORIGIN,
      MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: undefined,
    }, {
      get(target, name) {
        if (!(name in target)) throw new Error('SYNTHETIC_PROTECTED_SECRET_WAS_READ');
        return target[name];
      },
    });
    expect((await get('/api/me', secretsPoison)).status).toBe(404);
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
      await get('/api/auth/refresh?__myeongha_social_complete=1&__myeongha_social_complete=1', ENABLED, 'POST'),
      await get('/api/auth/refresh?__myeongha_social_complete=1&extra=1', ENABLED, 'POST'),
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

  it('admits only the exact social-complete marker, then fails closed before token exchange', async () => {
    const response = await get('/api/auth/refresh?__myeongha_social_complete=1', ENABLED, 'POST');
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('AUTH_UPSTREAM_UNAVAILABLE');
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

describe('Cloudflare emergency HOLD for Auth/DB and Saju', () => {
  it('closes all positive protected APIs while retaining Health and Seyeon fence', async () => {
    const paused = { ...ENABLED, MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'true' };
    for (const [method, path] of [
      ['POST', '/api/auth/sign-in'],
      ['POST', '/api/auth/social/start'],
      ['GET', '/api/auth/social/naver/authorize'],
      ['POST', '/api/session/bootstrap'],
      ['GET', '/api/me'],
      ['GET', '/api/me/birth-profile'],
      ['GET', '/api/birth-profiles/00000000-0000-4000-8000-000000000001'],
      ['POST', '/api/me/saju/calculation'],
    ]) {
      const response = await worker.fetch(new Request(PRIVATE_ORIGIN + path, { method }), paused);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    const health = await worker.fetch(new Request(PRIVATE_ORIGIN + '/api/health'), paused);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    for (const [method, path] of [
      ['POST', '/api/chat/123e4567-e89b-42d3-a456-426614174000/turns'],
      ['GET', '/api/chat/123e4567-e89b-42d3-a456-426614174000'],
    ]) {
      const response = await worker.fetch(new Request(PRIVATE_ORIGIN + path, { method }), paused);
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
    }
  });
  it('fails closed for invalid/inaccessible HOLD bindings before touching mode or DB', async () => {
    expect(cloudflareEmergencyHoldEnabledV1(undefined)).toBe(false);
    expect(cloudflareEmergencyHoldEnabledV1({ MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'false' })).toBe(false);
    expect(cloudflareEmergencyHoldEnabledV1({ MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'unexpected' })).toBe(true);
    const poison = new Proxy({ MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'true' }, {
      get(target, property) {
        if (property !== 'MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD') throw new Error('DB_BINDING_MUST_NOT_BE_READ');
        return target[property];
      },
    });
    const response = await worker.fetch(new Request(PRIVATE_ORIGIN + '/api/auth/sign-in', { method: 'POST' }), poison);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    const unreadable = new Proxy({}, { get() { throw new Error('UNREADABLE_HOLD'); } });
    const sealed = await worker.fetch(new Request(PRIVATE_ORIGIN + '/api/me'), unreadable);
    expect(sealed.status).toBe(404);
  });
});

describe('Cloudflare Auth/DB Worker response and cookie-origin fence', () => {
  it('preserves a valid JSON response and host-only cookie but removes CORS and caching', async () => {
    const response = fenceCloudflareApprovedAuthResponseV1(Response.json({ ok: true }, {
      headers: {
        'Set-Cookie': 'myeongha_member_refresh_v1=synthetic; Path=/api/auth; HttpOnly; Secure; SameSite=Strict',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'authorization',
        'Cache-Control': 'public, max-age=600',
      },
    }), { id: 'api.auth.sign-in' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('access-control-allow-headers')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('blocks HTML/SSE/plain-text responses and unexpected redirects', async () => {
    const inputs = [
      [new Response('<html>secret</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), 'api.auth.sign-in'],
      [new Response('data: secret', { headers: { 'Content-Type': 'text/event-stream' } }), 'api.auth.refresh'],
      [new Response('secret', { headers: { 'Content-Type': 'text/plain' } }), 'api.me'],
      [new Response(null, { status: 302, headers: { Location: 'https://attacker.example.test' } }), 'api.auth.sign-in'],
      [new Response(null, { status: 302, headers: { Location: 'https://nid.naver.com/oauth2.0/authorize' } }), 'api.auth.sign-in'],
      [new Response(null, { status: 302, headers: { Location: '/auth.html' } }), 'rewrite.naver.authorize'],
      [new Response(null, { status: 307, headers: { Location: 'https://nid.naver.com/oauth2.0/authorize' } }), 'rewrite.naver.authorize'],
      [new Response(null, { status: 302, headers: { Location: 'https://nid.naver.com/oauth2.0/authorize', 'Set-Cookie': 's=synthetic' } }), 'rewrite.naver.authorize'],
    ];
    for (const [candidate, id] of inputs) {
      const response = fenceCloudflareApprovedAuthResponseV1(candidate, { id });
      expect(response.status).toBe(503);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).not.toContain('secret');
    }
  });

  it('allows only exact Naver-to-Worker and Worker-to-Supabase callback handoff', () => {
    const sealed = 'a'.repeat(64);
    const naver = new URL('https://nid.naver.com/oauth2.0/authorize');
    naver.search = new URLSearchParams({
      response_type: 'code', client_id: 'synthetic-client',
      redirect_uri: PRIVATE_ORIGIN + '/api/auth/social/naver/callback', state: sealed,
    }).toString();
    const callback = new URL('https://cnsfpcdiyofqvhpcegfc.supabase.co/auth/v1/callback');
    callback.search = new URLSearchParams({ state: 'synthetic-oauth-state', code: sealed }).toString();
    const denial = new URL(callback);
    denial.search = new URLSearchParams({ state: 'synthetic-oauth-state', error: 'access_denied' }).toString();
    for (const [id, destination] of [
      ['rewrite.naver.authorize', naver.href],
      ['rewrite.naver.callback', callback.href],
      ['rewrite.naver.callback', denial.href],
    ]) {
      const response = fenceCloudflareApprovedAuthResponseV1(
        new Response(null, { status: 302, headers: { Location: destination } }),
        { id }, PRIVATE_ORIGIN,
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(destination);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    }
    for (const [id, destination] of [
      ['rewrite.naver.authorize', 'https://nid.naver.com.evil.test/oauth2.0/authorize'],
      ['rewrite.naver.authorize', naver.href + '&extra=1'],
      ['rewrite.naver.authorize', naver.href + '&state=b'],
      ['rewrite.naver.authorize', naver.href.replace('code&client_id=', 'token&client_id=')],
      ['rewrite.naver.authorize', naver.href.replace(encodeURIComponent(PRIVATE_ORIGIN), encodeURIComponent('https://attacker.example.test'))],
      ['rewrite.naver.callback', callback.href + '&redirect_uri=https://attacker.example.test'],
      ['rewrite.naver.callback', callback.href + '&error=access_denied'],
      ['rewrite.naver.callback', callback.href.replace(sealed, 'plaintext')],
      ['rewrite.naver.callback', denial.href.replace('access_denied', 'arbitrary_error')],
    ]) {
      const response = fenceCloudflareApprovedAuthResponseV1(
        new Response(null, { status: 302, headers: { Location: destination } }),
        { id }, PRIVATE_ORIGIN,
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('location')).toBeNull();
    }
    expect(approvedCloudflareNaverRedirectV1(naver, { id: 'rewrite.naver.authorize' }, PRIVATE_ORIGIN)).toBe(true);
    expect(approvedCloudflareNaverRedirectV1(naver, { id: 'rewrite.naver.authorize' }, undefined)).toBe(false);
  });

  it('rejects unknown, duplicate and contradictory Naver OAuth query controls before secrets', async () => {
    for (const [path, method] of [
      ['/api/auth/social/naver/token?x=1', 'POST'],
      ['/api/auth/social/naver/userinfo?__myeongha_naver_oauth_bridge=token', 'GET'],
      ['/api/auth/social/naver/authorize?state=a&state=b', 'GET'],
      ['/api/auth/social/naver/authorize?extra=1', 'GET'],
      ['/api/auth/social/naver/callback?state=a&code=c&error=access_denied', 'GET'],
      ['/api/auth/social/naver/callback?state=a&state=b', 'GET'],
      ['/api/auth/social/naver/callback?state=a&untrusted=1', 'GET'],
    ]) {
      const response = await get(path, ENABLED, method);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    const legitAuthorize = new URL(PRIVATE_ORIGIN + '/api/auth/social/naver/authorize?state=a&code_challenge=b');
    expect(allowedCloudflareNaverQueryV1(legitAuthorize, 'authorize')).toBe(true);
    const legitCallback = new URL(PRIVATE_ORIGIN + '/api/auth/social/naver/callback?state=a&code=c');
    expect(allowedCloudflareNaverQueryV1(legitCallback, 'callback')).toBe(true);
  });

  it('does not weaken Naver no-referrer even when upstream omits it', () => {
    const authorize = new URL('https://nid.naver.com/oauth2.0/authorize');
    authorize.search = new URLSearchParams({
      response_type: 'code', client_id: 'synthetic-client',
      redirect_uri: PRIVATE_ORIGIN + '/api/auth/social/naver/callback',
      state: 'a'.repeat(64),
    }).toString();
    const response = fenceCloudflareApprovedAuthResponseV1(
      new Response(null, { status: 302, headers: { Location: authorize.href } }),
      { id: 'rewrite.naver.authorize' }, PRIVATE_ORIGIN,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('fences refresh cookie to one host-only Secure/HttpOnly/Strict binding', () => {
    const base = 'myeongha_member_refresh_v1=synthetic; Path=/api/auth; HttpOnly; Secure; SameSite=Strict';
    for (const [route, cookie, valid] of [
      ['api.auth.refresh', base, true],
      ['api.auth.sign-out', 'myeongha_member_refresh_v1=; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=0', true],
      ['api.me', base, false],
      ['api.auth.refresh', base + '; Domain=.myeongha.example.test', false],
      ['api.auth.refresh', base.replace('SameSite=Strict', 'SameSite=None'), false],
      ['api.auth.refresh', base.replace('HttpOnly; ', ''), false],
      ['api.auth.refresh', base.replace('; Secure', ''), false],
      ['api.auth.refresh', base.replace('myeongha_member_refresh_v1', 'provider_session'), false],
      ['api.auth.refresh', base + ', provider_session=secret', false],
      ['api.auth.refresh', base + '; Max-Age=0', false],
    ]) {
      const candidate = Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
      expect(approvedCloudflareAuthCookieV1(candidate, { id: route })).toBe(valid);
      expect(fenceCloudflareApprovedAuthResponseV1(candidate, { id: route }).status)
        .toBe(valid ? 200 : 503);
    }
  });

  it('completes synthetic Naver PKCE authorization and callback without network', async () => {
    const env = {
      MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED: 'true',
      MYEONGHA_NAVER_CLIENT_ID: 'synthetic-client',
      MYEONGHA_NAVER_OAUTH_BRIDGE_KEY: randomBytes(32).toString('base64url'),
    };
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const nonce = 'synthetic-supabase-state';
    const requestUrl = new URL(PRIVATE_ORIGIN + '/api/auth/social/naver/authorize');
    requestUrl.search = new URLSearchParams({
      client_id: env.MYEONGHA_NAVER_CLIENT_ID,
      redirect_uri: 'https://cnsfpcdiyofqvhpcegfc.supabase.co/auth/v1/callback',
      response_type: 'code', state: nonce, code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    const first = await handleNaverOAuthBridgeRequestV1({
      request: new Request(requestUrl), action: 'authorize', env, webOrigin: PRIVATE_ORIGIN,
    });
    const out = fenceCloudflareApprovedAuthResponseV1(
      first, { id: 'rewrite.naver.authorize' }, PRIVATE_ORIGIN,
    );
    expect(out.status).toBe(302);
    const naver = new URL(out.headers.get('location'));
    expect(naver.origin).toBe('https://nid.naver.com');
    expect(naver.searchParams.get('redirect_uri'))
      .toBe(PRIVATE_ORIGIN + '/api/auth/social/naver/callback');
    const state = naver.searchParams.get('state');
    expect(state).not.toBe(nonce);
    const callbackUrl = new URL(PRIVATE_ORIGIN + '/api/auth/social/naver/callback');
    callbackUrl.search = new URLSearchParams({ state, code: 'synthetic-provider-code' }).toString();
    const second = await handleNaverOAuthBridgeRequestV1({
      request: new Request(callbackUrl), action: 'callback', env, webOrigin: PRIVATE_ORIGIN,
    });
    const result = fenceCloudflareApprovedAuthResponseV1(
      second, { id: 'rewrite.naver.callback' }, PRIVATE_ORIGIN,
    );
    expect(result.status).toBe(302);
    const bridge = new URL(result.headers.get('location'));
    expect(bridge.origin).toBe('https://cnsfpcdiyofqvhpcegfc.supabase.co');
    expect(bridge.pathname).toBe('/auth/v1/callback');
    expect(bridge.searchParams.get('state')).toBe(nonce);
    expect(bridge.searchParams.get('code')).not.toBe('synthetic-provider-code');
    expect(result.headers.get('referrer-policy')).toBe('no-referrer');
    const replayOnWrongOrigin = await handleNaverOAuthBridgeRequestV1({
      request: new Request(callbackUrl.href.replace(PRIVATE_ORIGIN, 'https://attacker.example.test')),
      action: 'callback', env, webOrigin: PRIVATE_ORIGIN,
    });
    expect(replayOnWrongOrigin.status).toBe(400);
  });

  it('seals unexpected Auth/DB and calculation exceptions before platform HTML', async () => {
    const secret = 'SYNTHETIC_CONFIGURATION_SECRET_NOT_FOR_CLIENTS';
    const explodingBindings = new Proxy({}, {
      get(_target, key) {
        if (key === 'MYEONGHA_CLOUDFLARE_AUTH_DB_MODE') throw new Error(secret);
        return undefined;
      },
    });
    for (const [path, method, code] of [
      ['/api/auth/sign-in', 'POST', 'AUTH_UPSTREAM_UNAVAILABLE'],
      ['/api/me', 'GET', 'AUTH_UPSTREAM_UNAVAILABLE'],
      ['/api/me/saju/calculation', 'POST', 'SAJU_SERVICE_UNAVAILABLE'],
    ]) {
      const response = await worker.fetch(
        new Request(PRIVATE_ORIGIN + path, { method }), explodingBindings,
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = await response.text();
      expect(body).not.toContain(secret);
      expect(body).not.toContain('<html');
      expect(JSON.parse(body).error.code).toBe(code);
    }
    const health = await worker.fetch(new Request(PRIVATE_ORIGIN + '/api/health'), explodingBindings);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const otherApi = await worker.fetch(new Request(PRIVATE_ORIGIN + '/api/unknown'), explodingBindings);
    expect(otherApi.status).toBe(404);
    expect(await otherApi.text()).toBe('');
  });

  it('rejects cookie-authenticated POST without a valid same-origin signal', async () => {
    for (const headers of [
      { Cookie: 'myeongha_member_refresh_v1=synthetic' },
      { Cookie: 'myeongha_member_refresh_v1=synthetic', 'Sec-Fetch-Site': 'none' },
      { Cookie: 'myeongha_member_refresh_v1=synthetic', 'Sec-Fetch-Site': 'same-site' },
      { Cookie: 'myeongha_member_refresh_v1=synthetic', Origin: 'https://attacker.example.test' },
    ]) {
      const request = new Request(PRIVATE_ORIGIN + '/api/auth/refresh', { method: 'POST', headers });
      expect(approvedCloudflareSameOriginPostV1(request, PRIVATE_ORIGIN)).toBe(false);
      const response = await worker.fetch(request, ENABLED);
      expect(response.status).toBe(404);
    }
    expect(approvedCloudflareSameOriginPostV1(
      new Request(PRIVATE_ORIGIN + '/api/auth/refresh', {
        method: 'POST', headers: { Cookie: 'myeongha_member_refresh_v1=synthetic', Origin: PRIVATE_ORIGIN },
      }), PRIVATE_ORIGIN,
    )).toBe(true);
  });
});
