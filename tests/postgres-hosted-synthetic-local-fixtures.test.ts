import { describe, expect, it } from 'vitest';
import {
  validateLocalFixtureConfig, prepareLocalSyntheticFixtures,
} from '../scripts/prepare-postgres-hosted-synthetic-local-fixtures.mjs';

const role = (role) => 'header.' +
  Buffer.from(JSON.stringify({ iss: 'supabase-demo', role })).toString('base64url') +
  '.signature';
const valid = Object.freeze({
  MH_DR_LOCAL_TARGET: 'http://127.0.0.1:54321',
  MH_DR_LOCAL_ANON_KEY: role('anon'),
  MH_DR_LOCAL_SERVICE_ROLE_KEY: role('service_role'),
  MH_DR_LOCAL_DB_PASSWORD: 'local-fixture-only-password',
  MH_DR_LOCAL_MEMBER_EMAIL: 'dr-synthetic-member@example.test',
  MH_DR_LOCAL_MEMBER_PASSWORD: 'synthetic-member-password',
  MH_DR_LOCAL_DELETED_EMAIL: 'dr-synthetic-deleted@example.test',
  MH_DR_LOCAL_DELETED_PASSWORD: 'synthetic-deleted-password',
  MH_DR_LOCAL_PRIVATE_BUCKET: 'dr-synthetic-private',
  MH_DR_LOCAL_OBJECT_PATH: 'probe/data.txt',
  MH_DR_LOCAL_OBJECT_SHA256: '641ca9086ef039b62e8bd97b5813fed6dabd847c934e5d834d5c6746a9b4fee4',
});

const mockUser = ['123e4567-e89b-42d3-a456-426614174000', '123e4567-e89b-42d3-a456-426614174001'];

describe('strict localhost-only synthetic Hosted fixture preparation', () => {
  it('rejects wrong target, identities, keys and deterministic object data before any request', () => {
    for (const delta of [
      { MH_DR_LOCAL_TARGET: 'https://example.com' },
      { MH_DR_LOCAL_TARGET: 'http://localhost:54321' },
      { MH_DR_LOCAL_ANON_KEY: role('service_role') },
      { MH_DR_LOCAL_SERVICE_ROLE_KEY: role('anon') },
      { MH_DR_LOCAL_MEMBER_EMAIL: 'real@example.test' },
      { MH_DR_LOCAL_DELETED_EMAIL: valid.MH_DR_LOCAL_MEMBER_EMAIL },
      { MH_DR_LOCAL_PRIVATE_BUCKET: 'customer-data' },
      { MH_DR_LOCAL_OBJECT_PATH: 'probe/wrong.txt' },
      { MH_DR_LOCAL_OBJECT_SHA256: '0'.repeat(64) },
    ]) {
      expect(() => validateLocalFixtureConfig({ ...valid, ...delta })).toThrow();
    }
    expect(validateLocalFixtureConfig(valid).expectedSha).toBe(valid.MH_DR_LOCAL_OBJECT_SHA256);
  });

  it('creates only synthetic Auth/Storage objects and one member-scoped read policy', async () => {
    const commands = [];
    const requested = [];
    let creates = 0;
    const db = {
      async query(sql) {
        commands.push(sql);
        if (sql.includes('current_database()')) {
          return { rows: [{ db: 'postgres', role: 'postgres', auth_schema: 1, storage_schema: 1 }] };
        }
        if (sql.includes('pg_policies')) return { rows: [] };
        return { rows: [] };
      },
      async end() { commands.push('end'); },
    };
    const request = async (url, options) => {
      requested.push({ url, method: options.method });
      expect(url.startsWith(valid.MH_DR_LOCAL_TARGET + '/')).toBe(true);
      expect(options.redirect).toBe('manual');
      expect(options.headers.apikey).toBe(valid.MH_DR_LOCAL_SERVICE_ROLE_KEY);
      if (url.endsWith('/auth/v1/admin/users') && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        expect(payload.email.startsWith('dr-synthetic-')).toBe(true);
        return { status: 201, json: async () => ({ id: mockUser[creates++] }) };
      }
      if (url.includes('/auth/v1/admin/users/') && options.method === 'DELETE') {
        expect(url.endsWith(mockUser[1])).toBe(true);
        return { status: 204 };
      }
      if (url.endsWith('/storage/v1/bucket') && options.method === 'POST') {
        expect(JSON.parse(options.body).public).toBe(false);
        return { status: 200 };
      }
      if (url.endsWith('/storage/v1/object/dr-synthetic-private/probe/data.txt')) {
        expect(Buffer.from(options.body).toString()).toBe('dr-synthetic-private-object-2026\n');
        return { status: 200 };
      }
      if (url.endsWith('/storage/v1/bucket/dr-synthetic-private') && options.method === 'GET') {
        return { status: 200, json: async () => ({ public: false }) };
      }
      throw new Error('Unexpected fixture endpoint');
    };
    const result = await prepareLocalSyntheticFixtures(valid, request, async () => db);
    expect(result).toMatchObject({
      target: 'local-loopback-synthetic-only', memberCreated: true,
      deletedMemberRemoved: true, privateBucket: true, drReady: false,
      gate: 'BLOCKED', serviceResumptionAllowed: false,
      productionDataUsed: false, hostedRecoveryProven: false,
    });
    expect(result.objectSha256).toBe(valid.MH_DR_LOCAL_OBJECT_SHA256);
    expect(JSON.stringify(result)).not.toContain(mockUser[0]);
    expect(JSON.stringify(result)).not.toContain(valid.MH_DR_LOCAL_MEMBER_EMAIL);
    expect(requested.map(x => x.method)).toEqual(['POST','POST','DELETE','POST','POST','GET']);
    const policy = commands.find(x => x.startsWith('create policy '));
    expect(policy).toContain("auth.uid() = '" + mockUser[0] + "'::uuid");
    expect(policy).toContain("bucket_id = 'dr-synthetic-private'");
    expect(commands).toContain('COMMIT');
    expect(commands.at(-1)).toBe('end');
  });

  it('rejects unexpected local schema and never starts creating accounts', async () => {
    let contacted = false;
    const db = {
      query: async () => ({ rows: [{ db: 'postgres', role: 'postgres', auth_schema: 1, storage_schema: 0 }] }),
      end: async () => {},
    };
    await expect(prepareLocalSyntheticFixtures(valid, () => { contacted = true; }, async () => db))
      .rejects.toThrow('HOLD_DR_LOCAL_FIXTURE');
    expect(contacted).toBe(false);
  });
});
