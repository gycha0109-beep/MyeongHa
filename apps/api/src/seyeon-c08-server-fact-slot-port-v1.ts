import {
  SEYEON_C08_FACT_SLOT_READ_VERSION_V1,
  SeyeonC08FactSlotHoldV1,
  type SeyeonC08FactSlotAuthorityPortV1,
  type SeyeonC08FactSlotReadKeyV1,
} from './seyeon-c08-immutable-fact-slot-v1.js';

/**
 * Server-owned adapter seam. readScopedFactAndGrant MUST query the canonical
 * Memory/LifeFact and active character access Grant in a consistent snapshot,
 * with ownership and record status enforced in the database.
 * This is not wired to a Production DB or a disclosure renderer.
 */
export interface SeyeonC08AuthoritativeFactAndGrantRowV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly currentUserMessageId:string;
  readonly characterId:'seyeon';
  readonly memoryId:string;
  readonly sourceRef:string;
  readonly kind:'memory'|'life_fact'|'relationship_event';
  readonly claimKind:'fact'|'character_interpretation';
  readonly summary:string;
  readonly origin:'AUTHORITATIVE_STORED_USER_MEMORY'|'ASSISTANT_CONVERSATION';
  readonly assistantGenerated:boolean;
  readonly recordState:'ACTIVE'|'REVOKED';
  readonly grantState:'ACTIVE'|'REVOKED'|'MISSING';
  readonly sourceRevision:string;
  readonly grantId:string;
  readonly grantRevision:string;
  readonly complete:boolean;
}
const fail=()=>new SeyeonC08FactSlotHoldV1();
const valid=(s:unknown):s is string=>
  typeof s==='string'&&s.length>0&&s.length<=256&&s.trim()===s;

export function createSeyeonC08ServerFactSlotPortV1(input:Readonly<{
  subjectId:string;threadId:string;
  readScopedFactAndGrant:(key:Readonly<SeyeonC08FactSlotReadKeyV1>)=>
    Promise<SeyeonC08AuthoritativeFactAndGrantRowV1>;
}>):SeyeonC08FactSlotAuthorityPortV1{
  if(!input||!valid(input.subjectId)||!valid(input.threadId)||
     typeof input.readScopedFactAndGrant!=='function')throw fail();
  return Object.freeze({
    async readAuthoritativeFactSlot(key:Readonly<SeyeonC08FactSlotReadKeyV1>){
      if(!key||key.subjectId!==input.subjectId||
         key.threadId!==input.threadId||key.characterId!=='seyeon'||
         !valid(key.currentUserMessageId)||!valid(key.memoryId)||
         !valid(key.sourceRef))throw fail();
      let row:SeyeonC08AuthoritativeFactAndGrantRowV1;
      try{row=await input.readScopedFactAndGrant(key);}
      catch{throw fail();}
      if(!row||row.subjectId!==key.subjectId||
         row.threadId!==key.threadId||
         row.currentUserMessageId!==key.currentUserMessageId||
         row.characterId!==key.characterId||
         row.memoryId!==key.memoryId||row.sourceRef!==key.sourceRef||
         !['memory','life_fact'].includes(row.kind)||
         row.claimKind!=='fact'||row.recordState!=='ACTIVE'||
         row.grantState!=='ACTIVE'||
         row.origin!=='AUTHORITATIVE_STORED_USER_MEMORY'||
         row.assistantGenerated!==false||row.complete!==true||
         !valid(row.sourceRevision)||!valid(row.grantId)||
         !valid(row.grantRevision)||
         typeof row.summary!=='string')throw fail();
      return Object.freeze({
        schemaVersion:SEYEON_C08_FACT_SLOT_READ_VERSION_V1,
        subjectId:key.subjectId,threadId:key.threadId,
        currentUserMessageId:key.currentUserMessageId,
        characterId:'seyeon' as const,memoryId:key.memoryId,
        sourceRef:key.sourceRef,kind:row.kind,claimKind:'fact' as const,
        summary:row.summary,recordState:'ACTIVE' as const,
        grantState:'ACTIVE' as const,
        origin:'AUTHORITATIVE_STORED_USER_MEMORY' as const,
        assistantGenerated:false as const,complete:true as const,
        sourceRevision:row.sourceRevision,grantId:row.grantId,
        grantRevision:row.grantRevision,
      });
    },
  });
}
