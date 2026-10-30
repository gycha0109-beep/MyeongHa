import { describe, expect, it } from 'vitest';
import { verifyLocalSyntheticPostDeletion } from '../scripts/run-postgres-hosted-synthetic-local-postdelete.mjs';

const role = (role) => 'header.' +
  Buffer.from(JSON.stringify({ iss: 'supabase-demo', role })).toString('base64url') +
  '.signature';
const env = Object.freeze({
  MH_DR_LOCAL_TARGET: 'http://127.0.0.1:54321',
  MH_DR_LOCAL_ANON_KEY: role('anon'),
  MH_DR_LOCAL_SERVICE_ROLE_KEY: role('service_role'),
  MH_DR_LOCAL_DB_PASSWORD: 'synthetic-only',
  MH_DR_LOCAL_MEMBER_EMAIL: 'dr-synthetic-member@example.test',
  MH_DR_LOCAL_MEMBER_PASSWORD: 'synthetic-member-password',
  MH_DR_LOCAL_DELETED_EMAIL: 'dr-synthetic-deleted@example.test',
  MH_DR_LOCAL_DELETED_PASSWORD: 'synthetic-deleted-password',
  MH_DR_LOCAL_PRIVATE_BUCKET: 'dr-synthetic-private',
  MH_DR_LOCAL_OBJECT_PATH: 'probe/data.txt',
  MH_DR_LOCAL_OBJECT_SHA256: '641ca9086ef039b62e8bd97b5813fed6dabd847c934e5d834d5c6746a9b4fee4',
});
const bytes = Buffer.from('dr-synthetic-private-object-2026\n');
const uuid = '123e4567-e89b-42d3-a456-426614174000';

function fake(status, body = null) {
  return { status, json: async () => body,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer };
}
function scenario(postStorageStatus = 403) {
  let deleted = false;
  let sourceRead = false;
  let marker = false;
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, method: options.method });
    expect(url.startsWith(env.MH_DR_LOCAL_TARGET + '/')).toBe(true);
    expect(options.redirect).toBe('manual');
    if (url.includes('/auth/v1/token?grant_type=password')) {
      return deleted ? fake(400) : fake(200, {
        access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
      });
    }
    if (url.endsWith('/auth/v1/user')) return fake(200, {
      email: env.MH_DR_LOCAL_MEMBER_EMAIL, id: uuid,
    });
    if (url.includes('/storage/v1/object/')) {
      if (deleted) return fake(marker ? postStorageStatus : 200);
      sourceRead = true;
      return fake(200);
    }
    if (url.endsWith('/auth/v1/admin/users/' + uuid)) {
      expect(sourceRead).toBe(true);
      expect(marker).toBe(true);
      expect(options.method).toBe('DELETE');
      expect(options.headers.apikey).toBe(env.MH_DR_LOCAL_SERVICE_ROLE_KEY);
      deleted = true;
      return fake(204);
    }
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) return fake(401);
    throw new Error('unexpected route');
  };
  const dbFactory = async (password) => {
    expect(password).toBe(env.MH_DR_LOCAL_DB_PASSWORD);
    return { query: async (sql, params) => {
      if (sql.includes('current_database()')) return { rows: [{ database_name: 'postgres', role: 'postgres', revoked_table: true }] };
      if (sql.startsWith('insert into dr_synthetic_local.revoked_subjects')) {
        expect(params).toEqual([uuid]);
        marker = true;
        return { rows: [] };
      }
      throw new Error('unexpected DB query');
    }, end: async () => {} };
  };
  return { request, calls, dbFactory, wasDeleted: () => deleted };
}

describe('Docker-local synthetic post-deletion access verification', () => {
  it('reports PASS only for denied stale-storage access and always holds DR gate', async () => {
    const { request, calls, dbFactory } = scenario(403);
    const report = await verifyLocalSyntheticPostDeletion(env, request, dbFactory);
    expect(report).toMatchObject({
      syntheticPrivateObjectBeforeDeletion: 'PASS',
      syntheticDeletion: 'PASS',
      newLoginDenied: 'PASS',
      refreshAfterDeletionDenied: 'PASS',
      staleAccessTokenStorageDenied: 'PASS',
      revocationAppliedBeforeDeletion: true,
      revocationBeforeDeletionStorageDenied: 'PASS',
      localRevocationMarkerApplied: true,
      drReady: false, gate: 'BLOCKED', serviceResumptionAllowed: false,
      independentPrivacyContinuityProven: false,
    });
    expect(calls.map(x => x.method)).toEqual([
      'POST','GET','GET','GET','DELETE','POST','POST','GET',
    ]);
    expect(JSON.stringify(report)).not.toContain(uuid);
    expect(JSON.stringify(report)).not.toContain('synthetic-access');
  });
  it('flags stale JWT Storage disclosure as FAIL, never a pass', async () => {
    const scene = scenario(200);
    await expect(verifyLocalSyntheticPostDeletion(env, scene.request, scene.dbFactory))
      .rejects.toThrow('revocation marker must deny stale JWT before account deletion');
    expect(scene.wasDeleted()).toBe(false);
  });
  it('refuses even the synthetic delete before verified identity and object baseline', async () => {
    let deleted = false;
    const request = async (url) => {
      if (url.includes('/auth/v1/token')) return fake(200, {
        access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
      });
      if (url.endsWith('/auth/v1/user')) return fake(200, {
        id: uuid, email: 'unapproved@example.com',
      });
      if (url.includes('/admin/users')) deleted = true;
      return fake(200);
    };
    await expect(verifyLocalSyntheticPostDeletion(env, request))
      .rejects.toThrow('nonfixture identity cannot be deleted');
    expect(deleted).toBe(false);
  });
});
