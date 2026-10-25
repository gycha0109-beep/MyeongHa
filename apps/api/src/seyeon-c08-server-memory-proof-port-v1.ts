import {
  SEYEON_C08_MEMORY_PROOF_VERSION_V1,
  SeyeonC08MemoryAuthorityHoldV1,
  hashSeyeonC08MemorySummaryV1,
  type SeyeonC08MemoryAuthorityPortV1,
} from './seyeon-c08-memory-authority-proof-v1.js';

/**
 * Authenticated DB adapter for C08 source/Grant proof. Caller must guarantee
 * a transaction-consistent read owned by the scoped subject and thread.
 * The returned proof contains a hash, NEVER the private text itself.
 */
export interface SeyeonC08AuthoritativeMemoryGrantReadV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly characterId:'seyeon';
  readonly memoryId:string;
  readonly sourceRef:string;
  readonly kind:'memory'|'life_fact'|'relationship_event';
  readonly claimKind:'fact'|'character_interpretation';
  readonly summary:string;
  readonly grantState:'ACTIVE'|'REVOKED'|'MISSING';
  readonly origin:'AUTHORITATIVE_STORED_USER_MEMORY'|'ASSISTANT_CONVERSATION';
  readonly assistantGenerated:boolean;
  readonly complete:boolean;
}
export function createSeyeonC08ServerMemoryProofPortV1(input:Readonly<{
  subjectId:string;threadId:string;
  readScopedMemoryGrant: (key:Readonly<{
    subjectId:string;threadId:string;currentUserMessageId:string;
    characterId:'seyeon';memoryId:string;sourceRef:string;
  }>)=>Promise<SeyeonC08AuthoritativeMemoryGrantReadV1>;
}>):SeyeonC08MemoryAuthorityPortV1{
  const hold=()=>new SeyeonC08MemoryAuthorityHoldV1();
  if(!input||typeof input.subjectId!=='string'||!input.subjectId.trim()||
     input.subjectId!==input.subjectId.trim()||input.subjectId.length>256||
     typeof input.threadId!=='string'||!input.threadId.trim()||
     input.threadId!==input.threadId.trim()||input.threadId.length>256||
     typeof input.readScopedMemoryGrant!=='function')throw hold();
  return Object.freeze({
    async readAuthoritativeMemoryGrant(key){
      if(key.subjectId!==input.subjectId||key.threadId!==input.threadId||
         key.characterId!=='seyeon'||!key.currentUserMessageId.trim()||
         !key.memoryId.trim()||!key.sourceRef.trim()||
         key.memoryId.length>256||key.sourceRef.length>256)throw hold();
      let row:SeyeonC08AuthoritativeMemoryGrantReadV1;
      try{row=await input.readScopedMemoryGrant(key);}
      catch{throw hold();}
      if(!row||row.subjectId!==key.subjectId||
         row.threadId!==key.threadId||row.characterId!=='seyeon'||
         row.memoryId!==key.memoryId||row.sourceRef!==key.sourceRef||
         !['memory','life_fact'].includes(row.kind)||
         row.claimKind!=='fact'||row.grantState!=='ACTIVE'||
         row.origin!=='AUTHORITATIVE_STORED_USER_MEMORY'||
         row.assistantGenerated!==false||row.complete!==true)throw hold();
      return Object.freeze({
        schemaVersion:SEYEON_C08_MEMORY_PROOF_VERSION_V1,
        subjectId:key.subjectId,threadId:key.threadId,
        currentUserMessageId:key.currentUserMessageId,
        characterId:'seyeon' as const,memoryId:key.memoryId,
        sourceRef:key.sourceRef,kind:row.kind,claimKind:'fact' as const,
        summaryHash:hashSeyeonC08MemorySummaryV1(row.summary),
        grantState:'ACTIVE' as const,complete:true as const,
        origin:'AUTHORITATIVE_STORED_USER_MEMORY' as const,
        assistantGenerated:false as const,
      });
    },
  });
}
