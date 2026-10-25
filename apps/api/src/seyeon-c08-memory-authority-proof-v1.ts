import {createHash} from 'node:crypto';
import type {SeyeonRetrievedMemoryV2} from
  '../../../packages/domain/src/seyeon-runtime-context-v2.js';

export const SEYEON_C08_MEMORY_PROOF_VERSION_V1 =
  'seyeon-c08-memory-authority-proof-v1' as const;

/**
 * Source/Grant preflight for a FUTURE one-call grounded recall slot.
 * This does not authorize inserting a memory into an LLM prompt, draft,
 * session, Canon, or output. It only admits a server-verified candidate.
 */
export class SeyeonC08MemoryAuthorityHoldV1 extends Error {
  constructor(){
    super('LOCAL_MEMORY_AUTHORITY_UNPROVEN');
    this.name='SeyeonC08MemoryAuthorityHoldV1';
  }
}
export interface SeyeonC08MemoryAuthorityPortV1 {
  readAuthoritativeMemoryGrant(input:Readonly<{
    subjectId:string;threadId:string;currentUserMessageId:string;
    characterId:'seyeon';memoryId:string;sourceRef:string;
  }>):Promise<unknown>;
}
const hold=()=>new SeyeonC08MemoryAuthorityHoldV1();
function isRecord(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
export function hashSeyeonC08MemorySummaryV1(summary:string):string{
  if(typeof summary!=='string'||!summary.trim()||
     summary.length>4000)throw hold();
  return 'sha256:'+createHash('sha256')
    .update('seyeon-c08-memory-summary-v1\\n','utf8')
    .update(summary,'utf8').digest('hex');
}

export async function requireSeyeonC08MemoryAuthorityProofV1(input:Readonly<{
  port:SeyeonC08MemoryAuthorityPortV1|undefined;
  subjectId:string;threadId:string;currentUserMessageId:string;
  memory:SeyeonRetrievedMemoryV2;
}>):Promise<Readonly<{
  verified:true;memoryId:string;sourceRef:string;
  memoryMayBeSentToModel:false;memoryMayBeQuotedToUser:false;
  serverRenderedSlotRequired:true;
}>>{
  const m=input.memory;
  if(!input.port||typeof input.port.readAuthoritativeMemoryGrant!=='function'||
     !m||!['life_fact','memory'].includes(m.kind)||
     m.claimKind!=='fact'||m.causalAuthority!==undefined||
     typeof m.memoryId!=='string'||!m.memoryId.trim()||
     typeof m.sourceRef!=='string'||!m.sourceRef.trim()||
     m.memoryId.length>256||m.sourceRef.length>256||
     typeof input.subjectId!=='string'||!input.subjectId.trim()||
     typeof input.threadId!=='string'||!input.threadId.trim()||
     typeof input.currentUserMessageId!=='string'||
     !input.currentUserMessageId.trim())throw hold();
  const expectedHash=hashSeyeonC08MemorySummaryV1(m.summary);
  let raw:unknown;
  try{
    raw=await input.port.readAuthoritativeMemoryGrant({
      subjectId:input.subjectId,threadId:input.threadId,
      currentUserMessageId:input.currentUserMessageId,
      characterId:'seyeon',memoryId:m.memoryId,sourceRef:m.sourceRef,
    });
  }catch{throw hold();}
  if(!isRecord(raw)||Object.keys(raw).length!==13||
     raw.schemaVersion!==SEYEON_C08_MEMORY_PROOF_VERSION_V1||
     raw.subjectId!==input.subjectId||raw.threadId!==input.threadId||
     raw.currentUserMessageId!==input.currentUserMessageId||
     raw.characterId!=='seyeon'||raw.memoryId!==m.memoryId||
     raw.sourceRef!==m.sourceRef||raw.kind!==m.kind||
     raw.claimKind!=='fact'||raw.summaryHash!==expectedHash||
     raw.grantState!=='ACTIVE'||raw.complete!==true||
     raw.origin!=='AUTHORITATIVE_STORED_USER_MEMORY'|| 
     raw.assistantGenerated!==false)throw hold();
  return Object.freeze({
    verified:true as const,memoryId:m.memoryId,sourceRef:m.sourceRef,
    memoryMayBeSentToModel:false as const,
    memoryMayBeQuotedToUser:false as const,
    serverRenderedSlotRequired:true as const,
  });
}
