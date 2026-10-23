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
import {
  tryHandleCloudflareApprovedSajuCalculationV1,
  fenceCloudflareApprovedSajuResponseV1,
} from '../workers/cloudflare-saju-calculation.mjs';
import {
  renderCloudflareStaticHeaders,
  writeCloudflareStaticHeaders,
  CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1,
  renderCloudflarePreviewReceiptV1,
} from '../scripts/prepare-cloudflare-static.mjs';
import {
  HTML_ENTRIES,
  verifyCloudflareStaticArtifact,
  hashCloudflareStaticTreeV1,
} from '../scripts/verify-cloudflare-static.mjs';

const vercelUrl = new URL('../vercel.json', import.meta.url);
const wranglerUrl = new URL('../wrangler.ops.jsonc', import.meta.url);
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
  await writeFile(join(folder, 'wrangler.ops.jsonc'), await readFile(wranglerUrl));
  return { folder, publicDir };
}

describe('Cloudflare static-only deployment boundary', () => {
  it('keeps all API paths out of Static Assets and disables SPA fallback', async () => {
    const config = JSON.parse(await readFile(wranglerUrl, 'utf8'));
    expect(config.assets.directory).toBe('./public');
    expect(config.assets.html_handling).toBe('none');
    expect(config.assets.not_found_handling).toBe('none');
    expect(config.assets.run_worker_first).toEqual(['/api', '/api/*']);
    expect(config.workers_dev).toBe(true);
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
    expect(output).toContain('/_myeongha-preview-build.json\n  Cache-Control: no-store');
    expect(output).toContain('/\n  Cache-Control: no-store');
    const changed = structuredClone(vercel);
    changed.headers[0].headers = changed.headers[0].headers.filter(
      (header) => header.key !== 'Content-Security-Policy',
    );
    expect(() => renderCloudflareStaticHeaders(changed)).toThrow();
  });

  it('verifies an isolated artifact and rejects stripped security headers', async () => {
    const { folder, publicDir } = await createFixture();
    const syntheticCommit = 'a'.repeat(40);
    await writeCloudflareStaticHeaders({ cwd: folder, commitSha: syntheticCommit });
    const verified = await verifyCloudflareStaticArtifact({
      cwd: folder,
      expectedCommitSha: syntheticCommit,
    });
    expect(verified.entryCount).toBe(11);
    expect(verified.fileCount).toBe(14);
    expect(verified.totalAssetBytes).toBeGreaterThanOrEqual(verified.largestFileSize);
    expect(verified.totalAssetBytes).toBeGreaterThan(0);
    expect(verified.staticAssetTreeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(verified.checksumScope).toBe('LOCAL_STATIC_ARTIFACT_ONLY');
    // Identical bytes and paths produce exactly the same tree fingerprint.
    const again = await verifyCloudflareStaticArtifact({
      cwd: folder, expectedCommitSha: syntheticCommit,
    });
    expect(again.staticAssetTreeSha256).toBe(verified.staticAssetTreeSha256);
    // A changed public HTML byte changes the whole static asset checksum.
    await writeFile(join(publicDir, 'hall.html'),
      '<!doctype html><title>changed public fixture</title>');
    const changed = await verifyCloudflareStaticArtifact({
      cwd: folder, expectedCommitSha: syntheticCommit,
    });
    expect(changed.staticAssetTreeSha256).not.toBe(verified.staticAssetTreeSha256);
    expect(await readFile(join(publicDir, CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1), 'utf8'))
      .toBe(renderCloudflarePreviewReceiptV1(syntheticCommit));
    await expect(verifyCloudflareStaticArtifact({
      cwd: folder,
      expectedCommitSha: 'b'.repeat(40),
    })).rejects.toThrow('receipt does not match');
    expect(await readFile(join(publicDir, '_redirects'), 'utf8')).toBe('/ /index.html 200\n');
    await writeFile(join(publicDir, '_headers'), '/*\n  X-Frame-Options: DENY\n');
    await expect(verifyCloudflareStaticArtifact({
      cwd: folder,
      expectedCommitSha: syntheticCommit,
    })).rejects.toThrow();
  });
  it('rejects Saju HTML, SSE, redirects, cookies and cross-origin response headers', async () => {
    const good = fenceCloudflareApprovedSajuResponseV1(Response.json(
      { ok: true, calculationOnly: true },
      { headers: {
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      } },
    ));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ ok: true, calculationOnly: true });
    expect(good.headers.get('cache-control')).toBe('no-store');
    expect(good.headers.get('access-control-allow-origin')).toBeNull();
    expect(good.headers.get('access-control-allow-credentials')).toBeNull();

    for (const candidate of [
      new Response('<html>PRIVATE_DATA</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response('data: PRIVATE_DATA', { headers: { 'Content-Type': 'text/event-stream' } }),
      new Response('PRIVATE_DATA', { headers: { 'Content-Type': 'text/plain' } }),
      new Response(null, { status: 302, headers: { Location: 'https://other.example.test' } }),
      Response.json({ ok: true }, { headers: { 'Set-Cookie': 'test=private' } }),
      Response.json({ ok: true }, { headers: { Location: '/login' } }),
      new Response(null, { status: 204 }),
    ]) {
      const denied = fenceCloudflareApprovedSajuResponseV1(candidate);
      expect(denied.status).toBe(503);
      expect(denied.headers.get('cache-control')).toBe('no-store');
      expect(denied.headers.get('location')).toBeNull();
      expect(denied.headers.get('set-cookie')).toBeNull();
      const body = await denied.text();
      expect(body).not.toContain('PRIVATE_DATA');
      expect(JSON.parse(body).error.code).toBe('SAJU_SERVICE_UNAVAILABLE');
    }
    const error = fenceCloudflareApprovedSajuResponseV1(Response.json(
      { ok: false, error: { code: 'EXISTING_VALIDATION_ERROR' } }, { status: 422 },
    ));
    expect(error.status).toBe(422);
    expect((await error.json()).error.code).toBe('EXISTING_VALIDATION_ERROR');
  });

  it('uses stable manifest hashing and rejects traversal or duplicate file metadata', () => {
    const a = { path:'index.html',bytes:4,sha256:'a'.repeat(64) };
    const b = { path:'assets/app.js',bytes:5,sha256:'b'.repeat(64) };
    const before=hashCloudflareStaticTreeV1([a,b]);
    expect(before).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCloudflareStaticTreeV1([b,a])).toBe(before);
    expect(hashCloudflareStaticTreeV1([a,{...b,bytes:6}])).not.toBe(before);
    expect(hashCloudflareStaticTreeV1([a,{...b,sha256:'c'.repeat(64)}])).not.toBe(before);
    for (const entries of [
      [],null,[a,a],[{...a,path:'../secret.env'}],
      [{...a,path:'/private.js'}],[{...a,path:'a\\private.js'}],
      [{...a,sha256:'INVALID'}],[{...a,bytes:-1}],
      [{...a,bytes:Number.MAX_SAFE_INTEGER+1}],
    ]) expect(() => hashCloudflareStaticTreeV1(entries)).toThrow();
  });

  it('rejects forged, truncated or non-hex Cloudflare build receipt commit', () => {
    for (const bad of ['not-a-sha', 'A'.repeat(40), 'f'.repeat(39), 'g'.repeat(40)]) {
      expect(() => renderCloudflarePreviewReceiptV1(bad)).toThrow();
    }
  });

  it('requires independent Auth/DB and calculation-only approval before routing Saju', async () => {
    const route = { id: 'api.me.saju.calculation' };
    // Accepted synthetic host shape; the Worker must still reject *.example.test.
    const origin = 'https://auth.synthetic-myeongha.dev';
    const request = new Request(origin + '/api/me/saju/calculation', { method: 'POST' });
    const approvedAuth = {
      MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
      MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
      MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
      MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
      MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
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
