import { describe, expect, it } from 'vitest';
import { fetchAdminReadV1, signInForAdminSessionV1, verifyAdminOwnerSessionV1, fetchAdminIssuesCsvV1, adminTokenExpiresAtV1, AdminAccessDeniedErrorV1, AdminSignInFailureV1, AdminReadUnavailableErrorV1, shouldClearAdminSessionAfterVerificationFailureV1, ADMIN_SESSION_MARKER_V1 } from './admin-client.js';
describe('admin browser API client', () => {
  it('extracts only a bounded expiry for UI revocation, without granting access from claims', () => {
    const token = (claims: unknown) => 'header.' + btoa(JSON.stringify(claims)) + '.signature';
    expect(adminTokenExpiresAtV1(token({ exp: 1_800_000_000, role: 'owner' }))).toBe(1_800_000_000_000);
    for (const claims of [{ role: 'owner' }, { exp: '1800000000' }, { exp: -1 }, { exp: 1.5 }, { exp: Number.MAX_SAFE_INTEGER }]) {
      expect(adminTokenExpiresAtV1(token(claims))).toBeNull();
    }
    expect(adminTokenExpiresAtV1('bad')).toBeNull();
  });
  it('downloads only audited issues CSV and rejects plain JSON substitutes', async () => {
    const csv = (async () => new Response('issueId,category\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })) as typeof fetch;
    expect(await fetchAdminIssuesCsvV1(ADMIN_SESSION_MARKER_V1, new URLSearchParams({ limit: '50' }), csv)).toContain('issueId');
    const spoof = (async () => Response.json({ data: 'not CSV' })) as typeof fetch;
    await expect(fetchAdminIssuesCsvV1(ADMIN_SESSION_MARKER_V1, new URLSearchParams(), spoof)).rejects.toThrow();
    await expect(fetchAdminIssuesCsvV1(ADMIN_SESSION_MARKER_V1, new URLSearchParams({ secret: 'true' }), csv)).rejects.toThrow();
  });
  it('never grants Admin screen access from a regular Member token', async () => {
    const denied = (async () => Response.json({ error: 'ADMIN_FORBIDDEN' }, { status: 403 })) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, denied)).rejects.toThrow('권한');
    const approved = (async () => Response.json({ authorized: true })) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, approved)).resolves.toBeUndefined();
    const spoof = (async () => Response.json({ ok: true })) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, spoof)).rejects.toThrow('권한');
  });
  it('retries only transient session errors while still requiring server Owner authorization', async () => {
    let calls = 0;
    const recover = (async () => {
      calls++;
      return calls === 1 ? Response.json({ error: 'ADMIN_AUTH_UNAVAILABLE' }, { status: 503 })
        : Response.json({ authorized: true });
    }) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, recover)).resolves.toBeUndefined();
    expect(calls).toBe(2);
    calls = 0;
    const denied = (async () => { calls++; return Response.json({ error: 'ADMIN_FORBIDDEN' }, { status: 403 }); }) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, denied)).rejects.toBeInstanceOf(AdminAccessDeniedErrorV1);
    expect(calls).toBe(1);
    calls = 0;
    const throttled = (async () => { calls++; return Response.json({ error: 'ADMIN_RATE_LIMITED' }, { status: 429 }); }) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, throttled)).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(1);
  });
  it('distinguishes session verification 429, 503 and untrusted server bodies', async () => {
    for (const [status, code] of [[429, 'ADMIN_RATE_LIMITED'], [503, 'ADMIN_AUTH_UNAVAILABLE'], [503, 'ADMIN_HOSTED_UNAVAILABLE']] as const) {
      const fake = (async () => Response.json({ error: code, token: 'not-for-display' }, { status })) as typeof fetch;
      await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, fake)).rejects.toMatchObject({
        name: 'AdminReadUnavailableErrorV1', status, reason: code,
      });
    }
    const unsafe = (async () => Response.json({ error: 'token:unsafe' }, { status: 502 })) as typeof fetch;
    await expect(verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1, unsafe)).rejects.toMatchObject({
      status: 502, reason: null,
    });
  });
  it('uses the existing Member auth endpoint but does not trust it as admin access', async () => {
    let path: RequestInfo | URL | undefined;
    const fake = (async (url: RequestInfo | URL) => {
      path = url;
      return Response.json({ ok: true, data: { status: 'authenticated', session: { mode: 'cookie' } } });
    }) as typeof fetch;
    expect(await signInForAdminSessionV1('owner@example.com', 'test-password', fake)).toBe(ADMIN_SESSION_MARKER_V1);
    expect(path).toBe('/api/auth/sign-in');
  });
  it('distinguishes Member login errors without exposing remote response bodies',async()=>{
    for(const [status,reason] of [[401,'invalid-credentials'],[429,'rate-limited'],[503,'upstream-unavailable']] as const){
      const fake=(async()=>Response.json({error:'secret-must-not-surface'},{status})) as typeof fetch;
      await expect(signInForAdminSessionV1('owner@example.test','not-a-password',fake)).rejects.toMatchObject({
        name:'AdminSignInFailureV1',reason,
      });
    }
  });
  it('retains the memory-only Owner session after transient verification failure',()=>{
    expect(shouldClearAdminSessionAfterVerificationFailureV1(new AdminAccessDeniedErrorV1())).toBe(true);
    expect(shouldClearAdminSessionAfterVerificationFailureV1(new Error('temporary 503'))).toBe(false);
    expect(shouldClearAdminSessionAfterVerificationFailureV1(new AdminReadUnavailableErrorV1(503,null))).toBe(false);
  });
  it('shows only HTTP status and allowlisted error codes for failed reads',async()=>{
    const unavailable=(async()=>Response.json({error:'ADMIN_HOSTED_UNAVAILABLE',secret:'must-not-display'},{status:503})) as typeof fetch;
    await expect(fetchAdminReadV1('/api/admin/users?limit=20',ADMIN_SESSION_MARKER_V1,unavailable)).rejects.toMatchObject({name:'AdminReadUnavailableErrorV1',status:503,reason:'ADMIN_HOSTED_UNAVAILABLE'});
    const unsafe=(async()=>Response.json({error:'password=secret'},{status:502})) as typeof fetch;
    await expect(fetchAdminReadV1('/api/admin/users',ADMIN_SESSION_MARKER_V1,unsafe)).rejects.toMatchObject({status:502,reason:null});
    const limited=(async()=>Response.json({error:'ADMIN_RATE_LIMITED'},{status:429})) as typeof fetch;
    await expect(fetchAdminReadV1('/api/admin/users',ADMIN_SESSION_MARKER_V1,limited)).rejects.toThrow('HTTP 429');
  });
  it('treats 403 as denied, never as a successful empty result', async () => {
    const fake = (async () => Response.json({ error: 'ADMIN_FORBIDDEN' }, { status: 403 })) as typeof fetch;
    await expect(fetchAdminReadV1('/api/admin/users', ADMIN_SESSION_MARKER_V1, fake)).rejects.toBeInstanceOf(AdminAccessDeniedErrorV1);
  });
  it('allows safe lifecycle and incident filter paths but rejects path traversal', async () => {
    const requests: string[] = [];
    const fake = (async (path: RequestInfo | URL) => {
      requests.push(String(path));
      return Response.json({ kind: 'users', rows: [], nextCursor: null });
    }) as typeof fetch;
    for (const path of [
      '/api/admin/users?subjectStatus=deletion_pending',
      '/api/admin/issues?status=dead_lettered&category=reading.failed',
      '/api/admin/readings?readingStatus=failed&limit=20',
    ]) {
      await expect(fetchAdminReadV1(path, ADMIN_SESSION_MARKER_V1, fake)).resolves.toBeDefined();
    }
    expect(requests).toHaveLength(3);
    for (const path of [
      '//evil.test/api/admin/users',
      '/api/admin/users#fragment',
      '/api/admin/../../../auth/secret',
      '/api/admin/users?subjectStatus=active&password=hello world',
    ]) {
      await expect(fetchAdminReadV1(path, ADMIN_SESSION_MARKER_V1, fake)).rejects.toThrow();
    }
    expect(requests).toHaveLength(3);
  });
  it('accepts only primitive projected rows', async () => {
    const fake = (async () => Response.json({
      kind: 'users', rows: [{ subjectId: 'safe', kind: 'member' }], nextCursor: null,
    })) as typeof fetch;
    expect((await fetchAdminReadV1('/api/admin/users', ADMIN_SESSION_MARKER_V1, fake)).rows).toHaveLength(1);
  });
});
