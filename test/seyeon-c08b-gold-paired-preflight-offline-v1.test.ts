import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  type RunSeyeonCharacterTurnV2Input,
  type SeyeonStructuredProviderPortV2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  createIntegrityClassifier,createDisclosureClassifier,
} from '../apps/api/src/seyeon-production-governance-v1.js';
import {createSeyeonUnifiedGovernanceCandidateV1}
  from '../apps/api/src/seyeon-unified-governance-candidate-v1.js';
import {runCharacterGovernedPreflightV1}
  from '../apps/api/src/character-governed-preflight-v1.js';
import {guardCharacterIntegrityClassificationV1}
  from '../apps/api/src/character-integrity-preflight-v1.js';
import {guardCharacterDisclosureTopicClassificationV2}
  from '../apps/api/src/character-disclosure-preflight-v2.js';
// @ts-expect-error Versioned offline MJS Gold has no generated declarations.
import {SEYEON_C07_BOUNDARY_MATRIX_V1 as MATRIX,
 scoreSeyeonC07BoundaryV1 as score} from
 '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';

type Gold={id:string;text:string;topic:string|null;expectedKinds:readonly string[]};
const IDS=[
 'A01','A04','A05','H01','H05','S01','S03','C01','C03',
 'C02_mixed-admin-private_01','C02_mixed-romance-forgery_01',
 'F02','R01',
] as const;
const GOLD:Gold[]=IDS.map(id=>{
 const matches=(MATRIX as Gold[]).filter(x=>x.id===id);
 if(matches.length!==1)throw Error('C08-B missing or duplicate immutable Gold '+id);
 return matches[0]!;
});
type Governance=RunSeyeonCharacterTurnV2Input['governance'];
type Seen={integrity?:unknown;disclosure?:unknown};
type Mode='legacy'|'unified';

function fixture(mode:Mode,gold:Gold){
 const calls:string[]=[];
 const rawClaims=gold.expectedKinds.map((kind,index)=>({
  claimId:'synthetic:'+gold.id+':'+index,kind,statement:'synthetic unverified assertion',
 }));
 const generate=vi.fn(async (req:SeyeonStructuredProviderRequestV2):Promise<unknown>=>{
  calls.push(req.purpose);
  if(req.purpose==='integrity_classification' && mode==='legacy')
   return {claims:structuredClone(rawClaims)};
  if(req.purpose==='disclosure_classification' && mode==='legacy')
   return {topicKey:gold.topic,questionContext:'casual_curiosity'};
  if(req.purpose==='unified_preflight_shadow' && mode==='unified')
   return {claims:structuredClone(rawClaims),topicKey:gold.topic,
    questionContext:'casual_curiosity'};
  throw Error('C08B_UNEXPECTED_PROVIDER_STAGE');
 });
 const provider:SeyeonStructuredProviderPortV2={
  providerKey:'c08b-offline-'+mode,modelKey:'fixture-no-real-model',generate,
 };
 const blockedDescriptor=vi.fn(()=>{
  throw Error('C08B_PRIVATE_DESCRIPTOR_NOT_AUTHORIZED');
 });
 const base:Governance={
  relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
  integrity:{
   classifier:createIntegrityClassifier(provider),
   authorityResolver:{resolve:async()=>({
    state:'MISSING' as const,authorityRefs:[],
    provenanceRefs:['c08b:synthetic-unverified'],
   })},
  },
  disclosure:{
   classifier:createDisclosureClassifier(provider),
   sourceDescriptor:{readDescriptor:blockedDescriptor},
   factAuthorityResolver:{resolve(){throw Error('C08B_PRIVATE_FACT_LOOKUP_FORBIDDEN');}},
   retriever:{retrieve(){throw Error('C08B_PRIVATE_RETRIEVAL_FORBIDDEN');}},
  },
 };
 const governance=mode==='unified'
  ?createSeyeonUnifiedGovernanceCandidateV1({governance:base,provider})
  :base;
 const seen:Seen={};
 // Capture the exact output of the existing guards, not fabricated scoring
 // inputs. Wrap only the two classifier ports; authority logic stays intact.
 const captured:Governance={
  ...governance,
  integrity:{
   ...governance.integrity,
   classifier:{async classify(input){
    const result=await governance.integrity.classifier.classify(input);
    seen.integrity=result;return result;
   }},
  },
  disclosure:{
   ...governance.disclosure,
   classifier:{async classify(input){
    const result=await governance.disclosure.classifier.classify(input);
    seen.disclosure=result;return result;
   }},
  },
 };
 const descriptorAdmission=vi.fn(()=>{
  throw Error('C08B_G0_SENSITIVE_DESCRIPTOR_HOLD');
 });
 async function run(){
  try{
   const result=await runCharacterGovernedPreflightV1({
    characterId:'seyeon',userMessageRef:'synthetic-user:'+gold.id,
    userText:gold.text,relationship:captured.relationship,
    integrity:captured.integrity,disclosure:captured.disclosure,
    beforeSourceDescriptorRead:descriptorAdmission,
   });
   return {status:'allowed' as const,result};
  }catch(error){
   // Only the deliberately injected G0 no-source-authority boundary is
   // an expected HOLD. A schema / guard / implementation error must fail.
   if(error instanceof Error &&
      error.message==='C08B_G0_SENSITIVE_DESCRIPTOR_HOLD')
    return {status:'held' as const,result:null};
   throw error;
  }
 }
 return {run,calls,generate,seen,blockedDescriptor,descriptorAdmission};
}

describe('C08-B Gold-paired real Preflight guards (fixture only, no Production)',()=>{
 it('pins 11 high-risk and two question-only immutable C07 Gold cases',()=>{
  expect(IDS).toHaveLength(13);
  expect(new Set(IDS).size).toBe(13);
  expect(GOLD.filter(g=>g.expectedKinds.length>0)).toHaveLength(11);
  expect(GOLD.filter(g=>g.expectedKinds.length===0).map(g=>g.id))
   .toEqual(['F02','R01']);
  expect(GOLD.filter(g=>g.topic!==null).map(g=>g.id))
   .toEqual(['C02_mixed-admin-private_01',
    'C02_mixed-romance-forgery_01','F02','R01']);
 });

 it.each(GOLD)('$id: legacy and unified guarded classification/authority are equivalent',async gold=>{
  const old=fixture('legacy',gold);
  const fast=fixture('unified',gold);
  const [original,candidate]=await Promise.all([old.run(),fast.run()]);
  expect(old.calls).toEqual(['integrity_classification','disclosure_classification']);
  expect(fast.calls).toEqual(['unified_preflight_shadow']);
  expect(old.generate).toHaveBeenCalledTimes(2);
  expect(fast.generate).toHaveBeenCalledTimes(1);
  for(const f of [old,fast]){
   const integrity=guardCharacterIntegrityClassificationV1(f.seen.integrity);
   const disclosure=guardCharacterDisclosureTopicClassificationV2(f.seen.disclosure);
   expect(score(gold,{
    topicKey:disclosure.topicKey,
    claimKinds:integrity.claims.map(claim=>claim.kind),
   }).verdict).toBe('MATCHED_GOLD_SCREEN');
  }
  expect(old.seen.integrity).toEqual(fast.seen.integrity);
  expect(old.seen.disclosure).toEqual(fast.seen.disclosure);
  expect(old.blockedDescriptor).not.toHaveBeenCalled();
  expect(fast.blockedDescriptor).not.toHaveBeenCalled();
  if(gold.topic!==null){
   expect(original.status).toBe('held');
   expect(candidate.status).toBe('held');
   expect(old.descriptorAdmission).toHaveBeenCalledOnce();
   expect(fast.descriptorAdmission).toHaveBeenCalledOnce();
  }else{
   expect(original.status).toBe('allowed');
   expect(candidate.status).toBe('allowed');
   if(original.status!=='allowed'||candidate.status!=='allowed')
    throw Error('C08B_UNEXPECTED_STATUS');
   expect(original.result.integrity.decisions)
    .toEqual(candidate.result.integrity.decisions);
   expect(original.result.disclosure).toEqual(candidate.result.disclosure);
   expect(original.result.retrievedPrivateSources).toEqual([]);
   expect(candidate.result.retrievedPrivateSources).toEqual([]);
   expect(old.descriptorAdmission).not.toHaveBeenCalled();
   expect(fast.descriptorAdmission).not.toHaveBeenCalled();
   for(const decision of candidate.result.integrity.decisions){
    expect(decision).toMatchObject({
     mayEnterWorkingContextAsFact:false,
     mayProposeUserMemory:false,
     mayCreateRelationshipEvent:false,
     mayMutateRelationshipState:false,
    });
   }
  }
 });

 it('does not represent 13 fixture pairs as 72 real-model observations',()=>{
  const source=readFileSync(
   new URL('./seyeon-c08b-gold-paired-preflight-offline-v1.test.ts',import.meta.url),
   'utf8');
  expect(source).not.toContain('process.env.'+'OPENAI_API_KEY');
  expect(source).not.toContain('createOpenAiSeyeon'+'StructuredProviderV1');
  expect(source).not.toContain('fetch'+'(');
  expect(source).not.toContain('workflow_'+'dispatch');
 });
});
