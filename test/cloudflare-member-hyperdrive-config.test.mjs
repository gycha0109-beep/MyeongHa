// Watchtower-Track: ops
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {
  CLOUDFLARE_HYPERDRIVE_MODE_V1,
  inspectCloudflareHyperdriveBindingV1,
} from '../workers/cloudflare-hyperdrive-subject-pool.mjs';

const cfg=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const mockOrigin='postgresql://test-login:synthetic-not-a-secret@hyperdrive.example:5432/postgres';

describe('ordinary authenticated Member transport',()=>{
  it('binds one pinned isolated Hyperdrive, preserving both separate S0 origins',()=>{
    const ids=new Map(cfg.hyperdrive.map(x=>[x.binding,x.id]));
    expect(ids.size).toBe(3);
    expect(ids.get('HYPERDRIVE')).toBe('1ffe61390c064c0480a0a1e933e4d2c9');
    expect(ids.get('SEYEON_SUBJECT_HYPERDRIVE')).toBe('8ee320f55db94f66b2681fcc43995219');
    expect(ids.get('SEYEON_GOVERNED_HYPERDRIVE')).toBe('64e88db2afcd4118afe1fe29bdf31742');
    expect(new Set(ids.values()).size).toBe(3);
    expect(cfg.compatibility_flags).toContain('nodejs_compat');
  });
  it('selects the existing separately governed login, not the ordinary direct secret or S0 roles',()=>{
    expect(cfg.vars).toEqual({
      MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:CLOUDFLARE_HYPERDRIVE_MODE_V1,
      MYEONGHA_CLOUDFLARE_HYPERDRIVE_ORIGIN_POLICY:'supabase-verify-full-rls-v1',
      MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL:'myeongha_cf_hyperdrive_login',
    });
    expect(inspectCloudflareHyperdriveBindingV1({
      ...cfg.vars,HYPERDRIVE:{connectionString:mockOrigin},
    })).toEqual({kind:'hyperdrive',connectionString:mockOrigin});
    expect(()=>inspectCloudflareHyperdriveBindingV1({
      ...cfg.vars,HYPERDRIVE:{},
    })).toThrow('Missing Hyperdrive runtime binding');
    expect(()=>inspectCloudflareHyperdriveBindingV1({
      ...cfg.vars,MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL:'myeongha_cf_api_login',
      HYPERDRIVE:{connectionString:mockOrigin},
    })).toThrow('Unexpected Hyperdrive login role');
  });
});
