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

  it('keeps protected, encoded and unknown APIs fail-closed instead of serving HTML', async () => {
    const asset = vi.fn(async () => new Response('PRIVATE_STATIC_FALLBACK'));
    const env = { ASSETS: { fetch: asset } };
    for (const path of ['/api/chat', '/api/readiness', '/api/unknown', '/%61pi/chat',
        '/api/health?%255f%255fmyeongha_chat_thread_id=forged']) {
      const response = await liveWorker.fetch(new Request('https://test.example' + path), env);
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('content-type')).toContain('application/json');
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
