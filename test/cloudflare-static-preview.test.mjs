// Cloudflare static preview is intentionally a deny-only API environment.
// Existing Vitest CI picks this up as a file-reading contract test.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleCloudflareStaticPreviewRequest,
  isCloudflareStaticPreviewApiPath,
} from '../workers/cloudflare-static-preview.mjs';
import { tryHandleCloudflareApprovedSajuCalculationV1 } from '../workers/cloudflare-saju-calculation.mjs';
import {
  renderCloudflareStaticHeaders,
  writeCloudflareStaticHeaders,
} from '../scripts/prepare-cloudflare-static.mjs';
import {
  HTML_ENTRIES,
  verifyCloudflareStaticArtifact,
} from '../scripts/verify-cloudflare-static.mjs';

const vercelUrl = new URL('../vercel.json', import.meta.url);
const wranglerUrl = new URL('../wrangler.jsonc', import.meta.url);
const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((d) => rm(d, {
    recursive: true,
    force: true,
  })));
});

async function createFixture() {
  const folder = await mkdtemp(join(tmpdir(), 'myeongha-cloudflare-static-'));
  temporaryDirectories.push(folder);
  const publicDir = join(folder, 'public');
  await mkdir(publicDir);
  for (const html of HTML_ENTRIES) {
    await writeFile(join(publicDir, html), '<!doctype html><title>safe fixture</title>');
  }
  await writeFile(join(folder, 'vercel.json'), await readFile(vercelUrl));
  await writeFile(join(folder, 'wrangler.jsonc'), await readFile(wranglerUrl));
  return { folder, publicDir };
}

describe('Cloudflare static-only deployment boundary', () => {
  it('keeps all API paths out of Static Assets and disables SPA fallback', async () => {
    const config = JSON.parse(await readFile(wranglerUrl, 'utf8'));
    expect(config.assets.directory).toBe('./public');
    expect(config.assets.html_handling).toBe('none');
    expect(config.assets.not_found_handling).toBe('none');
    expect(config.assets.run_worker_first).toEqual(['/api', '/api/*']);
    expect(config.workers_dev).toBe(false);
    expect(isCloudflareStaticPreviewApiPath('/api/health')).toBe(true);
    expect(isCloudflareStaticPreviewApiPath('/api')).toBe(true);
    expect(isCloudflareStaticPreviewApiPath('/apixel')).toBe(false);
  });

  it('never returns a successful or streaming response for unported APIs', async () => {
    const vercel = JSON.parse(await readFile(vercelUrl, 'utf8'));
    const csp = vercel.headers[0].headers.find((header) => header.key === 'Content-Security-Policy').value;
    for (const [method, path] of [
      ['POST', '/api/auth/sign-in'],
      ['GET', '/api/readings'],
      ['POST', '/api/me/saju/calculation'],
      ['GET', '/api/unknown'],
      ['GET', '/nonexistent.html'],
    ]) {
      const response = handleCloudflareStaticPreviewRequest(
        new Request('https://preview.example.test' + path, { method }),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-security-policy')).toBe(csp);
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
      expect(await response.text()).toBe('');
    }
  });

  it('preserves an explicit 503 for first Se-yeon turn send', async () => {
    const response = handleCloudflareStaticPreviewRequest(
      new Request('https://preview.example.test/api/chat/thread-1/turns', {
        method: 'POST',
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain('assistant');
  });

  it('generates exactly the current Vercel security headers', async () => {
    const vercel = JSON.parse(await readFile(vercelUrl, 'utf8'));
    const output = renderCloudflareStaticHeaders(vercel);
    for (const header of vercel.headers[0].headers) {
      expect(output).toContain(`  ${header.key}: ${header.value}`);
    }
    expect(output).toContain('/*.html\n  Cache-Control: no-store');
    expect(output).toContain('/\n  Cache-Control: no-store');
    const changed = structuredClone(vercel);
    changed.headers[0].headers = changed.headers[0].headers.filter(
      (header) => header.key !== 'Content-Security-Policy',
    );
    expect(() => renderCloudflareStaticHeaders(changed)).toThrow();
  });

  it('verifies an isolated artifact and rejects stripped security headers', async () => {
    const { folder, publicDir } = await createFixture();
    await writeCloudflareStaticHeaders({ cwd: folder });
    const verified = await verifyCloudflareStaticArtifact({ cwd: folder });
    expect(verified.entryCount).toBe(11);
    expect(verified.fileCount).toBe(13);
    expect(await readFile(join(publicDir, '_redirects'), 'utf8')).toBe('/ /index.html 200\n');
    await writeFile(join(publicDir, '_headers'), '/*\n  X-Frame-Options: DENY\n');
    await expect(verifyCloudflareStaticArtifact({ cwd: folder })).rejects.toThrow();
  });
  it('requires independent Auth/DB and calculation-only approval before routing Saju', async () => {
    const route = { id: 'api.me.saju.calculation' };
    const origin = 'https://myeongha-cf.example.test';
    const request = new Request(origin + '/api/me/saju/calculation', { method: 'POST' });
    const approvedAuth = {
      MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
      MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
    };
    expect(await tryHandleCloudflareApprovedSajuCalculationV1(request, {}, route)).toBeNull();
    expect(await tryHandleCloudflareApprovedSajuCalculationV1(request, approvedAuth, route)).toBeNull();
    const approvedCalculation = { ...approvedAuth, MYEONGHA_CLOUDFLARE_SAJU_MODE: 'approved-calculation-only-v1' };
    const wrongQuery = new Request(origin + '/api/me/saju/calculation?debug=1', { method: 'POST' });
    const rejected = await tryHandleCloudflareApprovedSajuCalculationV1(wrongQuery, approvedCalculation, route);
    expect(rejected.status).toBe(404);
    expect(rejected.headers.get('cache-control')).toBe('no-store');
    expect(await rejected.text()).toBe('');
    const wrongMethod = await tryHandleCloudflareApprovedSajuCalculationV1(
      new Request(origin + '/api/me/saju/calculation', { method: 'GET' }),
      approvedCalculation,
      route,
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('POST');
    expect(await tryHandleCloudflareApprovedSajuCalculationV1(request, approvedCalculation, { id: 'api.me' })).toBeNull();
  });

});
