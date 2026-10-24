import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { HTML_ENTRIES } from '../scripts/verify-cloudflare-static.mjs';
import {
  VERCEL_STANDBY_ORIGIN_V1,
  verifyVercelProductionStandbyV1,
  vercelStandbyStaticPolicyV1,
} from '../scripts/verify-cloudflare-vercel-standby.mjs';

const cfg = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries(vercelStandbyStaticPolicyV1(cfg));

function page(customHeaders = {}, status = 200, content = '<!doctype html><html><body>safe</body></html>') {
  return new Response(content, {
    status,
    headers: { ...headers, 'Content-Type': 'text/html', ...customHeaders },
  });
}

describe('Cloudflare rollback: Vercel static standby read-only', () => {
  it('checks exactly 11 static pages and sends no credentials or API calls', async () => {
    const seen = [];
    const fakeFetch = vi.fn(async (url, options) => { seen.push({ url, options }); return page(); });
    const report = await verifyVercelProductionStandbyV1({
      vercelConfig: cfg, fetchImpl: fakeFetch,
    });
    expect(report.status).toBe('PASS');
    expect(report.failures).toEqual([]);
    expect(seen.map(x=>x.url)).toEqual(
      HTML_ENTRIES.map(name=>VERCEL_STANDBY_ORIGIN_V1 + '/' + name),
    );
    for (const { url, options } of seen) {
      expect(url).not.toContain('/api/');
      expect(options).toMatchObject({
        method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
      });
      expect(options).not.toHaveProperty('headers');
      expect(options).not.toHaveProperty('body');
    }
  });

  it('fails for redirects, cookies, changed CSP and non-HTML', async () => {
    const responses = [
      page({ Location: '/redirect' }, 302, null),
      page({ 'Set-Cookie': 'secret=opaque' }),
      page({ 'Content-Security-Policy': 'default-src *' }),
      page({ 'Content-Type': 'text/plain' }, 200, 'PRIVATE_NOT_FOR_LOGGING'),
    ];
    let n = 0;
    const report = await verifyVercelProductionStandbyV1({
      vercelConfig: cfg, fetchImpl: async () => responses[n++] ?? page(),
    });
    expect(report.status).toBe('FAIL');
    expect(report.failures.map(x=>x.reason)).toEqual(expect.arrayContaining([
      'http-status', 'redirect', 'unexpected-cookie', 'security-header', 'html-mime', 'invalid-html',
    ]));
    expect(JSON.stringify(report)).not.toContain('PRIVATE_NOT_FOR_LOGGING');
    expect(JSON.stringify(report)).not.toContain('secret=opaque');
  });

  it('does not expose transport exception messages or accept changed baseline', async () => {
    const report = await verifyVercelProductionStandbyV1({
      vercelConfig: cfg, fetchImpl: async () => { throw Error('PRIVATE_FAILURE'); },
    });
    expect(report.status).toBe('FAIL');
    expect(report.failures).toHaveLength(HTML_ENTRIES.length);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_FAILURE');
    expect(() => vercelStandbyStaticPolicyV1({ headers: [] })).toThrow();
  });
});
