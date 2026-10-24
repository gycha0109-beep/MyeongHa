import { describe, expect, it, vi } from 'vitest';
import { createApprovedPortOnePreenrollmentMemberBindingPortV1 } from '../apps/api/src/portone-v2-approved-member-binding-v1.js';
import {
  extractPortOnePreenrollmentCookieV1,
  fingerprintPortOnePreenrollmentBindingV1,
  issuePortOnePreenrollmentHttpOnlyNonceV1,
  serializePortOnePreenrollmentCookieV1,
} from '../apps/api/src/portone-v2-preenrollment-age-authority-v1.js';
import {
  PORTONE_PREENROLLMENT_HTTP_RELEASE_V1,
  resolveProductionPortOnePreenrollmentModeV1,
  createProductionPortOnePreenrollmentHttpRuntimeV1,
} from '../apps/api/src/portone-v2-preenrollment-http-runtime-v1.js';

const nonce = 'A'.repeat(43);
const id = 'iv' + 'b'.repeat(32);
const secret = 'test-preenrollment-possession-hmac-secret-at-least-32-chars';
const g = PORTONE_PREENROLLMENT_HTTP_RELEASE_V1;
const approved = {
  MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'ENFORCE',
  MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'APPROVED_AND_APPLIED',
  MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'APPROVED',
  MYEONGHA_PORTONE_IDENTITY_HTTP_MODE: 'ENFORCE',
  MYEONGHA_PORTONE_IDENTITY_PROVIDER_CONTRACT_STATE: 'APPROVED',
  MYEONGHA_PORTONE_IDENTITY_STORE_ID: 'store-0123456789',
  MYEONGHA_PORTONE_IDENTITY_CHANNEL_KEY: 'channel-key-0123456789',
  MYEONGHA_PORTONE_IDENTITY_API_SECRET: 'test-only-portone-secret-material-never-live',
  [g.modeSetting]: 'ENFORCE',
  [g.migrationSetting]: 'APPROVED_AND_APPLIED',
  [g.privacySetting]: 'APPROVED',
  [g.bindingKeySetting]: secret,
};
const serverTime = '2026-10-24T01:00:00Z';
const base = 'https://myeongha.internal';
const issueRequest = () => new Request(base + g.issueRoute, {
  method: 'POST',
  headers: { Origin: g.origin, 'Content-Type': 'application/json' },
  body: '{}',
});
function fakeDb() {
  const sql: string[] = [];
  const args: Array<readonly unknown[] | undefined> = [];
  const connect = vi.fn(async () => ({
    query: async <Row = Record<string, unknown>>(query: string, values?: readonly unknown[]) => {
      sql.push(query);
      args.push(values);
      let rows: readonly Record<string, unknown>[] = [];
      if (query.includes('cmd_issue_legal_portone_preenrollment_v1')) {
        rows = [{ identityVerificationId: id, expiresAt: '2030-01-01T00:00:00Z' }];
      } else if (query.includes('qry_pending_legal_portone_preenrollment_v1')) {
        rows = [{ accepted: true }];
      } else if (query.includes('cmd_verify_legal_portone_preenrollment_v1')) {
        rows = [{ accepted: true }];
      }
      return { rows: rows as readonly Row[] };
    },
    release: vi.fn(),
  }));
  return { sql, args, connect };
}

describe('L2 A1 preenrollment PortOne identity admission', () => {
  it('keeps absent or partial operational approvals OFF, with zero provider calls', () => {
    expect(resolveProductionPortOnePreenrollmentModeV1({})).toBe('off');
    expect(resolveProductionPortOnePreenrollmentModeV1({
      ...approved, [g.modeSetting]: 'OFF',
    })).toBe('off');
    for (const failure of [
      { [g.privacySetting]: 'PENDING' },
      { [g.migrationSetting]: 'PROPOSED' },
      { [g.bindingKeySetting]: 'short' },
      { MYEONGHA_PORTONE_IDENTITY_PROVIDER_CONTRACT_STATE: 'PENDING' },
      { MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'OFF' },
    ]) {
      expect(() => resolveProductionPortOnePreenrollmentModeV1({
        ...approved, ...failure,
      })).toThrow();
    }
  });

  it('does not compose a Member binding for a cross-origin request', () => {
    const pool = { connect: vi.fn() };
    const bad = createApprovedPortOnePreenrollmentMemberBindingPortV1({
      env: approved, pool,
      request: new Request('https://myeongha.vercel.app/api/auth/sign-up', {
        method: 'POST', headers: {
          Origin: 'https://attacker.invalid',
          Cookie: serializePortOnePreenrollmentCookieV1(nonce),
        },
      }),
    });
    expect(bad).toBeNull();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('issues 256-bit nonce with HttpOnly/Secure/SameSite Strict and HMAC separation', () => {
    const raw = issuePortOnePreenrollmentHttpOnlyNonceV1();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(fingerprintPortOnePreenrollmentBindingV1({ rawNonce: nonce, secret }))
      .toMatch(/^[a-f0-9]{64}$/u);
    const cookie = serializePortOnePreenrollmentCookieV1(nonce);
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Strict');
    expect(extractPortOnePreenrollmentCookieV1(
      new Request(base, { headers: { Cookie: cookie } }),
    )).toBe(nonce);
    expect(extractPortOnePreenrollmentCookieV1(new Request(base, {
      headers: { Cookie: nonce + '; ' + cookie + '; ' + cookie },
    }))).toBeNull();
    expect(() => fingerprintPortOnePreenrollmentBindingV1({
      rawNonce: nonce, secret: 'short',
    })).toThrow();
  });

  it('issues with server-owned browser channel only after server-approved mode', async () => {
    const db = fakeDb();
    const lookup = { verify: vi.fn() };
    const rt = createProductionPortOnePreenrollmentHttpRuntimeV1({
      env: approved, pool: { connect: db.connect },
      providerLookup: lookup, nonceFactory: () => nonce,
    });
    const response = await rt.handleRequest({
      request: issueRequest(), action: 'issue', requestId: 'req', serverTime,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
    expect(await response.json()).toMatchObject({
      data: {
        identityVerificationId: id, storeId: approved.MYEONGHA_PORTONE_IDENTITY_STORE_ID,
        channelKey: approved.MYEONGHA_PORTONE_IDENTITY_CHANNEL_KEY,
      },
    });
    expect(lookup.verify).not.toHaveBeenCalled();
    expect(db.sql).toContain('SET LOCAL ROLE myeongha_api_executor');
    expect(db.sql.some(x => x.includes('cmd_issue_legal_portone_preenrollment_v1'))).toBe(true);
    const invalid = await rt.handleRequest({
      request: new Request(base + g.issueRoute, {
        method: 'POST', headers: { Origin: 'https://attacker.example' }, body: '{}',
      }),
      action: 'issue', requestId: 'req', serverTime,
    });
    expect(invalid.status).toBe(403);
    expect(db.connect).toHaveBeenCalledTimes(1);
  });

  it('requires cookie ownership and server VERIFIED before recording age band', async () => {
    const db = fakeDb();
    const lookup = { verify: vi.fn(async (input: { subjectId: string; identityVerificationId: string }) =>
      ({ kind: 'verified' as const, subjectId: input.subjectId,
        identityVerificationId: input.identityVerificationId, ageBand: 'adult' as const })) };
    const rt = createProductionPortOnePreenrollmentHttpRuntimeV1({
      env: approved, pool: { connect: db.connect },
      providerLookup: lookup, nonceFactory: () => nonce,
    });
    const complete = (cookie?: string) => new Request(base + g.completeRoute, {
      method: 'POST', headers: {
        Origin: g.origin, 'Content-Type': 'application/json',
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      }, body: JSON.stringify({ identityVerificationId: id }),
    });
    const without = await rt.handleRequest({
      request: complete(), action: 'complete', requestId: 'req', serverTime,
    });
    expect(without.status).toBe(403);
    expect(db.connect).not.toHaveBeenCalled();
    const response = await rt.handleRequest({
      request: complete(serializePortOnePreenrollmentCookieV1(nonce)),
      action: 'complete', requestId: 'req', serverTime,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { ageBand: 'adult' } });
    expect(lookup.verify).toHaveBeenCalledOnce();
    expect(db.sql.some(x => x.includes('cmd_verify_legal_portone_preenrollment_v1'))).toBe(true);
  });
});
