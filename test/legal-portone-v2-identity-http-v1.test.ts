import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  handlePortOneV2IdentityIssueRequestV1,
  handlePortOneV2IdentityCompleteRequestV1,
  PORTONE_V2_IDENTITY_HTTP_BINDINGS_V1,
} from '../apps/api/src/portone-v2-identity-http-v1.js';
import type {
  PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const subjectId = '92000000-0000-0000-0000-000000000001';
const identityVerificationId = 'iv_' + 'a'.repeat(32);
function post(route: string, body: unknown) {
  return new Request('https://myeongha.internal' + route, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify(body),
  });
}
function context(activation: boolean, readPending = true, canConsume = true) {
  const sql: string[] = [];
  const query: PostgresSubjectConnectionV1['query'] = async <Row = Record<string, unknown>>(
    text: string,
  ) => {
    sql.push(text);
    let rows: readonly Record<string, unknown>[] = [];
    if (text.includes('begin_member_subject_context_v1')) {
      rows = [{ subjectId, subjectKind: 'member' }];
    } else if (text.includes('cmd_issue_legal_portone_identity_v1')) {
      rows = [{ identityVerificationId, expiresAt: '2026-10-24T01:00:00Z' }];
    } else if (text.includes('qry_pending_legal_portone_identity_v1')) {
      rows = readPending ? [{ subjectId, identityVerificationId, status: 'pending' }] : [];
    } else if (text.includes('cmd_consume_legal_portone_identity_v1')) {
      rows = [{ consumed: canConsume }];
    }
    return { rows: rows as readonly Row[] };
  };
  const pool: PostgresSubjectPoolV1 = {
    connect: async () => ({ query, release: () => undefined }),
  };
  const lookup = {
    verify: vi.fn(async () => ({
      kind: 'verified' as const, subjectId, identityVerificationId, ageBand: 'adult' as const,
    })),
  };
  const common = {
    requestId: 'req-identity',
    serverTime: '2026-10-24T00:00:00Z',
    identityEvidenceVerifier: {
      verifyRequestIdentity: async () => ({
        kind: 'member' as const,
        verifiedAuthUserId: '91000000-0000-0000-0000-000000000001',
      }),
    },
    pool, lookup,
    ...(activation ? { testOnlyActivation: true as const } : {}),
  };
  return { sql, lookup, common };
}

describe('LEGAL PortOne V2 identity HTTP source boundary', () => {
  it('registers both Vercel entrypoints without provider secrets or activation', () => {
    for (const [name, handler] of [
      ['attempts', 'handlePortOneV2IdentityIssueRequestV1'],
      ['complete', 'handlePortOneV2IdentityCompleteRequestV1'],
    ] as const) {
      const source = readFileSync(new URL(`../api/identity-verifications/${name}.ts`, import.meta.url), 'utf8');
      expect(source).toContain(handler);
      expect(source).not.toContain('testOnlyActivation');
      expect(source).not.toContain('PORTONE_API_SECRET');
    }
  });

  it('registers inert routes, stays OFF, and makes zero DB/provider calls', async () => {
    expect(PORTONE_V2_IDENTITY_HTTP_BINDINGS_V1).toMatchObject({
      routeRegistered: true, active: false,
    });
    const t = context(false);
    const issue = await handlePortOneV2IdentityIssueRequestV1({
      ...t.common, request: post('/api/identity-verifications/attempts', {}),
    });
    const complete = await handlePortOneV2IdentityCompleteRequestV1({
      ...t.common, request: post('/api/identity-verifications/complete', { identityVerificationId }),
    });
    expect([issue.status, complete.status]).toEqual([503, 503]);
    expect(t.sql).toEqual([]);
    expect(t.lookup.verify).not.toHaveBeenCalled();
  });

  it('issues server-owned identity ID without accepting browser-selected identity', async () => {
    const t = context(true);
    const response = await handlePortOneV2IdentityIssueRequestV1({
      ...t.common, request: post('/api/identity-verifications/attempts', {}),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      data: { identityVerificationId },
    });
    expect(t.sql.filter(x => x.includes('cmd_issue_legal_portone_identity_v1'))).toHaveLength(1);
    const invalid = await handlePortOneV2IdentityIssueRequestV1({
      ...t.common, request: post('/api/identity-verifications/attempts', { subjectId }),
    });
    expect(invalid.status).toBe(400);
    expect(t.lookup.verify).not.toHaveBeenCalled();
  });

  it('requires pending owned attempt and atomic consume to finalize only age band', async () => {
    const t = context(true);
    const response = await handlePortOneV2IdentityCompleteRequestV1({
      ...t.common, request: post('/api/identity-verifications/complete', { identityVerificationId }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { ageBand: 'adult' } });
    expect(t.lookup.verify).toHaveBeenCalledTimes(1);
    expect(t.sql.filter(x => x.includes('cmd_consume_legal_portone_identity_v1'))).toHaveLength(1);
    const missing = context(true, false);
    const denied = await handlePortOneV2IdentityCompleteRequestV1({
      ...missing.common, request: post('/api/identity-verifications/complete', { identityVerificationId }),
    });
    expect(denied.status).toBe(403);
    expect(missing.lookup.verify).not.toHaveBeenCalled();
    const used = context(true, true, false);
    const replay = await handlePortOneV2IdentityCompleteRequestV1({
      ...used.common, request: post('/api/identity-verifications/complete', { identityVerificationId }),
    });
    expect(replay.status).toBe(403);
  });

  it('never performs lookup for an invalid browser-supplied identity ID', async () => {
    const t = context(true);
    const response = await handlePortOneV2IdentityCompleteRequestV1({
      ...t.common, request: post('/api/identity-verifications/complete', {
        identityVerificationId: '../bad-id', subjectId,
      }),
    });
    expect(response.status).toBe(400);
    expect(t.sql).toEqual([]);
    expect(t.lookup.verify).not.toHaveBeenCalled();
  });
});
