/**
 * Se-yeon evaluation provider evidence reader. Local, GET-only, admin key.
 * Never use this key in GitHub Actions, never dispatch paid models.
 */
import { pathToFileURL } from 'node:url';
const ORIGIN='https://api.openai.com';
const HOLD='SEYEON_EVALUATION_EXTERNAL_EVIDENCE_HOLD';
const projectPattern=/^proj_[A-Za-z0-9_-]{6,128}$/u;
const keyPattern=/^key_[A-Za-z0-9_-]{3,128}$/u;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=code=>{const e=new Error(HOLD);e.code=code;throw e;};
async function boundedJson(response){
 if(!response?.ok)fail('HTTP_REJECTED');
 if(!response.body?.getReader)fail('INVALID_RESPONSE');
 const reader=response.body.getReader(),chunks=[];
 let bytes=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   bytes+=part.value.byteLength;
   if(bytes>65536)fail('OVERSIZED_RESPONSE');
   chunks.push(part.value);
  }
 }finally{try{await reader.cancel();}catch{}}
 try{
  const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(record(parsed))return parsed;
 }catch{}
 return fail('INVALID_RESPONSE');
}
function usdMicros(value){
 if(!record(value)||value.currency!=='usd'||
    !Number.isFinite(value.value)||value.value<0||value.value>1000000)
  fail('UNRECONCILABLE_COST');
 const n=Math.round(value.value*1000000);
 if(!Number.isSafeInteger(n))fail('UNRECONCILABLE_COST');
 return n;
}
export async function auditSeyeonEvaluationProviderV1({
 adminApiKey,projectId,evaluationApiKeyId,fetchImpl=fetch,nowMs=Date.now(),
}={}){
 const result={
  schemaVersion:'seyeon-provider-admin-evidence-readback-v1',
  status:HOLD,readback:'NOT_COMPLETED',failureCode:null,
  projectNameMatched:false,projectActive:false,keyMembershipActive:false,
  hardLimitReadback:false,costReadback:false,monthUtc:null,monthToDateUsd:null,
  githubSecretKeyBindingVerified:false,prior11InvoiceReconciled:false,
  spendFreshnessGuaranteed:false,globalImmutableReservationVerified:false,
  paidDispatchEnabled:false,productionPromotionPermitted:false,
 };
 try{
  if(typeof adminApiKey!=='string'||adminApiKey.trim().length<20||
     !projectPattern.test(projectId??'')||
     !keyPattern.test(evaluationApiKeyId??'')||typeof fetchImpl!=='function')
   fail('ADMIN_READBACK_CREDENTIALS_MISSING');
  const now=new Date(nowMs);
  if(!Number.isFinite(now.getTime()))fail('INVALID_AUDIT_TIME');
  const start=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1);
  const from=Math.floor(start/1000),until=Math.floor(nowMs/1000);
  if(from>=until)fail('INVALID_AUDIT_TIME');
  result.monthUtc=now.toISOString().slice(0,7);
  const get=async(path,params=[])=>{
   const url=new URL(path,ORIGIN);
   if(url.origin!==ORIGIN||!url.pathname.startsWith('/v1/organization/'))
    fail('INVALID_ENDPOINT');
   for(const [k,v]of params)url.searchParams.append(k,v);
   let response;
   try{
    response=await fetchImpl(url.toString(),{
     method:'GET',redirect:'error',
     headers:{Authorization:'Bearer '+adminApiKey.trim(),Accept:'application/json'},
     signal:AbortSignal.timeout(15000),
    });
   }catch{fail('ADMIN_NETWORK_FAILED');}
   return boundedJson(response);
  };
  const path='/v1/organization/projects/'+projectId;
  const project=await get(path);
  if(project.object!=='organization.project'||project.id!==projectId||
     project.name!=='MyeongHa-Evaluation')
   fail('EVALUATION_PROJECT_MISMATCH');
  result.projectNameMatched=true;
  if(project.status!=='active'||project.archived_at!=null)
   fail('EVALUATION_PROJECT_INACTIVE');
  result.projectActive=true;
  const key=await get(path+'/api_keys/'+evaluationApiKeyId);
  if(key.object!=='organization.project.api_key'||
     key.id!==evaluationApiKeyId||key.owner_project_access!=='active'||
     (key.expires_at!=null&&
      (!Number.isSafeInteger(key.expires_at)||key.expires_at<=until)))
   fail('EVALUATION_KEY_INACTIVE');
  result.keyMembershipActive=true;
  const limit=await get(path+'/spend_limit');
  // threshold_amount is CENTS; an alert is not a hard spend limit.
  if(limit.object!=='project.spend_limit'||limit.threshold_amount!==100||
     limit.currency!=='USD'||limit.interval!=='month'||
     limit.enforcement?.status!=='enforcing')
   fail('USD1_HARD_LIMIT_NOT_ENFORCING');
  result.hardLimitReadback=true;
  let micros=0,cursor=null;
  const seen=new Set();
  for(let n=0;n<5;n++){
   const query=[
    ['start_time',String(from)],['end_time',String(until)],
    ['bucket_width','1d'],['limit','31'],
    ['project_ids[]',projectId],['group_by[]','project_id'],
   ];
   if(cursor)query.push(['page',cursor]);
   const costs=await get('/v1/organization/costs',query);
   if(costs.object!=='page'||!Array.isArray(costs.data))
    fail('UNRECONCILABLE_COST');
   for(const bucket of costs.data){
    if(bucket?.object!=='bucket'||!Number.isSafeInteger(bucket.start_time)||
       !Number.isSafeInteger(bucket.end_time)||bucket.start_time<from||
       bucket.end_time<=bucket.start_time||!Array.isArray(bucket.results))
     fail('UNRECONCILABLE_COST');
    for(const entry of bucket.results){
     if(entry?.object!=='organization.costs.result'||
        entry.project_id!==projectId)fail('UNRECONCILABLE_COST');
     micros+=usdMicros(entry.amount);
     if(!Number.isSafeInteger(micros))fail('UNRECONCILABLE_COST');
    }
   }
   if(costs.has_more===false){
    result.costReadback=true;
    result.monthToDateUsd=micros/1000000;
    result.readback='PROJECT_KEY_LIMIT_AND_COSTS_READ';
    return Object.freeze(result);
   }
   if(costs.has_more!==true||typeof costs.next_page!=='string'||
      costs.next_page.length<1||costs.next_page.length>256||
      seen.has(costs.next_page))fail('COST_PAGINATION_INCOMPLETE');
   seen.add(costs.next_page);
   cursor=costs.next_page;
  }
  fail('COST_PAGINATION_INCOMPLETE');
 }catch(error){
  const code=error?.code;
  result.failureCode=typeof code==='string'&&/^[A-Z0-9_]+$/u.test(code)
   ?code:'ADMIN_READBACK_FAILED';
  result.readback='NOT_COMPLETED';
  result.costReadback=false;
  result.monthToDateUsd=null;
  return Object.freeze(result);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await auditSeyeonEvaluationProviderV1({
  adminApiKey:process.env.OPENAI_ADMIN_KEY,
  projectId:process.env.SEYEON_EVAL_PROJECT_ID,
  evaluationApiKeyId:process.env.SEYEON_EVAL_API_KEY_ID,
 });
 console.log(JSON.stringify(result));
 if(result.readback!=='PROJECT_KEY_LIMIT_AND_COSTS_READ')process.exitCode=1;
}
