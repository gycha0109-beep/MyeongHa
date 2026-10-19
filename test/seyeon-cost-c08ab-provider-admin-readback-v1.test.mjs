import {describe,it,expect} from 'vitest';
import {auditSeyeonEvaluationProviderV1 as audit} from
 '../scripts/seyeon-cost-c08ab-provider-admin-readback-v1.mjs';

const projectId='proj_EVALUATION001';
const evaluationApiKeyId='key_EVALUATION001';
const fixed={adminApiKey:'admin-private-never-print-123456',
 projectId,evaluationApiKeyId,nowMs:Date.parse('2026-10-19T03:00:00Z')};
const project={id:projectId,name:'MyeongHa-Evaluation',
 object:'organization.project',status:'active',archived_at:null};
const key={id:evaluationApiKeyId,
 object:'organization.project.api_key',owner_project_access:'active',
 expires_at:null,redacted_value:'sk-DO-NOT-EMIT'};
const limit={object:'project.spend_limit',currency:'USD',interval:'month',
 threshold_amount:100,enforcement:{status:'enforcing'}};
const costs={object:'page',data:[{object:'bucket',
 start_time:1790812800,end_time:1790899200,
 results:[{object:'organization.costs.result',project_id:projectId,
 amount:{value:0.32,currency:'usd'}}]}],has_more:false,next_page:null};
function fake(override={}){
 const calls=[];
 const fetchImpl=async (url,init)=>{
  calls.push({url,method:init.method,body:init.body});
  const path=new URL(url).pathname;
  const kind=path.endsWith('/costs')?'costs':
   path.endsWith('/spend_limit')?'limit':
   path.endsWith('/api_keys/'+evaluationApiKeyId)?'key':'project';
  return new Response(JSON.stringify(override[kind]??({project,key,limit,costs})[kind]),
   {status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,fetchImpl};
}
describe('real OpenAI Admin API readback is local GET-only and never admits paid calls',()=>{
 it('missing credentials block without network',async()=>{
  const f=fake(),r=await audit({fetchImpl:f.fetchImpl});
  expect(f.calls).toHaveLength(0);
  expect(r.failureCode).toBe('ADMIN_READBACK_CREDENTIALS_MISSING');
  expect(r.paidDispatchEnabled).toBe(false);
 });
 it('uses exact active project, key ID, 100 CENT hard cap, UTC scoped project costs',async()=>{
  const f=fake(),r=await audit({...fixed,fetchImpl:f.fetchImpl});
  expect(r.readback).toBe('PROJECT_KEY_LIMIT_AND_COSTS_READ');
  expect(r.monthUtc).toBe('2026-10');
  expect(r.monthToDateUsd).toBe(0.32);
  expect(r.hardLimitReadback).toBe(true);
  expect(r.keyMembershipActive).toBe(true);
  expect(r.paidDispatchEnabled).toBe(false);
  expect(r.githubSecretKeyBindingVerified).toBe(false);
  expect(r.prior11InvoiceReconciled).toBe(false);
  expect(r.globalImmutableReservationVerified).toBe(false);
  expect(f.calls).toHaveLength(4);
  expect(f.calls.every(x=>x.method==='GET'&&!x.body&&
   new URL(x.url).origin==='https://api.openai.com')).toBe(true);
  const url=new URL(f.calls[3].url);
  expect(url.searchParams.get('start_time')).toBe('1790812800');
  expect(url.searchParams.get('group_by[]')).toBe('project_id');
  expect(url.searchParams.get('project_ids[]')).toBe(projectId);
  const printed=JSON.stringify(r);
  expect(printed).not.toContain(projectId);
  expect(printed).not.toContain(evaluationApiKeyId);
  expect(printed).not.toContain(fixed.adminApiKey);
  expect(printed).not.toContain('sk-DO-NOT-EMIT');
 });
 it('does not mistake a production project for an isolated evaluation project',async()=>{
  const f=fake({project:{...project,name:'MyeongHa'}});
  const r=await audit({...fixed,fetchImpl:f.fetchImpl});
  expect(r.failureCode).toBe('EVALUATION_PROJECT_MISMATCH');
  expect(f.calls).toHaveLength(1);
 });
 it('blocks inactive and expired project API keys',async()=>{
  for(const changed of [{owner_project_access:'inactive'},{expires_at:1}]){
   const f=fake({key:{...key,...changed}});
   const r=await audit({...fixed,fetchImpl:f.fetchImpl});
   expect(r.failureCode).toBe('EVALUATION_KEY_INACTIVE');
   expect(f.calls).toHaveLength(2);
  }
 });
 it('blocks alerts, missing enforcement, and a USD-versus-cents unit error',async()=>{
  for(const changed of [{threshold_amount:1},
    {enforcement:{status:'inactive'}},{enforcement:null}]){
   const f=fake({limit:{...limit,...changed}});
   const r=await audit({...fixed,fetchImpl:f.fetchImpl});
   expect(r.failureCode).toBe('USD1_HARD_LIMIT_NOT_ENFORCING');
   expect(f.calls).toHaveLength(3);
  }
 });
 it('cannot count an incomplete page or unattributed costs as zero',async()=>{
  for(const corrupted of [
   {...costs,has_more:true,next_page:null},
   {...costs,data:[{...costs.data[0],
     results:[{...costs.data[0].results[0],project_id:null}]}]},
   {...costs,data:[{...costs.data[0],
     results:[{...costs.data[0].results[0],
       amount:{value:-1,currency:'usd'}}]}]},
  ]){
   const f=fake({costs:corrupted});
   const r=await audit({...fixed,fetchImpl:f.fetchImpl});
   expect(r.readback).toBe('NOT_COMPLETED');
   expect(r.monthToDateUsd).toBeNull();
   expect(r.paidDispatchEnabled).toBe(false);
  }
 });
 it('redacts API errors and never trusts a failed readback',async()=>{
  const fetchImpl=async()=>new Response(
   JSON.stringify({error:{message:'sk-confidential-credential'}}),{status:403});
  const r=await audit({...fixed,fetchImpl});
  expect(r.failureCode).toBe('HTTP_REJECTED');
  expect(JSON.stringify(r)).not.toContain('confidential');
  expect(r.paidDispatchEnabled).toBe(false);
 });
});
