// Watchtower-Track: commerce-payment
// Candidate only. No Cloudflare/Vercel route, paid model admission or
// database EXECUTE grant is mounted by this module.
import type {IdentityEvidenceVerificationPortV1} from './current-subject-profile-http.js';
import {executePostgresSubjectTransactionV1,type PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import {acknowledgeDeliveredChatCreditCandidateV1} from './commerce-chat-credit-delivery-ack-candidate-v1.js';

export const CHAT_CREDIT_DELIVERY_ACK_HTTP_CANDIDATE_V1=Object.freeze({
  route:'/api/chat/credit-delivery/ack',
  productionMounted:false,
  method:'POST',
  apiContractVersion:'v0.9',
  maximumBodyBytes:768,
} as const);

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Body=Readonly<{
  threadId:string;
  clientTurnId:string;
  reservationId:string;
  committedTurnId:string;
  assistantMessageId:string;
}>;

function failure(status:number,code:string,requestId:string):Response {
  return Response.json({ok:false,error:{code,retryable:false},
    meta:{apiContractVersion:'v0.9',requestId}},
  {status,headers:{'Cache-Control':'no-store'}});
}

function parseBody(value:unknown):Body|null {
  if(typeof value!=='object'||value===null||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  const names=['threadId','clientTurnId','reservationId','committedTurnId','assistantMessageId'] as const;
  if(Object.keys(v).length!==names.length||
     names.some(name=>!Object.prototype.hasOwnProperty.call(v,name)||
       typeof v[name]!=='string'||!UUID.test(v[name])))return null;
  return Object.freeze({
    threadId:(v.threadId as string).toLowerCase(),
    clientTurnId:(v.clientTurnId as string).toLowerCase(),
    reservationId:(v.reservationId as string).toLowerCase(),
    committedTurnId:(v.committedTurnId as string).toLowerCase(),
    assistantMessageId:(v.assistantMessageId as string).toLowerCase(),
  });
}

async function boundedBody(request:Request):Promise<Body|null>{
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return null;
  const reader=request.body?.getReader();
  if(!reader)return null;
  const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){
      const next=await reader.read();
      if(next.done)break;
      if(!(next.value instanceof Uint8Array))return null;
      size+=next.value.byteLength;
      if(size>CHAT_CREDIT_DELIVERY_ACK_HTTP_CANDIDATE_V1.maximumBodyBytes)return null;
      chunks.push(next.value);
    }
    const joined=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
    return parseBody(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)));
  }catch{return null;}
  finally{
    try{await reader.cancel();}catch{}
    try{reader.releaseLock();}catch{}
  }
}

/**
 * An HTTP ACK is never directly a spend instruction. The actual row-level
 * proof is the original DB committed/delivered assistant and, for positive
 * SeYeon Memory, the independently acknowledged protected delivery receipt.
 * Only the canonical authenticated Member subject is sent to the private RPC.
 */
export async function handleChatCreditDeliveryAckCandidateV1(input:Readonly<{
  request:Request;
  requestId:string;
  serverTime:string;
  identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  pool:PostgresSubjectPoolV1;
}>):Promise<Response>{
  const {request,requestId}=input;
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
  const url=new URL(request.url);
  if(url.pathname!==CHAT_CREDIT_DELIVERY_ACK_HTTP_CANDIDATE_V1.route||
    url.search!=='')return failure(404,'NOT_FOUND',requestId);
  let identity;
  try{identity=await input.identityEvidenceVerifier.verifyRequestIdentity(request);}
  catch{return failure(503,'CREDIT_AUTHORITY_UNAVAILABLE',requestId);}
  if(identity===null)return failure(401,'AUTH_REQUIRED',requestId);
  if(identity.kind!=='member')return failure(403,'FORBIDDEN',requestId);
  const body=await boundedBody(request);
  if(body===null)return failure(400,'INVALID_REQUEST',requestId);
  try{
    const ack=await executePostgresSubjectTransactionV1({
      pool:input.pool,verifiedEvidence:identity,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member')throw Error('Member-only credit ACK');
        return acknowledgeDeliveredChatCreditCandidateV1({
          client,canonicalSubjectId:resolvedSubject.subjectId,
          canonicalSubjectKind:'member',...body,
          creditReservationId:body.reservationId,
          committedAssistantMessageId:body.assistantMessageId,
        });
      },
    });
    return Response.json({ok:true,data:ack,
      meta:{apiContractVersion:'v0.9',requestId,serverTime:input.serverTime}},
    {headers:{'Cache-Control':'no-store'}});
  }catch{
    return failure(503,'CREDIT_AUTHORITY_UNAVAILABLE',requestId);
  }
}
