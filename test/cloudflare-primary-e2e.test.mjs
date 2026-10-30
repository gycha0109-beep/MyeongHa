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
  if (path === '/api/me/saju/calculation' || path === '/api/me/saju/preview-reading')
    return new Response(null, { status: 404, headers });
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
    expect(result.checks).toHaveLength(14);
    expect(result.checks.map(x => x.name)).toContain('api.readiness.config_only');
    expect(visited.some(x => x.path === '/api/me/saju/calculation' && x.method === 'POST')).toBe(true);
    expect(visited.some(x => x.path.endsWith('/turns') && x.method === 'POST')).toBe(true);
    expect(visited.some(x => x.path === '/api/me/saju/preview-reading' && x.method === 'POST')).toBe(true);
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

  it('pins API version but not asset HTML, and stops before credential sign-in on unready setup', async () => {
    const expectedVersion = '123e4567-e89b-42d3-a456-426614174000';
    const { fetchImpl, visited } = mockFetch();
    const versionedFetch = async (input, init) => {
      if (new URL(input).pathname === '/api/auth/sign-in' &&
          init.headers.Origin === CLOUDFLARE_PRIMARY_E2E_ORIGIN) {
        throw Error('credentialed sign-in was called before admissions');
      }
      const result = await fetchImpl(input, init);
      if (![
        '/api/health', '/api/readiness', '/api/me',
        '/api/auth/sign-in', '/api/me/birth-profile',
        '/api/me/saju/calculation', '/api/me/saju/preview-reading',
      ].includes(new URL(input).pathname)) return result;
      const headersWithVersion = new Headers(result.headers);
      headersWithVersion.set('x-myeongha-worker-version', expectedVersion);
      return new Response(result.body, {
        status: result.status,
        headers: headersWithVersion,
      });
    };
    await expect(runCloudflarePrimaryE2E({
      mode: 'authenticated', expectedVersion, fetchImpl: versionedFetch,
    })).rejects.toThrow(
      /BLOCKED_BY_ADMISSION: readiness=503 member=401 saju=404 preview=404/,
    );
    expect(visited[0].path).toBe('/');
    expect(visited[1].path).toBe('/hall.html');
    expect(visited.some(x => x.path === '/api/health')).toBe(true);
  });

  it('fails before any credential even when health API reports a different deployment', async () => {
    const expectedVersion = '123e4567-e89b-42d3-a456-426614174000';
    const { fetchImpl, visited } = mockFetch();
    await expect(runCloudflarePrimaryE2E({
      mode: 'authenticated', expectedVersion, fetchImpl,
    })).rejects.toThrow(/health returned a different deployed Worker version/);
    expect(visited.map(x => x.path)).toEqual(['/', '/hall.html', '/api/health']);
  });

  it('cannot silently redirect E2E traffic to a non-primary origin', async () => {
    const { fetchImpl } = mockFetch();
    await expect(runCloudflarePrimaryE2E({
      origin: 'https://myeongha-web.gycha0109.workers.dev', fetchImpl,
    })).rejects.toThrow(/pinned/);
    expect(CLOUDFLARE_PRIMARY_E2E_ORIGIN).toBe('https://myeongha.gycha0109.workers.dev');
  });

  it('admits only 200 config readiness with exact Member and Saju anonymous denials', async () => {
    const version = '123e4567-e89b-42d3-a456-426614174000';
    const healthy = mockFetch({
      '/api/readiness': () => Response.json({
        status: 'ready', capabilities: { userData: 'ready' },
      }, { status: 200, headers }),
      '/api/me/saju/calculation': () => Response.json({
        ok: false, error: { code: 'AUTH_REQUIRED' },
      }, { status: 401, headers }),
      '/api/me/saju/preview-reading': () => Response.json({
        ok: false, error: { code: 'AUTH_REQUIRED' },
      }, { status: 401, headers }),
    });
    const versionedFetch = async (url, init) => {
      const response = await healthy.fetchImpl(url, init);
      if (!new URL(url).pathname.startsWith('/api/')) return response;
      const versionedHeaders = new Headers(response.headers);
      versionedHeaders.set('x-myeongha-worker-version', version);
      return new Response(response.body, {
        status: response.status, headers: versionedHeaders,
      });
    };
    const result = await runCloudflarePrimaryE2E({
      mode: 'operations', fetchImpl: versionedFetch,
    });
    expect(result).toMatchObject({
      result: 'PASS', mode: 'operations',
      observedWorkerVersion: version,
      readinessScope: 'configuration-only',
      liveDependencyConnectivityProven: false,
      productionAcceptanceProven: false,
    });
    expect(result.checks).toHaveLength(11);
    expect(result.checks.map(x => x.name)).toContain('api.operations_config_and_auth_denial');
    expect(healthy.visited.some(x => x.path.startsWith('/api/chat'))).toBe(false);
    expect(healthy.visited.some(x => x.path === '/api/auth/sign-in' &&
      x.method === 'POST')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('AUTH_REQUIRED');
  });

  it('does not accept degraded, absent or misversioned operations readiness', async () => {
    const version = '123e4567-e89b-42d3-a456-426614174000';
    const wrapVersion = (wrapped, changed = false) => async (url, init) => {
      const response = await wrapped(url, init);
      if (!new URL(url).pathname.startsWith('/api/')) return response;
      const h = new Headers(response.headers);
      h.set('x-myeongha-worker-version',
        changed && new URL(url).pathname === '/api/readiness'
          ? '223e4567-e89b-42d3-a456-426614174000' : version);
      return new Response(response.body, { status: response.status, headers: h });
    };
    const denied = mockFetch();
    await expect(runCloudflarePrimaryE2E({
      mode: 'operations', fetchImpl: wrapVersion(denied.fetchImpl),
    })).rejects.toThrow(/Cloudflare operations NOT_ACCEPTED: config readiness=503/);
    const inconsistent = mockFetch();
    await expect(runCloudflarePrimaryE2E({
      mode: 'operations', fetchImpl: wrapVersion(inconsistent.fetchImpl, true),
    })).rejects.toThrow(/readiness changed Worker version/);
    await expect(runCloudflarePrimaryE2E({
      mode: 'operations', fetchImpl: inconsistent.fetchImpl,
    })).rejects.toThrow(/health is missing its exact Worker version/);
  });

});
