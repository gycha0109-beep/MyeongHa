import type {
  SeyeonRelationshipContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';

export const SEYEON_C08_PUBLIC_RELATIONSHIP_PROOF_VERSION_V1 =
  'seyeon-c08-public-relationship-proof-v1' as const;

/** The port must read the authoritative current relationship revision,
 * scoped to the authenticated subject/thread, at each recheck.
 * Caller-supplied context or an LLM result is never an authority port.
 */
export interface SeyeonC08PublicRelationshipProofPortV1 {
  readAuthoritativeRelationship(input: Readonly<{
    subjectId:string;threadId:string;currentUserMessageId:string;
    characterId:'seyeon';
  }>):Promise<unknown>;
}

export class SeyeonC08PublicRelationshipProofHoldV1 extends Error {
  constructor(){
    super('LOCAL_RELATIONSHIP_AUTHORITY_UNPROVEN');
    this.name='SeyeonC08PublicRelationshipProofHoldV1';
  }
}
const hold=()=>new SeyeonC08PublicRelationshipProofHoldV1();
const record=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==='object'&&!Array.isArray(v);

/**
 * Relationship is an expression-policy input, not a fact/Memory/Reveal Grant.
 * Strictly require the pinned stage, revision, all bands and policy version.
 * The authoritative store must also prove PUBLIC access and no private Grant.
 */
export async function requireSeyeonC08PublicRelationshipProofV1(input:Readonly<{
  port:SeyeonC08PublicRelationshipProofPortV1 | undefined;
  subjectId:string;threadId:string;currentUserMessageId:string;
  expected:SeyeonRelationshipContextV2;
}>):Promise<void>{
  if(!input.port||typeof input.port.readAuthoritativeRelationship!=='function'||
     !record(input.expected)||typeof input.subjectId!=='string'||
     typeof input.threadId!=='string'||typeof input.currentUserMessageId!=='string'||
     !input.subjectId.trim()||!input.threadId.trim()||
     !input.currentUserMessageId.trim())throw hold();
  let raw:unknown;
  try{
    raw=await input.port.readAuthoritativeRelationship({
      subjectId:input.subjectId,threadId:input.threadId,
      currentUserMessageId:input.currentUserMessageId,characterId:'seyeon',
    });
  }catch{throw hold();}
  if(!record(raw)||Object.keys(raw).length!==9||
     raw.schemaVersion!==SEYEON_C08_PUBLIC_RELATIONSHIP_PROOF_VERSION_V1||
     raw.subjectId!==input.subjectId||raw.threadId!==input.threadId||
     raw.currentUserMessageId!==input.currentUserMessageId||
     raw.characterId!=='seyeon'||raw.complete!==true||
     raw.publicConversationEligible!==true||
     raw.privateDisclosureAuthorized!==false||
     !record(raw.relationship))throw hold();
  const r=raw.relationship;
  const expected=input.expected;
  if(Object.keys(r).length!==6 ||
     r.stageKey!==expected.stageKey||
     r.closenessBand!==expected.closenessBand||
     r.trustBand!==expected.trustBand||
     r.frictionBand!==expected.frictionBand||
     r.revision!==expected.revision||
     r.policyVersion!==expected.policyVersion||
     !Number.isSafeInteger(r.revision)||Number(r.revision)<0 ||
     typeof r.stageKey!=='string'||!r.stageKey.trim()||
     typeof r.policyVersion!=='string'||!r.policyVersion.trim())throw hold();
}
