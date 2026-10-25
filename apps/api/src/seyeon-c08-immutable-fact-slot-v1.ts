import {createHash} from 'node:crypto';
import type {SeyeonRetrievedMemoryV2} from
  '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  hashSeyeonC08MemorySummaryV1,
  requireSeyeonC08MemoryAuthorityProofV1,
  type SeyeonC08MemoryAuthorityPortV1,
} from './seyeon-c08-memory-authority-proof-v1.js';

/**
 * C08 server-private fact-slot admission. This is NOT a natural-language
 * semantic verifier, renderer approval, or permission to disclose a memory.
 * An authoritative DB port is required. No caller-supplied hash, Grant, or
 * relationship stage can turn text into an authorised fact.
 */
export const SEYEON_C08_IMMUTABLE_FACT_SLOT_VERSION_V1 =
  'seyeon-c08-immutable-fact-slot-v1' as const;
export const SEYEON_C08_FACT_SLOT_READ_VERSION_V1 =
  'seyeon-c08-authoritative-fact-slot-read-v1' as const;

export class SeyeonC08FactSlotHoldV1 extends Error {
  constructor(){
    super('LOCAL_FACT_SLOT_AUTHORITY_UNPROVEN');
    this.name='SeyeonC08FactSlotHoldV1';
  }
}
const hold=()=>new SeyeonC08FactSlotHoldV1();
const record=(x:unknown):x is Record<string,unknown> =>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string =>
  typeof x==='string'&&x.length>0&&x.length<=256&&x.trim()===x &&
  !/[\\u0000-\\u001f\\u007f]/u.test(x);

export interface SeyeonC08FactSlotReadKeyV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly currentUserMessageId:string;
  readonly characterId:'seyeon';
  readonly memoryId:string;
  readonly sourceRef:string;
}
export interface SeyeonC08FactSlotAuthorityPortV1 {
  /** Transaction-consistent, owner-scoped read from Memory/LifeFact + Grant.
   * The returned summary MUST originate from the authoritative stored row.
   */
  readAuthoritativeFactSlot(key:Readonly<SeyeonC08FactSlotReadKeyV1>):
    Promise<unknown>;
}

/**
 * The source version and active Grant revision must be obtained from the same
 * authoritative database snapshot. An explicit per-character/thread Grant
 * cannot be substituted with relationship stage or an old visibility label.
 */
export interface SeyeonC08ImmutableFactSlotV1 {
  readonly schemaVersion:typeof SEYEON_C08_IMMUTABLE_FACT_SLOT_VERSION_V1;
  readonly bindingHash:string;
  readonly subjectId:string;
  readonly threadId:string;
  readonly currentUserMessageId:string;
  readonly characterId:'seyeon';
  readonly memoryId:string;
  readonly sourceRef:string;
  readonly kind:'memory'|'life_fact';
  readonly summaryHash:string;
  readonly sourceRevision:string;
  readonly grantId:string;
  readonly grantRevision:string;
  readonly authority:'SERVER_SOURCED_FACT_METADATA_ONLY';
  readonly modelContentAccess:'DENIED';
  readonly userQuoteAccess:'DENIED';
  readonly rendering:'SERVER_PROTECTED_CONTRACT_REQUIRED';
}

type SlotInput=Readonly<{
  subjectId:string;threadId:string;currentUserMessageId:string;
  memory:SeyeonRetrievedMemoryV2;
  proofPort:SeyeonC08MemoryAuthorityPortV1|undefined;
  factSlotPort:SeyeonC08FactSlotAuthorityPortV1|undefined;
}>;

function bindingHash(slot:Pick<SeyeonC08ImmutableFactSlotV1,
  'subjectId'|'threadId'|'currentUserMessageId'|'characterId'|
  'memoryId'|'sourceRef'|'kind'|'summaryHash'|'sourceRevision'|
  'grantId'|'grantRevision'>):string{
  // Internal integrity commitment, not an anonymisation or access token.
  return 'sha256:'+createHash('sha256')
    .update('seyeon-c08-immutable-fact-slot-v1\n','utf8')
    .update(JSON.stringify([
      slot.subjectId,slot.threadId,slot.currentUserMessageId,
      slot.characterId,slot.memoryId,slot.sourceRef,slot.kind,
      slot.summaryHash,slot.sourceRevision,slot.grantId,
      slot.grantRevision,
    ]),'utf8').digest('hex');
}

async function readVerifiedSnapshot(
  input:SlotInput,
  key:SeyeonC08FactSlotReadKeyV1,
  expectedSummaryHash:string,
):Promise<Readonly<{
  sourceRevision:string;grantId:string;grantRevision:string;
}>>{
  if(!input.factSlotPort ||
     typeof input.factSlotPort.readAuthoritativeFactSlot!=='function')throw hold();
  let raw:unknown;
  try{raw=await input.factSlotPort.readAuthoritativeFactSlot(key);}
  catch{throw hold();}
  if(!record(raw) ||
     Object.keys(raw).sort().join('|')!==[
       'assistantGenerated','characterId','claimKind','complete',
       'currentUserMessageId','grantId','grantRevision','grantState',
       'kind','memoryId','origin','recordState','schemaVersion',
       'sourceRef','sourceRevision','subjectId','summary','threadId',
     ].sort().join('|') ||
     raw.schemaVersion!==SEYEON_C08_FACT_SLOT_READ_VERSION_V1 ||
     raw.subjectId!==key.subjectId||raw.threadId!==key.threadId||
     raw.currentUserMessageId!==key.currentUserMessageId||
     raw.characterId!=='seyeon'||raw.memoryId!==key.memoryId||
     raw.sourceRef!==key.sourceRef||raw.kind!==input.memory.kind||
     raw.claimKind!=='fact'||raw.complete!==true||
     raw.origin!=='AUTHORITATIVE_STORED_USER_MEMORY'||
     raw.assistantGenerated!==false||raw.recordState!=='ACTIVE'||
     raw.grantState!=='ACTIVE'||!id(raw.sourceRevision)||
     !id(raw.grantId)||!id(raw.grantRevision)||
     typeof raw.summary!=='string')throw hold();
  let summaryHash:string;
  try{summaryHash=hashSeyeonC08MemorySummaryV1(raw.summary);}
  catch{throw hold();}
  if(summaryHash!==expectedSummaryHash)throw hold();
  return Object.freeze({
    sourceRevision:raw.sourceRevision,
    grantId:raw.grantId,
    grantRevision:raw.grantRevision,
  });
}

export async function admitSeyeonC08ImmutableFactSlotV1(
  input:SlotInput,
):Promise<Readonly<SeyeonC08ImmutableFactSlotV1>>{
  const m=input.memory;
  if(!m||!id(input.subjectId)||!id(input.threadId)||
     !id(input.currentUserMessageId)||
     !id(m.memoryId)||!id(m.sourceRef)||
     !['memory','life_fact'].includes(m.kind)||m.claimKind!=='fact'||
     m.causalAuthority!==undefined)throw hold();
  const key=Object.freeze({
    subjectId:input.subjectId,threadId:input.threadId,
    currentUserMessageId:input.currentUserMessageId,
    characterId:'seyeon' as const,
    memoryId:m.memoryId,sourceRef:m.sourceRef,
  });
  let expectedSummaryHash:string;
  try{
    expectedSummaryHash=hashSeyeonC08MemorySummaryV1(m.summary);
    await requireSeyeonC08MemoryAuthorityProofV1({
      port:input.proofPort,subjectId:input.subjectId,
      threadId:input.threadId,currentUserMessageId:input.currentUserMessageId,
      memory:m,
    });
  }catch{throw hold();}
  const snapshot=await readVerifiedSnapshot(input,key,expectedSummaryHash);
  const identity={
    ...key,kind:m.kind as 'memory'|'life_fact',
    summaryHash:expectedSummaryHash,
    sourceRevision:snapshot.sourceRevision,grantId:snapshot.grantId,
    grantRevision:snapshot.grantRevision,
  };
  return Object.freeze({
    schemaVersion:SEYEON_C08_IMMUTABLE_FACT_SLOT_VERSION_V1,
    ...identity,bindingHash:bindingHash(identity),
    authority:'SERVER_SOURCED_FACT_METADATA_ONLY' as const,
    modelContentAccess:'DENIED' as const,
    userQuoteAccess:'DENIED' as const,
    rendering:'SERVER_PROTECTED_CONTRACT_REQUIRED' as const,
  });
}

/** Recheck the SAME fact and Grant before any future use/checkpoint. No
 * continuation, model disclosure or user quote is approved by this function.
 * Revisions/ownership/content drift must HOLD rather than silently rebind.
 */
export async function requireSeyeonC08FactSlotStillCurrentV1(
  input:SlotInput&Readonly<{slot:SeyeonC08ImmutableFactSlotV1}>,
):Promise<void>{
  const s=input.slot;
  if(!s||s.schemaVersion!==SEYEON_C08_IMMUTABLE_FACT_SLOT_VERSION_V1||
     s.authority!=='SERVER_SOURCED_FACT_METADATA_ONLY'||
     s.modelContentAccess!=='DENIED'||s.userQuoteAccess!=='DENIED'||
     s.rendering!=='SERVER_PROTECTED_CONTRACT_REQUIRED'||
     s.subjectId!==input.subjectId||s.threadId!==input.threadId||
     s.currentUserMessageId!==input.currentUserMessageId||
     s.characterId!=='seyeon'||s.memoryId!==input.memory?.memoryId||
     s.sourceRef!==input.memory?.sourceRef||
     s.kind!==input.memory?.kind)throw hold();
  const current=await admitSeyeonC08ImmutableFactSlotV1(input);
  if(s.bindingHash!==current.bindingHash||
     s.summaryHash!==current.summaryHash||
     s.sourceRevision!==current.sourceRevision||
     s.grantId!==current.grantId||
     s.grantRevision!==current.grantRevision)throw hold();
}
