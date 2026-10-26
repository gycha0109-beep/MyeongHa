import { describe, expect, it } from 'vitest';
import { fetchAdminReadV1, signInForAdminSessionV1, verifyAdminOwnerSessionV1 } from './admin-client.js';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
describe('admin browser API client', () => {
  it('never grants Admin screen access from a regular Member token', async () => {
    const denied = (async () => Response.json({ error: 'ADMIN_FORBIDDEN' }, { status: 403 })) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(JWT, denied)).rejects.toThrow('권한');
    const approved = (async () => Response.json({ authorized: true })) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(JWT, approved)).resolves.toBeUndefined();
    const spoof = (async () => Response.json({ ok: true })) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(JWT, spoof)).rejects.toThrow('권한');
  });
  it('uses the existing Member auth endpoint but does not trust it as admin access', async () => {
    let path: RequestInfo | URL | undefined;
    const fake = (async (url: RequestInfo | URL) => {
      path = url;
      return Response.json({ ok: true, data: { status: 'authenticated', session: { accessToken: JWT, refreshToken: 'never-store' } } });
    }) as typeof fetch;
    expect(await signInForAdminSessionV1('owner@example.com', 'test-password', fake)).toBe(JWT);
    expect(path).toBe('/api/auth/sign-in');
  });
  it('treats 403 as denied, never as a successful empty result', async () => {
    const fake = (async () => Response.json({ error: 'ADMIN_FORBIDDEN' }, { status: 403 })) as typeof fetch;
    await expect(fetchAdminReadV1('/api/admin/users', JWT, fake)).rejects.toThrow('권한');
  });
  it('accepts only primitive projected rows', async () => {
    const fake = (async () => Response.json({
      kind: 'users', rows: [{ subjectId: 'safe', kind: 'member' }], nextCursor: null,
    })) as typeof fetch;
    expect((await fetchAdminReadV1('/api/admin/users', JWT, fake)).rows).toHaveLength(1);
  });
});
