import { describe, expect, it, vi } from 'vitest';
import {
  CF_LOGIN_READONLY_SQL, verifyCloudflareDbCredentialConnectionV1,
} from '../scripts/operations/verify-cloudflare-db-credential-connectivity.mjs';

const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
const origin = 'https://myeongha.gycha0109.workers.dev';
const pwd = 'synthetic-not-a-real-password';
const env = () => ({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: host,
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '6543',
  MYEONGHA_DATABASE_URL:
    `postgresql://myeongha_cf_api_login.cnsfpcdiyofqvhpcegfc:${pwd}@${host}:6543/postgres?sslmode=require`,
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_cf_api_login',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: 'synthetic-ca',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'a'.repeat(30),
  MYEONGHA_GUEST_FINGERPRINT_SECRET: 'g'.repeat(40),
});
const validRole = {
  login_role: 'myeongha_cf_api_login',
  bypassrls: false, superuser: false, canlogin: true, executor_member: true,
};
const fake = (rows = [validRole]) => {
  const client = {
    connect: vi.fn(async () => {}),
    query: vi.fn(async () => ({ rows })),
    end: vi.fn(async () => {}),
  };
  return client;
};

describe('Cloudflare dedicated DB positive TLS + role canary', () => {
  it('stages DB credentials without requiring access to unrelated auth secrets', async () => {
    const values = env();
    delete values.MYEONGHA_SUPABASE_API_KEY;
    delete values.MYEONGHA_GUEST_FINGERPRINT_SECRET;
    const state = await verifyCloudflareDbCredentialConnectionV1(values, {
      validateRoot: () => true, clientFactory: async () => fake(),
    });
    expect(state.result).toBe('DB_AUTHENTICATED_READ_ONLY');
  });
  it('rejects URL options that could override TLS before opening a socket', async () => {
    const factory = vi.fn();
    const values = env();
    values.MYEONGHA_DATABASE_URL += '&ssl=no-verify';
    const state = await verifyCloudflareDbCredentialConnectionV1(values, {
      validateRoot: () => true, clientFactory: factory,
    });
    expect(state.result).toBe('HOLD');
    expect(factory).not.toHaveBeenCalled();
  });
  it('checks only the dedicated role with true TLS verification and a single SELECT', async () => {
    const client = fake();
    const factory = vi.fn(async () => client);
    const state = await verifyCloudflareDbCredentialConnectionV1(env(), {
      validateRoot: () => true, clientFactory: factory,
    });
    expect(state.result).toBe('DB_AUTHENTICATED_READ_ONLY');
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledExactlyOnceWith(CF_LOGIN_READONLY_SQL);
    expect(CF_LOGIN_READONLY_SQL).toMatch(/^SELECT /);
    expect(client.end).toHaveBeenCalledOnce();
    expect(factory.mock.calls[0][0].ssl).toMatchObject({
      rejectUnauthorized: true, servername: host,
    });
    expect(factory.mock.calls[0][0].connectionString).not.toContain('sslmode=');
    expect(JSON.stringify(state)).not.toContain(pwd);
  });
  it('rejects forged role, bypass-RLS, missing privileges and auth errors', async () => {
    for (const row of [
      { ...validRole, login_role: 'myeongha_runtime' },
      { ...validRole, bypassrls: true },
      { ...validRole, executor_member: false },
      { ...validRole, superuser: true },
    ]) {
      const client = fake([row]);
      const state = await verifyCloudflareDbCredentialConnectionV1(env(), {
        validateRoot: () => true, clientFactory: async () => client,
      });
      expect(state.result).toBe('HOLD');
      expect(state.code).toBe('DB_LOGIN_OR_RLS_AUTHORITY_MISMATCH');
      expect(client.end).toHaveBeenCalledOnce();
    }
    const broken = fake();
    broken.connect.mockRejectedValueOnce(new Error('NEVER_PRINT:' + pwd));
    const state = await verifyCloudflareDbCredentialConnectionV1(env(), {
      validateRoot: () => true, clientFactory: async () => broken,
    });
    expect(state.code).toBe('DB_CONNECTION_OR_AUTH_FAILED');
    expect(JSON.stringify(state)).not.toContain(pwd);
    expect(broken.end).toHaveBeenCalledOnce();
  });
  it('does not initiate a connection without contract and valid root', async () => {
    const factory = vi.fn();
    expect((await verifyCloudflareDbCredentialConnectionV1({
      ...env(), MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
    }, { clientFactory: factory, validateRoot: () => true })).result).toBe('HOLD');
    expect((await verifyCloudflareDbCredentialConnectionV1(env(), {
      clientFactory: factory, validateRoot: () => false,
    })).code).toBe('DB_TLS_ROOT_INVALID');
    expect(factory).not.toHaveBeenCalled();
  });
});
