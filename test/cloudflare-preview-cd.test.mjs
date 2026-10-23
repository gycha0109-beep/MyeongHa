import { describe, expect, it, vi } from 'vitest';
import previewWorker from '../cloudflare/preview-worker.mjs';
import {
  CLOUDFLARE_PREVIEW_CD_V1,
  assertCloudflarePreviewConfiguration,
  resolveCloudflarePreviewCdAdmission,
} from '../scripts/cloudflare-preview-cd.mjs';

const commitSha = 'a'.repeat(40);
const correctContext = Object.freeze({
  workersCi: '1',
  branch: CLOUDFLARE_PREVIEW_CD_V1.branch,
  commitSha,
  checkoutSha: commitSha,
});

const previewConfig = Object.freeze({
  name: 'myeongha',
  main: './cloudflare/preview-worker.mjs',
  workers_dev: false,
  preview_urls: true,
  assets: {
    directory: './public',
    binding: 'ASSETS',
    run_worker_first: true,
    html_handling: 'none',
    not_found_handling: 'none',
  },
  previews: {},
});

describe('Cloudflare preview Git-based CD', () => {
  it('admits only the pinned GitHub branch and commit within Workers Builds', () => {
    expect(resolveCloudflarePreviewCdAdmission(correctContext)).toEqual({
      branch: CLOUDFLARE_PREVIEW_CD_V1.branch,
      commitSha,
      previewName: 'approved-character-labels',
    });
  });

  it('rejects a local/manual deployment', () => {
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, workersCi: undefined })).toThrow(/local\/manual uploads are prohibited/u);
  });

  it('does not deploy main or unrelated branches', () => {
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, branch: 'main' })).toThrow(/rejected branch/u);
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, branch: 'feat/other' })).toThrow(/rejected branch/u);
  });

  it('rejects a forged or stale commit', () => {
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, checkoutSha: 'b'.repeat(40) })).toThrow(/exact checked-out/u);
    expect(() => resolveCloudflarePreviewCdAdmission({ ...correctContext, commitSha: 'HEAD' })).toThrow(/exact checked-out/u);
  });

  it('requires preview-only static routing with API interception', () => {
    expect(assertCloudflarePreviewConfiguration(previewConfig)).toBe(true);
    expect(() => assertCloudflarePreviewConfiguration({ ...previewConfig, workers_dev: true })).toThrow(/production workers.dev route disabled/u);
    expect(() => assertCloudflarePreviewConfiguration({ ...previewConfig, assets: { ...previewConfig.assets, run_worker_first: false } })).toThrow(/static assets isolated/u);
    expect(() => assertCloudflarePreviewConfiguration({ ...previewConfig, route: 'example.com/*' })).toThrow(/static assets isolated/u);
  });
  it('routes real Preview chat traffic through the existing sealed Se-yeon Fetch fence', async () => {
    let assetFetches = 0;
    const env = {
      ASSETS: {
        async fetch() {
          assetFetches += 1;
          return new Response('<html>private fallback must never run</html>');
        },
      },
    };
    const protectedRequests = [
      new Request('https://preview.example/api/chat'),
      new Request('https://preview.example/api/chat/123e4567-e89b-42d3-a456-426614174000'),
      new Request('https://preview.example/api/chat/123e4567-e89b-42d3-a456-426614174000/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTurnId: '123e4567-e89b-42d3-a456-426614174001', text: 'hello' }),
      }),
    ];
    for (const request of protectedRequests) {
      const response = await previewWorker.fetch(request, env);
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-type')).toContain('application/json');
      const payload = await response.json();
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
      expect(payload).not.toHaveProperty('assistantText');
    }
    const aliased = await previewWorker.fetch(new Request('https://preview.example/%61pi/chat'), env);
    expect(aliased.status).toBe(503);
    expect(assetFetches).toBe(0);
  });
  it('uses the existing Member preflight on the real Worker route when Auth is configured', async () => {
    const asset = vi.fn(async () => new Response('wrong static fallback'));
    const env = {
      MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
      MYEONGHA_SUPABASE_API_KEY: 'preview-auth-test-key-1234567890',
      ASSETS: { fetch: asset },
    };
    const url = 'https://preview.example/api/chat/123e4567-e89b-42d3-a456-426614174000/turns';
    const method = await previewWorker.fetch(new Request(url), env);
    expect(method.status).toBe(405);
    expect(method.headers.get('Allow')).toBe('POST');
    expect(method.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(method.headers.get('X-Frame-Options')).toBe('DENY');
    expect(method.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(method.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(await method.text()).toBe('');

    const unauthenticated = await previewWorker.fetch(new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientTurnId: '123e4567-e89b-42d3-a456-426614174001',
        text: 'hello',
      }),
    }), env);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(unauthenticated.headers.get('Cache-Control')).toBe('no-store');
    expect((await unauthenticated.json()).error.code).toBe('AUTH_REQUIRED');

    const verifiedUserId = '123e4567-e89b-42d3-a456-426614174002';
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      expect(input).toBe(env.MYEONGHA_SUPABASE_URL + '/auth/v1/user');
      expect(init.headers.apikey).toBe(env.MYEONGHA_SUPABASE_API_KEY);
      expect(init.headers.authorization).toBe('Bearer synthetic-member-token');
      return Response.json({ id: verifiedUserId });
    });
    try {
      const authenticated = await previewWorker.fetch(new Request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer synthetic-member-token',
        },
        body: JSON.stringify({
          clientTurnId: '123e4567-e89b-42d3-a456-426614174001',
          text: 'hello',
        }),
      }), env);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(authenticated.status).toBe(503);
      expect(authenticated.headers.get('Cache-Control')).toBe('no-store');
      expect(authenticated.headers.get('X-Frame-Options')).toBe('DENY');
      expect(authenticated.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect((await authenticated.json()).error.code)
        .toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
      expect(asset).not.toHaveBeenCalled();
    } finally {
      upstream.mockRestore();
    }

    const missingAuthEnv = { ASSETS: { fetch: asset } };
    const missing = await previewWorker.fetch(new Request(url), missingAuthEnv);
    expect(missing.status).toBe(503);
    expect(missing.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
    expect((await missing.json()).error.code)
      .toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
    expect(asset).not.toHaveBeenCalled();
  });

});
