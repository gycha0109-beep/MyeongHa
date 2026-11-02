import { test } from 'vitest';
import assert from 'node:assert/strict';
import { verifyCloudflareOAuthStart, ORIGIN } from '../scripts/operations/verify-cloudflare-oauth-start-live.mjs';

const VERSION = '8553fcc5-ea3e-406f-a14e-c02d332aeaba';
function mockFetch({ callbackOrigin = ORIGIN, responseVersion = VERSION, naverProvider = 'custom:naver' } = {}) {
  let index = 0;
  return async (url, init) => {
    assert.ok(url.startsWith(ORIGIN + '/api/'));
    const headers = { 'x-myeongha-worker-version': responseVersion, 'cache-control': 'no-store' };
    if (url.endsWith('/api/health')) return new Response('{}', { status: 200, headers });
    assert.equal(init.method, 'POST');
    const input = JSON.parse(init.body);
    const provider = ['google', 'kakao', 'naver'][index++];
    assert.equal(input.provider, provider);
    const state = 'teststateteststateteststate';
    const cb = new URL(callbackOrigin + '/auth.html?social=callback');
    cb.searchParams.set('state', state);
    const authorization = new URL('https://example.supabase.co/auth/v1/authorize');
    authorization.searchParams.set('provider', provider === 'naver' ? naverProvider : provider);
    authorization.searchParams.set('redirect_to', cb.toString());
    return new Response(JSON.stringify({ ok: true, data: {
      provider, state, authorizationUrl: authorization.toString(),
    } }), { status: 200, headers });
  };
}

test('all three provider start contracts pass but do not claim callback exchange', async () => {
  const report = await verifyCloudflareOAuthStart({
    workerVersion: VERSION, fetchImpl: mockFetch(),
  });
  assert.equal(report.result, 'PASS_START_ONLY');
  assert.equal(report.callbackExchanged, false);
  assert.equal(report.checks.length, 3);
});

test('rejects missing exact Worker version before any traffic', async () => {
  await assert.rejects(verifyCloudflareOAuthStart({
    fetchImpl: () => { throw Error('must not fetch'); },
  }), /WORKER_VERSION_REQUIRED/);
});

test('rejects a mismatched live Worker version', async () => {
  await assert.rejects(verifyCloudflareOAuthStart({
    workerVersion: VERSION, fetchImpl: mockFetch({ responseVersion: '37f7b28f-667c-4af1-98c0-f833e83200f2' }),
  }), /WORKER_VERSION_DRIFT/);
});

test('rejects Vercel callback origin even when upstream returns 200', async () => {
  await assert.rejects(verifyCloudflareOAuthStart({
    workerVersion: VERSION, fetchImpl: mockFetch({ callbackOrigin: 'https://myeongha.vercel.app' }),
  }), /google_CALLBACK_ORIGIN/);
});

test('Naver requires exact Supabase custom provider alias', async () => {
  await assert.rejects(verifyCloudflareOAuthStart({
    workerVersion: VERSION, fetchImpl: mockFetch({ naverProvider: 'naver' }),
  }), /naver_PROVIDER_MAPPING/);
});
