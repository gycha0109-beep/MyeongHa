import {generateKeyPairSync,sign} from 'node:crypto';
import {afterEach,describe,it,expect,vi} from 'vitest';
import worker,{createAdminMemberAuthServiceFetchV1} from '../../cloudflare/admin-worker.mjs';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={MYEONGHA_ADMIN_PRIVATE_ENABLED:'false',
 MYEONGHA_ADMIN_ACCESS_ISSUER:'https://noisy-star-3d9a.cloudflareaccess.com',
 MYEONGHA_ADMIN_ACCESS_AUD:'a'.repeat(64),MYEONGHA_ADMIN_OWNER_EMAIL:'owner@example.test'};
function jwt(extra={}){
 const claims={iss:env.MYEONGHA_ADMIN_ACCESS_ISSUER,aud:[env.MYEONGHA_ADMIN_ACCESS_AUD],
  email:env.MYEONGHA_ADMIN_OWNER_EMAIL,exp:Math.floor(Date.now()/1000)+60,...extra};
 const data=[{alg:'RS256',kid:'test-key'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
}
afterEach(()=>vi.restoreAllMocks());
describe('scoped same-account Member authentication transport',()=>{
 it('permits only the original Member sign-in on the dedicated binding',async()=>{
  const url='https://myeongha.gycha0109.workers.dev/api/auth/sign-in';
  const called=[];
  const env={MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN:'https://myeongha.gycha0109.workers.dev',
    MEMBER_AUTH_SERVICE:{async fetch(input,init){called.push({input,method:init?.method});return Response.json({ok:false});}}};
  const fetchImpl=createAdminMemberAuthServiceFetchV1(env);
  expect((await fetchImpl(url,{method:'POST'})).status).toBe(200);
  expect(called).toEqual([{input:url,method:'POST'}]);
  expect(()=>fetchImpl(url.replace('sign-in','sign-out'),{method:'POST'})).toThrow();
  expect(()=>fetchImpl(url,{method:'GET'})).toThrow();
  expect(()=>createAdminMemberAuthServiceFetchV1({...env,MEMBER_AUTH_SERVICE:undefined})).toThrow();
  expect(()=>createAdminMemberAuthServiceFetchV1({...env,MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN:'https://other.example'})).toThrow();
 });
});
describe('inactive Worker verifies Access before its disabled boundary',()=>{
 it('denies anonymous and non-Owner requests without assets, bindings or SQL',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('unexpected network');});
  let io=0;
  const bindings={...env,get ADMIN_READ_HYPERDRIVE(){io++;throw Error('unexpected DB');},
   ASSETS:{fetch(){io++;throw Error('unexpected asset');}}};
  for(const path of ['/admin/','/admin/index.html','/admin/assets/app.js','/assets/app.js','/api/admin/session']){
   for(const token of [null,'invalid',jwt({email:'member@example.test'}),jwt({exp:1})]){
    const response=await worker.fetch(new Request('https://myeongha-admin.gycha0109.workers.dev'+path,
     {headers:token?{'cf-access-jwt-assertion':token}:{}}),bindings,{waitUntil(){io++;}});
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({error:'ADMIN_ACCESS_REQUIRED'});
   }
  }
  expect(io).toBe(0);expect(fetch).not.toHaveBeenCalled();
 });
 it('logs only safe, fixed denial categories in the disabled stage',async()=>{
  const diagnostic=vi.spyOn(console,'warn').mockImplementation(()=>{});
  await worker.fetch(new Request('https://myeongha-admin.gycha0109.workers.dev/admin/'),env,{});
  expect(diagnostic).toHaveBeenCalledWith('ADMIN_ACCESS_DIAGNOSTIC_V1',{
    source:'none',gateReason:'credential_missing_or_ambiguous',workerReason:'context_unavailable'});
  expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('owner@example.test');
 });
 it('uses only Cloudflare-verified Owner context when the JWT header is unavailable',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('unexpected network');});
  let io=0;
  const bindings={...env,get ADMIN_READ_HYPERDRIVE(){io++;throw Error('unexpected DB');},
    ASSETS:{fetch(){io++;throw Error('unexpected asset');}}};
  const request=new Request('https://myeongha-admin.gycha0109.workers.dev/admin/');
  const context=(aud,email)=>({access:{aud,getIdentity:async()=>({email})},waitUntil(){io++;}});
  const allowed=await worker.fetch(request,bindings,context(env.MYEONGHA_ADMIN_ACCESS_AUD,'OWNER@example.test'));
  expect(allowed.status).toBe(503);
  expect(await allowed.json()).toEqual({error:'ADMIN_PRIVATE_DISABLED'});
  for(const ctx of [
    context('wrong-audience','owner@example.test'),
    context(env.MYEONGHA_ADMIN_ACCESS_AUD,'other@example.test'),
    {access:{aud:env.MYEONGHA_ADMIN_ACCESS_AUD,getIdentity:async()=>{throw Error('not authenticated');}}},
    {access:{aud:env.MYEONGHA_ADMIN_ACCESS_AUD}},
    {access:{aud:env.MYEONGHA_ADMIN_ACCESS_AUD,getIdentity:async()=>null}},
  ]){
    const denied=await worker.fetch(request,bindings,ctx);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({error:'ADMIN_ACCESS_REQUIRED'});
  }
  expect(io).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
 });
 it('returns a distinct disabled response only for an actually signed Owner token',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({
   keys:[{...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig'}],
  }));
  let io=0;const bindings={...env,get ADMIN_READ_HYPERDRIVE(){io++;throw Error('unexpected DB');}};
  const response=await worker.fetch(new Request('https://myeongha-admin.gycha0109.workers.dev/api/admin/session',
   {headers:{'cf-access-jwt-assertion':jwt()}}),bindings,{waitUntil(){io++;}});
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:'ADMIN_PRIVATE_DISABLED'});
  expect(response.headers.get('cache-control')).toBe('no-store');expect(io).toBe(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  const parts=jwt().split('.');parts[2]='invalid-signature';
  const denied=await worker.fetch(new Request('https://myeongha-admin.gycha0109.workers.dev/admin/',
   {headers:{'cf-access-jwt-assertion':parts.join('.')}}),bindings,{waitUntil(){io++;}});
  expect(denied.status).toBe(403);expect(io).toBe(0);
 });
});
