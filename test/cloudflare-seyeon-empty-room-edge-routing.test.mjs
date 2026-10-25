// Watchtower-Track: security
import {describe,expect,it,vi} from 'vitest';

vi.mock('../workers/cloudflare-auth-db-api.mjs', async(importOriginal)=>({
  ...await importOriginal(),
  approvedCloudflareAuthOriginV1:()=> 'https://worker-preview.example.test',
  approvedCloudflareStage5HandoffV1:()=>true,
  approvedCloudflareSameOriginPostV1:()=>true,
}));
import {tryHandleCloudflareSeyeonSecurityV1}
  from '../workers/cloudflare-seyeon-security.mjs';

const ID='123e4567-e89b-42d3-a456-426614174000';
const URL='https://worker-preview.example.test/api/chat/'+ID;
const request=(method='GET',suffix='')=>new Request(URL+suffix,{
  method,...(method==='POST'?{headers:{'Content-Type':'application/json'},
    body:JSON.stringify({clientTurnId:ID,text:'synthetic test'})}:{}),
});
function setup(verdict){
  const close=vi.fn(async()=>{});
  const scope=vi.fn(async()=>verdict);
  const createSubjectScope=vi.fn(()=>({
    pool:{},identityEvidenceVerifier:{},close,
  }));
  return {close,scope,createSubjectScope};
}
describe('S0 Worker ingress never equates an empty shell with History permission',()=>{
  it('hands exact, owner-checked empty GET to the separately authorized reader',async()=>{
    const d=setup({kind:'seyeon_empty_thread_requires_ops_reauthorization',threadId:ID});
    const response=await tryHandleCloudflareSeyeonSecurityV1(request(),{},{
      id:'rewrite.chat.thread',
    },d);
    expect(response).toBeNull();
    expect(d.scope).toHaveBeenCalledTimes(1);
    expect(d.close).toHaveBeenCalledTimes(1);
  });
  it('never admits a paid send even if a future scope returns the empty marker incorrectly',async()=>{
    const d=setup({kind:'seyeon_empty_thread_requires_ops_reauthorization',threadId:ID});
    const response=await tryHandleCloudflareSeyeonSecurityV1(request('POST','/turns'),{},{
      id:'rewrite.chat.turns',
    },d);
    expect(response?.status).toBe(503);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(d.close).toHaveBeenCalledTimes(1);
  });
  it.each([
    {kind:'seyeon_protected_held',threadId:ID},
    {kind:'seyeon_empty_thread_requires_ops_reauthorization',threadId:'223e4567-e89b-42d3-a456-426614174000'},
    {kind:'denied'},
  ])('holds protected, mismatched and unknown authority responses',async(verdict)=>{
    const d=setup(verdict);
    const response=await tryHandleCloudflareSeyeonSecurityV1(request(),{},{
      id:'rewrite.chat.thread',
    },d);
    expect(response?.status).toBe(503);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(d.close).toHaveBeenCalledTimes(1);
  });
});
