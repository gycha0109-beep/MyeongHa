// Watchtower-Track: security
// User-initiated S0 proposal staging only. Not mounted in any public router.
import { randomUUID } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import { proposeSeyeonOriginalUserMessageV1,
  type SeyeonOriginalMessageProposalReceiptV1 } from
  './postgres-seyeon-original-message-proposal-v1.js';

export const SEYEON_ORIGINAL_MESSAGE_PROPOSAL_HTTP_V1 = Object.freeze({
  method:'POST',
  routeTemplate:'/api/chat/:threadId/turns/:turnId/messages/:messageId/memory-proposal',
  publicRouteMounted:false,
  defaultDbWriteAdmission:'DENY',
  memberOnly:true,
  proposalKind:'private_original_message',
} as const);

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH=/^\/api\/chat\/([^/]+)\/turns\/([^/]+)\/messages\/([^/]+)\/memory-proposal$/u;
const MAX_BYTES=96;

export interface HandleSeyeonOriginalMessageProposalRequestV1 {
  readonly request:Request;
  readonly requestId:string;
  readonly serverTime:string;
  readonly identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  readonly pool:PostgresSubjectPoolV1;
  /** Explicit server-owned gate; never derived from headers, body or env. */
  readonly approvedDbWriteAdmission?:()=>boolean|Promise<boolean>;
  readonly propose?:(input:Readonly<{
    pool:PostgresSubjectPoolV1;
    verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
    subjectOwnedSource:Readonly<{
      threadId:string;turnId:string;messageId:string;proposalId:string;
    }>;
  }>)=>Promise<SeyeonOriginalMessageProposalReceiptV1>;
}

function reject(status:number,code:string,requestId:string):Response {
  return Response.json({ok:false,error:{code,retryable:false},
    meta:{apiContractVersion:'v0.9',requestId}},
    {status,headers:{'Cache-Control':'no-store'}});
}

async function exactPrivateChoice(request:Request):Promise<boolean> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type')??'') ||
      request.body===null) return false;
  let reader:ReadableStreamDefaultReader<Uint8Array>;
  try{reader=request.body.getReader();}catch{return false;}
  const chunks:Uint8Array[]=[];let size=0;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>
    {timeout=setTimeout(()=>reject(Error('Body deadline')),1500);});
  try{
    for(;;){
      if(request.signal.aborted)return false;
      const next=await Promise.race([reader.read(),deadline]);
      if(next.done)break;
      if(!(next.value instanceof Uint8Array))return false;
      size+=next.value.byteLength;
      if(size>MAX_BYTES)return false;
      chunks.push(next.value);
    }
    const bytes=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return data!==null && typeof data==='object' && !Array.isArray(data) &&
      Object.keys(data).length===1 &&
      (data as Record<string,unknown>).proposalChoice==='private_original_message';
  }catch{return false;}
  finally{
    if(timeout!==undefined)clearTimeout(timeout);
    try{void reader.cancel().catch(()=>undefined);}catch{}
    try{reader.releaseLock();}catch{}
  }
}

async function proposeInVerifiedMemberTransaction(input:Readonly<{
  pool:PostgresSubjectPoolV1;
  verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  subjectOwnedSource:Readonly<{
    threadId:string;turnId:string;messageId:string;proposalId:string;
  }>;
}>):Promise<SeyeonOriginalMessageProposalReceiptV1> {
  return executePostgresSubjectTransactionV1({
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:({resolvedSubject,client})=>{
      if(resolvedSubject.subjectKind!=='member')throw Error('Member required');
      return proposeSeyeonOriginalUserMessageV1(client,{
        subjectId:resolvedSubject.subjectId,...input.subjectOwnedSource,
      });
    },
  });
}

/** A proposal is NOT accepted private Memory and grants no character access. */
export async function handleSeyeonOriginalMessageProposalRequestV1(
  input:HandleSeyeonOriginalMessageProposalRequestV1,
):Promise<Response> {
  if(typeof input.requestId!=='string'||!input.requestId.trim()||
     !Number.isFinite(Date.parse(input.serverTime))){
    throw Error('Invalid server-owned proposal request metadata');
  }
  const url=new URL(input.request.url);
  const match=url.search===''&&url.hash===''?PATH.exec(url.pathname):null;
  const ids=match?.slice(1);
  if(!ids||ids.length!==3||!ids.every(x=>UUID.test(x))){
    return reject(404,'NOT_FOUND',input.requestId);
  }
  if(input.request.method!=='POST'){
    return new Response(null,{status:405,
      headers:{Allow:'POST','Cache-Control':'no-store'}});
  }
  if(!await exactPrivateChoice(input.request)){
    return reject(400,'INVALID_REQUEST',input.requestId);
  }
  const evidence=await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if(evidence===null)return reject(401,'AUTH_REQUIRED',input.requestId);
  if(evidence.kind!=='member')return reject(403,'MEMBER_REQUIRED',input.requestId);
  let approved=false;
  try{approved=input.approvedDbWriteAdmission!==undefined &&
    await input.approvedDbWriteAdmission()===true;}catch{}
  if(!approved||input.request.signal.aborted){
    return reject(503,'SEYEON_ORIGINAL_MESSAGE_PROPOSAL_UNAVAILABLE',input.requestId);
  }
  const [threadId,turnId,messageId]=ids as [string,string,string];
  const proposalId=randomUUID();
  try{
    const receipt=await (input.propose??proposeInVerifiedMemberTransaction)({
      pool:input.pool,verifiedEvidence:evidence,
      subjectOwnedSource:{threadId,turnId,messageId,proposalId},
    });
    if(receipt.proposalId!==proposalId ||receipt.proposalState!=='pending'||
       receipt.replayed!==false){
      return reject(503,'SEYEON_ORIGINAL_MESSAGE_PROPOSAL_UNAVAILABLE',input.requestId);
    }
    return Response.json({ok:true,data:{proposalId,proposalState:'pending',
      proposalKind:'memory',shareState:'private_not_accepted'},
      meta:{apiContractVersion:'v0.9',requestId:input.requestId,serverTime:input.serverTime}},
      {status:201,headers:{'Cache-Control':'no-store'}});
  }catch{
    return reject(503,'SEYEON_ORIGINAL_MESSAGE_PROPOSAL_UNAVAILABLE',input.requestId);
  }
}
