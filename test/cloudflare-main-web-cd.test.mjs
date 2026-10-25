import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { assertMainWebCdEnvironment, assertMainWebConfig } from '../scripts/cloudflare-main-web-cd.mjs';
import liveWorker from '../cloudflare/myeongha-worker.mjs';

const configuration = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

describe('merged-main Cloudflare single Worker CD', () => {
  it('uses only myeongha for static web and fail-closed APIs', () => {
    expect(() => assertMainWebConfig(configuration)).not.toThrow();
    expect(configuration.name).toBe('myeongha');
    expect(configuration.main).toBe('./cloudflare/myeongha-worker.mjs');
    expect(configuration.compatibility_flags).toEqual(['nodejs_compat']);
    expect(configuration).not.toHaveProperty('services');
    expect(configuration.assets.run_worker_first).toBe(true);
  });

  it('publishes health from the same Worker without calling the assets binding', async () => {
    const asset = vi.fn(async () => new Response('<html>never</html>'));
    const response = await liveWorker.fetch(new Request('https://test.example/api/health'), {
      ASSETS: { fetch: asset },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(asset).not.toHaveBeenCalled();
  });

  it('binds API canary responses to provider metadata rather than a request header', async () => {
    const version = '123e4567-e89b-42d3-a456-426614174000';
    const response = await liveWorker.fetch(new Request('https://test.example/api/health', {
      headers: { 'X-Myeongha-Worker-Version': 'forged-client-version' },
    }), { CF_VERSION_METADATA: { id: version } });
    expect(response.headers.get('X-Myeongha-Worker-Version')).toBe(version);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
    const absent = await liveWorker.fetch(new Request('https://test.example/api/health'), {});
    expect(absent.headers.has('X-Myeongha-Worker-Version')).toBe(false);
  });

  it('emits native login denial exactly once without logging client inputs', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await liveWorker.fetch(new Request('https://myeongha.gycha0109.workers.dev/api/auth/sign-in', {
        method: 'POST', headers: { Origin: 'https://private-attacker.invalid', Authorization: 'Bearer private-token' },
        body: 'private-password-and-birth-data',
      }), {});
      expect(response.status).toBe(403);
      expect(log).toHaveBeenCalledTimes(1);
      const line = log.mock.calls[0][0];
      expect(line).toContain('MYEONGHA_SECURITY_EVENT ');
      expect(line).toContain('"routeId":"api.auth.sign-in"');
      expect(line).toContain('"eventCode":"ACCESS_DENIED"');
      expect(line).not.toContain('private-');
    } finally { log.mockRestore(); }
  });

  it('keeps protected, encoded and unknown APIs fail-closed instead of serving HTML', async () => {
    const asset = vi.fn(async () => new Response('PRIVATE_STATIC_FALLBACK'));
    const env = { ASSETS: { fetch: asset } };
    for (const [path, expected] of [['/api/chat', 503], ['/api/readiness', 404],
        ['/api/unknown', 404], ['/%61pi/chat', 503],
        ['/api/health?%255f%255fmyeongha_chat_thread_id=forged', 503]]) {
      const response = await liveWorker.fetch(new Request('https://test.example' + path), env);
      expect(response.status).toBe(expected);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      if (expected === 503) expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.text()).not.toContain('PRIVATE_STATIC_FALLBACK');
    }
    expect(asset).not.toHaveBeenCalled();
  });

  it('serves the unchanged multipage web assets through the same Worker', async () => {
    const asset = vi.fn(async () => new Response('<html>page</html>'));
    const response = await liveWorker.fetch(new Request('https://test.example/hall.html'), {
      ASSETS: { fetch: asset },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(await response.text()).toBe('<html>page</html>');
    expect(asset).toHaveBeenCalledTimes(1);
  });

  it('serves the website root as index.html while leaving unknown paths unrewritten', async () => {
    const requested = [];
    const env = { ASSETS: { async fetch(req) {
      requested.push(new URL(req.url).pathname);
      return new Response('<html>index</html>');
    } } };
    expect((await liveWorker.fetch(new Request('https://test.example/'), env)).status).toBe(200);
    expect(requested).toEqual(['/index.html']);
  });

  it('restores gated native Auth/DB dispatch instead of blanket-blocking all APIs', async () => {
    const origin = 'https://auth.synthetic-myeongha.dev';
    const env = {
      MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
      MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
      MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
      MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
      MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
      ASSETS: { async fetch() { throw Error('API must never fetch assets'); } },
    };
    const response = await liveWorker.fetch(new Request(origin + '/api/me'), env);
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json()).error.code).toBe('AUTH_UPSTREAM_UNAVAILABLE');
  });

  it('denies non-merged or local deploy attempts', () => {
    const sha = 'a'.repeat(40);
    expect(() => assertMainWebCdEnvironment({
      workersCi: '1', branch: 'main', sha, checkoutSha: sha,
    })).not.toThrow();
    for (const invalid of [
      { workersCi: undefined, branch: 'main', sha, checkoutSha: sha },
      { workersCi: '1', branch: 'dev', sha, checkoutSha: sha },
      { workersCi: '1', branch: 'main', sha, checkoutSha: 'b'.repeat(40) },
    ]) expect(() => assertMainWebCdEnvironment(invalid)).toThrow();
  });

  it('rejects every attempt to deploy a second Worker or self-binding API proxy', () => {
    for (const bad of [
      { ...configuration, name: 'myeongha-web' },
      { ...configuration, main: './cloudflare/web-worker.mjs' },
      { ...configuration, services: [{ binding: 'AUTHORITY_API', service: 'myeongha' }] },
      { ...configuration, workers_dev: false },
      { ...configuration, routes: ['example.com/*'] },
    ]) expect(() => assertMainWebConfig(bad)).toThrow();
  });
});
