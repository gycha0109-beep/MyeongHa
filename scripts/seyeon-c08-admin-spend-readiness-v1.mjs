// Watchtower-Track: character-memory
/**
 * C08: read-only OpenAI Admin API check of the dedicated evaluation project's
 * active status, enforced monthly hard limit, and current-month costs.
 *
 * This is NOT paid admission: Admin GET is not proof of the exact evaluation
 * key's project, historical invoice reconciliation, or cross-run reservation.
 * Never include credentials, project IDs, HTTP bodies, or raw errors in output.
 */
import {pathToFileURL} from 'node:url';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P}
  from './seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const BASE='https://api.openai.com/v1';
const PROJECT=/^proj_[A-Za-z0-9_-]{6,128}$/u;
const PROJECT_KEY=/^key_[A-Za-z0-9_-]{3,128}$/u;
const EVAL_PROJECT_NAME='MyeongHa-Evaluation';
const MAX_BODY_BYTES=256*1024;
const MAX_PAGES=8;
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const hold=(reason)=>Object.freeze({
 schemaVersion:'seyeon-c08-admin-spend-readiness-v1',
 status:'HOLD',reason,projectActiveVerified:false,projectHardLimitVerified:false,
 monthSpendReadbackComplete:false,monthSpendMicroUsd:null,
 remainingUnderProjectLimitMicroUsd:null,
 projectKeyMetadataVerified:false,
 projectCredentialBindingVerified:false,invoiceReconciled:false,
 crossRunPaidReservationVerified:false,paidDispatchEnabled:false,
});

async function getJson(fetchImpl,url,key){
 const response=await fetchImpl(url,{
  method:'GET',redirect:'error',headers:{
   Authorization:'Bearer '+key,Accept:'application/json',
  },signal:AbortSignal.timeout(10000),
 });
 if(response?.status!==200||!response.body)throw Error('READBACK_HTTP_HOLD');
 const reader=response.body.getReader();
 const chunks=[];let length=0;
 try{
  for(;;){
   const part=await reader.read();
   if(part.done)break;
   length+=part.value.byteLength;
   if(length>MAX_BODY_BYTES)throw Error('READBACK_SIZE_HOLD');
   chunks.push(part.value);
  }
 }finally{
  try{await reader.cancel();}catch{}
  try{reader.releaseLock();}catch{}
 }
 const buffer=Buffer.concat(chunks.map(x=>Buffer.from(x)),length);
 const value=JSON.parse(buffer.toString('utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw Error('READBACK_SHAPE_HOLD');
 return value;
}

export async function inspectSeyeonC08AdminSpendReadinessV1({
 adminKey,projectId,evaluationKeyId=null,fetchImpl=fetch,now=new Date(),
}={}){
 if(!PROJECT.test(String(projectId??''))||
    typeof adminKey!=='string'||adminKey.length<24||
    !adminKey.startsWith('sk-')||adminKey!==adminKey.trim())
  return hold('ADMIN_CREDENTIAL_OR_PROJECT_MISSING');
 if(evaluationKeyId!==null&&evaluationKeyId!==''&&
    (typeof evaluationKeyId!=='string'||!PROJECT_KEY.test(evaluationKeyId)))
  return hold('EVALUATION_KEY_ID_INVALID');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  return hold('CLOCK_UNAVAILABLE');
 if(typeof fetchImpl!=='function')return hold('TRANSPORT_UNAVAILABLE');
 if(P.additionalBudgetKrw!==5000||P.maxFirstBatchCalls!==6||
    P.firstBatchReservedMicroUsd!==19662||P.paidDispatchEnabled!==false)
  return hold('POLICY_CHANGED');
 let project;
 try{
  project=await getJson(fetchImpl,BASE+'/organization/projects/'+
   encodeURIComponent(projectId),adminKey);
 }catch{return hold('PROJECT_READBACK_FAILED');}
 if(project.object!=='organization.project'||project.id!==projectId||
    project.name!==EVAL_PROJECT_NAME||
    project.status!=='active'||project.archived_at!=null)
  return hold('PROJECT_NOT_ACTIVE_OR_MISMATCHED');
 // Optional Admin metadata probe: an active key ID belongs to the project,
 // but there is NO cryptographic link to the evaluation secret on this host.
 // Keep projectCredentialBindingVerified=false even after a successful GET.
 let projectKeyMetadataVerified=false;
 if(evaluationKeyId){
  let keyMetadata;
  try{
   keyMetadata=await getJson(fetchImpl,BASE+'/organization/projects/'+
    encodeURIComponent(projectId)+'/api_keys/'+
    encodeURIComponent(evaluationKeyId),adminKey);
  }catch{return hold('PROJECT_KEY_READBACK_FAILED');}
  // A project-owned key may be expired even when its owner's access is active.
  // Mirror the existing C08-AB Admin evidence admission's key-expiry rule.
  const nowSeconds=Math.floor(now.getTime()/1000);
  const ownerKind=keyMetadata.owner?.type;
  const ownerId=ownerKind==='user'?keyMetadata.owner?.user?.id:
   ownerKind==='service_account'?keyMetadata.owner?.service_account?.id:null;
  if(keyMetadata.object!=='organization.project.api_key'||
     keyMetadata.id!==evaluationKeyId||
     keyMetadata.owner_project_access!=='active'||
     !Number.isSafeInteger(keyMetadata.created_at)||
     keyMetadata.created_at<1||keyMetadata.created_at>nowSeconds||
     (keyMetadata.expires_at!==undefined&&keyMetadata.expires_at!==null&&
      (!Number.isSafeInteger(keyMetadata.expires_at)||
       keyMetadata.expires_at<=nowSeconds||
       keyMetadata.expires_at<=keyMetadata.created_at))||
     !['user','service_account'].includes(ownerKind)||
     typeof ownerId!=='string'||ownerId.length===0||
     ownerId.length>160||!ownerId.startsWith(ownerKind==='user'?'user_':'svc_acct_'))
   return hold('PROJECT_KEY_INACTIVE_OR_MISMATCHED');
  projectKeyMetadataVerified=true;
 }
 let cap;
 try{
  cap=await getJson(fetchImpl,BASE+'/organization/projects/'+
   encodeURIComponent(projectId)+'/spend_limit',adminKey);
 }catch{return hold('HARD_LIMIT_READBACK_FAILED');}
 if(cap.object!=='project.spend_limit'||cap.currency!=='USD'||
    cap.interval!=='month'||cap.enforcement?.status!=='enforcing'||
    !safeInt(cap.threshold_amount)||cap.threshold_amount===0||
    cap.threshold_amount>100)
  return hold('HARD_LIMIT_MISSING_OR_NOT_ONE_USD_ENFORCED');
 const monthStart=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)/1000;
 const end=Math.floor(now.getTime()/1000);
 if(!safeInt(monthStart)||!safeInt(end)||end<=monthStart)
  return hold('CLOCK_UNAVAILABLE');
 const seenPages=new Set();
 let next=null,spent=0,complete=false;
 for(let i=0;i<MAX_PAGES;i++){
  const url=new URL(BASE+'/organization/costs');
  url.searchParams.set('start_time',String(monthStart));
  url.searchParams.set('end_time',String(end));
  url.searchParams.set('bucket_width','1d');
  url.searchParams.append('group_by[]','project_id');
  url.searchParams.append('project_ids[]',projectId);
  url.searchParams.set('limit','31');
  if(next)url.searchParams.set('page',next);
  let page;
  try{page=await getJson(fetchImpl,url.toString(),adminKey);}
  catch{return hold('MONTH_COST_READBACK_FAILED');}
  if(page.object!=='page'||!Array.isArray(page.data)||
    typeof page.has_more!=='boolean')
   return hold('MONTH_COST_SHAPE_MISMATCH');
  for(const b of page.data){
   if(b?.object!=='bucket'||!safeInt(b.start_time)||
      b.start_time<monthStart||b.start_time>end||!Array.isArray(b.results))
    return hold('MONTH_COST_BUCKET_INVALID');
   for(const row of b.results){
    const amount=row?.amount;
    if(row?.object!=='organization.costs.result'||
       row.project_id!==projectId||
       amount?.currency!=='usd'||
       typeof amount.value!=='number'||!Number.isFinite(amount.value)||
       amount.value<0)
     return hold('MONTH_COST_IDENTITY_OR_AMOUNT_INVALID');
    const micro=Math.ceil(amount.value*1_000_000-1e-9);
    if(!safeInt(micro)||!safeInt(spent+micro))
     return hold('MONTH_COST_OVERFLOW');
    spent+=micro;
   }
  }
  if(page.has_more===false){
   if(page.next_page!==null&&page.next_page!==undefined)
    return hold('MONTH_COST_UNEXPECTED_CURSOR');
   complete=true;break;
  }
  if(typeof page.next_page!=='string'||page.next_page.length<1||
     page.next_page.length>200||seenPages.has(page.next_page))
   return hold('MONTH_COST_PAGINATION_INCOMPLETE');
  next=page.next_page;seenPages.add(next);
 }
 if(!complete)return hold('MONTH_COST_PAGINATION_INCOMPLETE');
 const remaining=cap.threshold_amount*10000-spent;
 // Even a positive margin does not prove complete invoicing or fee finality.
 return Object.freeze({
  schemaVersion:'seyeon-c08-admin-spend-readiness-v1',
  status:remaining>=P.firstBatchReservedMicroUsd?
   'ADMIN_READBACK_ONLY':'HOLD',
  reason:remaining>=P.firstBatchReservedMicroUsd?
   null:'INSUFFICIENT_PROJECT_LIMIT_HEADROOM',
  projectActiveVerified:true,projectHardLimitVerified:true,
  monthSpendReadbackComplete:true,
  monthSpendMicroUsd:spent,
  remainingUnderProjectLimitMicroUsd:Math.max(0,remaining),
  projectKeyMetadataVerified,
  projectCredentialBindingVerified:false,invoiceReconciled:false,
  crossRunPaidReservationVerified:false,paidDispatchEnabled:false,
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await inspectSeyeonC08AdminSpendReadinessV1({
  adminKey:process.env.OPENAI_ADMIN_KEY,
  projectId:process.env.OPENAI_EVAL_PROJECT_ID,
  evaluationKeyId:process.env.OPENAI_EVAL_API_KEY_ID??null,
 }).catch(()=>hold('UNEXPECTED_READBACK_FAILURE'));
 console.info('C08_ADMIN_READONLY_SPEND '+JSON.stringify(result));
 if(result.status!=='ADMIN_READBACK_ONLY')process.exitCode=1;
}
