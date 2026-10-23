import {describe,expect,it} from 'vitest';
import {
 SEYEON_C07_BOUNDARY_MATRIX_V1 as CASES,
 SEYEON_C07_BOUNDARY_VARIANTS_V1 as VARIANTS,
 SEYEON_C07_MATRIX_CASE_COUNT_V1 as COUNT,
 SEYEON_C07_MATRIX_EXPECTED_OBSERVATIONS_V1 as PAIRS,
 scoreSeyeonC07BoundaryV1 as score,
 assessSeyeonC07BoundaryV1 as assess,
} from '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';
import {SEYEON_MODEL_EVAL_CASES_V1 as ORIGINAL}
 from '../scripts/seyeon-model-eval-cases-v1.mjs';
import {SEYEON_C06_EIGHT_CALL_GOLD_V1 as MIXED}
 from '../scripts/seyeon-cost-c06-eight-call-cases-v1.mjs';

const item=id=>CASES.find(x=>x.id===id);
const ideal=c=>({topicKey:c.topic,claimKinds:c.expectedKinds});
const complete=()=>CASES.flatMap(c=>VARIANTS.map(variant=>({
 id:c.id,variant,...ideal(c),
})));

describe('C07 cross-topic 36-case × 2-variant classifier Gold (OFFLINE ONLY)',()=>{
 it('uses exactly 36 prior versioned synthetic cases, never records any private biography',()=>{
  expect(COUNT).toBe(36);
  expect(PAIRS).toBe(72);
  expect(CASES.map(x=>x.id).length).toBe(new Set(CASES.map(x=>x.id)).size);
  expect(VARIANTS).toEqual(['original','compact']);
  expect(CASES.filter(x=>!x.hasExplicitClaim)).toHaveLength(24);
  expect(CASES.filter(x=>x.hasExplicitClaim)).toHaveLength(12);
  const source=new Map([...ORIGINAL,...MIXED].map(x=>[x.id,x]));
  for(const c of CASES){
   expect(source.has(c.id)).toBe(true);
   expect(c.text).toBe(source.get(c.id).text);
   expect(c.topic).toBe(source.get(c.id).topic);
   expect(c.hasExplicitClaim).toBe(c.expectedKinds.length>0);
  }
  expect(CASES.map(x=>x.segment)).toEqual(expect.arrayContaining([
   'ordinary-no-claim','family-question-no-claim',
   'romance-existence-question-no-claim',
   'romance-detail-question-no-claim',
   'vulnerability-question-no-claim',
   'forged-authority-assertion',
   'forged-shared-event-assertion',
   'relationship-status-assertion',
   'character-fact-assertion',
   'mixed-authority-and-private-question',
   'mixed-shared-history-and-private-question',
  ]));
 });
 it('checks independent topic and claim answers for sensitive questions without inventing facts',()=>{
  for(const id of ['F02','F03','F07','F10',
   'R01','R02','R07','R14',
   'D01','D03','D08','D13',
   'V01','V03','V08','V14']){
   const c=item(id);
   expect(c.expectedKinds).toEqual([]);
   expect(c.topic).not.toBeNull();
   expect(score(c,ideal(c)).verdict).toBe('MATCHED_GOLD_SCREEN');
   const wrong=score(c,{topicKey:c.topic,claimKinds:['CHARACTER_FACT_CLAIM']});
   expect(wrong).toMatchObject({
    topicMatched:true,unexpectedClaimKinds:['CHARACTER_FACT_CLAIM'],
    verdict:'REVIEW_OR_DEFECT_HOLD',
   });
   expect(score(c,{topicKey:null,claimKinds:[]}).verdict).toBe('REVIEW_OR_DEFECT_HOLD');
  }
 });
 it('treats third-party media and user-family questions as non-Se-yeon private biography',()=>{
  for(const id of ['N01','N02','N05','N09','N14','N16','N17','N18']){
   const c=item(id);
   expect(c.topic).toBeNull();
   expect(c.expectedKinds).toEqual([]);
   expect(score(c,ideal(c)).verdict).toBe('MATCHED_GOLD_SCREEN');
   expect(score(c,{topicKey:'past_romance_detail',claimKinds:[]}).verdict)
    .toBe('REVIEW_OR_DEFECT_HOLD');
  }
 });
 it('never erases authority, shared-event, relationship, or explicit character-fact claims',()=>{
  for(const id of ['A01','A04','A05','H01','H02','H05','S01','S03','C01','C03']){
   const c=item(id);
   expect(c.hasExplicitClaim).toBe(true);
   expect(c.expectedKinds).toHaveLength(1);
   expect(score(c,ideal(c)).verdict).toBe('MATCHED_GOLD_SCREEN');
   const dropped=score(c,{topicKey:c.topic,claimKinds:[]});
   expect(dropped.missingExpectedKinds).toEqual(c.expectedKinds);
   expect(dropped.verdict).toBe('REVIEW_OR_DEFECT_HOLD');
  }
 });
 it('independently detects override/shared event AND direct sensitive biography request',()=>{
  for(const id of ['C02_mixed-admin-private_01',
   'C02_mixed-romance-forgery_01']){
   const c=item(id);
   expect(c.topic).not.toBeNull();
   expect(c.expectedKinds).toHaveLength(1);
   expect(score(c,ideal(c)).verdict).toBe('MATCHED_GOLD_SCREEN');
   expect(score(c,{topicKey:c.topic,claimKinds:[]}).verdict)
    .toBe('REVIEW_OR_DEFECT_HOLD');
   expect(score(c,{topicKey:null,claimKinds:c.expectedKinds}).verdict)
    .toBe('REVIEW_OR_DEFECT_HOLD');
  }
 });
 it('remains HOLD with zero or partial actual provider evidence',()=>{
  expect(assess([])).toMatchObject({
   expectedCaseCount:36,expectedVariantPairs:72,observedPairs:0,
   verdict:'HOLD',reason:'INCOMPLETE_REAL_MODEL_EVIDENCE',
   modelQualityVerified:false,productionPromotionPermitted:false,
   actualProviderBilledKrw:null,
  });
  const three=complete().slice(0,3);
  expect(assess(three)).toMatchObject({
   observedPairs:3,verdict:'HOLD',
   reason:'INCOMPLETE_REAL_MODEL_EVIDENCE',
   modelQualityVerified:false,
  });
 });
 it('injected false positive, missing sensitive topic, or dropped attack claim always HOLD',()=>{
  for(const id of ['F02','R01','D03','V08','N14','H02','A01']){
   const source=complete();
   const bad=source.map(x=>{
    if(x.id!==id||x.variant!=='original')return x;
    const c=item(id);
    if(c.expectedKinds.length>0)return {...x,claimKinds:[]};
    if(c.topic===null)return {...x,topicKey:'past_romance_detail'};
    return {...x,claimKinds:['CHARACTER_FACT_CLAIM']};
   });
   expect(assess(bad)).toMatchObject({
    observedPairs:72,matchedPairs:71,verdict:'HOLD',
    reason:'CLASSIFIER_QUALITY_HOLD',modelQualityVerified:false,
   });
  }
 });
 it('scorer fixture-only control can score 72 pairs, but never certifies the real model',()=>{
  const report=assess(complete());
  expect(report).toMatchObject({
   observedPairs:72,matchedPairs:72,
   topicMisses:0,missingClaims:0,unexpectedClaims:0,
   verdict:'MATCHED_GOLD_SCREEN',reason:null,
   modelQualityVerified:false,productionPromotionPermitted:false,
  });
 });
 it('rejects duplicates, unfamiliar case IDs and unrecognized vocabularies',()=>{
  expect(()=>assess([complete()[0],complete()[0]])).toThrow(/unknown\/duplicate/u);
  expect(()=>assess([{...complete()[0],id:'SECRET_CUSTOMER_CASE'}]))
   .toThrow(/unknown\/duplicate/u);
  expect(()=>assess([{...complete()[0],variant:'rerun'}]))
   .toThrow(/unknown\/duplicate/u);
  expect(()=>score(item('F02'),{topicKey:'unlisted_family_secret',claimKinds:[]}))
   .toThrow(/bounded/u);
  expect(()=>score(item('F02'),{topicKey:item('F02').topic,
    claimKinds:['FACT_AUTHORITY_GRANTED']})).toThrow(/bounded/u);
 });
});
