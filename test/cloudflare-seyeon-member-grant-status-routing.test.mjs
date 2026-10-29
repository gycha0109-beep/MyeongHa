import {afterEach,describe,expect,it,vi} from 'vitest';

const status=vi.fn(async()=>Response.json({
  ok:true,data:{memoryItemId:'a8100000-0000-4000-8000-000000000001',
    characterId:'seyeon',currentlyGranted:false,grantedAt:null},
  meta:{apiContractVersion:'v0.9',requestId:'synthetic',
    serverTime:'2026-10-29T00:00:00Z'},
},{headers:{'Cache-Control':'no-store'}}));
vi.mock('../cloudflare/seyeon-member-grant-status.mjs',()=>({
  handleCloudflareSeyeonMemberGrantStatusV1:status,
}));
const worker=await import('../cloudflare/myeongha-worker.mjs');
const origin='https://myeongha.gycha0109.workers.dev';
const memory='a8100000-0000-4000-8000-000000000001';
const env=()=>({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE:'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN:origin,
  MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN:origin,
  CF_VERSION_METADATA:{id:'11111111-2222-4333-8444-555555555555'},
});
afterEach(()=>vi.clearAllMocks());

describe('primary Worker Member Memory grant status routing',()=>{
  it('routes only canonical GET without a query to the read-only authority',async()=>{
    const res=await worker.default.fetch(new Request(origin+'/api/memories/'+memory+'/grants/seyeon'),env(),{});
    expect(res.status).toBe(200);
    expect(res.headers.get('x-myeongha-worker-version')).toBe(env().CF_VERSION_METADATA.id);
    expect(status).toHaveBeenCalledTimes(1);
    expect(status.mock.calls[0][0].method).toBe('GET');
  });
  it('does not call the authority for query markers, malformed IDs or external origins',async()=>{
    for(const url of [
      origin+'/api/memories/'+memory+'/grants/seyeon?__myeongha_seyeon_memory_grant_status_id='+memory,
      origin+'/api/memories/not-a-uuid/grants/seyeon',
      origin+'/api/memories/'+memory+'/grants/seyeon/extra',
      'https://untrusted.example.com/api/memories/'+memory+'/grants/seyeon',
    ]){
      const res=await worker.default.fetch(new Request(url),env(),{});
      expect(res.status).not.toBe(200);
    }
    expect(status).not.toHaveBeenCalled();
  });
  it('keeps missing binding requests outside the read-only authority',async()=>{
    const res=await worker.default.fetch(new Request(origin+'/api/memories/'+memory+'/grants/seyeon'),{},{});
    expect(res.status).not.toBe(200);
    expect(status).not.toHaveBeenCalled();
  });
});
