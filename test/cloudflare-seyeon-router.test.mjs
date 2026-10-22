import { describe, expect, it, vi } from 'vitest';
import {
  classifyCloudflareChatIngressV1,
  holdCloudflareSeyeonBeforeProviderV1,
  fenceCloudflareSeyeonBeforeFetchReturnV1,
  tryHandleCloudflareSeyeonSecurityV1,
} from '../workers/cloudflare-seyeon-security.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import worker from '../workers/cloudflare-static-preview.mjs';

// Synthetic DNS-shaped host for local Worker tests, never resolved.
// Auth origin approval rejects reserved .test addresses before route dispatch.
const ROOT = 'https://auth.synthetic-myeongha.dev';
const THREAD = '123e4567-e89b-42d3-a456-426614174000';
const SECRET = 'PRIVATE_ASSISTANT_CONTENT_MUST_NOT_LEAK';
const bindings = {
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: ROOT,
};

function invoke(path, method = 'GET', env = {}, dependencies) {
  const request = new Request(ROOT + path, { method });
  return tryHandleCloudflareSeyeonSecurityV1(
    request, env, matchCloudflareApiRoute(new URL(request.url).pathname),
    dependencies,
  );
}
async function expectHeld(response) {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.text()).not.toContain(SECRET);
}
describe('S-CF2 mounted Worker /api/chat deny and independent hooks', () => {
  it('classifies first POST or committed replay, History and malformed independently', () => {
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/chat/' + THREAD + '/turns'))).toMatchObject({
      kind: 'first_post_or_committed_replay', threadId: THREAD,
    });
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/chat/' + THREAD))).toMatchObject({
      kind: 'history', threadId: THREAD,
    });
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/chat/' + THREAD + '/replay')).kind).toBe('malformed_or_unknown_chat');
    expect(classifyCloudflareChatIngressV1(new Request(ROOT + '/api/auth/refresh'))).toBeNull();
  });
  it('holds first send and history before any Auth/DB/Provider when approval is absent', async () => {
    const spy = vi.fn();
    const deps = { createSubjectScope: spy, scope: spy };
    for (const [path, method] of [
      ['/api/chat/' + THREAD + '/turns', 'POST'],
      ['/api/chat/' + THREAD, 'GET'],
      ['/api/chat/' + THREAD + '?pageSize=20', 'GET'],
    ]) {
      await expectHeld(await invoke(path, method, {}, deps));
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it('blocks malformed or method-confused Chat before consulting scoped DB', async () => {
    const spy = vi.fn();
    for (const [path, method] of [
      ['/api/chat/' + THREAD + '/turns?__myeongha_chat_thread_id=' + THREAD, 'POST'],
      ['/api/chat/' + THREAD + '?afterSequenceNo=0&afterSequenceNo=2', 'GET'],
      ['/api/chat/' + THREAD + '/replay', 'GET'],
      ['/api/chat/' + THREAD + '/turns', 'OPTIONS'],
      ['/api/chat/' + THREAD, 'POST'],
      ['/api/chat/%34' + THREAD.slice(1), 'GET'],
    ]) {
      await expectHeld(await invoke(path, method, bindings, { createSubjectScope: spy, scope: spy }));
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it('stops cross-origin POST and browser-cookie provenance before DB/Auth', async () => {
    const count = vi.fn();
    const route = matchCloudflareApiRoute('/api/chat/' + THREAD + '/turns');
    for (const headers of [
      { Origin: 'https://attacker.example.test' },
      { 'Sec-Fetch-Site': 'cross-site' },
      { 'X-Myeongha-Auth-Transport': 'web-cookie-v1' },
      { Origin: 'https://attacker.example.test', 'Sec-Fetch-Site': 'same-origin' },
    ]) {
      const response = await tryHandleCloudflareSeyeonSecurityV1(
        new Request(ROOT + '/api/chat/' + THREAD + '/turns', { method: 'POST', headers }),
        bindings, route, { createSubjectScope: count },
      );
      await expectHeld(response);
    }
    expect(count).not.toHaveBeenCalled();
  });
  it('accepts only independently reauthorized unrelated Character handoff, never a positive payload', async () => {
    const close = vi.fn(async () => {});
    const create = vi.fn(() => ({
      pool: {}, identityEvidenceVerifier: {}, close,
    }));
    const scope = vi.fn(async () => ({
      kind: 'unrelated_thread_requires_ops_reauthorization', threadId: THREAD,
    }));
    expect(await invoke('/api/chat/' + THREAD, 'GET', bindings, { createSubjectScope: create, scope })).toBeNull();
    expect(scope).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
    expect(await invoke('/api/me', 'GET', bindings, { createSubjectScope: create, scope })).toBeNull();
    expect(scope).toHaveBeenCalledTimes(1);
  });
  it('fails closed for SeYeon/mixed, unknown, forged candidate and close failure', async () => {
    const injected = {
      createSubjectScope: () => ({ pool: {}, identityEvidenceVerifier: {}, close: async () => {} }),
      scope: async () => ({ kind: 'seyeon_protected_held', response: Response.json({ text: SECRET }) }),
    };
    await expectHeld(await invoke('/api/chat/' + THREAD, 'GET', bindings, injected));
    await expectHeld(await invoke('/api/chat/' + THREAD + '/turns', 'POST', bindings, injected));
    await expectHeld(await invoke('/api/chat/' + THREAD, 'GET', bindings, {
      ...injected, scope: async () => ({ kind: 'unrelated_thread_requires_ops_reauthorization', threadId: 'different' }),
    }));
    await expectHeld(await invoke('/api/chat/' + THREAD, 'GET', bindings, {
      ...injected, createSubjectScope: () => ({ pool: {}, identityEvidenceVerifier: {}, close: async () => { throw Error(SECRET); } }),
    }));
  });
  it('independently seals 200, unregistered 4xx, SSE and redirect', async () => {
    const uuid = crypto.randomUUID();
    await expectHeld(holdCloudflareSeyeonBeforeProviderV1(uuid));
    for (const candidate of [
      Response.json({ assistantText: SECRET }),
      Response.json({ assistantText: SECRET }, { status: 403, headers: { 'Cache-Control': 'no-store' } }),
      new Response('data: ' + SECRET, { headers: { 'Content-Type': 'text/event-stream' } }),
      new Response(null, { status: 302, headers: { Location: '/index.html' } }),
    ]) await expectHeld(fenceCloudflareSeyeonBeforeFetchReturnV1(candidate, uuid));
  });
});


describe('S-CF2 actual Worker fetch boundary and no HTML fallback', () => {
  it('intercepts chat before Auth/Saju and never emits HTML, success or redirects', async () => {
    for (const [path, method] of [
      ['/api/chat/' + THREAD + '/turns', 'POST'],
      ['/api/chat/' + THREAD + '/turns?replay=1', 'POST'],
      ['/api/chat/' + THREAD + '?pageSize=20', 'GET'],
      ['/api/chat/' + THREAD + '/replay', 'POST'],
      ['/api/chat/' + THREAD, 'OPTIONS'],
    ]) {
      const result = await worker.fetch(new Request(ROOT + path, { method }), {});
      await expectHeld(result);
      expect(result.headers.get('location')).toBeNull();
      expect(result.headers.get('content-type')).not.toContain('text/html');
      expect(result.headers.get('access-control-allow-origin')).toBeNull();
    }
  });
  it('holds percent-encoded and double-encoded chat aliases at the actual Worker fetch entrypoint', async () => {
    for (const path of [
      '/api/%63hat/' + THREAD + '/turns',
      '/api/%2563hat/' + THREAD + '/turns',
      '/%61pi/chat/' + THREAD + '/turns',
      '/%2561pi/chat/' + THREAD + '/turns',
      '/api%2F%63hat/' + THREAD + '/turns',
      '/api%252F%2563hat/' + THREAD + '/turns',
      '/%2525252561pi%252525252Fchat/' + THREAD + '/turns',
      '/api%2Fchat/' + THREAD + '/turns',
      '/api/chat%2F' + THREAD + '/turns',
      '/api/chat%252F' + THREAD + '/turns',
      '/api/CHAT/' + THREAD + '/turns',
      '/api/chat%00/' + THREAD,
      '/api/chat%GG/' + THREAD,
    ]) {
      const response = await worker.fetch(new Request(ROOT + path, { method: 'POST' }), bindings);
      await expectHeld(response);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('content-type')).not.toContain('text/html');
    }
    // The deny-only classifier must not hijack unrelated generic APIs.
    for (const path of ['/api/chatty', '/api%2Fchatty', '/%61pi/health']) {
      const generic = await worker.fetch(new Request(ROOT + path), {});
      expect(generic.status).toBe(404);
      expect(await generic.text()).toBe('');
    }
  });

  it('rejects legacy Vercel chat rewrite markers at Worker fetch before Auth/Saju/Health/Static', async () => {
    for (const [path, method] of [
      ['/api/me?__myeongha_chat_turn_send=1', 'GET'],
      ['/api/me?__myeongha_chat_thread_id=' + THREAD, 'GET'],
      ['/api/memories?__myeongha_chat_open=1', 'GET'],
      ['/api/health?__MYEONGHA_CHAT_OPEN=1', 'GET'],
      ['/api/me?%5F_myeongha_chat_open=1', 'GET'],
      ['/api/me?%255F_myeongha_chat_open=1', 'GET'],
      ['/api/me?%25255F_myeongha_chat_open=1', 'GET'],
      ['/api/auth/refresh?%255F%255Fmyeongha_chat_open=1', 'POST'],
      ['/api/health?%25255F%25255Fmyeongha_chat_open=1', 'GET'],
      ['/index.html?__myeongha_chat_open=1', 'GET'],
      ['/api/auth/refresh?__myeongha_chat_thread_id=' + THREAD, 'POST'],
    ]) {
      const response = await worker.fetch(new Request(ROOT + path, { method }), bindings);
      await expectHeld(response);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
    // Existing health path remains a constant 200 without a forged marker.
    const health = await worker.fetch(new Request(ROOT + '/api/health'), bindings);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
  });

  it('intercepts all static requests before ASSETS and denies encoded API alias or query-marker bypass', async () => {
    const calls = vi.fn(async request => {
      const html = new URL(request.url).pathname === '/' ||
        new URL(request.url).pathname.endsWith('.html');
      return new Response(html
        ? '<!doctype html><html>public fixture</html>'
        : 'public fixture image bytes', {
        status: 200,
        headers: {
          'content-type': html ? 'text/html; charset=utf-8' : 'image/png',
          'cache-control': html ? 'no-store' : 'public, max-age=300',
        },
      });
    });
    const env = { ASSETS: { fetch: calls } };

    for (const path of [
      '/index.html?__myeongha_chat_open=1',
      '/?__myeongha_chat_turn_send=1',
      '/hall.html?%255F_myeongha_chat_open=1',
      '/api%2Fhealth',
      '/%61pi%252Fme',
      '/API/health',
      '/api%2Fchat/' + THREAD,
      '/%61pi/chat/' + THREAD,
      '/%2561pi/chat/' + THREAD,
      '/api%2F%63hat/' + THREAD,
      '/api%252F%2563hat/' + THREAD,
    ]) {
      const held = await worker.fetch(new Request(ROOT + path), env);
      if (path.startsWith('/api') || path.startsWith('/%61pi') ||
          path.startsWith('/API')) {
        // Encoded/noncanonical API selectors must never be Static Assets.
        expect([404, 503]).toContain(held.status);
        expect(held.headers.get('cache-control')).toBe('no-store');
      } else {
        await expectHeld(held);
      }
      expect(held.headers.get('location')).toBeNull();
    }
    expect(calls).not.toHaveBeenCalled();

    for (const path of ['/index.html', '/', '/assets/logo.png']) {
      const response = await worker.fetch(new Request(ROOT + path), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('public fixture');
    }
    expect(calls).toHaveBeenCalledTimes(3);

    const rejectedPost = await worker.fetch(new Request(ROOT + '/index.html', {
      method: 'POST',
    }), env);
    expect(rejectedPost.status).toBe(404);
    expect(calls).toHaveBeenCalledTimes(3);

    const missingAssetBinding = await worker.fetch(new Request(ROOT + '/index.html'), {});
    expect(missingAssetBinding.status).toBe(404);
    const failingAssets = await worker.fetch(new Request(ROOT + '/index.html'), {
      ASSETS: { fetch() { throw Error('SYNTHETIC_ASSET_FAILURE'); } },
    });
    expect(failingAssets.status).toBe(404);
    expect(await failingAssets.text()).toBe('');
  });

  it('seals malformed, redirecting, CORS or private ASSETS responses and rejects HTML fallback', async () => {
    const rejections = [
      Response.json({ secret: SECRET }, { status: 500 }),
      Response.json({ secret: SECRET }, { status: 403 }),
      new Response(null, { status: 302, headers: { Location: 'https://unsafe.example.test/' } }),
      new Response('secret', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'session=unsafe' } }),
      new Response('secret', { headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' } }),
      new Response('secret', { headers: { 'Content-Type': 'text/html', 'Location': '/fallback' } }),
      new Response('secret', { headers: { 'Content-Type': 'text/html', 'Access-Control-Expose-Headers': '*' } }),
      new Response('secret', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public,max-age=9999' } }),
    ];
    for (const candidate of rejections) {
      const response = await worker.fetch(new Request(ROOT + '/missing-private.html'), {
        ASSETS: { fetch: () => candidate },
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(await response.text()).toBe('');
    }

    // The exact HTML allowlist cannot be bypassed by an unexpected 200
    // asset or a generic text/html SPA fallback on unrelated static paths.
    for (const [path, mime] of [
      ['/index.html', 'application/json'],
      ['/assets/bundle.js', 'text/html'],
      ['/missing.html', 'text/html'],
      ['/', 'text/plain'],
    ]) {
      const response = await worker.fetch(new Request(ROOT + path), {
        ASSETS: { fetch: () => new Response(SECRET, {
          status: 200, headers: { 'Content-Type': mime },
        }) },
      });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
    const noCandidate = await worker.fetch(new Request(ROOT + '/index.html'), {
      ASSETS: { fetch: () => null },
    });
    expect(noCandidate.status).toBe(404);
    expect(await noCandidate.text()).toBe('');
  });

  it('blocks streaming and ungrounded 206/304 Static Assets, permits bound partial and conditional responses', async () => {
    const invalid = [
      [new Request(ROOT + '/assets/report.js'),
        new Response(SECRET, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })],
      [new Request(ROOT + '/assets/report.js'),
        new Response(SECRET, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })],
      [new Request(ROOT + '/assets/report.js'),
        new Response(new Uint8Array([0x50, 0x52, 0x49, 0x56]), { status: 200 })],
      [new Request(ROOT + '/assets/report.js'),
        new Response(SECRET, { status: 206, headers: {
          'Content-Type': 'text/javascript', 'Content-Range': 'bytes 0-5/50',
        } })],
      [new Request(ROOT + '/assets/report.js', { headers: { Range: 'bytes=0-5' } }),
        new Response(SECRET, { status: 206, headers: { 'Content-Type': 'text/javascript' } })],
      [new Request(ROOT + '/assets/report.js'),
        new Response(null, { status: 304 })],
    ];
    for (const [request, candidate] of invalid) {
      const response = await worker.fetch(request, { ASSETS: { fetch: () => candidate } });
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    }

    const partial = await worker.fetch(
      new Request(ROOT + '/assets/report.js', { headers: { Range: 'bytes=0-5' } }),
      { ASSETS: { fetch: () => new Response('PUBLIC', {
        status: 206, headers: {
          'Content-Type': 'text/javascript',
          'Content-Range': 'bytes 0-5/200',
        },
      }) } },
    );
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe('PUBLIC');
    const conditional = await worker.fetch(
      new Request(ROOT + '/assets/report.js', {
        headers: { 'If-None-Match': '"synthetic-tag"' },
      }),
      { ASSETS: { fetch: () => new Response(null, {
        status: 304, headers: { ETag: '"synthetic-tag"' },
      }) } },
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
    expect(conditional.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects forged, malformed or unbound 304 ETag and Last-Modified responses', async () => {
    const path = ROOT + '/assets/cache.js';
    const timestamp = 'Wed, 21 Oct 2015 07:28:00 GMT';
    const earlier = 'Wed, 21 Oct 2015 07:27:00 GMT';
    const later = 'Wed, 21 Oct 2015 07:29:00 GMT';
    const cases = [
      [{ 'If-None-Match': '"client"' }, { ETag: '"server"' }],
      [{ 'If-None-Match': '"client"' }, {}],
      [{ 'If-None-Match': 'W/"client", "another"' }, { ETag: '"server"' }],
      [{ 'If-None-Match': '"client", ' }, { ETag: '"client"' }],
      [{ 'If-None-Match': '"client", *' }, { ETag: '"client"' }],
      [{ 'If-None-Match': 'W/"unterminated' }, { ETag: '"client"' }],
      [{ 'If-None-Match': 'weak' }, { ETag: '"client"' }],
      [{ 'If-None-Match': '"client"' }, { ETag: 'client' }],
      [{ 'If-None-Match': '"client"' }, { ETag: '"client", "another"' }],
      [{ 'If-None-Match': '"client"', 'If-Modified-Since': later }, {
        ETag: '"server"', 'Last-Modified': timestamp,
      }], // ETag must take precedence over timestamp.
      [{ 'If-Modified-Since': earlier }, { 'Last-Modified': timestamp }],
      [{ 'If-Modified-Since': later }, {}],
      [{ 'If-Modified-Since': 'not-a-date' }, { 'Last-Modified': timestamp }],
      [{ 'If-Modified-Since': later }, { 'Last-Modified': 'Wed, 35 Oct 2015 07:28:00 GMT' }],
      [{ 'If-Modified-Since': later }, { 'Last-Modified': timestamp, Date: 'yesterday' }],
      [{ 'If-None-Match': '"client"' }, { ETag: '"client"', 'Content-Range': 'bytes 0-5/200' }],
      [{ 'If-None-Match': '"client"' }, { ETag: '"client"', 'Content-Length': '0' }],
      [{ 'If-None-Match': '"client"' }, { ETag: '"client"', 'Transfer-Encoding': 'chunked' }],
      [{ 'If-None-Match': '"client"', 'If-Range': '"client"' }, { ETag: '"client"' }],
      [{ 'If-None-Match': '"client"', 'If-Match': '"client"' }, { ETag: '"client"' }],
    ];
    for (const [requestHeaders, responseHeaders] of cases) {
      const result = await worker.fetch(
        new Request(path, { headers: requestHeaders }),
        { ASSETS: { fetch: () => new Response(null, {
          status: 304, headers: responseHeaders,
        }) } },
      );
      expect(result.status, JSON.stringify([requestHeaders, responseHeaders])).toBe(404);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(result.headers.get('set-cookie')).toBeNull();
      expect(result.headers.get('location')).toBeNull();
      expect(await result.text()).toBe('');
    }
  });

  it('accepts only matched 304 cached non-HTML variants without body or cache breakage', async () => {
    const path = ROOT + '/assets/cache.js';
    const timestamp = 'Wed, 21 Oct 2015 07:28:00 GMT';
    const later = 'Wed, 21 Oct 2015 07:29:00 GMT';
    const cases = [
      [{ 'If-None-Match': '"same"' }, { ETag: '"same"' }],
      [{ 'If-None-Match': 'W/"same"' }, { ETag: '"same"' }],
      [{ 'If-None-Match': '"other", W/"same"' }, { ETag: 'W/"same"' }],
      [{ 'If-None-Match': '"with,comma"' }, { ETag: 'W/"with,comma"' }],
      [{ 'If-None-Match': '*' }, { ETag: '"same"' }],
      [{ 'If-Modified-Since': timestamp }, { 'Last-Modified': timestamp }],
      [{ 'If-Modified-Since': later }, { 'Last-Modified': timestamp }],
      [{ 'If-None-Match': '"same"', 'If-Modified-Since': 'not-a-date' }, { ETag: '"same"' }],
    ];
    for (const [requestHeaders, responseHeaders] of cases) {
      const candidate = { ...responseHeaders, 'Cache-Control': 'public,max-age=300', Date: timestamp };
      const response = await worker.fetch(
        new Request(path, { headers: requestHeaders }),
        { ASSETS: { fetch: () => new Response(null, { status: 304, headers: candidate }) } },
      );
      expect(response.status, JSON.stringify([requestHeaders, responseHeaders])).toBe(304);
      expect(response.body).toBeNull();
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('public,max-age=300');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
    }
    // Protected HTML is never eligible for a revalidation 304, even with
    // syntactically valid ETags; the exact HTML allowlist still requires 200.
    const html = await worker.fetch(
      new Request(ROOT + '/index.html', { headers: { 'If-None-Match': '"same"' } }),
      { ASSETS: { fetch: () => new Response(null, {
        status: 304, headers: { ETag: '"same"' },
      }) } },
    );
    expect(html.status).toBe(404);
    expect(await html.text()).toBe('');
  });

  it('rejects a synthetic 304 Response subclass carrying a hidden stream body', async () => {
    class Forged304 extends Response {
      get body() {
        return new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode(SECRET));
          controller.close();
        } });
      }
    }
    const leaked = await worker.fetch(
      new Request(ROOT + '/assets/cache.js', { headers: { 'If-None-Match': '"same"' } }),
      { ASSETS: { fetch: () => new Forged304(null, {
        status: 304, headers: { ETag: '"same"' },
      }) } },
    );
    expect(leaked.status).toBe(404);
    expect(await leaked.text()).toBe('');
  });

  it('binds every ASSETS 206 interval to the exact single client byte Range', async () => {
    const path = ROOT + '/assets/chunk.js';
    const cases = [
      ['bytes=0-5', 'bytes 1-6/200', undefined],
      ['bytes=0-5', 'bytes 0-4/200', undefined],
      ['bytes=0-5', 'bytes 0-5/5', undefined],
      ['bytes=0-5', 'bytes 0-5/200', '4'],
      ['bytes=0-5', 'bytes 0-5/200', 'bogus'],
      ['bytes=0-5,10-15', 'bytes 0-5/200', undefined],
      ['bytes=-0', 'bytes 0-5/200', undefined],
      ['bytes=-5', 'bytes 0-4/200', undefined],
      ['bytes=6-5', 'bytes 6-5/200', undefined],
      ['bytes=0-9007199254740993', 'bytes 0-5/200', undefined],
      ['bytes=0-', 'bytes 0-5/200', undefined],
      ['bytes=200-', 'bytes 200-205/300', undefined],
      ['items=0-5', 'bytes 0-5/200', undefined],
      ['bytes=00-05', 'bytes 0-5/200', undefined],
    ];
    for (const [range, contentRange, contentLength] of cases) {
      const response = await worker.fetch(new Request(path, { headers: { Range: range } }), {
        ASSETS: { fetch: () => new Response('PUBLIC', {
          status: 206,
          headers: {
            'Content-Type': 'text/javascript',
            'Content-Range': contentRange,
            ...(contentLength === undefined ? {} : { 'Content-Length': contentLength }),
          },
        }) },
      });
      expect(response.status, range + ' => ' + contentRange).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    }

    for (const [range, contentRange] of [
      ['bytes=0-5', 'bytes 0-5/200'],
      ['bytes=10-', 'bytes 10-199/200'],
      ['bytes=-4', 'bytes 196-199/200'],
      ['bytes=190-300', 'bytes 190-199/200'],
    ]) {
      const response = await worker.fetch(new Request(path, { headers: { Range: range } }), {
        ASSETS: { fetch: () => new Response('PUBLIC', {
          status: 206, headers: {
            'Content-Type': 'text/javascript',
            'Content-Range': contentRange,
          },
        }) },
      });
      expect(response.status, range + ' => ' + contentRange).toBe(206);
      expect(await response.text()).toBe('PUBLIC');
    }
  });

  it('never emits a body from Static Assets for HEAD, even if ASSETS supplies one', async () => {
    const requests = [
      ['/index.html', 'text/html'],
      ['/assets/app.js', 'text/javascript'],
      ['/assets/photo.png', 'image/png'],
    ];
    for (const [path, mime] of requests) {
      const upstream = vi.fn(() => new Response(SECRET, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(SECRET.length),
          'Cache-Control': 'public, max-age=60',
        },
      }));
      const request = new Request(ROOT + path, { method: 'HEAD' });
      const held = await worker.fetch(request, { ASSETS: { fetch: upstream } });
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(upstream.mock.calls[0][0].method).toBe('HEAD');
      expect(held.status).toBe(200);
      expect(held.body).toBeNull();
      expect(await held.text()).toBe('');
      expect(held.headers.get('content-type')).toBe(mime);
      expect(held.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(held.headers.get('x-content-type-options')).toBe('nosniff');
      if (path === '/index.html') {
        expect(held.headers.get('cache-control')).toBe('no-store');
      } else {
        expect(held.headers.get('cache-control')).toBe('public, max-age=60');
      }
    }
  });

  it('rejects invalid 200 Content-Range and HEAD 206 partial asset metadata', async () => {
    for (const [method, status, headers] of [
      ['GET', 200, {
        'Content-Type': 'text/javascript', 'Content-Range': 'bytes 0-5/200',
      }],
      ['HEAD', 200, {
        'Content-Type': 'text/javascript', 'Content-Range': 'bytes 0-5/200',
      }],
      ['HEAD', 206, {
        'Content-Type': 'text/javascript', 'Content-Range': 'bytes 0-5/200',
      }],
    ]) {
      const request = new Request(ROOT + '/assets/app.js', {
        method, headers: { Range: 'bytes=0-5' },
      });
      const result = await worker.fetch(request, {
        ASSETS: { fetch: () => new Response(SECRET, { status, headers }) },
      });
      expect(result.status, method + ' ' + status).toBe(404);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(result.headers.get('location')).toBeNull();
      expect(result.body).toBeNull();
      expect(await result.text()).toBe('');
    }
  });

  it('keeps conditional HEAD 304 empty and blocks HEAD API-to-assets fallthrough', async () => {
    const validator = '"synthetic-cache-validator"';
    const cached = await worker.fetch(
      new Request(ROOT + '/assets/app.js', {
        method: 'HEAD', headers: { 'If-None-Match': validator },
      }),
      { ASSETS: { fetch: () => new Response(null, {
        status: 304, headers: {
          ETag: validator, 'Cache-Control': 'public,max-age=180',
        },
      }) } },
    );
    expect(cached.status).toBe(304);
    expect(cached.body).toBeNull();
    expect(await cached.text()).toBe('');
    expect(cached.headers.get('cache-control')).toBe('public,max-age=180');

    const assets = vi.fn(() => new Response(SECRET, {
      headers: { 'Content-Type': 'text/plain' },
    }));
    for (const path of [
      '/api/health', '/api/me', '/api/chat/' + THREAD,
      '/%61pi/chat/' + THREAD, '/api%2Fchat/' + THREAD,
    ]) {
      const response = await worker.fetch(new Request(ROOT + path, {
        method: 'HEAD',
      }), { ASSETS: { fetch: assets } });
      expect([404, 405, 503]).toContain(response.status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
    }
    expect(assets).not.toHaveBeenCalled();
  });

  it('never serves If-Range 206 from a different or weak cache representation', async () => {
    const path = ROOT + '/assets/chunk.js';
    const earlier = 'Wed, 21 Oct 2015 07:28:00 GMT';
    const later = 'Wed, 21 Oct 2015 07:29:00 GMT';
    const early = 'Wed, 21 Oct 2015 07:28:30 GMT';
    const cases = [
      ['"current"', { ETag: '"current"' }, 206],
      ['"stale"', { ETag: '"current"' }, 404],
      ['"current"', {}, 404],
      ['W/"current"', { ETag: '"current"' }, 404],
      ['"current"', { ETag: 'W/"current"' }, 404],
      ['"current", "stale"', { ETag: '"current"' }, 404],
      ['bad-validator', { ETag: '"current"' }, 404],
      [earlier, { 'Last-Modified': earlier, Date: later }, 206],
      [earlier, { 'Last-Modified': earlier, Date: early }, 404],
      [earlier, { 'Last-Modified': earlier }, 404],
      [earlier, { 'Last-Modified': later, Date: later }, 404],
      [earlier, { 'Last-Modified': earlier, Date: later, ETag: '"current"' }, 404],
      [earlier, { Date: later }, 404],
      [later, { 'Last-Modified': earlier, Date: later }, 404],
      ['Wed, 35 Oct 2015 07:28:00 GMT', { 'Last-Modified': earlier, Date: later }, 404],
    ];
    for (const [ifRange, validators, expected] of cases) {
      const response = await worker.fetch(
        new Request(path, {
          headers: { Range: 'bytes=0-5', 'If-Range': ifRange },
        }),
        {
          ASSETS: {
            fetch: () => new Response('PUBLIC', {
              status: 206,
              headers: {
                'Content-Type': 'text/javascript',
                'Content-Range': 'bytes 0-5/200',
                'Content-Length': '6',
                ...validators,
              },
            }),
          },
        },
      );
      expect(response.status, 'If-Range=' + ifRange).toBe(expected);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      if (expected === 404) {
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(await response.text()).toBe('');
      } else {
        expect(await response.text()).toBe('PUBLIC');
      }
    }
    const unconditional = await worker.fetch(
      new Request(path, { headers: { Range: 'bytes=0-5' } }),
      {
        ASSETS: {
          fetch: () => new Response('PUBLIC', {
            status: 206,
            headers: {
              'Content-Type': 'text/javascript',
              'Content-Range': 'bytes 0-5/200',
            },
          }),
        },
      },
    );
    expect(unconditional.status).toBe(206);
    expect(await unconditional.text()).toBe('PUBLIC');
  });

  it('keeps browser credentials and query secrets out of internal public ASSETS', async () => {
    const controller = new AbortController();
    const secret = 'SYNTHETIC_STATIC_REQUEST_SECRET';
    const received = [];
    const assets = vi.fn(request => {
      received.push(request);
      return new Response('PUBLIC', {
        headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public,max-age=60' },
      });
    });
    const original = new Request(ROOT + '/assets/app.js?cache=1&session=' + secret, {
      signal: controller.signal,
      headers: {
        Accept: 'text/javascript',
        'Accept-Encoding': 'gzip, br',
        'Accept-Language': 'ko-KR',
        Cookie: 'session=' + secret,
        Authorization: 'Bearer ' + secret,
        Referer: ROOT + '/account/private',
        Origin: ROOT,
        'X-Api-Key': secret,
        'X-Forwarded-Authorization': secret,
        'CF-Connecting-IP': '192.0.2.100',
      },
    });
    const response = await worker.fetch(original, { ASSETS: { fetch: assets } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('PUBLIC');
    expect(assets).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
    const sent = received[0];
    expect(sent.method).toBe('GET');
    expect(sent.url).toBe(ROOT + '/assets/app.js');
    expect(sent.redirect).toBe('manual');
    expect(sent.headers.get('accept')).toBe('text/javascript');
    expect(sent.headers.get('accept-encoding')).toBe('gzip, br');
    expect(sent.headers.get('accept-language')).toBe('ko-KR');
    for (const name of [
      'cookie', 'authorization', 'referer', 'origin', 'x-api-key',
      'x-forwarded-authorization', 'cf-connecting-ip', 'sec-fetch-site',
    ]) {
      expect(sent.headers.get(name)).toBeNull();
    }
    expect([...sent.headers].flat().join(' ')).not.toContain(secret);
    expect(original.headers.get('authorization')).toBe('Bearer ' + secret);
    controller.abort();
    expect(sent.signal.aborted).toBe(true);
  });

  it('forwards only conditional and range validators required for legal static 304/206', async () => {
    const requestSecret = 'SYNTHETIC_PRIVATE_COOKIE';
    const cases = [
      {
        request: new Request(ROOT + '/assets/app.js?session=' + requestSecret, {
          headers: {
            Cookie: 'sid=' + requestSecret,
            'If-None-Match': '"public-tag"',
            'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT',
          },
        }),
        response: new Response(null, { status: 304, headers: { ETag: '"public-tag"' } }),
        status: 304,
      },
      {
        request: new Request(ROOT + '/assets/app.js?download=1', {
          headers: {
            Authorization: 'Bearer ' + requestSecret,
            Range: 'bytes=0-5',
            'If-Range': '"public-tag"',
          },
        }),
        response: new Response('PUBLIC', { status: 206, headers: {
          ETag: '"public-tag"',
          'Content-Type': 'text/javascript',
          'Content-Range': 'bytes 0-5/200',
          'Content-Length': '6',
        } }),
        status: 206,
      },
    ];
    for (const scenario of cases) {
      const upstream = vi.fn(() => scenario.response);
      const result = await worker.fetch(scenario.request, {
        ASSETS: { fetch: upstream },
      });
      expect(result.status).toBe(scenario.status);
      const sent = upstream.mock.calls[0][0];
      expect(new URL(sent.url).search).toBe('');
      expect(sent.headers.get('cookie')).toBeNull();
      expect(sent.headers.get('authorization')).toBeNull();
      expect(sent.headers.get('range')).toBe(scenario.request.headers.get('range'));
      expect(sent.headers.get('if-range')).toBe(scenario.request.headers.get('if-range'));
      expect(sent.headers.get('if-none-match')).toBe(scenario.request.headers.get('if-none-match'));
      expect(sent.headers.get('if-modified-since')).toBe(
        scenario.request.headers.get('if-modified-since'),
      );
      expect(await result.text()).toBe(scenario.status === 206 ? 'PUBLIC' : '');
    }
  });

  it('rejects Static Assets navigation, browser-state and user-scoped cache response headers', async () => {
    const forbidden = [
      { Refresh: '0;url=https://attacker.example.test/redirect' },
      { 'Clear-Site-Data': '"cookies", "storage"' },
      { Link: '<https://attacker.example.test/collect>; rel=preload' },
      { 'Content-Location': '/api/chat/private' },
      { 'Content-Disposition': 'attachment; filename="private.txt"' },
      { 'WWW-Authenticate': 'Basic realm="secret"' },
      { 'Proxy-Authenticate': 'Basic realm="secret"' },
      { 'X-Accel-Redirect': '/api/chat/private' },
      { 'X-Sendfile': '/private/file' },
      { 'Access-Control-Allow-Origin': '*' },
      { Location: '/api/me' },
      { 'Set-Cookie': 'session=secret' },
      { Vary: 'Cookie' },
      { Vary: 'Accept-Encoding, Authorization' },
      { Vary: '*' },
      { Vary: 'Accept-Encoding, ' },
    ];
    for (const injected of forbidden) {
      const response = await worker.fetch(
        new Request(ROOT + '/assets/app.js'),
        { ASSETS: { fetch: () => new Response('PUBLIC', {
          status: 200, headers: {
            'Content-Type': 'text/javascript',
            'Cache-Control': 'public,max-age=300',
            ...injected,
          },
        }) } },
      );
      expect(response.status, JSON.stringify(injected)).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('refresh')).toBeNull();
      expect(response.headers.get('clear-site-data')).toBeNull();
      expect(await response.text()).toBe('');
    }
  });

  it('forwards only public representation metadata, not ASSETS debug or internal headers', async () => {
    const privateValue = 'SYNTHETIC_ASSET_HEADER_PRIVATE_VALUE';
    const response = await worker.fetch(
      new Request(ROOT + '/assets/app.js'),
      { ASSETS: { fetch: () => new Response('PUBLIC', {
        status: 200,
        headers: {
          'Content-Type': 'text/javascript',
          'Cache-Control': 'public,max-age=3600',
          'Content-Encoding': 'identity',
          'Content-Language': 'ko',
          ETag: '"public-static"',
          Vary: 'Accept-Encoding, Accept-Language',
          'X-Internal-Trace': privateValue,
          'Server-Timing': 'private;desc="' + privateValue + '"',
          'Report-To': privateValue,
          'Content-Security-Policy-Report-Only': 'report-uri https://attacker.example.test/',
          'Content-Security-Policy': 'default-src *',
        },
      }) } },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('PUBLIC');
    expect(response.headers.get('cache-control')).toBe('public,max-age=3600');
    expect(response.headers.get('etag')).toBe('"public-static"');
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Accept-Language');
    expect(response.headers.get('content-language')).toBe('ko');
    expect(response.headers.get('content-encoding')).toBe('identity');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    for (const name of [
      'x-internal-trace', 'server-timing', 'report-to',
      'content-security-policy-report-only',
    ]) expect(response.headers.get(name)).toBeNull();
    expect([...response.headers].flat().join(' ')).not.toContain(privateValue);
  });

  it('preserves approved HTML security headers and non-HTML cache behavior', async () => {
    const publicHtml = await worker.fetch(new Request(ROOT + '/index.html'), {
      ASSETS: { fetch: () => new Response('<html>public</html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public,max-age=3600',
          'Content-Security-Policy': 'default-src *',
        },
      }) },
    });
    expect(publicHtml.status).toBe(200);
    expect(publicHtml.headers.get('cache-control')).toBe('no-store');
    expect(publicHtml.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(publicHtml.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await publicHtml.text()).toContain('public');

    const publicAsset = await worker.fetch(new Request(ROOT + '/assets/app.js'), {
      ASSETS: { fetch: () => new Response('export default 1;', {
        status: 200, headers: {
          'Content-Type': 'text/javascript',
          'Cache-Control': 'public,max-age=3600',
          'Content-Security-Policy': 'default-src *',
        },
      }) },
    });
    expect(publicAsset.status).toBe(200);
    expect(publicAsset.headers.get('cache-control')).toBe('public,max-age=3600');
    expect(publicAsset.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(publicAsset.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await publicAsset.text()).toBe('export default 1;');
  });

  it('does not confuse an unported other-Character chat open with approved SeYeon Reveal', async () => {
    const response = await worker.fetch(new Request(ROOT + '/api/chat', { method: 'POST' }), {});
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('keeps every ambiguous history, replay and malformed selector inside the security boundary', async () => {
    for (const [path, method] of [
      ['/api/chat/' + THREAD + '?afterSequenceNo=0&afterSequenceNo=1', 'GET'],
      ['/api/chat/' + THREAD + '?pageSize=0', 'GET'],
      ['/api/chat/' + THREAD + '/turns?__myeongha_chat_turn_send=1', 'POST'],
      ['/api/chat/' + THREAD + '/turns', 'GET'],
      ['/api/chat/' + THREAD + '/replay', 'GET'],
    ]) {
      const response = await worker.fetch(new Request(ROOT + path, { method }), {});
      await expectHeld(response);
    }
  });
  it('preserves non-chat router state independently, with Static Assets unavailable to APIs', async () => {
    for (const path of ['/api/me', '/api/readings', '/api/memories', '/api/chat-unknown', '/api/unknown']) {
      const result = await worker.fetch(new Request(ROOT + path), {});
      expect(result.status).toBe(404);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(await result.text()).toBe('');
    }
    const health = await worker.fetch(new Request(ROOT + '/api/health'), {});
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const unknown = await worker.fetch(new Request(ROOT + '/no-such-page.html'), {});
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe('');
  });
});
