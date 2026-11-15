// Watchtower-Track: character-memory
/**
 * Historical C06/F01/C07 aggregate corroboration, strictly read-only.
 * Two independently sourced Admin GETs: daily costs + hourly completions.
 * Request counts are aggregate; never proof of eleven individual invoices.
 */
import {pathToFileURL} from 'node:url';
import {inspectSeyeonC08Prior11ProviderCostV1 as readCost}
 from './seyeon-c08-prior11-provider-cost-v1.mjs';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P}
 from './seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const ORIGIN='https://api.openai.com';
const START=Date.parse('2026-10-16T00:00:00.000Z')/1000;
const END=START+24*3600;
const PROJECT=/^proj_[A-Za-z0-9_-]{6,128}$/u;
const KEY=/^key_[A-Za-z0-9_-]{3,128}$/u;
const MAX_BYTES=128*1024;
const uint=x=>Number.isSafeInteger(x)&&x>=0;

const hold=reason=>Object.freeze({
 schemaVersion:'seyeon-c08-prior11-usage-cost-crosscheck-v1',
 status:'HOLD',reason,expectedHistoricalRequests:11,
 observedProviderRequestCount:null,
 aggregateCostMicroUsd:null,
 aggregateUseCorroborated:false,
 independentRequestReceiptsVerified:false,invoiceReconciled:false,
 actualBilledKrw:null,paidDispatchEnabled:false,
 productionPromotionPermitted:false,
});

async function boundedJson(res){
 if(res?.status!==200||!res.body||
    !res.headers?.get('content-type')?.toLowerCase().includes('application/json'))
  throw Error('READBACK_RESPONSE');
 const reader=res.body.getReader(),chunks=[];
 let n=0;
 try{
  for(;;){
   const p=await reader.read();
   if(p.done)break;
   n+=p.value.byteLength;
   if(n>MAX_BYTES)throw Error('READBACK_BODY_LIMIT');
   chunks.push(Buffer.from(p.value));
  }
 }finally{try{await reader.cancel();}catch{}
          try{reader.releaseLock();}catch{}}
 const parsed=JSON.parse(Buffer.concat(chunks,n).toString('utf8'));
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
  throw Error('READBACK_JSON_SHAPE');
 return parsed;
}

/**
 * Caller provides only independent historical Project/Key identifiers;
 * neither key ID nor Admin secret is emitted in results.
 * All transport calls use fixed OpenAI origin, GET, no redirects, no POST.
 */
export async function crosscheckSeyeonC08Prior11UsageCostV1({
 adminKey,historicalProjectId,historicalApiKeyId,fetchImpl=fetch,
}={}){
 if(typeof adminKey!=='string'||adminKey.length<24||
    !adminKey.startsWith('sk-')||adminKey!==adminKey.trim()||
    !PROJECT.test(String(historicalProjectId??''))||
    !KEY.test(String(historicalApiKeyId??''))||
    typeof fetchImpl!=='function')return hold('HISTORICAL_SCOPE_UNVERIFIED');
 const evidence=await readCost({
  adminKey,historicalProjectId,historicalApiKeyId,fetchImpl,
 });
 if(evidence.status!=='DAILY_AGGREGATE_ONLY')
  return hold('HISTORICAL_COST_EVIDENCE_INCOMPLETE');

 const url=new URL('/v1/organization/usage/completions',ORIGIN);
 url.searchParams.set('start_time',String(START));
 url.searchParams.set('end_time',String(END));
 url.searchParams.set('bucket_width','1h');
 url.searchParams.set('limit','24');
 url.searchParams.append('project_ids[]',historicalProjectId);
 url.searchParams.append('api_key_ids[]',historicalApiKeyId);
 // Do not filter by the expected model: that hides other-model usage on the same key.
 for(const group of ['project_id','api_key_id','model'])
  url.searchParams.append('group_by[]',group);
 let response;
 try{
  response=await fetchImpl(url.toString(),{
   method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+adminKey,Accept:'application/json'},
   signal:AbortSignal.timeout(10000),
  });
  response=await boundedJson(response);
 }catch{return hold('HISTORICAL_USAGE_READBACK_FAILED');}
 // A paginated or malformed result is not authoritative evidence.
 if(response.object!=='page'||response.has_more!==false||
    response.next_page!=null||!Array.isArray(response.data)||
    response.data.length!==24)
  return hold('HISTORICAL_USAGE_PAGE_INCOMPLETE');
 let observed=0,input=0,output=0;
 // A complete historical day must include all 24 hours, including
 // zero-usage hours. Missing, duplicated or reordered slots remain HOLD.
 for(let hour=0;hour<24;hour++){
  const bucket=response.data[hour],hourStart=START+hour*3600;
  if(bucket?.object!=='bucket'||bucket.start_time!==hourStart||
     bucket.end_time!==hourStart+3600||
     !Array.isArray(bucket.results)||bucket.results.length>1)
   return hold('HISTORICAL_USAGE_BUCKET_UNTRUSTED');
  if(bucket.results.length===0)continue;
  const item=bucket.results[0];
  if(item?.object!=='organization.usage.completions.result'||
     item.project_id!==historicalProjectId||
     item.api_key_id!==historicalApiKeyId||
     !uint(item.num_model_requests)||
     !uint(item.input_tokens)||!uint(item.output_tokens))
   return hold('HISTORICAL_USAGE_ATTRIBUTION_INVALID');
  // With no model filter, unexpected model activity is visible and blocking.
  if(item.model!==P.model)
   return hold('HISTORICAL_OTHER_MODEL_ACTIVITY');
  observed+=item.num_model_requests;
  input+=item.input_tokens;
  output+=item.output_tokens;
  if(!uint(observed)||!uint(input)||!uint(output))
   return hold('HISTORICAL_USAGE_OVERFLOW');
 }
 if(observed!==11)
  return hold('HISTORICAL_PROVIDER_REQUEST_COUNT_MISMATCH');
 return Object.freeze({
  schemaVersion:'seyeon-c08-prior11-usage-cost-crosscheck-v1',
  status:'HISTORICAL_AGGREGATES_CORROBORATED_ONLY',
  reason:null,expectedHistoricalRequests:11,
  observedProviderRequestCount:observed,
  aggregateInputTokens:input,aggregateOutputTokens:output,
  aggregateCostMicroUsd:evidence.historicalCostMicroUsd,
  aggregateUseCorroborated:true,
  // These remain FALSE even when the request count equals eleven.
  independentRequestReceiptsVerified:false,invoiceReconciled:false,
  actualBilledKrw:null,paidDispatchEnabled:false,
  productionPromotionPermitted:false,
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await crosscheckSeyeonC08Prior11UsageCostV1({
  adminKey:process.env.OPENAI_ADMIN_KEY,
  historicalProjectId:process.env.SEYEON_C07_HISTORICAL_PROJECT_ID,
  historicalApiKeyId:process.env.SEYEON_C07_HISTORICAL_API_KEY_ID,
 }).catch(()=>hold('UNEXPECTED_HISTORICAL_READBACK_FAILURE'));
 console.info('C08_PRIOR11_PROVIDER_CROSSCHECK '+JSON.stringify(report));
 if(report.status!=='HISTORICAL_AGGREGATES_CORROBORATED_ONLY')
  process.exitCode=1;
}
