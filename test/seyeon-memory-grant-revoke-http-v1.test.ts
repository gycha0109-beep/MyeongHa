import { describe, expect, it } from 'vitest';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  handleSeyeonMemoryGrantRevokeRequestV1,
} from '../apps/api/src/seyeon-memory-grant-revoke-http-v1.js';

const MEMORY_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_USER = '11111111-1111-4111-8111-111111111111';
const PATH = `https://myeongha.invalid/api/memories/${MEMORY_ID}/grants/seyeon/revoke`;
const MEMBER = Object.freeze({ kind: 'member' as const, verifiedAuthUserId: AUTH_USER });
const pool: PostgresSubjectPoolV1 = {
  connect() { throw Error('DB should never open without admission'); },
};

function requestFor(
  options: Readonly<{ method?: string; url?: string; body?: string }> = {},
): Request {
  return new Request(options.url ?? PATH, {
    method: options.method ?? 'POST',
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

function call(
  request: Request,
  evidence: VerifiedSubjectIdentityEvidenceV1 | null = MEMBER,
  overrides: Partial<Parameters<typeof handleSeyeonMemoryGrantRevokeRequestV1>[0]> = {},
): Promise<Response> {
  return handleSeyeonMemoryGrantRevokeRequestV1({
    request,
    requestId: 'r16-safe',
    serverTime: '2026-10-18T13:00:00.000Z',
    identityEvidenceVerifier: { verifyRequestIdentity: async () => evidence },
    pool,
    ...overrides,
  });
}

describe('R16 Se-yeon original Memory Grant revoke HTTP candidate — NOT mounted', () => {
  it('rejects wrong route, method, client-provided body, missing Member and guest without DB writes', async () => {
    expect((await call(requestFor({ url: PATH + '?subjectId=forged' }))).status).toBe(404);
    const wrongMethod = await call(requestFor({ method: 'GET' }));
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('POST');
    expect((await call(requestFor({ body: JSON.stringify({
      subjectId: AUTH_USER, characterId: 'forged', grantId: MEMORY_ID,
    }) }))).status).toBe(400);
    expect((await call(requestFor(), null)).status).toBe(401);
    expect((await call(requestFor(), {
      kind: 'guest', verifiedGuestTokenHash: 'offline-test-only',
    })).status).toBe(403);
  });

  it('accepts zero-byte Worker POST streams, then still requires verified Member and DB admission', async () => {
    const empty = requestFor({ body: '' });
    expect(empty.body).not.toBeNull();
    expect((await call(empty, null)).status).toBe(401);

    let revokes = 0;
    const approved = await call(requestFor({ body: '' }), MEMBER, {
      approvedDbWriteAdmission: () => true,
      revoke: async () => {
        revokes += 1;
        return { status: 'pending' as const, memoryItemId: MEMORY_ID,
          characterId: 'seyeon' as const, newUseBlocked: true as const };
      },
    });
    expect(approved.status).toBe(202);
    expect((await approved.json()).data).toMatchObject({
      status: 'pending', newUseBlocked: true,
    });
    expect(revokes).toBe(1);
  });

  it('rejects nonempty or locked streams before Member authentication and DB use', async () => {
    let verifications = 0;
    let revokes = 0;
    const overrides = {
      identityEvidenceVerifier: {
        verifyRequestIdentity: async () => {
          verifications += 1;
          return MEMBER;
        },
      },
      approvedDbWriteAdmission: () => true,
      revoke: async () => {
        revokes += 1;
        throw Error('Body must be rejected before revocation');
      },
    };
    expect((await call(requestFor({ body: '{}' }), MEMBER, overrides)).status).toBe(400);
    const request = requestFor({ body: '' });
    const lock = request.body!.getReader();
    try {
      expect((await call(request, MEMBER, overrides)).status).toBe(400);
    } finally {
      lock.releaseLock();
    }
    expect(verifications).toBe(0);
    expect(revokes).toBe(0);
  });

  it('defaults to 503/no-store: missing, false and failing DB-write admission never invoke revoker', async () => {
    let calls = 0;
    const revoke = async () => {
      calls += 1;
      throw Error('must never be called');
    };
    for (const approvedDbWriteAdmission of [
      undefined,
      async () => false,
      async () => { throw Error('catalog unavailable'); },
    ]) {
      const result = await call(requestFor(), MEMBER, {
        ...(approvedDbWriteAdmission === undefined ? {} : { approvedDbWriteAdmission }),
        revoke,
      });
      const text = await result.text();
      expect(result.status).toBe(503);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(text).toContain('SEYEON_MEMORY_GRANT_REVOKE_AUTHORITY_UNAVAILABLE');
      expect(text).not.toContain('committed');
    }
    expect(calls).toBe(0);
  });

  it('in injected approved test mode, responds only after commit-returning R15 port succeeds', async () => {
    let called = false;
    const response = await call(requestFor(), MEMBER, {
      approvedDbWriteAdmission: () => true,
      revoke: async args => {
        called = true;
        expect(args.verifiedEvidence).toEqual(MEMBER);
        expect(args.memoryItemId).toBe(MEMORY_ID);
        return {
          status: 'committed',
          memoryItemId: MEMORY_ID,
          characterId: 'seyeon',
          revokedGrantCount: 1,
          replayed: false,
        };
      },
    });
    expect(called).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        status: 'committed', characterId: 'seyeon',
        memoryItemId: MEMORY_ID, revokedGrantCount: 1,
      },
    });
  });

  it('does not falsely ACK ambiguous COMMIT or malformed/mismatched DB response', async () => {
    const ambiguous = await call(requestFor(), MEMBER, {
      approvedDbWriteAdmission: () => true,
      revoke: async () => { throw Error('COMMIT outcome unknown'); },
    });
    expect(ambiguous.status).toBe(503);
    expect(await ambiguous.text()).not.toContain('COMMIT outcome unknown');

    const invalid = await call(requestFor(), MEMBER, {
      approvedDbWriteAdmission: () => true,
      revoke: async () => ({
        status: 'committed', memoryItemId: AUTH_USER,
        characterId: 'seyeon', revokedGrantCount: 1, replayed: false,
      }),
    });
    expect(invalid.status).toBe(503);
    expect(await invalid.text()).not.toContain('committed');
  });
});
