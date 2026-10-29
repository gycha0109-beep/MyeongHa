import {describe,it,expect,vi} from 'vitest';
import {verifyAdminAccessPolicyV1} from './access-policy-preflight.mjs';
const appId='3a376a53-ad4d-4a07-9fa0-cd55cb0cb62f';
const policyId='ebc2dd30-46de-491b-ac90-47629ca46f31';
const owner='owner@example.test';
const audience='a'.repeat(64);
const accountId='b'.repeat(32);
const app={id:appId,name:'MyeongHa Admin Owner Only',
  domain:'myeongha-admin.gycha0109.workers.dev',type:'self_hosted',
  aud:audience,policies:[{id:policyId,decision:'allow',name:'Owner email only'}]};
const policy={id:policyId,name:'Owner email only',decision:'allow',
  include:[{email:{email:owner}}],exclude:[],require:[]};

function fixture(apps=[app],policies=[policy],ok=true){
  const requests=[];
  const fetchImpl=vi.fn(async(url,init)=>{
    requests.push({url,method:init.method,redirect:init.redirect,
      auth:typeof init.headers.Authorization==='string'});
    return{ok,status:ok?200:403,
      async json(){return{success:ok,result:String(url).endsWith('/policies')?policies:apps}}};
  });
  const execute=()=>verifyAdminAccessPolicyV1({
    accountId,apiToken:'test-scoped-access-token-123',audience,ownerEmail:owner,fetchImpl,
  });
  return{execute,requests,fetchImpl};
}
describe('live Access Owner-only policy deployment gate',()=>{
  it('admits only the matching private Access app, exact AUD, one email and one allow policy',async()=>{
    const f=fixture();
    expect(await f.execute()).toEqual({appVerified:true,ownerOnlyVerified:true});
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/'+accountId+'/access/apps');
    expect(f.requests[1].url).toMatch(/\/access\/apps\/[0-9a-f-]+\/policies$/u);
    expect(f.requests.every(x=>x.method==='GET'&&x.redirect==='error'&&x.auth)).toBe(true);
  });
  it('rejects a different audience or wrong/multiple app identities',async()=>{
    for(const apps of [
      [{...app,aud:'f'.repeat(64)}],
      [{...app,domain:'myeongha.gycha0109.workers.dev'}],
      [app,app],
      [],
    ])await expect(fixture(apps).execute()).rejects.toThrow('identity mismatch');
  });
  it('refuses broad, additional, expired or mismatched policies',async()=>{
    for(const policies of [
      [{...policy,include:[{everyone:{}}]}],
      [{...policy,include:[{email:{email:'other@example.test'}}]}],
      [{...policy,include:[{email:{email:owner}},{everyone:{}}]}],
      [{...policy,exclude:[{ip:{ip:'1.1.1.1'}}]}],
      [{...policy,decision:'bypass'}],
      [policy,{...policy,id:'7'.repeat(8)+'-aaaa-4aaa-8aaa-'+'a'.repeat(12)}],
      [],
    ])await expect(fixture([app],policies).execute()).rejects.toThrow('Owner allow policy');
  });
  it('refuses a missing source or unauthorized Cloudflare API without echoing credentials',async()=>{
    await expect(fixture([app],[policy],false).execute()).rejects.toThrow('readback unavailable');
    const error=await verifyAdminAccessPolicyV1({
      accountId:'not-a-real-account',apiToken:'sensitive-token-abc',
      audience,ownerEmail:owner,fetchImpl:async()=>{throw Error('Unexpected call');},
    }).then(()=>null,e=>e);
    expect(error?.message).toContain('configuration unavailable');
    expect(String(error)).not.toContain('sensitive-token');
    expect(String(error)).not.toContain(owner);
  });
});
