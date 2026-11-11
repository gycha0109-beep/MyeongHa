import { describe, expect, it, vi } from 'vitest';
import { APPROVED_SAJU_SANDBOX_ROUTES_V1 as ROUTES } from '../../../packages/contracts/src/approved-saju-sandbox-routes.js';
import { createApprovedSajuSandboxHttpRuntimeV1 } from './approved-saju-sandbox-http-runtime-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const origin = 'http://127.0.0.1:4173';
const id = '11111111-1111-4111-8111-111111111111';
const channel = { environment: 'sandbox' as const, storeId: 'store-' + id, channelKey: 'channel-key-' + id };

function runtime(owner = true) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('begin_member_subject_context_v1')) return { rows: [{ subjectId: id, subjectKind: 'member' }] };
    if (sql.includes('qry_myeongha_owner_admin_access_v1')) {
      return { rows: [{ isOwnerAdmin: owner, chatCreditExempt: false, sandboxCheckoutAllowed: owner }] };
    }
    return { rows: [] };
  });
  const pool = { async connect() { return { query, release() {} }; } } as PostgresSubjectPoolV1;
  const commercePool = { connect: vi.fn(() => { throw new Error('Receipt pool should remain unused'); }) };
  const verificationAdapter = { verify: vi.fn(() => { throw new Error('Provider should remain unused'); }) };
  const verifyRequestIdentity = vi.fn(async (request: Request) => request.headers.get('Authorization') === 'Bearer fixture'
    ? { kind: 'member' as const, verifiedAuthUserId: id } : null);
  return {
    query, verifyRequestIdentity, commercePool, verificationAdapter,
    server: createApprovedSajuSandboxHttpRuntimeV1({
      origin, channel, pool, commercePool, verificationAdapter, identityEvidenceVerifier: { verifyRequestIdentity },
    }),
  };
}

describe('approved Saju sandbox HTTP runtime', () => {
  it('only discloses the test channel to the verified owner', async () => {
    for (const owner of [false, true]) {
      const fixture = runtime(owner);
      const response = await fixture.server.handleRequest(new Request(origin + ROUTES.access, {
        headers: { Authorization: 'Bearer fixture' },
      }));
      expect(response?.status).toBe(owner ? 200 : 404);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(await response?.json()).toEqual(owner ? { ok: true, data: channel } : { ok: false });
      expect(fixture.commercePool.connect).not.toHaveBeenCalled();
    }
  });

  it('rejects cross-origin, unauthenticated, and oversized verification before provider or receipt access', async () => {
    const fixture = runtime();
    const post = (headers: Record<string, string>, body = '{}') =>
      fixture.server.handleRequest(new Request(origin + ROUTES.verify, {
        method: 'POST', body, headers: { 'Content-Type': 'application/json', ...headers },
      }));
    expect((await post({ Origin: 'https://different.example' }))?.status).toBe(403);
    expect(fixture.verifyRequestIdentity).not.toHaveBeenCalled();
    expect((await post({ Origin: origin }))?.status).toBe(404);
    expect(fixture.query).not.toHaveBeenCalled();
    expect((await post({ Origin: origin, Authorization: 'Bearer fixture' }, 'x'.repeat(1025)))?.status).toBe(400);
    expect(fixture.verificationAdapter.verify).not.toHaveBeenCalled();
    expect(fixture.commercePool.connect).not.toHaveBeenCalled();
  });
});
