import {createHmac,createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import type {IdentityEvidenceVerificationPortV1} from './current-subject-profile-http.js';
import {executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1} from './postgres-subject-execution.js';

export const COMMERCE_READING_WITHDRAWAL_CLAIM_HTTP_V1=Object.freeze({
  endpoint:'/api/me?__myeongha_withdrawal_claim=1',
  claimVersion:'digital-reading-withdrawal-claim-v1',
  customerSelfServiceEnabledByDefault:false,
  decisionAutomatic:false,
  providerRefundAutomatic:false,
  maxBodyBytes:2048,
} as const);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REASONS=new Set(['change_of_mind','not_provided','delivery_failed',
  'not_as_described','defect','duplicate_charge','unprovided_separable_part','other']);
const RECEIVE=[
  'select claim_id::text as "claimId",',
  'received_at::text as "receivedAt",replayed as "replayed"',
  'from public.cmd_receive_digital_reading_withdrawal_claim_v1(',
  '$1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text)',
].join('\n');
const STATUS=[
  'select claim_id::text as "claimId",received_at::text as "receivedAt",',
  'request_state as "state"',
  'from public.qry_received_digital_reading_withdrawal_claim_v1($1::uuid,$2::uuid)',
].join('\n');
type IntakeRequest=Readonly<{
  purchaseIntentId:string|null;unitId:string|null;reason:string;idempotencyKey:string;
}>;
const NO_STORE=Object.freeze({'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'});
function error(code:string,status:number){
  return Response.json({ok:false,error:{code}}, {status,headers:NO_STORE});
}
async function readBoundedJson(request:Request):Promise<unknown>{
  if(!request.body)throw Error('INVALID_BODY');
  const declared=request.headers.get('content-length');
  if(declared && (!/^\d+$/u.test(declared)||Number(declared)>2048))
    throw Error('INVALID_BODY');
  const reader=request.body.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let total=0,text='';
  try{
    for(;;){
      const chunk=await reader.read();
      if(chunk.done)break;
      if(!(chunk.value instanceof Uint8Array))throw Error('INVALID_BODY');
      total+=chunk.value.byteLength;
      if(total>2048)throw Error('INVALID_BODY');
      text+=decoder.decode(chunk.value,{stream:true});
    }
    text+=decoder.decode();
    return JSON.parse(text) as unknown;
  }finally{
    try{await reader.cancel();}catch{}
    try{reader.releaseLock();}catch{}
  }
}
function parseRequest(value:unknown):IntakeRequest|null{
  if(typeof value!=='object'||value===null||Array.isArray(value))return null;
  const r=value as Record<string,unknown>;
  const shape=Object.keys(r).sort().join(',');
  const exact=shape==='idempotencyKey,purchaseIntentId,reason,unitId';
  const general=shape==='idempotencyKey,reason';
  if((!exact&&!general)
    ||(exact&&(typeof r.purchaseIntentId!=='string'||!UUID.test(r.purchaseIntentId)
      ||typeof r.unitId!=='string'||!UUID.test(r.unitId)))
    ||typeof r.idempotencyKey!=='string'||!UUID.test(r.idempotencyKey)
    ||typeof r.reason!=='string'||!REASONS.has(r.reason))return null;
  return {purchaseIntentId:exact?r.purchaseIntentId as string:null,
    unitId:exact?r.unitId as string:null,
    reason:r.reason,idempotencyKey:r.idempotencyKey};
}
type ClaimRow={claimId:unknown;receivedAt:unknown;replayed?:unknown;state?:unknown};
function resultRow(row:ClaimRow,forStatus:boolean){
  if(typeof row.claimId!=='string'||!UUID.test(row.claimId)
    ||typeof row.receivedAt!=='string'||!Number.isFinite(Date.parse(row.receivedAt))
    ||(forStatus?row.state!=='received':typeof row.replayed!=='boolean'))
    throw Error('CLAIM_ROW_INVALID');
  return {claimId:row.claimId,receivedAt:row.receivedAt,
    replayed:forStatus?null:row.replayed};
}
export async function handleDigitalReadingWithdrawalClaimHttpV1(input:Readonly<{
  request:Request;
  identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  pool:PostgresSubjectPoolV1;
  enabled:boolean;
  idempotencySecret?:string;
}>):Promise<Response>{
  if(!input.enabled)return error('SERVICE_UNAVAILABLE',503);
  const url=new URL(input.request.url);
  const keys=[...url.searchParams.keys()];
  if(url.pathname!=='/api/me'
    ||url.searchParams.getAll('__myeongha_withdrawal_claim').length!==1
    ||url.searchParams.get('__myeongha_withdrawal_claim')!=='1'
    ||keys.some(k=>k!=='__myeongha_withdrawal_claim'
      &&k!=='claimId'&&k!=='_vercel_share')
    ||url.hash!=='')return error('NOT_FOUND',404);
  const method=input.request.method;
  if(method!=='POST'&&method!=='GET')
    return new Response(null,{status:405,headers:{...NO_STORE,Allow:'GET, POST'}});
  if(method==='POST'&&(input.request.headers.get('origin')!==url.origin
    ||url.searchParams.has('claimId')))
    return error('ORIGIN_FORBIDDEN',403);
  if(typeof input.idempotencySecret!=='string'
    ||Buffer.byteLength(input.idempotencySecret,'utf8')<32)
    return error('SERVICE_UNAVAILABLE',503);
  let identity:Awaited<ReturnType<IdentityEvidenceVerificationPortV1['verifyRequestIdentity']>>;
  try{identity=await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);}
  catch{return error('SESSION_UNAVAILABLE',503);}
  if(!identity)return error('AUTH_REQUIRED',401);
  if(identity.kind!=='member')return error('MEMBER_REQUIRED',403);
  let parsed:IntakeRequest|null=null;
  if(method==='POST'){
    if(!/^application\/json(?:\s*;|$)/iu.test(
      input.request.headers.get('content-type')??''))return error('INVALID_CONTENT_TYPE',415);
    try{parsed=parseRequest(await readBoundedJson(input.request));}
    catch{return error('INVALID_REQUEST_BODY',400);}
    if(!parsed)return error('INVALID_REQUEST_BODY',400);
  }
  const id=url.searchParams.get('claimId');
  if(method==='GET'&&(!id||!UUID.test(id)
      ||url.searchParams.getAll('claimId').length!==1))
    return error('INVALID_CLAIM_ID',400);
  try{
    const data=await executePostgresSubjectTransactionV1({
      pool:input.pool,verifiedEvidence:identity,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member')throw Error('NOT_MEMBER');
        const subjectId=resolvedSubject.subjectId;
        if(method==='GET'){
          const rows=await client.query<ClaimRow>(STATUS,[subjectId,id]);
          if(rows.rows.length>1)throw Error('CLAIM_AMBIGUOUS');
          if(rows.rows.length===0)return null;
          return resultRow(rows.rows[0]!,true);
        }
        if(!parsed)throw Error('CLAIM_INVALID');
        const hmac='hmac-sha256:k1:'+createHmac('sha256',input.idempotencySecret!)
          .update(canonicalJson([
            COMMERCE_READING_WITHDRAWAL_CLAIM_HTTP_V1.claimVersion,
            subjectId,parsed.idempotencyKey,
          ]),'utf8').digest('hex');
        const hash='sha256:v1:'+createHash('sha256').update(canonicalJson([
          COMMERCE_READING_WITHDRAWAL_CLAIM_HTTP_V1.claimVersion,
          subjectId,parsed.purchaseIntentId,parsed.unitId,parsed.reason,
        ]),'utf8').digest('hex');
        const rows=await client.query<ClaimRow>(RECEIVE,[
          subjectId,parsed.purchaseIntentId,parsed.unitId,
          parsed.reason,hmac,hash,
        ]);
        if(rows.rows.length!==1)throw Error('CLAIM_AUTHORITY_UNAVAILABLE');
        return resultRow(rows.rows[0]!,false);
      },
    });
    if(data===null)return error('NOT_FOUND',404);
    if(method==='POST')return Response.json({
      ok:true,data:{
        claimId:data.claimId,receivedAt:data.receivedAt,
        status:'received',replayed:data.replayed,
        refundApproved:false,providerRefundCompleted:false,
      },
    },{status:201,headers:NO_STORE});
    return Response.json({
      ok:true,data:{claimId:data.claimId,
        receivedAt:data.receivedAt,status:'received'},
    },{status:200,headers:NO_STORE});
  }catch{
    return error('CLAIM_UNAVAILABLE',503);
  }
}
