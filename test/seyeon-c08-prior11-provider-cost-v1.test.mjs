// Watchtower-Track: character-memory
import {describe,it,expect} from 'vitest';
import {inspectSeyeonC08Prior11ProviderCostV1 as read,
 C08_PRIOR11_DATE_UTC_V1,C08_PRIOR11_RUN_IDS_V1}
 from '../scripts/seyeon-c08-prior11-provider-cost-v1.mjs';

const historicalProjectId='proj_historical_123456';
const historicalApiKeyId='key_old_model_123456';
const adminKey='sk-admin-synthetic-credential-0001234567890';
const start=Date.parse('2026-10-16T00:00:00Z')/1000;
const end=start+86400;
const row=(value=0.001234,override={})=>({
 object:'organization.costs.result',
 project_id:historicalProjectId,
 api_key_id:historicalApiKeyId,
 amount:{currency:'usd',value},
 ...override,
});
const bucket=(rows=[row()],override={})=>({
 object:'bucket',start_time:start,end_time:end,results:rows,...override,
});
const page=(rows=[row()],override={})=>({
 object:'page',data:[bucket(rows)],has_more:false,next_page:null,...override,
});
function mockProvider(payload=page()){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return typeof payload==='function'?payload(url,options):Response.json(payload);
 };
 return {calls,fetchImpl};
}
const inspect=(t,override={})=>read({
 adminKey,historicalProjectId,historicalApiKeyId,fetchImpl:t.fetchImpl,
 ...override,
});

describe('C08 historical 11-call provider cost evidence: UTC-day aggregation ONLY',()=>{
 it('binds Oct 16 to original three run IDs and never claims invoice or paid approval',async()=>{
  expect(C08_PRIOR11_DATE_UTC_V1).toBe('2026-10-16');
  expect(C08_PRIOR11_RUN_IDS_V1).toEqual([
   38845185681,38854937049,38859692050,
  ]);
  const f=mockProvider(page([row(0.001234),row(0.002)]));
  const result=await inspect(f);
  expect(result).toMatchObject({
   status:'DAILY_AGGREGATE_ONLY',
   historicalDateUtc:'2026-10-16',
   expectedHistoricalRequests:11,
   historicalCostMicroUsd:3234,
   providerAggregateObserved:true,
   elevenRequestReceiptsVerified:false,
   invoiceReconciled:false,
   actualBilledKrw:null,
   paidDispatchEnabled:false,
   productionPromotionPermitted:false,
  });
  expect(JSON.stringify(result)).not.toContain(historicalProjectId);
  expect(JSON.stringify(result)).not.toContain(historicalApiKeyId);
  expect(JSON.stringify(result)).not.toContain(adminKey);
  expect(f.calls).toHaveLength(1);
  const [{url,options}]=f.calls;
  expect(url).toMatch(/^https:\/\/api\.openai\.com\/v1\/organization\/costs\?/u);
  expect(options.method).toBe('GET');
  expect(options.redirect).toBe('error');
  expect(options.headers.Authorization).toBe('Bearer '+adminKey);
  const q=new URL(url).searchParams;
  expect(q.get('start_time')).toBe(String(start));
  expect(q.get('end_time')).toBe(String(end));
  expect(q.get('bucket_width')).toBe('1d');
  expect(q.get('limit')).toBe('1');
  expect(q.getAll('project_ids[]')).toEqual([historicalProjectId]);
  expect(q.getAll('api_key_ids[]')).toEqual([historicalApiKeyId]);
  expect(q.getAll('group_by[]')).toEqual(['project_id','api_key_id']);
 });
 it('refuses missing historical identity, not silently using the new C08 project',async()=>{
  const f=mockProvider();
  for(const invalid of [
   {adminKey:''},
   {adminKey:'sk-short'},
   {historicalProjectId:'proj-bad'},
   {historicalProjectId:'https://evil.com'},
   {historicalApiKeyId:''},
   {historicalApiKeyId:'sk-proj-secret'},
   {historicalApiKeyId:'key_other?x=1'},
   {historicalApiKeyId:null},
  ]){
   const x=await inspect(f,invalid);
   expect(x.status).toBe('HOLD');
   expect(x.historicalCostMicroUsd).toBeNull();
   expect(x.invoiceReconciled).toBe(false);
   expect(x.paidDispatchEnabled).toBe(false);
  }
  expect(f.calls).toHaveLength(0);
 });
 it('rejects other project, other key, unknown attribution and wrong amount',async()=>{
  for(const altered of [
   row(0.1,{project_id:'proj_foreign_987654'}),
   row(0.1,{api_key_id:'key_other_987654'}),
   row(0.1,{api_key_id:null}),
   row(0.1,{amount:{currency:'krw',value:0.1}}),
   row(0.1,{amount:{currency:'usd',value:-0.1}}),
   row(0.1,{amount:{currency:'usd',value:'0.1'}}),
   row(0.1,{amount:{currency:'usd',value:Infinity}}),
   row(0.1,{object:'organization.usage.completions.result'}),
  ]){
   const result=await inspect(mockProvider(page([altered])));
   expect(result).toMatchObject({
    status:'HOLD',reason:'HISTORICAL_COST_ATTRIBUTION_INVALID',
    historicalCostMicroUsd:null,invoiceReconciled:false,
   });
  }
 });
 it('holds missing, partial, duplicate and out-of-date daily buckets',async()=>{
  for(const bad of [
   page([]),
   page([row()],{data:[]}),
   page([row()],{data:[bucket(),bucket()]}),
   page([row()],{has_more:true,next_page:'page2'}),
   page([row()],{next_page:'unexpected'}),
   page([row()],{data:[bucket([row()],{start_time:start+86400})]}),
   page([row()],{data:[bucket([row()],{end_time:end+86400})]}),
   page([row()],{data:[bucket([row()],{start_time:start-86400})]}),
   {...page(),object:'not_page'},
  ]){
   const result=await inspect(mockProvider(bad));
   expect(result.status).toBe('HOLD');
   expect(result.invoiceReconciled).toBe(false);
  }
 });
 it('does not turn zero aggregate into eleven reconciled invoices',async()=>{
  const result=await inspect(mockProvider(page([row(0)])));
  expect(result).toMatchObject({
   status:'DAILY_AGGREGATE_ONLY',historicalCostMicroUsd:0,
   elevenRequestReceiptsVerified:false,invoiceReconciled:false,
   actualBilledKrw:null,paidDispatchEnabled:false,
  });
 });
 it('holds non-200, broken JSON and oversized provider responses',async()=>{
  const transports=[
   async()=>new Response(null,{status:403}),
   async()=>new Response('invalid json',{status:200,headers:{
    'content-type':'application/json',
   }}),
   async()=>new Response('x'.repeat(128*1024+1),{
    status:200,headers:{'content-type':'application/json'},
   }),
   async()=>new Response(JSON.stringify(page()),{
    status:200,headers:{'content-type':'text/html'},
   }),
  ];
  for(const fetchImpl of transports){
   const x=await inspect({fetchImpl});
   expect(x).toMatchObject({
    status:'HOLD',reason:'HISTORICAL_COST_GET_FAILED',
    paidDispatchEnabled:false,
   });
  }
 });
});
