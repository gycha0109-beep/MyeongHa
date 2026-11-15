// Watchtower-Track: character-memory
import {describe,it,expect} from 'vitest';
import {inspectSeyeonC08AdminSpendReadinessV1 as check}
 from '../scripts/seyeon-c08-admin-spend-readiness-v1.mjs';
const projectId='proj_testing_123456';
const adminKey='sk-admin-synthetic-not-a-real-secret-1234567890';
const now=new Date('2026-11-11T09:00:00Z');
const project=()=>({
 object:'organization.project',id:projectId,name:'MyeongHa-Evaluation',
 status:'active',archived_at:null,
});
const cap=(status='enforcing',cents=100)=>({
 object:'project.spend_limit',currency:'USD',interval:'month',
 threshold_amount:cents,enforcement:{status},
});
const bucket=(value,override={})=>({
 object:'bucket',start_time:1793491200,end_time:1793577600,
 results:[{object:'organization.costs.result',
  project_id:projectId,amount:{currency:'usd',value},...override}],
});
const page=(value=0,more=false,cursor=null)=>({
 object:'page',data:[bucket(value)],has_more:more,next_page:cursor,
});
const reply=v=>Response.json(v);
const fake=(limit=cap(),cost=page(),currentProject=project())=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,method:opts.method,redirect:opts.redirect});
  if(calls.length===1)return reply(currentProject);
  if(calls.length===2)return reply(limit);
  return reply(typeof cost==='function'?cost(calls.length,url):cost);
 };
 return {fetchImpl,calls};
};
const run=(f,fields={})=>check({
 projectId,adminKey,now,fetchImpl:f.fetchImpl,...fields,
});
describe('C08 actual Admin GET hard-limit and current-cost readiness (never paid admission)',()=>{
 it('uses only two scoped GETs, reports redacted cost and never authorizes paid dispatch',async()=>{
  const f=fake(cap(),page(0.25));
  const x=await run(f);
  expect(x).toMatchObject({
   status:'ADMIN_READBACK_ONLY',projectActiveVerified:true,projectHardLimitVerified:true,
   monthSpendReadbackComplete:true,monthSpendMicroUsd:250000,
   remainingUnderProjectLimitMicroUsd:750000,
   projectCredentialBindingVerified:false,invoiceReconciled:false,
   crossRunPaidReservationVerified:false,paidDispatchEnabled:false,
  });
  expect(f.calls).toHaveLength(3);
  expect(f.calls.every(c=>c.method==='GET'&&c.redirect==='error')).toBe(true);
  expect(f.calls[0].url).toBe(
   'https://api.openai.com/v1/organization/projects/'+projectId);
  expect(f.calls[1].url).toBe(
   'https://api.openai.com/v1/organization/projects/'+projectId+'/spend_limit');
  const url=new URL(f.calls[2].url);
  expect(url.pathname).toBe('/v1/organization/costs');
  expect(url.searchParams.getAll('project_ids[]')).toEqual([projectId]);
  expect(url.searchParams.getAll('group_by[]')).toEqual(['project_id']);
  expect(url.searchParams.get('start_time')).toBe('1793491200');
  expect(JSON.stringify(x)).not.toContain(projectId);
  expect(JSON.stringify(x)).not.toContain(adminKey);
 });
 it('rejects archived, mismatched and unverified projects before any spend API request',async()=>{
  for(const bad of [
   {...project(),status:'archived'},
   {...project(),archived_at:1793491200},
   {...project(),id:'proj_foreign_999999'},
   {...project(),object:'not_a_project'},
   {...project(),name:'Another-Evaluation'},
   {...project(),name:null},
  ]){
   const f=fake(cap(),page(),bad);
   const outcome=await run(f);
   expect(outcome).toMatchObject({
    status:'HOLD',reason:'PROJECT_NOT_ACTIVE_OR_MISMATCHED',
    projectActiveVerified:false,paidDispatchEnabled:false,
   });
   expect(f.calls).toHaveLength(1);
   expect(f.calls[0].method).toBe('GET');
  }
 });
 it('requires the real enforced hard spend limit, not a spend alert',async()=>{
  for(const limit of [cap('inactive'),cap('enforcing',250),
   {...cap(),currency:'KRW'}, {...cap(),object:'project.spend_alert'},
   {...cap(),enforcement:{status:'active'}},cap('enforcing',0)]){
   const f=fake(limit);
   const x=await run(f);
   expect(x.status).toBe('HOLD');
   expect(x.reason).toBe('HARD_LIMIT_MISSING_OR_NOT_ONE_USD_ENFORCED');
   expect(f.calls).toHaveLength(2);
  }
 });
 it('holds absent admin privilege/project and never calls a provider',async()=>{
  const f=fake();
  expect((await run(f,{adminKey:''})).reason).toBe('ADMIN_CREDENTIAL_OR_PROJECT_MISSING');
  expect((await run(f,{projectId:'https://evil.test/x'})).reason).toBe('ADMIN_CREDENTIAL_OR_PROJECT_MISSING');
  expect(f.calls).toHaveLength(0);
 });
 it('fails closed on foreign project cost attribution, invalid currencies and negative spend',async()=>{
  for(const bad of [
   {project_id:'proj_other_123456'},
   {amount:{currency:'krw',value:0.1}},
   {amount:{currency:'usd',value:-1}},
   {amount:{currency:'usd',value:NaN}},
  ]){
   const f=fake(cap(),{...page(),data:[bucket(0.5,bad)]});
   expect((await run(f)).reason).toBe('MONTH_COST_IDENTITY_OR_AMOUNT_INVALID');
  }
 });
 it('sums every page, rejects repeated cursors and incomplete pagination',async()=>{
  const f=fake(cap(),(n)=>{
   if(n===3)return page(0.1,true,'cursor_two');
   return page(0.2,false,null);
  });
  const x=await run(f);
  expect(x.monthSpendMicroUsd).toBe(300000);
  expect(f.calls).toHaveLength(4);
  expect(new URL(f.calls[3].url).searchParams.get('page')).toBe('cursor_two');
  const repeated=fake(cap(),()=>page(0.1,true,'dup'));
  expect((await run(repeated)).reason).toBe('MONTH_COST_PAGINATION_INCOMPLETE');
 });
 it('holds an insufficient USD $1 limit headroom without authorizing paid calls',async()=>{
  const x=await run(fake(cap(),page(0.99)));
  expect(x).toMatchObject({
   status:'HOLD',reason:'INSUFFICIENT_PROJECT_LIMIT_HEADROOM',
   projectHardLimitVerified:true,monthSpendReadbackComplete:true,
   paidDispatchEnabled:false,
  });
 });
 it('holds HTTP failure, malformed costs, and clock changes safely',async()=>{
  const no=await run({fetchImpl:async()=>new Response(null,{status:403})});
  expect(no.reason).toBe('PROJECT_READBACK_FAILED');
  expect((await run(fake(cap(),{object:'not_a_page'}))).reason).toBe(
   'MONTH_COST_SHAPE_MISMATCH');
  expect((await run(fake(),{now:new Date('invalid')})).reason).toBe(
   'CLOCK_UNAVAILABLE');
 });
});

describe('C08 optional project-key metadata readback remains non-authorizing',()=>{
 const keyId='key_eval_readonly_123456';
 const record=()=>({
  object:'organization.project.api_key',id:keyId,
  owner_project_access:'active',created_at:1793300000,
  redacted_value:'sk-private...masked',
  owner:{type:'service_account',service_account:{id:'svc_acct_private_123'}},
 });
 const withKey=(keyResponse=record())=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{
   calls.push({url,method:opts.method,redirect:opts.redirect});
   if(calls.length===1)return reply(project());
   if(calls.length===2)return reply(keyResponse);
   if(calls.length===3)return reply(cap());
   if(calls.length===4)return reply(page(0.1));
   throw Error('unexpected extra GET');
  };
  return {fetchImpl,calls};
 };
 it('reads project-owned active key metadata only and does not claim secret binding',async()=>{
  const f=withKey();
  const result=await run(f,{evaluationKeyId:keyId});
  expect(result).toMatchObject({
   status:'ADMIN_READBACK_ONLY',projectKeyMetadataVerified:true,
   projectCredentialBindingVerified:false,invoiceReconciled:false,
   paidDispatchEnabled:false,monthSpendMicroUsd:100000,
  });
  expect(f.calls).toHaveLength(4);
  expect(f.calls.every(c=>c.method==='GET'&&c.redirect==='error')).toBe(true);
  expect(f.calls[1].url).toBe(
   'https://api.openai.com/v1/organization/projects/'+projectId+
   '/api_keys/'+keyId);
  expect(JSON.stringify(result)).not.toContain(keyId);
  expect(JSON.stringify(result)).not.toContain('private');
 });
 it('rejects inactive, foreign, malformed or missing key metadata before cost reads',async()=>{
  for(const bad of [
   {...record(),id:'key_other_987654'},
   {...record(),owner_project_access:'inactive'},
   {...record(),owner_project_access:null},
   {...record(),created_at:'1793300000'},
   {...record(),created_at:1794387601},
   {...record(),expires_at:1794387599},
   {...record(),expires_at:1794387600},
   {...record(),expires_at:'1794389999'},
   {...record(),expires_at:1793299999},
   {...record(),owner:{type:'user',user:{id:'svc_acct_invalid'}}},
   {...record(),owner:{type:'service_account',service_account:{id:'user_invalid'}}},
   {...record(),owner:{type:'unknown'}},
   {...record(),object:'organization.project'},
  ]){
   const f=withKey(bad);
   const result=await run(f,{evaluationKeyId:keyId});
   expect(result).toMatchObject({status:'HOLD',
    reason:'PROJECT_KEY_INACTIVE_OR_MISMATCHED',
    paidDispatchEnabled:false,projectKeyMetadataVerified:false});
   expect(f.calls).toHaveLength(2);
  }
 });
 it('accepts genuinely unexpired project keys but never grants billable dispatch',async()=>{
  const f=withKey({...record(),expires_at:1794387601});
  const x=await run(f,{evaluationKeyId:keyId});
  expect(x).toMatchObject({
   status:'ADMIN_READBACK_ONLY',projectKeyMetadataVerified:true,
   projectCredentialBindingVerified:false,paidDispatchEnabled:false,
  });
  expect(f.calls).toHaveLength(4);
  const noExpiry=withKey({...record(),expires_at:null});
  const y=await run(noExpiry,{evaluationKeyId:keyId});
  expect(y.projectKeyMetadataVerified).toBe(true);
  expect(y.paidDispatchEnabled).toBe(false);
 });
 it('rejects malformed key ID without any remote read',async()=>{
  const f=withKey();
  for(const bad of ['key_../other','sk-live-secret','key_x?owner=1','key_한글',17]){
   const result=await run(f,{evaluationKeyId:bad});
   expect(result).toMatchObject({
    status:'HOLD',reason:'EVALUATION_KEY_ID_INVALID',
    paidDispatchEnabled:false});
  }
  expect(f.calls).toHaveLength(0);
 });
 it('holds an Admin key metadata HTTP error without reading costs',async()=>{
  const calls=[];
  const f={fetchImpl:async(url,opts)=>{
   calls.push({url,method:opts.method});
   return calls.length===1?reply(project()):new Response(null,{status:403});
  }};
  const result=await run(f,{evaluationKeyId:keyId});
  expect(result.reason).toBe('PROJECT_KEY_READBACK_FAILED');
  expect(result.paidDispatchEnabled).toBe(false);
  expect(calls).toHaveLength(2);
 });
 it('does not require key metadata to preserve independent existing spending diagnosis',async()=>{
  const f=fake(cap(),page(0.1));
  const result=await run(f);
  expect(result).toMatchObject({
   status:'ADMIN_READBACK_ONLY',projectKeyMetadataVerified:false,
   projectCredentialBindingVerified:false,paidDispatchEnabled:false,
  });
  expect(f.calls).toHaveLength(3);
 });
});
