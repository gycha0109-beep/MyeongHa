import { describe, expect, it } from 'vitest';
import { runCloudflarePrimaryE2E, CLOUDFLARE_PRIMARY_E2E_ORIGIN } from '../scripts/verify-cloudflare-primary-e2e.mjs';

const headers = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json',
};
function fixture(path, init = {}) {
  if (path === '/') return new Response('<html>home</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  if (path === '/hall.html') return new Response('<html>hall</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  if (path === '/api/health' && init.method === 'POST') return new Response(null, {
    status: 405, headers: { ...headers, Allow: 'GET' },
  });
  if (path === '/api/health') return Response.json({ status: 'ok' }, { headers });
  if (path === '/api/readiness') return Response.json({
    status: 'unready', capabilities: { userData: 'unready' },
  }, { status: 503, headers });
  if (path === '/api/me') return Response.json({ ok: false, error: { code: 'AUTH_REQUIRED' } }, { status: 401, headers });
  if (path === '/api/me/saju/calculation') return new Response(null, { status: 404, headers });
  if (path === '/api/auth/sign-in') return Response.json({
    ok: false, error: { code: 'INVALID_REQUEST' },
  }, { status: 403, headers });
  if (path === '/api/__myeongha_e2e_unknown') return new Response(null, { status: 404, headers });
  return Response.json({ ok: false, error: { code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE' } }, { status: 503, headers });
}
function mockFetch(overrides = {}) {
  const visited = [];
  async function fetchImpl(input, init) {
    const u = new URL(input);
    visited.push({ path: u.pathname + u.search, method: init.method ?? 'GET' });
    if (overrides[u.pathname + u.search]) return overrides[u.pathname + u.search](init);
    return fixture(u.pathname + u.search, init);
  }
  return { fetchImpl, visited };
}

describe('Cloudflare primary live E2E verifier (offline harness)', () => {
  it('covers health, readiness, Member, Saju and protected Chat without credentials', async () => {
    const { fetchImpl, visited } = mockFetch();
    const result = await runCloudflarePrimaryE2E({ fetchImpl });
    expect(result.result).toBe('PASS');
    expect(result.mode).toBe('anonymous');
    expect(result.checks).toHaveLength(13);
    expect(result.checks.map(x => x.name)).toContain('api.readiness.config_only');
    expect(visited.some(x => x.path === '/api/me/saju/calculation' && x.method === 'POST')).toBe(true);
    expect(visited.some(x => x.path.endsWith('/turns') && x.method === 'POST')).toBe(true);
  });

  it('rejects an accidental positive protected Chat or HTML API fallback', async () => {
    const positive = mockFetch({
      '/api/chat': () => Response.json({ ok: true, reply: 'private' }, { status: 200, headers }),
    });
    await expect(runCloudflarePrimaryE2E({ fetchImpl: positive.fetchImpl }))
      .rejects.toThrow(/chat.open_hold unexpected HTTP 200/);
    const html = mockFetch({
      '/api/readiness': () => new Response('<html>oops</html>', { status: 503, headers }),
    });
    await expect(runCloudflarePrimaryE2E({ fetchImpl: html.fetchImpl }))
      .rejects.toThrow(/invalid JSON/);
  });

  it('cannot silently redirect E2E traffic to a non-primary origin', async () => {
    const { fetchImpl } = mockFetch();
    await expect(runCloudflarePrimaryE2E({
      origin: 'https://myeongha-web.gycha0109.workers.dev', fetchImpl,
    })).rejects.toThrow(/pinned/);
    expect(CLOUDFLARE_PRIMARY_E2E_ORIGIN).toBe('https://myeongha.gycha0109.workers.dev');
  });
});
