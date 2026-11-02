import { afterEach, describe, expect, it } from 'vitest';
import { createAdminLoopbackServerV1 } from './admin-private-loopback-server-v1.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from './production-user-data-runtime-config.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { request as httpRequest, type Server } from 'node:http';

const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
const active: Server[] = [];
let nextPort = 4187;
const env = Object.freeze({
  MYEONGHA_ADMIN_PRIVATE_ENABLED: 'true',
  MYEONGHA_ADMIN_OWNER_AUTH_USER_ID: OWNER,
  MYEONGHA_ADMIN_OWNER_EMAIL: "owner@example.test",
  MYEONGHA_ADMIN_SUPABASE_ORIGIN: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  MYEONGHA_SUPABASE_API_KEY: 'synthetic-key-for-local-tests-only',
  MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN: 'https://auth.example.test',
});
function pool(role: string, queries: string[]): PostgresSubjectPoolV1 {
  return {
    async connect() {
      return {
        async query<Row = Record<string, unknown>>(text: string) {
          queries.push(text);
          return { rows: text.startsWith('SELECT current_user')
            ? [{ currentUser: role }] as unknown as Row[]
            : [] as Row[] };
        },
        release() {},
      };
    },
  };
}
async function start(options: { userId?: string; invalidAuthOrigin?: boolean } = {}) {
  const reads: string[] = [];
  const audit: string[] = [];
  const port = nextPort++;
  const server = createAdminLoopbackServerV1({
    env: options.invalidAuthOrigin ? { ...env, MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN: 'http://bad.example.test' } : env,
    readPool: pool('myeongha_admin_reader', reads),
    auditPool: pool('myeongha_admin_audit_writer', audit),
    memberFetchImpl: async () => Response.json({ id: options.userId ?? OWNER,email:"owner@example.test" }),
    signInFetchImpl: (async () => Response.json({
      ok: true, data: { status: 'authenticated', session: {
        accessToken: TOKEN, refreshToken: 'never-expose-this-secret',
      } },
    }, { headers: { 'Set-Cookie': 'secret-should-never-forward=1' } })) as typeof fetch,
    port,
  });
  active.push(server);
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  return { reads, audit, port };
}
afterEach(async () => {
  while (active.length) {
    const server = active.pop();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
describe('private local administrator execution boundary', () => {
  it('audits real Owner-only GET without ever proxying cookies', async () => {
    const state = await start();
    const response = await fetch('http://127.0.0.1:' + state.port + '/api/admin/session', {
      headers: { Authorization: 'Bearer ' + TOKEN },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).authorized).toBe(true);
    expect(state.audit.some(query => query.includes('INSERT INTO myeongha_admin_ops'))).toBe(true);
    expect(state.reads).toHaveLength(0);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('cannot read cross-subject data as another verified Member', async () => {
    const state = await start({ userId: OTHER });
    expect((await fetch('http://127.0.0.1:' + state.port + '/api/admin/users', {
      headers: { Authorization: 'Bearer ' + TOKEN },
    })).status).toBe(403);
    expect(state.reads).toHaveLength(0);
  });
  it('requires the exact local UI Origin and drops refresh token', async () => {
    const { port } = await start();
    const url = 'http://127.0.0.1:' + port + '/api/auth/sign-in';
    const rejected = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.test' }, body: '{}' });
    expect(rejected.status).toBe(403);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4184' },
      body: JSON.stringify({ email: 'owner@example.test', password: 'test_password' }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('never-expose-this-secret');
    expect(text).not.toContain('secret-should-never-forward');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('refuses unpinned or non-HTTPS Member Auth origin', async () => {
    const { port } = await start({ invalidAuthOrigin: true });
    const status = await new Promise<number>((resolve, reject) => {
      const body = JSON.stringify({ email: 'owner@example.test', password: 'pass' });
      const request = httpRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/sign-in',
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Connection: 'close',
          Origin: 'http://127.0.0.1:4184',
        },
      }, response => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
        response.once('error', reject);
      });
      request.once('error', reject);
      request.end(body);
    });
    expect(status).toBe(503);
  });
});
