import { describe, expect, it } from 'vitest';
import { verifyCloudflareDbHandoffV1 } from '../scripts/operations/verify-cloudflare-db-handoff.mjs';

const secret = 'synthetic-secret-never-print';
const projectRef = 'cnsfpcdiyofqvhpcegfc';
const role = 'myeongha_cf_api_login';
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
const origin = 'https://myeongha.gycha0109.workers.dev';
const build = (overrides = {}) => ({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: host,
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '6543',
  MYEONGHA_DATABASE_URL: `postgresql://${role}.${projectRef}:${secret}@${host}:6543/postgres?sslmode=require`,
  MYEONGHA_DATABASE_PRINCIPAL: role,
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: 'synthetic-root',
  MYEONGHA_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  MYEONGHA_SUPABASE_API_KEY: 'a'.repeat(30),
  MYEONGHA_GUEST_FINGERPRINT_SECRET: 'g'.repeat(44),
  ...overrides,
});

describe('offline Cloudflare dedicated DB credential contract', () => {
  it('accepts only exact dedicated role, tenant and session policy without network', () => {
    expect(verifyCloudflareDbHandoffV1(build())).toEqual({
      result: 'CONFIG_CONTRACT_PASS', code: 'CONFIG_ONLY_NO_NETWORK_PROOF',
      liveDatabaseVerified: false, workerDeployed: false,
    });
  });
  it('rejects legacy Vercel logins even when a Vercel principal is supplied', () => {
    const unsafe = build({
      MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
      MYEONGHA_DATABASE_URL: `postgresql://myeongha_runtime.${projectRef}:${secret}@${host}:6543/postgres?sslmode=require`,
    });
    expect(verifyCloudflareDbHandoffV1(unsafe).code)
      .toBe('DB_PRINCIPAL_NOT_DEDICATED_CF_API_LOGIN');
  });
  it('rejects wrong approved port, wrong tenant suffix and wrong hostname', () => {
    const cases = [
      [build({ MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432' }), 'DB_PORT_NOT_APPROVED'],
      [build({ MYEONGHA_DATABASE_URL: `postgresql://${role}.wrongtenant:${secret}@${host}:6543/postgres?sslmode=require` }), 'DB_LOGIN_NOT_DEDICATED_CF_API_LOGIN'],
      [build({ MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'aws-1-ap-southeast-1.pooler.supabase.com' }), 'DB_HOST_NOT_APPROVED'],
    ];
    for (const [data, code] of cases) expect(verifyCloudflareDbHandoffV1(data).code).toBe(code);
  });
  it('rejects missing production bindings, unapproved stage and unsafe TLS', () => {
    const cases = [
      [build({ MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: '' }), 'AUTH_DB_STAGE5_NOT_ADMITTED'],
      [build({ MYEONGHA_DATABASE_URL: undefined }), 'PRODUCTION_DB_CONFIG_INVALID'],
      [build({ MYEONGHA_DATABASE_TLS_PEER_MODE: 'require' }), 'PRODUCTION_DB_CONFIG_INVALID'],
    ];
    for (const [data, code] of cases) expect(verifyCloudflareDbHandoffV1(data).code).toBe(code);
  });
  it('never returns the password, role, host or database URL', () => {
    for (const v of [
      build(),
      build({ MYEONGHA_DATABASE_URL: `postgresql://postgres:${secret}@${host}:6543/postgres` }),
    ]) {
      const serialized = JSON.stringify(verifyCloudflareDbHandoffV1(v));
      for (const forbidden of [secret, role, host, 'postgresql://', projectRef]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });
});
