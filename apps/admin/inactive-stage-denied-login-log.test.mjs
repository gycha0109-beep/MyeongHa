import {describe,it,expect} from 'vitest';
import {verifyInactiveAdminDeniedLoginLogV1 as verify} from './inactive-stage-denied-login-log.mjs';

const app='3a376a53-ad4d-4a07-9fa0-cd55cb0cb62f';
const owner='owner@example.test',other='not-owner@example.test';
const since='2026-11-04T05:00:00.000Z',until='2026-11-04T05:10:00.000Z';
const input={accountId:'410d3f82ed3ccc66609a2b698803859b',
 apiToken:'test-token-not-a-real-secret',ownerEmail:owner,nonOwnerEmail:other,since,until};
const event=(overrides={})=>({
 app_uid:app,action:'login',user_email:other,allowed:false,
 created_at:'2026-11-04T05:03:00Z',...overrides,
});
const remote=(items)=>async(url,options)=>{
 const parsed=new URL(url);
 expect(parsed.pathname).toContain('/access/logs/access_requests');
 expect(parsed.searchParams.get('email')).toBe(other);
 expect(parsed.searchParams.get('emailOp')).toBe('eq');
 expect(options.redirect).toBe('manual');
 expect(options.cache).toBe('no-store');
 return Response.json({success:true,result:items});
};
describe('real non-Owner Access log proof for the inactive admin stage',()=>{
 it('accepts only a logged denial for the exact app, identity and 30-minute window',async()=>{
  const result=await verify({...input,fetchImpl:remote([event()])});
  expect(result).toMatchObject({nonOwnerAccessLoginDenied:true,deniedLoginEvents:1,
   identityVerifiedByCloudflareLogs:true,ownerAccessVerified:false,
   memberAuthenticationVerified:false,productionReadsVerified:false,activationEnabled:false});
  expect(JSON.stringify(result)).not.toContain(other);
 });
 it('rejects wrong app, wrong user, irrelevant event and stale record',async()=>{
  for(const e of [
   event({app_uid:'some-other-app'}),
   event({user_email:'random@example.test'}),
   event({action:'logout'}),
   event({created_at:'2026-11-04T04:59:00Z'}),
  ])await expect(verify({...input,fetchImpl:remote([e])})).rejects.toThrow('not yet observed');
 });
 it('fails closed if any authenticated grant to the non-Owner is found',async()=>{
  await expect(verify({...input,fetchImpl:remote([event(),event({allowed:true})])}))
   .rejects.toThrow('unexpectedly allowed');
 });
 it('rejects absent session evidence, invented identities and invalid windows',async()=>{
  for(const changes of [
   {nonOwnerEmail:owner},
   {apiToken:''},
   {since:'2026-11-04T04:00:00.000Z'},
   {until:'2026-11-04T04:00:00.000Z'},
  ])await expect(verify({...input,...changes,fetchImpl:()=>{throw Error('Must not fetch');}}))
   .rejects.toThrow();
  await expect(verify({...input,fetchImpl:remote([])})).rejects.toThrow('not yet observed');
 });
 it('never leaks remote error content or identity in failure messages',async()=>{
  await expect(verify({...input,fetchImpl:async()=>new Response('sensitive-provider-body',{status:403})}))
   .rejects.toThrow('unavailable');
  try{await verify({...input,fetchImpl:async()=>{throw Error('private JWT');}});}
  catch(error){expect(String(error)).not.toContain('private JWT');expect(String(error)).not.toContain(other);}
 });
});
