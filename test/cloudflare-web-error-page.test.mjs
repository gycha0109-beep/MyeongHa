import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  WEB_DOCUMENT_ERROR_COPY_V1,
  isPublicWebDocumentRequestV1,
  renderPublicWebErrorResponseV1,
} from '../workers/cloudflare-web-error-page.mjs';

const origin = 'https://myeongha.example.test';
const template = await readFile(new URL('../apps/web/error.html', import.meta.url), 'utf8');
const assets = () => ({
  fetch: vi.fn(async (request) => {
    expect(new URL(request.url).pathname).toBe('/error.html');
    expect(request.headers.has('cookie')).toBe(false);
    expect(request.headers.has('authorization')).toBe(false);
    return new Response(template, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }),
});
const request = (path, method = 'GET', headers = { Accept: 'text/html' }) =>
  new Request(origin + path, { method, headers });

describe('Cloudflare public web error page', () => {
  it.each([404, 500, 501, 502, 503, 504])('serves branded document with original %i status', async (status) => {
    const a = assets();
    const response = await renderPublicWebErrorResponseV1({
      request: request('/missing.html', 'GET', { Accept: 'text/html', Cookie: 'private=value' }),
      response: new Response(null, { status, headers: { 'X-Frame-Options': 'DENY', 'Retry-After': '12' } }),
      assets: a,
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('retry-after')).toBe('12');
    const content = await response.text();
    expect(content).toContain('data-error-status="' + status + '"');
    expect(content).toContain('<span data-error-code>' + status + '</span>');
    expect(content).toContain(WEB_DOCUMENT_ERROR_COPY_V1[status].title);
    expect(content).toContain(WEB_DOCUMENT_ERROR_COPY_V1[status].description);
    expect(content).not.toContain('private=value');
    expect(a.fetch).toHaveBeenCalledTimes(1);
  });

  it('serves HEAD without body but preserves 404 status and HTML headers', async () => {
    const result = await renderPublicWebErrorResponseV1({
      request: request('/absent.html', 'HEAD', { Accept: 'text/html' }),
      response: new Response(null, { status: 404 }),
      assets: assets(),
    });
    expect(result.status).toBe(404);
    expect(await result.text()).toBe('');
    expect(result.headers.get('content-type')).toContain('text/html');
  });

  it('never swaps errors for API, assets, unsafe methods or existing successes', async () => {
    const excluded = [
      request('/api/chat/turns', 'GET', { Accept: 'text/html' }),
      request('/api%2fchat', 'GET', { Accept: 'text/html' }),
      request('/%61pi/chat', 'GET', { Accept: 'text/html' }),
      request('/not-found.js', 'GET', { Accept: '*/*' }),
      request('/missing.png', 'GET', { Accept: 'image/png' }),
      request('/missing.html', 'POST'),
    ];
    for (const req of excluded) {
      expect(isPublicWebDocumentRequestV1(req)).toBe(false);
      const old = new Response('JSON_OR_BINARY_KEEP', { status: 404 });
      const a = assets();
      expect(await renderPublicWebErrorResponseV1({ request: req, response: old, assets: a })).toBe(old);
      expect(a.fetch).not.toHaveBeenCalled();
    }
    for (const status of [200, 400, 401, 403, 405, 409, 422, 429]) {
      const old = new Response('KEEP', { status });
      expect(await renderPublicWebErrorResponseV1({ request: request('/x.html'), response: old, assets: assets() })).toBe(old);
    }
  });

  it('keeps original 404 if error HTML is unavailable or malformed', async () => {
    for (const htmlResponse of [
      new Response(null, { status: 404 }),
      new Response('<html>unexpected</html>', { status: 200 }),
    ]) {
      const old = new Response('original 404', { status: 404 });
      const result = await renderPublicWebErrorResponseV1({
        request: request('/missing.html'),
        response: old,
        assets: { fetch: async () => htmlResponse },
      });
      expect(result).toBe(old);
    }
  });

  it('wires only the public static Worker fallback, never the protected API dispatch', async () => {
    const [worker, vite, page, css, script] = await Promise.all([
      readFile(new URL('../cloudflare/myeongha-worker.mjs', import.meta.url), 'utf8'),
      readFile(new URL('../apps/web/vite.config.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/web/error.html', import.meta.url), 'utf8'),
      readFile(new URL('../apps/web/error.css', import.meta.url), 'utf8'),
      readFile(new URL('../apps/web/error-page.js', import.meta.url), 'utf8'),
    ]);
    expect(worker).toContain('servePublicWebAssetV1(request, env, ctx)');
    expect(worker).toContain("url.pathname === '/error.html'");
    expect(worker.indexOf('return servePublicWebAssetV1(request, env, ctx)'))
      .toBeGreaterThan(worker.indexOf("url.pathname === '/api'"));
    expect(vite).toContain("'error.html'");
    expect(page).toContain('href="/hall.html"');
    expect(page).toContain('href="/contact.html"');
    expect(page).toContain('data-error-retry');
    expect(css).toContain('data-error-status="503"');
    expect(script).toContain('myeongha.productTheme.v1');
  });
});
