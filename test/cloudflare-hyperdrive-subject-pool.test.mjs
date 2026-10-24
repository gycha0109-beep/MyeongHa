import { describe, expect, it } from 'vitest';
import { inspectCloudflareHyperdriveBindingV1 } from '../workers/cloudflare-hyperdrive-subject-pool.mjs';
const URL='postgresql://hyperdrive_user:local-only-fake-secret@database.hyperdrive.internal:5432/postgres';
const mode='approved-supabase-hyperdrive-v1';

describe('Cloudflare Hyperdrive optional subject transport',()=>{
 it('preserves direct strict-TLS mode until explicitly enabled',()=>{
  expect(inspectCloudflareHyperdriveBindingV1({})).toEqual({kind:'direct'});
  expect(inspectCloudflareHyperdriveBindingV1({
    MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:'direct-tls-v1',
  })).toEqual({kind:'direct'});
 });
 it('requires exact approved origin policy and runtime binding',()=>{
  for (const env of [
    {MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:'unsafe'},
    {MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:mode},
    {MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:mode,
      MYEONGHA_CLOUDFLARE_HYPERDRIVE_ORIGIN_POLICY:'supabase-verify-full-rls-v1'},
    {MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:mode,
      MYEONGHA_CLOUDFLARE_HYPERDRIVE_ORIGIN_POLICY:'allow-any-origin',
      HYPERDRIVE:{connectionString:URL}},
  ]) expect(()=>inspectCloudflareHyperdriveBindingV1(env)).toThrow();
 });
 it('accepts well-formed binding and rejects bad credentials/URI shape',()=>{
  const env={
    MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:mode,
    MYEONGHA_CLOUDFLARE_HYPERDRIVE_ORIGIN_POLICY:'supabase-verify-full-rls-v1',
    MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL:'myeongha_cf_hyperdrive_login',
  };
  expect(inspectCloudflareHyperdriveBindingV1({
    ...env,HYPERDRIVE:{connectionString:URL},
  })).toEqual({kind:'hyperdrive',connectionString:URL});
  expect(()=>inspectCloudflareHyperdriveBindingV1({
    ...env,MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL:'postgres',
    HYPERDRIVE:{connectionString:URL},
  })).toThrow();
  for(const input of [
    'http://user:password@somehost:5432/postgres',
    'postgresql://user@somehost:5432/postgres',
    'postgresql://somehost:5432/postgres',
    'postgresql://user:pass@somehost:5432/postgres#fragment',
  ])expect(()=>inspectCloudflareHyperdriveBindingV1({
    ...env,HYPERDRIVE:{connectionString:input},
  })).toThrow();
 });
});
