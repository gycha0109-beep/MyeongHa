import { describe, expect, it, vi } from 'vitest';
import {
  STAGED_DB_KEYS_V1, prepareCloudflareDbCredentialStageV1,
  buildCloudflareDbCredentialBulkV1, stageCloudflareDbCredentialV1,
} from '../scripts/operations/stage-cloudflare-db-credential-version.mjs';

const origin = 'https://myeongha.gycha0109.workers.dev';
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
const password = 'synthetic-not-a-real-secret';
const template = () => ({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: host,
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '6543',
  MYEONGHA_DATABASE_URL: 'postgresql://myeongha_cf_api_login.cnsfpcdiyofqvhpcegfc:' +
    password + '@' + host + ':6543/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_cf_api_login',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: 'synthetic-ca',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 's'.repeat(40),
  MYEONGHA_GUEST_FINGERPRINT_SECRET: 'g'.repeat(40),
});
const config = { name: 'myeongha', workers_dev: true,
  main: './cloudflare/myeongha-worker.mjs' };
const reader = async () => JSON.stringify(config);
const proved = async () => ({ result: 'DB_AUTHENTICATED_READ_ONLY' });

describe('un-deployed Cloudflare DB credential stage boundary', () => {
  it('refuses to stage when actual dedicated DB login has not passed the live canary', async () => {
    const uploader = vi.fn();
    const state = await stageCloudflareDbCredentialV1({
      env: template(), apply: true, readFileImpl: reader, uploader,
      credentialVerifier: async () => ({ result: 'HOLD', code: 'DB_CONNECTION_OR_AUTH_FAILED' }),
    });
    expect(state).toMatchObject({
      result: 'HOLD', code: 'DB_CREDENTIAL_READ_ONLY_PROOF_MISSING',
      deploymentExecuted: false,
    });
    expect(uploader).not.toHaveBeenCalled();
  });

  it('only stages two exact DB binding names when the role matches', () => {
    const report = prepareCloudflareDbCredentialStageV1(template(), config);
    expect(report.result).toBe('READY_TO_STAGE_UNDEPLOYED');
    const bulk = buildCloudflareDbCredentialBulkV1(template());
    expect(Object.keys(bulk).sort()).toEqual([...STAGED_DB_KEYS_V1].sort());
    expect(Object.keys(bulk)).not.toContain('MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST');
  });
  it('never invokes upload without explicit --apply even if credentials exist', async () => {
    const uploader = vi.fn();
    const state = await stageCloudflareDbCredentialV1({
      env: template(), readFileImpl: reader, uploader,
    });
    expect(state.result).toBe('READY_TO_STAGE_UNDEPLOYED');
    expect(state.deploymentExecuted).toBe(false);
    expect(uploader).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain(password);
  });
  it('requires approved production Worker config and dedicated DB role', async () => {
    for (const invalid of [
      { env: template(), file: { ...config, name: 'another' } },
      { env: template(), file: { ...config, main: './other-worker.mjs' } },
      { env: { ...template(), MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime' }, file: config },
    ]) {
      const uploader = vi.fn();
      const state = await stageCloudflareDbCredentialV1({
        env: invalid.env, apply: true,
        readFileImpl: async () => JSON.stringify(invalid.file), uploader,
      });
      expect(state.result).toBe('HOLD');
      expect(uploader).not.toHaveBeenCalled();
    }
  });
  it('uploads only to the injected undeployed uploader and never deploys', async () => {
    const uploader = vi.fn(async () => {});
    const state = await stageCloudflareDbCredentialV1({
      env: template(), apply: true, readFileImpl: reader, uploader,
      credentialVerifier: proved,
    });
    expect(state.result).toBe('UNDEPLOYED_VERSION_STAGED');
    expect(state.deploymentExecuted).toBe(false);
    expect(uploader).toHaveBeenCalledTimes(1);
    const payload = uploader.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual([...STAGED_DB_KEYS_V1]);
    expect(JSON.stringify(state)).not.toContain(password);
  });
  it('maps thrown uploader errors to fixed codes without leaking secrets', async () => {
    const state = await stageCloudflareDbCredentialV1({
      env: template(), apply: true, readFileImpl: reader,
      credentialVerifier: proved,
      uploader: () => { throw new Error('SENSITIVE ' + password); },
    });
    expect(state).toMatchObject({ result: 'HOLD', code: 'UNDEPLOYED_SECRET_STAGE_FAILED' });
    expect(JSON.stringify(state)).not.toContain(password);
  });
});
