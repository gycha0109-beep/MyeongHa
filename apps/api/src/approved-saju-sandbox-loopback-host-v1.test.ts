import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { APPROVED_SAJU_SANDBOX_ROUTES_V1 as ROUTES } from '../../../packages/contracts/src/approved-saju-sandbox-routes.js';
import { createApprovedSajuSandboxLoopbackHostV1 } from './approved-saju-sandbox-loopback-host-v1.js';
import { createApprovedSajuSandboxHttpRuntimeV1 } from './approved-saju-sandbox-http-runtime-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const port = 48673;
const origin = `http://127.0.0.1:${port}`;
const handler = vi.fn(async (request: Request): Promise<Response | null> => {
  if (request.url.endsWith(ROUTES.access)) {
    if (request.headers.get('authorization') !== 'Bearer owner') return Response.json({ ok: false }, { status: 404 });
    return Response.json({ ok: true, data: { environment: 'sandbox' } });
  }
  if (request.url.endsWith(ROUTES.order)) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (request.headers.get('origin') !== origin) return Response.json({ ok: false }, { status: 403 });
    if (request.headers.get('authorization') !== 'Bearer owner') return Response.json({ ok: false }, { status: 404 });
    return Response.json({ ok: true });
  }
  return null;
});
let root = '';
let server: ReturnType<typeof createApprovedSajuSandboxLoopbackHostV1>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'saju-owner-loopback-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'reading.html'), '<html><title>사주 상품</title></html>');
  await writeFile(join(root, 'assets', 'test.js'), 'console.log("saju");');
  server = createApprovedSajuSandboxLoopbackHostV1({ origin, staticRoot: root, runtime: { handleRequest: handler } });
  await server.start();
});
afterAll(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
describe('approved Saju isolated localhost web / checkout HTTP host', () => {
  it('serves the real local frontend and assets without granting API authorization', async () => {
    let response = await fetch(origin + '/reading.html');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('사주 상품');
    expect(response.headers.get('cache-control')).toBe('no-store');
    response = await fetch(origin + '/assets/test.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(origin + '/admin.html')).status).toBe(404);
    expect((await fetch(origin + '/%2e%2e/.env')).status).toBe(404);
  });
  it('preserves member-only checks for the existing sandbox API', async () => {
    expect((await fetch(origin + ROUTES.access)).status).toBe(404);
    const response = await fetch(origin + ROUTES.access, {
      headers: { authorization: 'Bearer owner' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { environment: 'sandbox' } });
  });
  it('rejects unauthorized and cross-origin checkout writes', async () => {
    const post = (headers: Record<string, string>, body = '{}') => fetch(origin + ROUTES.order, {
      method: 'POST', body, headers,
    });
    expect((await post({ origin: origin })).status).toBe(404);
    expect((await post({ origin: 'https://other.example', authorization: 'Bearer owner' })).status).toBe(403);
    expect((await post({ origin, authorization: 'Bearer owner' })).status).toBe(200);
    expect((await post({ origin, authorization: 'Bearer owner' }, 'z'.repeat(1025))).status).toBe(413);
  });
  it('rejects unknown paths and methods without forwarding payment authority', async () => {
    const before = handler.mock.calls.length;
    expect((await fetch(origin + '/api/me/saju/unknown')).status).toBe(404);
    expect((await fetch(origin + '/reading.html', { method: 'POST' })).status).toBe(405);
    expect(handler.mock.calls.length).toBe(before);
  });
  it('refuses non-loopback or arbitrary configured hosts', () => {
    for (const wrongOrigin of ['https://127.0.0.1:48673', 'http://0.0.0.0:48673',
      'http://localhost:48673', 'http://127.0.0.1:80']) {
      expect(() => createApprovedSajuSandboxLoopbackHostV1({
        origin: wrongOrigin, staticRoot: root, runtime: { handleRequest: handler },
      })).toThrow();
    }
  });
});

describe('real owner-only sandbox adapter exposed through the isolated host', () => {
  it('rejects anonymous requests before the provider or merchant database can be consulted', async () => {
    const port = 48674;
    const localOrigin = `http://127.0.0.1:${port}`;
    const subjectId = '11111111-1111-4111-8111-111111111111';
    const query = vi.fn(async (sql: string) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK', 'SET LOCAL ROLE myeongha_api_executor'].includes(sql)
        || sql.includes('assert_myeongha_subject_context_v1')) return { rows: [] };
      if (sql.includes('begin_member_subject_context_v1')) {
        return { rows: [{ subjectId, subjectKind: 'member' }] };
      }
      if (sql.includes('qry_myeongha_owner_admin_access_v1')) {
        return { rows: [{ isOwnerAdmin: true, chatCreditExempt: false, sandboxCheckoutAllowed: true }] };
      }
      throw new Error('Unexpected database access');
    });
    const subjectPool = { connect: async () => ({ query, release() {} }) } as PostgresSubjectPoolV1;
    const commerceConnect = vi.fn(() => { throw new Error('Merchant authority must stay isolated'); });
    const verificationAdapter = { verify: vi.fn(() => { throw new Error('No provider request expected'); }) };
    const runtime = createApprovedSajuSandboxHttpRuntimeV1({
      origin: localOrigin,
      channel: {
        environment: 'sandbox', storeId: 'store-' + subjectId,
        channelKey: 'channel-key-' + subjectId,
      },
      pool: subjectPool,
      commercePool: { connect: commerceConnect } as unknown as PostgresSubjectPoolV1,
      identityEvidenceVerifier: {
        async verifyRequestIdentity(request) {
          return request.headers.get('authorization') === 'Bearer owner'
            ? { kind: 'member', verifiedAuthUserId: subjectId } : null;
        },
      },
      verificationAdapter: verificationAdapter as never,
    });
    const host = createApprovedSajuSandboxLoopbackHostV1({ origin: localOrigin, staticRoot: root, runtime });
    await host.start();
    try {
      expect((await fetch(localOrigin + ROUTES.access)).status).toBe(404);
      expect(query).not.toHaveBeenCalled();
      const admitted = await fetch(localOrigin + ROUTES.access, { headers: { authorization: 'Bearer owner' } });
      expect(admitted.status, JSON.stringify(query.mock.calls)).toBe(200);
      expect(await admitted.json()).toMatchObject({ ok: true, data: { environment: 'sandbox' } });
      expect(commerceConnect).not.toHaveBeenCalled();
      expect(verificationAdapter.verify).not.toHaveBeenCalled();
      expect((await fetch(localOrigin + ROUTES.order, {
        method: 'POST', body: '{}',
        headers: { origin: 'https://attacker.example', authorization: 'Bearer owner' },
      })).status).toBe(403);
    } finally {
      await host.close();
    }
  });
});
