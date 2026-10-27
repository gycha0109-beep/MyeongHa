import { describe, expect, it } from 'vitest';
import { createAdminPrivateRuntimeV1 } from './admin-private-runtime-v1.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from './production-user-data-runtime-config.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
const env = {
  MYEONGHA_ADMIN_PRIVATE_ENABLED: 'true',
  MYEONGHA_ADMIN_OWNER_AUTH_USER_ID: OWNER,
  MYEONGHA_ADMIN_SUPABASE_ORIGIN: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  MYEONGHA_SUPABASE_API_KEY: 'synthetic-public-anon-key-test-only',
};
function mockPool(role: string) {
  const seen: string[] = [];
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      return {
        async query<Row = Record<string, unknown>>(text: string) {
          seen.push(text);
          return { rows: text.startsWith('SELECT current_user')
            ? [{ currentUser: role }] as unknown as Row[] : [] as Row[] };
        },
        release() {},
      };
    },
  };
  return { pool, seen };
}
describe('isolated private Administrator runtime', () => {
  it('rejects expired upstream sessions without issuing any domain read', async () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({ env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ error: 'jwt_expired' }, { status: 401 }),
    });
    const response = await runtime.handleRequest(new Request('https://admin.example/api/admin/users/' + OWNER, {
      headers: { Authorization: 'Bearer ' + JWT },
    }));
    expect(response.status).toBe(403);
    expect(r.seen).toHaveLength(0);
    expect(a.seen.some(sql => sql.startsWith('INSERT'))).toBe(true);
  });
  it('refuses disabled and mismatched authority environments', () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    expect(() => createAdminPrivateRuntimeV1({
      env: {}, readPool: r.pool, auditPool: a.pool,
    })).toThrow();
    expect(() => createAdminPrivateRuntimeV1({
      env: { ...env, MYEONGHA_ADMIN_SUPABASE_ORIGIN: 'https://wrong.example' },
      readPool: r.pool, auditPool: a.pool,
    })).toThrow();
  });
  it('requires Owner evidence, dedicated read role and audit write role', async () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({
      env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ id: OWNER }),
    });
    const response = await runtime.handleRequest(new Request('https://admin.example/api/admin/users', {
      headers: { Authorization: 'Bearer ' + JWT },
    }));
    expect(response.status).toBe(200);
    expect(r.seen.some(s => s.includes('FROM public.subjects'))).toBe(true);
    expect(a.seen.some(s => s.includes('INSERT INTO myeongha_admin_ops.admin_audit_events_v1'))).toBe(true);
  });
  it('does not query user data for another authenticated Member', async () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({
      env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ id: OTHER }),
    });
    expect((await runtime.handleRequest(new Request('https://admin.example/api/admin/users', {
      headers: { Authorization: 'Bearer ' + JWT },
    }))).status).toBe(403);
    expect(r.seen).toHaveLength(0);
  });
  it('fails closed for ordinary user DB role', async () => {
    const r = mockPool('myeongha_api_executor');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({
      env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ id: OWNER }),
    });
    expect((await runtime.handleRequest(new Request('https://admin.example/api/admin/users', {
      headers: { Authorization: 'Bearer ' + JWT },
    }))).status).toBe(503);
  });
});
