import { describe, expect, it, vi } from 'vitest';
import {
  classifyCloudflareChatIngressV1,
  holdCloudflareSeyeonBeforeProviderV1,
  fenceCloudflareSeyeonBeforeFetchReturnV1,
  tryHandleCloudflareSeyeonSecurityV1,
} from '../workers/cloudflare-seyeon-security.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import worker from '../workers/cloudflare-static-preview.mjs';

const ROOT = 'https://myeongha-cf.example.test';
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
    const generic = await worker.fetch(new Request(ROOT + '/api/chatty'), {});
    expect(generic.status).toBe(404);
    expect(await generic.text()).toBe('');
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
      { ASSETS: { fetch: () => new Response(null, { status: 304 }) } },
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
    expect(conditional.headers.get('x-content-type-options')).toBe('nosniff');
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
