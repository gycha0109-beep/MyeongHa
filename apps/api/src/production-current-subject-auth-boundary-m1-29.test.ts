import { describe, expect, it, vi } from 'vitest';
import {
  createProductionCurrentSubjectProfileRuntimeV1,
} from './production-current-subject-profile-runtime.js';
import {
  fingerprintProductionGuestBearerTokenV1,
} from './production-request-identity-verifier.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
} from './production-user-data-runtime-config.js';
import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

// M1-29: exercise the actual production composition root, member verifier,
// guest HMAC verifier and subject transaction. All remote I/O is synthetic;
// the DB mock enforces exact canonical SQL instead of executing arbitrary SQL.
// This is NOT a live authentication, Supabase Owner or deployment approval.
const GUEST = 'm129-synthetic-opaque-guest-bearer-0123456789abcdef';
const GUEST_SECRET = 'm129-ci-only-guest-hmac-secret-0123456789abcdef';
const MEMBER_JWT = 'synthetic.header.signature';
const MEMBER_ID = 'a1290000-0000-4000-8000-000000000011';
const GUEST_SUBJECT = 'a1290000-0000-4000-8000-000000000012';
const MEMBER_SUBJECT = 'a1290000-0000-4000-8000-000000000013';
const ATTACKER_SUBJECT = 'a1290000-0000-4000-8000-000000000014';
const SUPABASE_KEY = 'sb_publishable_synthetic_m129_identity_boundary_20261018';
const env = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_m129_ci_login:synthetic-fixture-only@unit.invalid:5432/m129?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_m129_ci_login',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: 'm129-synthetic-fixture-root-not-real-certificate',
  MYEONGHA_SUPABASE_URL: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  MYEONGHA_SUPABASE_API_KEY: SUPABASE_KEY,
  MYEONGHA_GUEST_FINGERPRINT_SECRET: GUEST_SECRET,
});
const FINGERPRINT = fingerprintProductionGuestBearerTokenV1({
  rawBearerToken: GUEST, secret: GUEST_SECRET,
});
type SqlCall = Readonly<{ sql: string; values?: readonly unknown[] }>;

function syntheticPool() {
  const calls: SqlCall[] = [];
  const released: unknown[] = [];
  let connects = 0;
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      connects++;
      let resolved: string | undefined;
      return {
        async query<Row = Record<string, unknown>>(
          sql: string, values?: readonly unknown[],
        ) {
          calls.push({ sql, ...(values === undefined ? {} : { values }) });
          let rows: readonly Record<string, unknown>[] = [];
          if (sql === 'BEGIN' || sql === 'SET LOCAL ROLE myeongha_api_executor' ||
              sql === 'COMMIT' || sql === 'ROLLBACK') {
            // Transaction lifecycle is enforced by the real adapter.
          } else if (sql.includes('from public.begin_guest_subject_context_v1($1::text)')) {
            if (values?.[0] !== FINGERPRINT) {
              throw Object.assign(new Error('synthetic unknown guest'), {
                constraint: 'guest_subject_context_unresolved',
              });
            }
            resolved = GUEST_SUBJECT;
            rows = [{ subjectId: GUEST_SUBJECT, subjectKind: 'guest' }];
          } else if (sql.includes('from public.begin_member_subject_context_v1($1::uuid)')) {
            if (values?.[0] !== MEMBER_ID) {
              throw Object.assign(new Error('synthetic unknown member'), {
                constraint: 'member_subject_context_unresolved',
              });
            }
            resolved = MEMBER_SUBJECT;
            rows = [{ subjectId: MEMBER_SUBJECT, subjectKind: 'member' }];
          } else if (sql === 'select public.assert_myeongha_subject_context_v1($1::uuid)') {
            if (values?.[0] !== resolved) throw new Error('synthetic canonical subject mismatch');
          } else if (sql.includes('from public.qry_subject_profile_current_v1($1::uuid)')) {
            if (values?.[0] !== resolved || resolved === undefined) {
              throw new Error('profile query did not use resolver-bound canonical Subject');
            }
            rows = [{
              subjectId: resolved,
              subjectKind: resolved === GUEST_SUBJECT ? 'guest' : 'member',
              subjectStatus: 'active', displayName: null,
              locale: 'ko', timezone: 'Asia/Seoul',
              onboardingState: null, profileUpdatedAt: null,
            }];
          } else {
            throw new Error('M1-29 disallowed SQL: ' + sql);
          }
          return { rows: rows as readonly Row[] };
        },
        release(error?: unknown) {
          released.push(error);
        },
      };
    },
  };
  return {
    pool, calls, released,
    get connects() { return connects; },
  };
}

function request(token?: string, headers?: Record<string, string>): Request {
  return new Request('https://myeongha.invalid/api/me', {
    headers: {
      ...(token === undefined ? {} : { Authorization: 'Bearer ' + token }),
      ...headers,
    },
  });
}

function run(
  pool: PostgresSubjectPoolV1,
  req: Request,
  memberFetchImpl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
) {
  const runtime = createProductionCurrentSubjectProfileRuntimeV1({
    env, pool, memberFetchImpl,
  });
  return runtime.handleRequest({
    request: req,
    requestId: 'm129-safe-request-id',
    serverTime: '2026-10-18T00:00:00.000Z',
  });
}

function assertCanonicalSql(calls: readonly SqlCall[], subject: string, evidence: string) {
  expect(calls.map(x => x.sql)).toEqual([
    'BEGIN',
    'SET LOCAL ROLE myeongha_api_executor',
    expect.stringContaining(evidence),
    'select public.assert_myeongha_subject_context_v1($1::uuid)',
    expect.stringContaining('from public.qry_subject_profile_current_v1($1::uuid)'),
    'COMMIT',
  ]);
  expect(calls[3]?.values).toEqual([subject]);
  expect(calls[4]?.values).toEqual([subject]);
  expect(calls.some(x => /set_config|set role postgres|grant |alter role|insert into/iu.test(x.sql))).toBe(false);
}

describe('M1-29 production /api/me Member+Guest HTTP-to-DB identity fence', () => {
  it('accepts only the server-HMACed guest credential and ignores forged Subject/role/GUC headers', async () => {
    const m = syntheticPool();
    const memberFetch = vi.fn(async () => {
      throw new Error('Guest token must never call the Member Auth endpoint');
    });
    const response = await run(m.pool, request(GUEST, {
      'x-myeongha-subject-id': ATTACKER_SUBJECT,
      'x-myeongha-subject-guc': ATTACKER_SUBJECT,
      'x-db-role': 'postgres',
      'x-postgres-query': 'set role postgres',
      Cookie: 'myeongha.subject_id=' + ATTACKER_SUBJECT,
    }), memberFetch);

    expect(response.status).toBe(200);
    const body = await response.json() as { data: { subjectId: string; subjectKind: string } };
    expect(body.data).toMatchObject({ subjectId: GUEST_SUBJECT, subjectKind: 'guest' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(memberFetch).not.toHaveBeenCalled();
    expect(m.connects).toBe(1);
    expect(m.calls[2]?.values).toEqual([FINGERPRINT]);
    assertCanonicalSql(m.calls, GUEST_SUBJECT, 'begin_guest_subject_context_v1');
    expect(m.released).toEqual([undefined]);
  });

  it('resolves a member ONLY from the Supabase Auth /user verified response, not claimed header IDs', async () => {
    const m = syntheticPool();
    const authFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(MYEONGHA_PRODUCTION_SUPABASE_ORIGIN + '/auth/v1/user');
      expect(init?.method).toBe('GET');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer ' + MEMBER_JWT,
        apikey: SUPABASE_KEY,
      });
      return Response.json({ id: MEMBER_ID });
    });
    const response = await run(m.pool, request(MEMBER_JWT, {
      'x-myeongha-subject-id': ATTACKER_SUBJECT,
      'x-auth-user-id': ATTACKER_SUBJECT,
      'x-db-role': 'service_role',
    }), authFetch);
    expect(response.status).toBe(200);
    expect((await response.json() as {data:{subjectId:string;subjectKind:string}}).data)
      .toMatchObject({ subjectId: MEMBER_SUBJECT, subjectKind: 'member' });
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(m.calls[2]?.values).toEqual([MEMBER_ID]);
    assertCanonicalSql(m.calls, MEMBER_SUBJECT, 'begin_member_subject_context_v1');
    expect(m.released).toEqual([undefined]);
  });

  it('returns 401 before DB connection for absent or malformed bearer; ignores claimed subject metadata', async () => {
    for (const token of [undefined, 'short', 'not_a_jwt']) {
      const m = syntheticPool();
      const authFetch = vi.fn(async () => Response.json({ id: MEMBER_ID }));
      const response = await run(m.pool, request(token, {
        'x-myeongha-subject-id': GUEST_SUBJECT,
        'x-db-role': 'myeongha_api_executor',
      }), authFetch);
      expect(response.status).toBe(401);
      expect(m.connects).toBe(0);
      expect(m.calls).toEqual([]);
      expect(authFetch).not.toHaveBeenCalled();
    }
  });

  it.each([401, 403])('never falls back to Guest when Supabase rejects a JWT (%i)', async status => {
    const m = syntheticPool();
    const authFetch = vi.fn(async () => new Response(null, { status }));
    const response = await run(m.pool, request(MEMBER_JWT, {
      'x-myeongha-subject-id': GUEST_SUBJECT,
    }), authFetch);
    expect(response.status).toBe(401);
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(m.connects).toBe(0);
    expect(m.calls).toEqual([]);
  });

  it('does not authorize a syntactically valid but unknown Guest HMAC without the DB resolver', async () => {
    const m = syntheticPool();
    const unknownOpaqueBearer = 'm129-unknown-guest-opaque-bearer-aaaaaaaaaaaaaaaa';
    const response = await run(m.pool, request(unknownOpaqueBearer), vi.fn());
    expect(response.status).toBe(401);
    expect(m.connects).toBe(1);
    expect(m.calls.map(x => x.sql)).toEqual([
      'BEGIN', 'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_guest_subject_context_v1'), 'ROLLBACK',
    ]);
    expect(m.calls[2]?.values?.[0]).not.toBe(FINGERPRINT);
    expect(m.released).toEqual([undefined]);
  });

  it('never connects to DB for unsupported HTTP methods, even with an otherwise valid credential', async () => {
    const m = syntheticPool();
    const authFetch = vi.fn();
    const runtime = createProductionCurrentSubjectProfileRuntimeV1({
      env, pool: m.pool, memberFetchImpl: authFetch,
    });
    const response = await runtime.handleRequest({
      request: new Request('https://myeongha.invalid/api/me', {
        method: 'POST', headers: { Authorization: 'Bearer ' + GUEST },
      }),
      requestId: 'm129-request-id',
      serverTime: '2026-10-18T00:00:00.000Z',
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(authFetch).not.toHaveBeenCalled();
    expect(m.connects).toBe(0);
  });
});
