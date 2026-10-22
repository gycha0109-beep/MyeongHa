// Cloudflare static preview is intentionally a deny-only API environment.
// Existing Vitest CI picks this up as a file-reading contract test.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleCloudflareStaticPreviewRequest,
  isCloudflareStaticPreviewApiPath,
  CLOUDFLARE_PUBLIC_HTML_PATHS_V1,
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
  isCloudflareApiStaticAliasV1,
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
    expect(config.assets.run_worker_first).toBe(true);
    expect(config.workers_dev).toBe(false);
    expect(isCloudflareStaticPreviewApiPath('/api/health')).toBe(true);
    expect(isCloudflareStaticPreviewApiPath('/api')).toBe(true);
    expect(isCloudflareStaticPreviewApiPath('/apixel')).toBe(false);
  });

  it('rejects encoded or case-folded API namespace names from Static Assets', async () => {
    for (const artifact of [
      'API/chat.html',
      'api/chat.html',
      'api',
      '%61pi/chat.html',
      'api%2Fchat.html',
      'api%252Fchat.html',
      '%2Fapi%2Fchat.html',
      'api\\\\turns.json',
    ]) {
      expect(isCloudflareApiStaticAliasV1(artifact), artifact).toBe(true);
    }
    for (const artifact of [
      'api-client.js',
      'api.json',
      'apixel/icons.svg',
      'assets/api/history.png',
      'index.html',
    ]) {
      expect(isCloudflareApiStaticAliasV1(artifact), artifact).toBe(false);
    }

    const { folder, publicDir } = await createFixture();
    const sha = 'a'.repeat(40);
    await writeCloudflareStaticHeaders({ cwd: folder, commitSha: sha });
    for (const entry of ['API', '%61pi', 'api%2Fchat.html', 'api%252Fchat.html']) {
      const path = join(publicDir, entry);
      if (entry === 'API' || entry === '%61pi') {
        await mkdir(path);
      } else {
        await writeFile(path, 'PROTECTED_FIXTURE_MUST_NOT_DEPLOY');
      }
      await expect(verifyCloudflareStaticArtifact({
        cwd: folder, expectedCommitSha: sha,
      })).rejects.toThrow('API namespace must not be packaged as Static Assets');
      await rm(path, { recursive: true, force: true });
    }
    const cleared = await verifyCloudflareStaticArtifact({
      cwd: folder, expectedCommitSha: sha,
    });
    expect(cleared.entryCount).toBe(11);
  });

  it('keeps the Worker-first HTML allowlist pinned to the built 11-page inventory', () => {
    expect([...CLOUDFLARE_PUBLIC_HTML_PATHS_V1].sort()).toEqual(
      ['/', ...HTML_ENTRIES.map(entry => '/' + entry)].sort(),
    );
    expect(CLOUDFLARE_PUBLIC_HTML_PATHS_V1).not.toContain('/api');
    expect(CLOUDFLARE_PUBLIC_HTML_PATHS_V1).not.toContain('/api/chat');
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

  it('rejects forged, truncated or non-hex Cloudflare build receipt commit', () => {
    for (const bad of ['not-a-sha', 'A'.repeat(40), 'f'.repeat(39), 'g'.repeat(40)]) {
      expect(() => renderCloudflarePreviewReceiptV1(bad)).toThrow();
    }
  });

  it('requires independent Auth/DB and calculation-only approval before routing Saju', async () => {
    const route = { id: 'api.me.saju.calculation' };
    // Synthetic DNS-shaped host satisfies the Auth origin grammar; the test
    // never resolves the hostname or opens a network connection.
    const origin = 'https://auth.synthetic-myeongha.dev';
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
