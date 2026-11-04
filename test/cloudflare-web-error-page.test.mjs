import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
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
      request('/missing.js', 'GET', { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' }),
      request('/missing.css', 'GET', { Accept: 'text/html' }),
      request('/missing.svg', 'GET', { Accept: 'text/html' }),
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


describe('localized public error presentation', () => {
  const scriptUrl = new URL('../apps/web/error-page.js', import.meta.url);
  const textKeys = [
    'title', 'description', 'kicker', 'contact', 'home', 'retry', 'back', 'support',
  ];
  const chromeSelectors = {
    kicker: '.mh-error-kicker',
    contact: '.mh-error-header-help',
    home: '.mh-error-primary',
    retry: '[data-error-retry]',
    back: '[data-error-back]',
    support: '.mh-error-support',
  };
  const mount = async (status, startingLocale) => {
    const js = await readFile(scriptUrl, 'utf8');
    const makeNode = (content = '') => ({
      textContent: content,
      attrs: {},
      getAttribute(key) { return this.attrs[key] ?? null; },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener() {},
    });
    const nodes = new Map([
      ['[data-error-code]', makeNode(String(status))],
      ['[data-error-title]', makeNode(WEB_DOCUMENT_ERROR_COPY_V1[status].title)],
      ['[data-error-description]', makeNode(WEB_DOCUMENT_ERROR_COPY_V1[status].description)],
      ['meta[name="description"]', makeNode()],
      ['.mh-error-brand', makeNode()],
      ...Object.values(chromeSelectors).map(key => [key, makeNode('서비스 안내')]),
      ['[data-error-status]', makeNode(String(status))],
    ]);
    nodes.get('meta[name="description"]').attrs.content = '명하 페이지 오류 안내';
    nodes.get('.mh-error-brand').attrs['aria-label'] = '명하 홈으로 이동';
    const handlers = new Map();
    let locale = startingLocale;
    const document = {
      title: '페이지 안내 · 명하',
      documentElement: { dataset: {}, style: {}, lang: 'ko' },
      querySelector(selector) { return nodes.get(selector) ?? null; },
      addEventListener(event, callback) { handlers.set(event, callback); },
    };
    const window = {
      matchMedia: () => ({ matches: false }),
      addEventListener(event, callback) { handlers.set(event, callback); },
    };
    const localStorage = { getItem(key) {
      return key === 'myeongha.ui.locale.v1' ? locale : key === 'myeongha.productTheme.v1' ? 'light' : null;
    } };
    runInNewContext(js, { document, window, localStorage, URL, location: {}, history: {} });
    handlers.get('DOMContentLoaded')();
    return {
      document, nodes,
      switchTo(value) { locale = value; handlers.get('storage')({ key: 'myeongha.ui.locale.v1' }); },
    };
  };
  it.each([404, 500, 501, 502, 503, 504])('localizes the complete %i error page in every supported locale', async (status) => {
    for (const locale of ['ja-JP','zh-TW','en-US','zh-CN']) {
      const view = await mount(status, locale);
      const strings = [
        view.document.title,
        view.nodes.get('[data-error-title]').textContent,
        view.nodes.get('[data-error-description]').textContent,
        ...Object.values(chromeSelectors).map(key => view.nodes.get(key).textContent),
        view.nodes.get('.mh-error-brand').getAttribute('aria-label'),
        view.nodes.get('meta[name="description"]').getAttribute('content'),
      ];
      expect(view.document.documentElement.lang).toBe(locale);
      for (const value of strings) {
        expect(value).toBeTruthy();
        expect(value).not.toMatch(/[가-힣]/u);
      }
      expect(view.nodes.get('[data-error-code]').textContent).toBe(String(status));
      view.switchTo('ko-KR');
      expect(view.nodes.get('[data-error-title]').textContent).toBe(WEB_DOCUMENT_ERROR_COPY_V1[status].title);
      expect(view.nodes.get('[data-error-description]').textContent).toBe(WEB_DOCUMENT_ERROR_COPY_V1[status].description);
      expect(view.document.documentElement.lang).toBe('ko-KR');
    }
  });
});
