// Watchtower-Track: character-memory
import {describe,it,expect} from 'vitest';
import {inspectSeyeonC08AdminSpendReadinessV1 as check}
 from '../scripts/seyeon-c08-admin-spend-readiness-v1.mjs';
const projectId='proj_testing_123456';
const adminKey='sk-admin-synthetic-not-a-real-secret-1234567890';
const now=new Date('2026-11-11T09:00:00Z');
const project=()=>({
 object:'organization.project',id:projectId,status:'active',archived_at:null,
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
