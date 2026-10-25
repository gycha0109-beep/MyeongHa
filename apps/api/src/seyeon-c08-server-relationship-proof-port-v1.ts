import type { SeyeonRelationshipContextV2 } from
  '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  SEYEON_C08_PUBLIC_RELATIONSHIP_PROOF_VERSION_V1,
  SeyeonC08PublicRelationshipProofHoldV1,
  type SeyeonC08PublicRelationshipProofPortV1,
} from './seyeon-c08-public-relationship-proof-v1.js';

/** Transaction-consistent result from the authenticated relationship store.
 * This is NOT an assertion that a user- or model-supplied value is trusted.
 * The adapter intentionally never returns private source content.
 */
export interface SeyeonC08AuthoritativeRelationshipReadV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly characterId:'seyeon';
  readonly complete:true;
  readonly publicConversationEligible:boolean;
  readonly privateDisclosureAuthorized:false;
  readonly relationship:SeyeonRelationshipContextV2 | null;
}
export function createSeyeonC08ServerRelationshipProofPortV1(input:Readonly<{
  subjectId:string;threadId:string;
  readCurrentRelationship: (key:Readonly<{
    subjectId:string;threadId:string;currentUserMessageId:string;
    characterId:'seyeon';
  }>)=>Promise<SeyeonC08AuthoritativeRelationshipReadV1>;
}>):SeyeonC08PublicRelationshipProofPortV1{
  const fail=()=>new SeyeonC08PublicRelationshipProofHoldV1();
  if(!input||typeof input.subjectId!=='string'||!input.subjectId.trim()||
     input.subjectId!==input.subjectId.trim()||input.subjectId.length>256||
     typeof input.threadId!=='string'||!input.threadId.trim()||
     input.threadId!==input.threadId.trim()||input.threadId.length>256||
     typeof input.readCurrentRelationship!=='function')throw fail();
  return Object.freeze({
    async readAuthoritativeRelationship(key:Readonly<{
      subjectId:string;threadId:string;currentUserMessageId:string;
      characterId:'seyeon';
    }>){
      if(key.subjectId!==input.subjectId||key.threadId!==input.threadId||
         key.characterId!=='seyeon'||!key.currentUserMessageId?.trim()||
         key.currentUserMessageId.length>256)throw fail();
      let record:SeyeonC08AuthoritativeRelationshipReadV1;
      try{record=await input.readCurrentRelationship(key);}
      catch{throw fail();}
      if(!record||record.complete!==true||
         record.subjectId!==input.subjectId||
         record.threadId!==input.threadId||
         record.characterId!=='seyeon'||
         record.publicConversationEligible!==true||
         record.privateDisclosureAuthorized!==false||
         !record.relationship)throw fail();
      const r=record.relationship;
      if(typeof r.stageKey!=='string'||!r.stageKey.trim()||
         typeof r.policyVersion!=='string'||!r.policyVersion.trim()||
         !Number.isSafeInteger(r.revision)||r.revision<0||
         !['low','medium','high'].includes(r.closenessBand)||
         !['low','medium','high'].includes(r.trustBand)||
         !['low','medium','high'].includes(r.frictionBand))throw fail();
      const snapshot=Object.freeze({
        stageKey:r.stageKey,closenessBand:r.closenessBand,
        trustBand:r.trustBand,frictionBand:r.frictionBand,
        revision:r.revision,policyVersion:r.policyVersion,
      });
      return Object.freeze({
        schemaVersion:SEYEON_C08_PUBLIC_RELATIONSHIP_PROOF_VERSION_V1,
        subjectId:input.subjectId,threadId:input.threadId,
        currentUserMessageId:key.currentUserMessageId,characterId:'seyeon' as const,
        complete:true as const,publicConversationEligible:true as const,
        privateDisclosureAuthorized:false as const,relationship:snapshot,
      });
    },
  });
}
