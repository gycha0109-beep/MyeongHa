// Watchtower-Track: character-memory
import {describe,it,expect} from 'vitest';
import {crosscheckSeyeonC08Prior11UsageCostV1 as check}
 from '../scripts/seyeon-c08-prior11-usage-cost-crosscheck-v1.mjs';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P}
 from '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const project='proj_historical_123456';
const keyId='key_legacy_123456';
const secret='sk-admin-synthetic-credential-999999999999';
const start=Date.parse('2026-10-16T00:00:00Z')/1000;
const cost=()=>({
 object:'page',has_more:false,next_page:null,
 data:[{object:'bucket',start_time:start,end_time:start+86400,
  results:[{object:'organization.costs.result',
   project_id:project,api_key_id:keyId,
   amount:{currency:'usd',value:0.003770}}],
 }],
});
const usageRow=(calls,attrs={})=>({
 object:'organization.usage.completions.result',
 project_id:project,api_key_id:keyId,model:P.model,
 num_model_requests:calls,input_tokens:1000,output_tokens:100,...attrs,
});
const usageBucket=(h,calls)=>({
 object:'bucket',start_time:start+h*3600,end_time:start+(h+1)*3600,
 results:calls===null?[]:[usageRow(calls)],
});
const usage=()=>({
 object:'page',has_more:false,next_page:null,
 data:Array.from({length:24},(_,h)=>usageBucket(h,h===3?5:h===6?6:null)),
});
const harness=(costBody=cost(),usageBody=usage())=>{
 const calls=[];
 const fetchImpl=async (url,options)=>{
  calls.push({url,options});
  return Response.json(calls.length===1?costBody:usageBody);
 };
 return {calls,fetchImpl};
};
const run=(h,fields={})=>check({
 adminKey:secret,historicalProjectId:project,historicalApiKeyId:keyId,
 fetchImpl:h.fetchImpl,...fields,
});

describe('Historical 11-call usage/cost dual-source readback remains non-authorizing',()=>{
 it('requires two GETs scoped to same historical key, project, model and UTC day',async()=>{
  const h=harness();
  const r=await run(h);
  expect(r).toMatchObject({
   status:'HISTORICAL_AGGREGATES_CORROBORATED_ONLY',
   expectedHistoricalRequests:11,observedProviderRequestCount:11,
   aggregateInputTokens:2000,aggregateOutputTokens:200,
   aggregateCostMicroUsd:3770,aggregateUseCorroborated:true,
   independentRequestReceiptsVerified:false,invoiceReconciled:false,
   actualBilledKrw:null,paidDispatchEnabled:false,
   productionPromotionPermitted:false,
  });
  expect(h.calls).toHaveLength(2);
  expect(h.calls.every(c=>c.options.method==='GET'
   &&c.options.redirect==='error')).toBe(true);
  const u=new URL(h.calls[1].url);
  expect(u.origin).toBe('https://api.openai.com');
  expect(u.pathname).toBe('/v1/organization/usage/completions');
  expect(u.searchParams.get('start_time')).toBe(String(start));
  expect(u.searchParams.get('end_time')).toBe(String(start+86400));
  expect(u.searchParams.get('bucket_width')).toBe('1h');
  expect(u.searchParams.getAll('project_ids[]')).toEqual([project]);
  expect(u.searchParams.getAll('api_key_ids[]')).toEqual([keyId]);
  // No models[] filter: otherwise the API would hide other-model charges.
  expect(u.searchParams.getAll('models[]')).toEqual([]);
  expect(u.searchParams.getAll('group_by[]')).toEqual(['project_id','api_key_id','model']);
  expect(JSON.stringify(r)).not.toContain(project);
  expect(JSON.stringify(r)).not.toContain(keyId);
  expect(JSON.stringify(r)).not.toContain(secret);
 });
 it('never calls the API when historical identity is unavailable or malformed',async()=>{
  const h=harness();
  for(const invalid of [
   {adminKey:''},{historicalProjectId:''},
   {historicalProjectId:'proj_../other'},
   {historicalApiKeyId:null},{historicalApiKeyId:'key_wrong?x=1'},
  ]){
   const r=await run(h,invalid);
   expect(r.status).toBe('HOLD');
   expect(r.invoiceReconciled).toBe(false);
  }
  expect(h.calls).toHaveLength(0);
 });
 it('halts after an invalid cost readback without querying the usage endpoint',async()=>{
  const h=harness({...cost(),has_more:true,next_page:'incomplete'});
  const r=await run(h);
  expect(r).toMatchObject({
   status:'HOLD',reason:'HISTORICAL_COST_EVIDENCE_INCOMPLETE',
   paidDispatchEnabled:false,
  });
  expect(h.calls).toHaveLength(1);
 });
 it('mismatched aggregate count is not evidence of eleven requests',async()=>{
  const bad=usage();bad.data[6].results[0].num_model_requests=7;
  const r=await run(harness(cost(),bad));
  expect(r).toMatchObject({
   status:'HOLD',reason:'HISTORICAL_PROVIDER_REQUEST_COUNT_MISMATCH',
   invoiceReconciled:false,actualBilledKrw:null,
  });
 });
 it('unattributed, wrong-model, duplicated and partial usage must hold',async()=>{
  const mutate=[
   u=>{u.data[3].results[0].api_key_id=null;},
   u=>{u.data[3].results[0].project_id='proj_wrong_123456';},
   u=>{u.data[3].results[0].model='unrelated-model';},
   u=>{u.data[3].results[0].input_tokens=-1;},
   u=>{u.data[3].results[0].output_tokens='100';},
   u=>{u.data[6].start_time=u.data[3].start_time;
        u.data[6].end_time=u.data[3].end_time;},
   u=>{u.data[0].start_time=start-3600;},
   u=>{u.data[0].end_time=start+1800;},
   u=>{u.data[3].results.push(usageRow(1));},
   u=>{u.has_more=true;u.next_page='next';},
   u=>{u.data=[];},
   u=>{u.data.splice(5,1);},
   u=>{u.data.reverse();},
  ];
  for(const change of mutate){
   const obj=usage();change(obj);
   const r=await run(harness(cost(),obj));
   expect(r.status).toBe('HOLD');
   expect(r.independentRequestReceiptsVerified).toBe(false);
   expect(r.invoiceReconciled).toBe(false);
  }
 });
 it('empty hours are permitted only when the complete day is accounted for',async()=>{
  const original=usage();
  expect(original.data).toHaveLength(24);
  expect(original.data.filter(b=>b.results.length===0)).toHaveLength(22);
  const r=await run(harness(cost(),original));
  expect(r.status).toBe('HISTORICAL_AGGREGATES_CORROBORATED_ONLY');
  expect(r.observedProviderRequestCount).toBe(11);
 });
 it('extra-model traffic cannot hide behind a model-specific filter',async()=>{
  const extra=usage();
  extra.data[9].results=[usageRow(1,{model:'other-model'})];
  const result=await run(harness(cost(),extra));
  expect(result).toMatchObject({
   status:'HOLD',reason:'HISTORICAL_OTHER_MODEL_ACTIVITY',
   invoiceReconciled:false,paidDispatchEnabled:false,
  });
 });
 it('server errors and non-JSON usage do not claim cost confirmation',async()=>{
  for(const response of [
   new Response('bad',{status:403}),
   new Response('not json',{status:200,headers:{'content-type':'application/json'}}),
   new Response('x'.repeat(128*1024+1),{status:200,headers:{'content-type':'application/json'}}),
  ]){
   const calls=[];
   const fetchImpl=async()=>{calls.push(true);return calls.length===1?Response.json(cost()):response;};
   const r=await check({adminKey:secret,historicalProjectId:project,
    historicalApiKeyId:keyId,fetchImpl});
   expect(r).toMatchObject({status:'HOLD',reason:'HISTORICAL_USAGE_READBACK_FAILED'});
   expect(calls).toHaveLength(2);
  }
 });
});
