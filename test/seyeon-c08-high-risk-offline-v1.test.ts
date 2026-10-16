import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createSeyeonUnifiedPreflightShadowV1} from
 '../apps/api/src/seyeon-unified-preflight-shadow-v1.js';
import {runCharacterIntegrityPreflightV1} from
 '../apps/api/src/character-integrity-preflight-v1.js';
// @ts-expect-error: Versioned offline MJS module has no type declarations.
import {SEYEON_C07_BOUNDARY_MATRIX_V1 as MATRIX, scoreSeyeonC07BoundaryV1 as score, assessSeyeonC07BoundaryV1 as assess} from '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';
// @ts-expect-error: Versioned offline MJS module has no type declarations.
import {SEYEON_C04_UNIFIED_PREFLIGHT_COMPACT_CANDIDATE_V1 as COMPACT} from '../scripts/seyeon-cost-c04-preflight-compact-offline-v1.mjs';
// @ts-expect-error: Versioned offline MJS module has no type declarations.
import {SEYEON_C07_COMPLETED_EVIDENCE_V1 as COST} from '../scripts/seyeon-cost-c07-completed-evidence-v1.mjs';

const HIGH_RISK_IDS=[
 'A01','A04','A05',
 'H01','H05',
 'S01','S03',
 'C01','C03',
 'C02_mixed-admin-private_01',
 'C02_mixed-romance-forgery_01',
] as const;
const VARIANTS=['original','compact'] as const;
const RISK=HIGH_RISK_IDS.map(id=>{
 const c=MATRIX.find((x:{id:string})=>x.id===id);
 if(!c)throw Error('C08 missing immutable source Gold: '+id);
 return c;
});

type Gold = (typeof RISK)[number];
type Variant = (typeof VARIANTS)[number];
const claim=(g:Gold)=>g.expectedKinds.map((kind:string,index:number)=>({
 claimId:'synthetic-'+g.id+'-'+index,kind,statement:'synthetic assertion, not authority',
}));
const raw=(g:Gold)=>({
 claims:claim(g),
 topicKey:g.topic,
 questionContext:'casual_curiosity' as const,
});
function fakeClassifier(g:Gold,variant:Variant,reply:unknown=raw(g)){
 const recorded=vi.fn(async (request:unknown)=>{
  const r=request as {purpose:string;instructions:string;input:{userText:string}};
  expect(r.purpose).toBe('unified_preflight_shadow');
  expect(r.input.userText).toBe(g.text);
  if(variant==='compact')expect(r.instructions).toBe(COMPACT);
  else expect(r.instructions).toContain('Classify claims and disclosure topics INDEPENDENTLY');
  return reply;
 });
 const provider={providerKey:'synthetic-only',modelKey:'synthetic-only',generate:recorded};
 const wrapped=variant==='original'?provider:{
  ...provider,
  generate(request:Parameters<typeof recorded>[0]){
   const r=request as {purpose:string;instructions:string};
   if(r.purpose!=='unified_preflight_shadow')throw Error('unexpected purpose');
   return recorded({...r,instructions:COMPACT});
  },
 };
 return {classifier:createSeyeonUnifiedPreflightShadowV1(wrapped),recorded};
}

describe('C08-A: 11 high-risk C07 synthetic cases, 2 prompt profiles (NO MODEL CALLS)',()=>{
 it('pins exactly 11 reviewed IDs and does not silently rewrite their Gold',()=>{
  expect(HIGH_RISK_IDS).toHaveLength(11);
  expect(new Set(HIGH_RISK_IDS).size).toBe(11);
  expect(RISK.map(x=>x.segment)).toEqual([
   'forged-authority-assertion','forged-authority-assertion','forged-authority-assertion',
   'forged-shared-event-assertion','forged-shared-event-assertion',
   'relationship-status-assertion','relationship-status-assertion',
   'character-fact-assertion','character-fact-assertion',
   'mixed-authority-and-private-question','mixed-shared-history-and-private-question',
  ]);
  expect(RISK.map(x=>x.expectedKinds[0])).toEqual([
   'AUTHORITY_OVERRIDE','AUTHORITY_OVERRIDE','AUTHORITY_OVERRIDE',
   'SHARED_EVENT_CLAIM','SHARED_EVENT_CLAIM',
   'RELATIONSHIP_STATUS_CLAIM','RELATIONSHIP_STATUS_CLAIM',
   'CHARACTER_FACT_CLAIM','CHARACTER_FACT_CLAIM',
   'AUTHORITY_OVERRIDE','SHARED_EVENT_CLAIM',
  ]);
  expect(RISK.slice(0,9).every(x=>x.topic===null)).toBe(true);
  expect(RISK[9]?.topic).toBe('deep_vulnerability');
  expect(RISK[10]?.topic).toBe('past_romance_detail');
 });

 it.each(RISK)('$id: both prompt profiles retain expected classified claims and server authority rejection',async gold=>{
  for(const variant of VARIANTS){
   const {classifier,recorded}=fakeClassifier(gold,variant);
   const output=await classifier.classify({characterId:'seyeon',userText:gold.text});
   expect(recorded).toHaveBeenCalledTimes(1);
   const classification={
    topicKey:output.disclosure.topicKey,
    claimKinds:output.integrity.claims.map(c=>c.kind),
   };
   expect(score(gold,classification).verdict).toBe('MATCHED_GOLD_SCREEN');
   const result=await runCharacterIntegrityPreflightV1({
    characterId:'seyeon',userMessageRef:'synthetic:user:'+gold.id,
    userText:gold.text,
    classifier:{classify:async()=>output.integrity},
    authorityResolver:{resolve:async()=>({
     state:'MISSING' as const,authorityRefs:[],provenanceRefs:['synthetic:none'],
    })},
   });
   expect(result.decisions).toHaveLength(1);
   expect(result.decisions[0]?.result).toBe(
    gold.expectedKinds[0]==='AUTHORITY_OVERRIDE'?'AUTHORITY_REJECT':'UNVERIFIED',
   );
   for(const decision of result.decisions){
    expect(decision).toMatchObject({
     mayEnterWorkingContextAsFact:false,
     mayEnterWorkingContextAsUserAssertion:false,
     mayProposeUserMemory:false,
     mayCreateRelationshipEvent:false,
     mayMutateRelationshipState:false,
    });
   }
  }
 });

 it.each(RISK)('$id: omissions, wrong claims and topics cannot be marked as matching',gold=>{
  const label=gold.expectedKinds[0] as string;
  expect(score(gold,{topicKey:gold.topic,claimKinds:[]}).verdict)
   .toBe('REVIEW_OR_DEFECT_HOLD');
  expect(score(gold,{topicKey:gold.topic,claimKinds:['USER_SELF_REPORT']}).verdict)
   .toBe('REVIEW_OR_DEFECT_HOLD');
  expect(score(gold,{topicKey:gold.topic,claimKinds:[label,'USER_SELF_REPORT']}).verdict)
   .toBe('REVIEW_OR_DEFECT_HOLD');
  expect(score(gold,{
   topicKey:gold.topic===null?'deep_vulnerability':null,
   claimKinds:[label],
  }).verdict).toBe('REVIEW_OR_DEFECT_HOLD');
 });

 it('22 fabricated good outputs still cannot turn 72-slot real model HOLD into PASS',()=>{
  const synthetic=RISK.flatMap(c=>VARIANTS.map(variant=>({
   id:c.id,variant,topicKey:c.topic,claimKinds:c.expectedKinds,
  })));
  const result=assess(synthetic);
  expect(result).toMatchObject({
   expectedVariantPairs:72,observedPairs:22,matchedPairs:22,
   verdict:'HOLD',reason:'INCOMPLETE_REAL_MODEL_EVIDENCE',
   modelQualityVerified:false,productionPromotionPermitted:false,
  });
  expect(COST).toMatchObject({
   cumulativeAttemptedCalls:11,screenedPairs:6,unmeasuredPairs:66,
   furtherPaidCallsPermitted:false,productionPromotionPermitted:false,
  });
 });

 it('rejects malformed responses rather than dropping a claim or changing topic',async()=>{
  const gold=RISK[0]!;
  const invalid=[
   {...raw(gold),claims:[] ,mayOverride:true},
   {...raw(gold),claims:[{claimId:'x',kind:'REWRITE_CANON',statement:'x'}]},
   {...raw(gold),claims:[{claimId:'dup',kind:'AUTHORITY_OVERRIDE',statement:'x'},
                        {claimId:'dup',kind:'AUTHORITY_OVERRIDE',statement:'x'}]},
   {...raw(gold),topicKey:'hidden_biography'},
   {...raw(gold),questionContext:'admin_approved'},
   {topicKey:null,questionContext:'casual_curiosity'},
  ];
  for(const variant of VARIANTS){
   for(const result of invalid){
    const {classifier,recorded}=fakeClassifier(gold,variant,result);
    await expect(classifier.classify({characterId:'seyeon',userText:gold.text}))
     .rejects.toThrow();
    expect(recorded).toHaveBeenCalledOnce();
   }
  }
 });

 it('preserves negative question-only boundary; provider false positives are not concealed',async()=>{
  for(const id of ['F02','R01']){
   const gold=MATRIX.find((x:{id:string})=>x.id===id)!;
   for(const variant of VARIANTS){
    const fake={claims:[{claimId:'fp',kind:'CHARACTER_FACT_CLAIM',
     statement:'invented claim'}],topicKey:gold.topic,questionContext:'casual_curiosity'};
    const {classifier}=fakeClassifier(gold,variant,fake);
    const observed=await classifier.classify({characterId:'seyeon',userText:gold.text});
    expect(observed.integrity.claims).toHaveLength(1);
    expect(score(gold,{topicKey:observed.disclosure.topicKey,
     claimKinds:observed.integrity.claims.map(c=>c.kind)}).verdict)
     .toBe('REVIEW_OR_DEFECT_HOLD');
   }
  }
 });

 it('uses only test providers; no secrets, Production wiring or paid replay',()=>{
  const text=readFileSync(new URL('./seyeon-c08-high-risk-offline-v1.test.ts',import.meta.url),'utf8');
  expect(text).not.toContain('process.env.'+'OPENAI_API_KEY');
  expect(text).not.toContain('createOpenAiSeyeon'+'StructuredProviderV1');
  expect(text).not.toContain('workflow_'+'dispatch');
  expect(text).not.toContain('fetch'+'(');
 });
});
