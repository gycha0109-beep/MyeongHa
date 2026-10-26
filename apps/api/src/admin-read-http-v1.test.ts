import { describe, expect, it } from 'vitest';
import { createAdminOwnerAuthV1 } from './admin-auth-v1.js';
import { createAdminReadHttpHandlerV1, parseAdminReadFiltersV1 } from './admin-read-http-v1.js';
import type { AdminAuditEventV1 } from './admin-read-http-v1.js';
import type { AdminReadPortV1 } from './admin-read-contract-v1.js';

const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const STRANGER = '123e4567-e89b-42d3-a456-426614174001';
const subject = '123e4567-e89b-42d3-a456-426614174002';

function harness(options: {
  readonly principal?: 'owner' | 'stranger' | 'guest' | 'missing';
  readonly throwAudit?: boolean;
  readonly throwRead?: boolean;
} = {}) {
  const auditEvents: AdminAuditEventV1[] = [];
  let readsCount = 0;
  const auth = createAdminOwnerAuthV1({
    ownerAuthUserId: OWNER,
    identityVerifier: {
      async verifyRequestIdentity() {
        switch (options.principal ?? 'owner') {
          case 'owner': return { kind: 'member', verifiedAuthUserId: OWNER };
          case 'stranger': return { kind: 'member', verifiedAuthUserId: STRANGER };
          case 'guest': return { kind: 'guest', verifiedGuestTokenHash: 'synthetic' };
          case 'missing': return null;
        }
      },
    },
  });
  const reads: AdminReadPortV1 = {
    async read() {
      readsCount++;
      if (options.throwRead) throw new Error('DB unavailable: private');
      return { rows: [{ subjectId: subject, status: 'active', email: 'not-allowed@example.com', privateNote: 'never leak' }], nextCursor: null };
    },
  };
  const handler = createAdminReadHttpHandlerV1({
    auth,
    reads,
    audit: {
      async append(e) {
        if (options.throwAudit) throw new Error('audit failed');
        auditEvents.push(e);
      },
    },
    requestId: () => OWNER,
    now: () => new Date('2026-10-26T10:00:00Z'),
  });
  return {
    call(path = '/api/admin/users', method = 'GET') {
      return handler(new Request('https://admin.invalid' + path, { method }));
    },
    get readCount() { return readsCount; },
    auditEvents,
  };
}

describe('admin owner-only reads', () => {
  it.each(['stranger', 'guest', 'missing'] as const)('rejects %s before any read', async principal => {
    const h = harness({ principal });
    const res = await h.call();
    expect(res.status).toBe(403);
    expect(h.readCount).toBe(0);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(h.auditEvents[0]?.outcome).toBe('denied');
  });

  it('omits email and every unlisted sensitive field', async () => {
    const h = harness();
    const res = await h.call();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/not-allowed|privateNote|never leak|email/);
    expect(JSON.parse(text).rows[0]).toEqual({ subjectId: subject, status: 'active' });
    expect(h.auditEvents[0]?.actorAuthUserId).toBe(OWNER);
  });

  it('refuses unknown paths, unsafe filters, and writes before DB access', async () => {
    const h = harness();
    for (const path of [
      '/api/admin/users/' + STRANGER + '/edit',
      '/api/admin/users?limit=500',
      '/api/admin/users?cursor=%27OR%201%3D1',
      '/api/admin/users?from=2026-01-01&to=2026-10-26',
      '/api/admin/users?subjectId=anyone',
      '/api/admin/users?limit=2&limit=3',
      '/api/admin/users?secret=true',
    ]) {
      expect((await h.call(path)).status).toBe(400);
    }
    expect((await h.call('/api/admin/users', 'POST')).status).toBe(405);
    expect(h.readCount).toBe(0);
  });

  it('fails closed when audit or data is unavailable', async () => {
    const noAudit = harness({ throwAudit: true });
    expect((await noAudit.call()).status).toBe(503);
    const noDb = harness({ throwRead: true });
    const res = await noDb.call();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('private');
  });

  it('validates single resource lookup and date bounds', () => {
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/users/' + subject)).kind).toBe('user-detail');
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/ai-costs?limit=50&from=2026-10-01&to=2026-10-26')).limit).toBe(50);
  });

  it('does not accept undefined or non-UUID owner allowlist', () => {
    expect(() => createAdminOwnerAuthV1({
      identityVerifier: { verifyRequestIdentity: () => null },
      ownerAuthUserId: 'owner@example.com',
    })).toThrow();
  });
});
