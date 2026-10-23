/**
 * C08-U — zero-token, read-only evaluation credential preflight.
 * Only checks whether the newly scoped API key can GET the pinned model.
 * It CANNOT prove which project issued the credential, provider hard-limit
 * settings, spending to date, or reconciliation of earlier invoices.
 * No inference endpoint, no POST, no prompt or user data, no paid dispatch.
 */
import {pathToFileURL} from 'node:url';
import {
 SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P,
} from './seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const ORIGIN='https://api.openai.com';
export const SEYEON_C08U_READONLY_MODEL_URL_V1=
 ORIGIN+'/v1/models/'+encodeURIComponent(P.model);
const MAX_RESPONSE_BYTES=8192;

const hold=reason=>Object.freeze({
 schemaVersion:'seyeon-c08u-eval-credential-readiness-v1',
 scope:'CREDENTIAL_MODEL_GET_ONLY_NOT_BILLING_OR_PAID_APPROVAL',
 result:'HOLD',reason,paidDispatchEnabled:false,
 projectIdentityVerified:false,providerHardLimitVerified:false,
 invoiceReconciled:false,
});
const ready=()=>Object.freeze({
 schemaVersion:'seyeon-c08u-eval-credential-readiness-v1',
 scope:'CREDENTIAL_MODEL_GET_ONLY_NOT_BILLING_OR_PAID_APPROVAL',
 result:'MODEL_GET_ACCESSIBLE',reason:null,paidDispatchEnabled:false,
 projectIdentityVerified:false,providerHardLimitVerified:false,
 invoiceReconciled:false,
});

async function readBoundedJson(response){
 if(!response.body)return null;
 const reader=response.body.getReader();
 const chunks=[];let bytes=0;
 try{
  while(true){
   const next=await reader.read();
   if(next.done)break;
   bytes+=next.value.byteLength;
   if(bytes>MAX_RESPONSE_BYTES)throw Error('BODY_LIMIT');
   chunks.push(next.value);
  }
 }finally{await reader.cancel().catch(()=>undefined);}
 try{return JSON.parse(new TextDecoder().decode(
  Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)))));}
 catch{return null;}
}

export async function verifySeyeonC08UEvaluationCredentialV1({
 key,fetchImpl=fetch,
}={}){
 if(typeof key!=='string'||key.length<32||key!==key.trim()||
    !/^sk-(?:proj|svcacct)-[A-Za-z0-9_-]+$/u.test(key))
  return hold('MISSING_OR_INVALID_EVAL_PROJECT_KEY');
 if(typeof fetchImpl!=='function')return hold('NO_HTTP_TRANSPORT');
 let response;
 try{
  response=await fetchImpl(SEYEON_C08U_READONLY_MODEL_URL_V1,{
   method:'GET',
   redirect:'error',
   headers:{
    Authorization:'Bearer '+key,
    Accept:'application/json',
   },
   signal:AbortSignal.timeout(10000),
  });
 }catch{return hold('MODEL_GET_NETWORK_OR_TLS_FAILURE');}
 if(!response||response.status!==200)
  return hold('MODEL_GET_NOT_AVAILABLE_OR_NOT_AUTHORIZED');
 let body;
 try{body=await readBoundedJson(response);}
 catch{return hold('MODEL_GET_RESPONSE_TOO_LARGE_OR_UNREADABLE');}
 if(!body||body.object!=='model'||body.id!==P.model)
  return hold('MODEL_GET_UNEXPECTED_RESPONSE');
 return ready();
}

async function main(){
 const report=await verifySeyeonC08UEvaluationCredentialV1({
  key:process.env.OPENAI_EVAL_API_KEY,
 });
 // Never emit credential, response headers/body, organization/project data,
 // upstream error strings, response URL, prompts or identity metadata.
 console.info('SEYEON_C08U_READONLY_PREFLIGHT '+JSON.stringify(report));
 if(report.result!=='MODEL_GET_ACCESSIBLE')process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main().catch(()=>{
  console.error('SEYEON_C08U_READONLY_PREFLIGHT_ERROR');
  process.exitCode=1;
 });
