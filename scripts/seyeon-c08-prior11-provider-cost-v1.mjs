// Watchtower-Track: character-memory
/**
 * Read-only provider aggregate for the already observed 11 C06/F01/C07
 * requests dated 2026-10-16 UTC. An aggregate is NEVER an individual
 * provider invoice or 11 independent billable request receipts.
 *
 * Separate historical project/key identity is REQUIRED; do not silently
 * substitute the NEW C08-T evaluation project or its secret.
 */
import {pathToFileURL} from 'node:url';

export const C08_PRIOR11_DATE_UTC_V1='2026-10-16';
export const C08_PRIOR11_RUN_IDS_V1=Object.freeze([
 38845185681,38854937049,38859692050,
]);
const BASE='https://api.openai.com/v1/organization/costs';
const PROJECT=/^proj_[A-Za-z0-9_-]{6,128}$/u;
const KEY=/^key_[A-Za-z0-9_-]{3,128}$/u;
const DAY_START=Date.parse('2026-10-16T00:00:00.000Z')/1000;
const DAY_END=Date.parse('2026-10-17T00:00:00.000Z')/1000;
const MAX_BYTES=128*1024;
const hold=reason=>Object.freeze({
 schemaVersion:'seyeon-c08-prior11-provider-cost-readback-v1',
 status:'HOLD',reason,
 historicalDateUtc:C08_PRIOR11_DATE_UTC_V1,
 expectedHistoricalRequests:11,
 historicalCostMicroUsd:null,
 providerAggregateObserved:false,
 elevenRequestReceiptsVerified:false,
 invoiceReconciled:false,
 actualBilledKrw:null,
 paidDispatchEnabled:false,
 productionPromotionPermitted:false,
});
async function boundedJson(res){
 if(res?.status!==200||!res.body||
    !res.headers?.get('content-type')?.toLowerCase().includes('application/json'))
  throw Error('BAD_HTTP');
 const reader=res.body.getReader();
 const chunks=[];let bytes=0;
 try{
  for(;;){
   const part=await reader.read();
   if(part.done)break;
   bytes+=part.value.byteLength;
   if(bytes>MAX_BYTES)throw Error('BODY_OVER_LIMIT');
   chunks.push(Buffer.from(part.value));
  }
 }finally{
  try{await reader.cancel();}catch{}
  try{reader.releaseLock();}catch{}
 }
 const value=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw Error('NOT_OBJECT');
 return value;
}

/**
 * Candidate only. Even if the project/key/date match and the API returns a
 * positive amount, OTHER provider traffic may share that daily aggregate.
 * Per-call receipts and a reconciled invoice remain independently required.
 */
export async function inspectSeyeonC08Prior11ProviderCostV1({
 adminKey,historicalProjectId,historicalApiKeyId,fetchImpl=fetch,
}={}){
 if(typeof adminKey!=='string'||adminKey.length<24||
    !adminKey.startsWith('sk-')||adminKey!==adminKey.trim()||
    !PROJECT.test(String(historicalProjectId??''))||
    !KEY.test(String(historicalApiKeyId??'')))
  return hold('HISTORICAL_ADMIN_KEY_PROJECT_OR_KEY_ID_MISSING');
 if(typeof fetchImpl!=='function')return hold('HTTP_TRANSPORT_MISSING');

 const url=new URL(BASE);
 url.searchParams.set('start_time',String(DAY_START));
 url.searchParams.set('end_time',String(DAY_END));
 url.searchParams.set('bucket_width','1d');
 url.searchParams.set('limit','1');
 url.searchParams.append('project_ids[]',historicalProjectId);
 url.searchParams.append('api_key_ids[]',historicalApiKeyId);
 url.searchParams.append('group_by[]','project_id');
 url.searchParams.append('group_by[]','api_key_id');

 let data;
 try{
  const res=await fetchImpl(url.toString(),{
   method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+adminKey,Accept:'application/json'},
   signal:AbortSignal.timeout(10000),
  });
  data=await boundedJson(res);
 }catch{return hold('HISTORICAL_COST_GET_FAILED');}

 // One exact UTC daily bucket is all this bounded historical request covers.
 // Cursor, duplicates, missing days or foreign attribution must NOT be
 // promoted to "0 charged" or a complete independent billing audit.
 if(data.object!=='page'||data.has_more!==false||
    data.next_page!=null||!Array.isArray(data.data)||
    data.data.length!==1)
  return hold('HISTORICAL_COST_PAGE_INCOMPLETE');
 const b=data.data[0];
 if(b?.object!=='bucket'||b.start_time!==DAY_START||
    b.end_time!==DAY_END||!Array.isArray(b.results)||
    b.results.length===0)
  return hold('HISTORICAL_COST_BUCKET_INCOMPLETE');
 let microUsd=0;
 for(const row of b.results){
  if(row?.object!=='organization.costs.result'||
     row.project_id!==historicalProjectId||
     row.api_key_id!==historicalApiKeyId||
     row.amount?.currency!=='usd'||
     typeof row.amount.value!=='number'||
     !Number.isFinite(row.amount.value)||row.amount.value<0)
   return hold('HISTORICAL_COST_ATTRIBUTION_INVALID');
  const micro=Math.ceil(row.amount.value*1_000_000-1e-9);
  if(!Number.isSafeInteger(micro)||micro<0||
     !Number.isSafeInteger(microUsd+micro))
   return hold('HISTORICAL_COST_SUM_OVERFLOW');
  microUsd+=micro;
 }
 return Object.freeze({
  schemaVersion:'seyeon-c08-prior11-provider-cost-readback-v1',
  status:'DAILY_AGGREGATE_ONLY',
  reason:null,
  historicalDateUtc:C08_PRIOR11_DATE_UTC_V1,
  expectedHistoricalRequests:11,
  historicalCostMicroUsd:microUsd,
  providerAggregateObserved:true,
  elevenRequestReceiptsVerified:false,
  invoiceReconciled:false,
  actualBilledKrw:null,
  paidDispatchEnabled:false,
  productionPromotionPermitted:false,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await inspectSeyeonC08Prior11ProviderCostV1({
  adminKey:process.env.OPENAI_ADMIN_KEY,
  historicalProjectId:process.env.SEYEON_C07_HISTORICAL_PROJECT_ID,
  historicalApiKeyId:process.env.SEYEON_C07_HISTORICAL_API_KEY_ID,
 }).catch(()=>hold('UNEXPECTED_READBACK_FAILURE'));
 console.info('C08_PRIOR11_PROVIDER_COST '+JSON.stringify(report));
 if(report.status!=='DAILY_AGGREGATE_ONLY')process.exitCode=1;
}
