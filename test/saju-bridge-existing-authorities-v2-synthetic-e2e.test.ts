import { describe, expect, it, vi } from 'vitest';
import {
  createSajuBridgeExistingAuthoritiesV2,
} from '../apps/api/src/saju-bridge-existing-authorities-v2.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { SupabaseMemberVerifierFetchV1 } from '../apps/api/src/supabase-member-identity-verifier.js';
import type { SajuProductionCalculationHttpFetchV1 } from '../apps/api/src/saju-production-calculation-http-adapter.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:
    '-----BEGIN CERTIFICATE-----\ntest-only\n-----END CERTIFICATE-----',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_saju_v2_e2e',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.internal.example',
  MYEONGHA_SAJU_SERVICE_BEARER: 'test-only-saju-service-bearer-secret',
});

const AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const BIRTH_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';
const MEMBER_JWT = 'header.payload.signature';

function fixture(options: {
  readonly rejectAuth?: boolean;
  readonly wrongSubjectKind?: boolean;
  readonly driftedRevision?: boolean;
  /** Synthetic Saju preview response. Other tests keep the 503 baseline. */
  readonly previewResponse?: 'admitted' | 'missing-admission' | 'missing-lifecycle' | 'wrong-envelope';
} = {}) {
  const events: string[] = [];
  const sqlQueries: { sql: string; values?: readonly unknown[] }[] = [];
  const connect = vi.fn(async () => {
    events.push('CONNECT');
    return {
      async query(sql: string, values?: readonly unknown[]) {
        sqlQueries.push(values === undefined ? { sql } : { sql, values });
        events.push(sql);
        if (['BEGIN', 'COMMIT', 'ROLLBACK', 'SET LOCAL ROLE myeongha_api_executor'].includes(sql)) {
          return { rows: [] };
        }
        if (sql.includes('begin_member_subject_context_v1')) {
          return { rows: [{
            subjectId: SUBJECT_ID,
            subjectKind: options.wrongSubjectKind ? 'guest' : 'member',
          }] };
        }
        if (sql.includes('assert_myeongha_subject_context_v1')) return { rows: [{}] };
        if (sql.includes('qry_self_birth_profile_current_v1')) {
          return { rows: [{
            subjectId: SUBJECT_ID,
            birthProfileId: BIRTH_PROFILE_ID,
            currentRevisionId: REVISION_ID,
            currentRevisionNo: options.driftedRevision ? 8 : 7,
            profileUpdatedAt: '2026-09-19T13:00:00.000Z',
          }] };
        }
        if (sql.includes('qry_birth_profile_current_revision_v1')) {
          return { rows: [{
            birthProfileId: BIRTH_PROFILE_ID,
            profileKind: 'self',
            label: null,
            currentRevisionId: REVISION_ID,
            archivedAt: null,
            currentRevisionNo: 7,
            currentCalendarType: 'solar',
            currentBirthDate: '2001-07-14',
            currentBirthTime: '15:20:00',
            currentTimeKnown: true,
            currentIsLeapMonth: false,
            currentSex: 'female',
            revisionId: REVISION_ID,
            revisionNo: 7,
            isCurrentRevision: true,
          }] };
        }
        throw new Error('Unexpected SQL in role-free Saju V2 fixture');
      },
      release() { events.push('RELEASE'); },
    };
  });
  const pool = { connect } as unknown as PostgresSubjectPoolV1;
  const memberFetchImpl: SupabaseMemberVerifierFetchV1 = vi.fn(async (url, init) => {
    events.push('AUTH');
    expect(String(url)).toBe('https://cnsfpcdiyofqvhpcegfc.supabase.co/auth/v1/user');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${MEMBER_JWT}`);
    return options.rejectAuth
      ? new Response(null, { status: 401 })
      : Response.json({ id: AUTH_USER_ID, user_metadata: { subject_id: 'untrusted' } });
  });
  const sajuFetchImpl: SajuProductionCalculationHttpFetchV1 = vi.fn(async (url, init) => {
    events.push('SAJU');
    expect(url).toMatch(/^https:\/\/saju\.internal\.example\/api\/(?:calculations|preview\/readings)$/u);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(
      `Bearer ${ENV.MYEONGHA_SAJU_SERVICE_BEARER}`,
    );
    const payload = JSON.parse(init.body) as { birth?: { date?: string } };
    expect(payload.birth?.date).toBe('2001-07-14');
    if (String(url).endsWith('/api/preview/readings') && options.previewResponse !== undefined) {
      const responseVersion = options.previewResponse === 'wrong-envelope'
        ? 'unrecognized-product-response'
        : 'myeonghwa-product-reading-response-v2';
      return Response.json({
        responseVersion,
        state: 'delivered',
        sections: [{ sectionId: 'core', title: 'synthetic test section', blocks: [] }],
      }, {
        status: 200,
        headers: {
          ...(options.previewResponse === 'missing-admission' ? {} : {
            'x-myeonghwa-product-reading-response-admitted':
              'myeonghwa-product-reading-response-v2',
          }),
          ...(options.previewResponse === 'missing-lifecycle' ? {} : {
            'x-myeonghwa-reading-lifecycle': 'preview',
          }),
        },
      });
    }
    return Response.json({ synthetic: 'upstream unavailable' }, { status: 503 });
  });

  const runtime = createSajuBridgeExistingAuthoritiesV2({
    env: ENV,
    pool,
    memberFetchImpl,
    sajuFetchImpl,
  });
  return { runtime, events, sqlQueries, connect, memberFetchImpl, sajuFetchImpl };
}

function request(route: 'calculation' | 'preview-reading'): Request {
  return new Request(`https://myeongha.example/api/me/saju/${route}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MEMBER_JWT}`,
      'x-client-subject-id': 'attacker-controlled',
      ...(route === 'preview-reading' ? { 'content-type': 'application/json' } : {}),
    },
    ...(route === 'preview-reading'
      ? { body: JSON.stringify({ readingText: '재물운' }) }
      : {}),
  });
}

async function handle(
  fixtureValue: ReturnType<typeof fixture>,
  route: 'calculation' | 'preview-reading',
) {
  return fixtureValue.runtime.handleRequest({
    request: request(route),
    requestId: 'saju-v2-member-e2e',
    serverTime: '2026-10-16T00:00:00.000Z',
  });
}

describe('Saju V2 synthetic Member Auth -> existing Subject DB -> Saju transport', () => {
  it.each(['calculation', 'preview-reading'] as const)(
    '%s authenticates and commits existing-role Birth authority before calling Saju, no permit or new role',
    async route => {
      const f = fixture();
      try {
        const response = await handle(f, route);
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
          ok: false,
          error: {
            code: route === 'calculation'
              ? 'SAJU_TEMPORARILY_UNAVAILABLE'
              : 'SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE',
          },
        });
        expect(f.connect).toHaveBeenCalledOnce();
        expect(f.events.filter(x => x === 'AUTH')).toHaveLength(1);
        expect(f.events.filter(x => x === 'SAJU')).toHaveLength(1);
        expect(f.events).toContain('SET LOCAL ROLE myeongha_api_executor');
        expect(f.events.indexOf('AUTH')).toBeLessThan(f.events.indexOf('CONNECT'));
        expect(f.events.indexOf('COMMIT')).toBeLessThan(f.events.indexOf('RELEASE'));
        expect(f.events.indexOf('RELEASE')).toBeLessThan(f.events.indexOf('SAJU'));
        expect(f.sqlQueries.some(x =>
          x.sql.includes('begin_member_subject_context_v1')
          && x.values?.[0] === AUTH_USER_ID)).toBe(true);
        expect(f.sqlQueries.some(x =>
          x.sql.includes('qry_birth_profile_current_revision_v1')
          && x.values?.[0] === SUBJECT_ID
          && x.values?.[1] === BIRTH_PROFILE_ID)).toBe(true);
        expect(f.sqlQueries.map(x => x.sql).join('\n')).not.toMatch(
          /saju_bridge_private|myeongha_saju_bridge_permit|CREATE ROLE|SET ROLE postgres/iu,
        );
      } finally {
        await f.runtime.close();
      }
    },
  );

  it('returns a source-attested preview reading over the existing Auth and Birth transaction', async () => {
    const f = fixture({ previewResponse: 'admitted' });
    try {
      const response = await handle(f, 'preview-reading');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        data: {
          lifecycle: 'preview',
          reading: {
            responseVersion: 'myeonghwa-product-reading-response-v2',
            state: 'delivered',
          },
        },
      });
      expect(f.connect).toHaveBeenCalledOnce();
      expect(f.memberFetchImpl).toHaveBeenCalledOnce();
      expect(f.sajuFetchImpl).toHaveBeenCalledOnce();
      expect(f.events.indexOf('COMMIT')).toBeLessThan(f.events.indexOf('RELEASE'));
      expect(f.events.indexOf('RELEASE')).toBeLessThan(f.events.indexOf('SAJU'));
      expect(f.sqlQueries.map(q => q.sql).join('\\n')).not.toMatch(
        /saju_bridge_private|myeongha_saju_bridge_permit|CREATE ROLE|SET ROLE postgres/iu,
      );
    } finally {
      await f.runtime.close();
    }
  });

  it.each(['missing-admission', 'missing-lifecycle', 'wrong-envelope'] as const)(
    'fails closed on %s preview success response without disclosing unadmitted reading',
    async previewResponse => {
      const f = fixture({ previewResponse });
      try {
        const response = await handle(f, 'preview-reading');
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        const payload = await response.json();
        expect(payload).toMatchObject({
          ok: false,
          error: { code: 'SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE' },
        });
        expect(JSON.stringify(payload)).not.toContain('synthetic test section');
        expect(f.events.filter(x => x === 'SAJU')).toHaveLength(1);
        expect(f.events.indexOf('RELEASE')).toBeLessThan(f.events.indexOf('SAJU'));
      } finally {
        await f.runtime.close();
      }
    },
  );

  it.each(['calculation', 'preview-reading'] as const)(
    '%s denies rejected Auth before DB and Saju, without Guest fallback',
    async route => {
      const f = fixture({ rejectAuth: true });
      try {
        const response = await handle(f, route);
        expect(response.status).toBe(401);
        expect(f.events).toEqual(['AUTH']);
        expect(f.connect).not.toHaveBeenCalled();
        expect(f.sajuFetchImpl).not.toHaveBeenCalled();
      } finally {
        await f.runtime.close();
      }
    },
  );

  it.each(['calculation', 'preview-reading'] as const)(
    '%s blocks mismatched Subject identity without sending Birth upstream',
    async route => {
      const f = fixture({ wrongSubjectKind: true });
      try {
        const response = await handle(f, route);
        expect(response.status).toBe(503);
        expect(f.events).toContain('ROLLBACK');
        expect(f.events).not.toContain('COMMIT');
        expect(f.events).not.toContain('SAJU');
      } finally {
        await f.runtime.close();
      }
    },
  );

  it.each(['calculation', 'preview-reading'] as const)(
    '%s blocks stale Birth revision without sending Birth upstream',
    async route => {
      const f = fixture({ driftedRevision: true });
      try {
        const response = await handle(f, route);
        expect(response.status).toBe(503);
        expect(f.events).toContain('ROLLBACK');
        expect(f.events).not.toContain('COMMIT');
        expect(f.events).not.toContain('SAJU');
      } finally {
        await f.runtime.close();
      }
    },
  );
});
