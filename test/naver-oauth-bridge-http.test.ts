import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { handleNaverOAuthBridgeRequestV1, type NaverOAuthBridgeActionV1, type NaverOAuthBridgeFetchV1 } from '../apps/api/src/naver-oauth-bridge-http.js';
import { resolveAuthSignInDispatchForTestV1 } from '../api/auth/sign-in.js';

const origin = 'https://myeongha.vercel.app';
const callback = 'https://cnsfpcdiyofqvhpcegfc.supabase.co/auth/v1/callback';
const env = { MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED: 'true', MYEONGHA_NAVER_CLIENT_ID: 'fixture-app', MYEONGHA_NAVER_OAUTH_BRIDGE_KEY: randomBytes(32).toString('base64url') };
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const now = 1_800_000_000_000;

function run(action: NaverOAuthBridgeActionV1, query = '', init: RequestInit = {}, fetchImpl?: NaverOAuthBridgeFetchV1, time = now) {
  return handleNaverOAuthBridgeRequestV1({ request: new Request(`${origin}/api/auth/social/naver/${action}${query}`, init), action, env, nowEpochMs: () => time, ...(fetchImpl ? { fetchImpl } : {}) });
}
function authQuery(extra: Record<string, string> = {}) {
  return `?${new URLSearchParams({ client_id: 'fixture-app', redirect_uri: callback, response_type: 'code', state: 'supabase-state', code_challenge: challenge, code_challenge_method: 'S256', ...extra })}`;
}
async function flow() {
  const authorization = await run('authorize', authQuery());
  expect(authorization.status).toBe(302);
  const naver = new URL(authorization.headers.get('Location')!);
  const state = naver.searchParams.get('state')!;
  const returned = await run('callback', `?${new URLSearchParams({ state, code: 'naver-code' })}`);
  expect(returned.status).toBe(302);
  const destination = new URL(returned.headers.get('Location')!);
  expect(destination.origin + destination.pathname).toBe(callback);
  expect(destination.searchParams.get('state')).toBe('supabase-state');
  return { state, code: destination.searchParams.get('code')!, naver };
}
function tokenRequest(code: string, extra: Record<string, string> = {}, basic = false): RequestInit {
  const body: Record<string, string> = { grant_type: 'authorization_code', client_id: 'fixture-app', client_secret: 'fixture-secret', code, code_verifier: verifier, redirect_uri: callback, ...extra };
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (basic) {
    headers.Authorization = `Basic ${Buffer.from('fixture-app:fixture-secret').toString('base64')}`;
    delete body.client_id;
    delete body.client_secret;
  }
  return { method: 'POST', headers, body: new URLSearchParams(body) };
}

describe('Naver OAuth transport bridge', () => {
  it.each([false, true])('preserves state, verifies PKCE, and normalizes profile without email linking (Basic=%s)', async basic => {
    const { state, code, naver } = await flow();
    expect(naver.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/social/naver/callback`);
    expect(naver.searchParams.has('client_secret')).toBe(false);
    const upstream = vi.fn<NaverOAuthBridgeFetchV1>().mockImplementation(async (url, init) => {
      if (String(url).endsWith('/token')) {
        const body = init?.body as URLSearchParams;
        expect(body.get('state')).toBe(state);
        expect(body.get('code')).toBe('naver-code');
        expect(body.get('redirect_uri')).toBe(`${origin}/api/auth/social/naver/callback`);
        expect(init?.redirect).toBe('error');
        return Response.json({ access_token: 'fixture-nav-token', token_type: 'bearer', expires_in: '3600', refresh_token: 'fixture-refresh' });
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-nav-token');
      return Response.json({ resultcode: '00', response: { id: 'app-scoped-id', email: 'same@example.test', nickname: 'Nick', profile_image: 'https://example.test/photo', mobile: 'unrequested' } });
    });
    const token = await run('token', '', tokenRequest(code, {}, basic), upstream);
    expect(token.status).toBe(200);
    const payload = await token.json() as { access_token: string; expires_in: number };
    expect(payload.access_token).not.toContain('fixture-nav-token');
    expect(payload).not.toHaveProperty('refresh_token');
    expect(payload.expires_in).toBe(300);
    const userinfo = await run('userinfo', '', { headers: { Authorization: `Bearer ${payload.access_token}` } }, upstream);
    expect(await userinfo.json()).toEqual({ sub: 'app-scoped-id', nickname: 'Nick', picture: 'https://example.test/photo' });
    expect(userinfo.headers.get('Cache-Control')).toBe('no-store');
    expect(userinfo.headers.get('Referrer-Policy')).toBe('no-referrer');
  });
  it('permits identifier-only profiles', async () => {
    const { code } = await flow();
    const fetcher = vi.fn<NaverOAuthBridgeFetchV1>()
      .mockResolvedValueOnce(Response.json({ access_token: 'fixture', token_type: 'bearer', expires_in: 60 }))
      .mockResolvedValueOnce(Response.json({ resultcode: '00', response: { id: 'id-only' } }));
    const token = await run('token', '', tokenRequest(code), fetcher);
    const payload = await token.json() as { access_token: string };
    const profile = await run('userinfo', '', { headers: { Authorization: `Bearer ${payload.access_token}` } }, fetcher);
    expect(await profile.json()).toEqual({ sub: 'id-only' });
  });
  it.each([{ redirect_uri: 'https://evil.test' }, { client_id: 'another-app' }, { code_challenge_method: 'plain' }, { code_challenge: 'bad' }])('rejects ungoverned authorization: %j', async fields => {
    expect((await run('authorize', authQuery(fields))).status).toBe(400);
  });
  it('rejects duplicate parameters and disabled/missing configuration', async () => {
    expect((await run('authorize', `${authQuery()}&state=other`)).status).toBe(400);
    const request = new Request(`${origin}/api/auth/social/naver/authorize${authQuery()}`);
    for (const config of [{}, { ...env, MYEONGHA_NAVER_OAUTH_BRIDGE_KEY: 'invalid' }]) {
      expect((await handleNaverOAuthBridgeRequestV1({ request, action: 'authorize', env: config })).status).toBe(503);
    }
  });
  it('rejects forged, wrong-kind and expired state without redirecting', async () => {
    const { state, code } = await flow();
    for (const value of [state.slice(0, -4) + 'AAAA', code]) {
      expect((await run('callback', `?${new URLSearchParams({ state: value, code: 'code' })}`)).status).toBe(400);
    }
    expect((await run('callback', `?${new URLSearchParams({ state, code: 'code' })}`, {}, undefined, now + 600_000)).status).toBe(400);
  });
  it('returns cancellation only to the governed callback with original state', async () => {
    const { state } = await flow();
    const result = await run('callback', `?${new URLSearchParams({ state, error: 'access_denied', error_description: 'private-error' })}`);
    const url = new URL(result.headers.get('Location')!);
    expect(url.searchParams.get('state')).toBe('supabase-state');
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.has('error_description')).toBe(false);
  });
  it('rejects wrong PKCE, app, redirect, grant and expired code before upstream requests', async () => {
    const { code } = await flow();
    const fetcher = vi.fn<NaverOAuthBridgeFetchV1>();
    for (const fields of [{ code_verifier: 'b'.repeat(43) }, { client_id: 'other' }, { redirect_uri: 'https://evil.test' }, { grant_type: 'refresh_token' }]) {
      expect((await run('token', '', tokenRequest(code, fields), fetcher)).status).toBe(400);
    }
    expect((await run('token', '', tokenRequest(code), fetcher, now + 60_000)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects arbitrary raw Naver access tokens', async () => {
    const fetcher = vi.fn<NaverOAuthBridgeFetchV1>();
    expect((await run('userinfo', '', { headers: { Authorization: 'Bearer arbitrary-provider-token' } }, fetcher)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('suppresses upstream secrets/errors and rejects oversized upstream responses', async () => {
    const { code } = await flow();
    for (const result of [Response.json({ error: 'secret-upstream-error' }), new Response('secret-upstream-error', { status: 400 }), Response.json({ access_token: 'x'.repeat(20_000) })]) {
      const response = await run('token', '', tokenRequest(code), vi.fn<NaverOAuthBridgeFetchV1>().mockResolvedValue(result));
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain('secret');
    }
  });
  it('rejects oversized and duplicate token fields', async () => {
    const fetcher = vi.fn<NaverOAuthBridgeFetchV1>();
    const { code } = await flow();
    for (const body of ['x=' + 'x'.repeat(20_000), `${new URLSearchParams(tokenRequest(code).body as URLSearchParams)}&code=other`]) {
      expect((await run('token', '', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, fetcher)).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('routes all four endpoints through sign-in and rejects conflicting selectors', () => {
    for (const action of ['authorize', 'callback', 'token', 'userinfo']) {
      expect(resolveAuthSignInDispatchForTestV1(new Request(`${origin}/api/auth/sign-in?__myeongha_naver_oauth_bridge=${action}`))).toMatchObject({ kind: 'naver-bridge', action });
    }
    for (const query of ['__myeongha_naver_oauth_bridge=unknown', '__myeongha_naver_oauth_bridge=token&__myeongha_social_auth_start=1', '__myeongha_naver_oauth_bridge=token&__myeongha_naver_oauth_bridge=token']) {
      expect(resolveAuthSignInDispatchForTestV1(new Request(`${origin}/api/auth/sign-in?${query}`))).toBeNull();
    }
  });
  it('deploys exactly one rewrite per bridge action without another serverless function', async () => {
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8')) as { rewrites: { source: string; destination: string }[] };
    for (const action of ['authorize', 'callback', 'token', 'userinfo']) {
      expect(config.rewrites.filter(rule => rule.source === `/api/auth/social/naver/${action}`)).toEqual([{ source: `/api/auth/social/naver/${action}`, destination: `/api/auth/sign-in?__myeongha_naver_oauth_bridge=${action}` }]);
    }
  });
});
