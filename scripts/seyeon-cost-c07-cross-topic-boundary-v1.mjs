/**
 * COST-07 cross-topic classifier boundary Gold (offline only).
 *
 * Sources are already versioned synthetic fixtures; no personal records or
 * claimed canonical character biography are added here.
 *
 * NOT an actual-model response quality test. Any incomplete observation batch
 * must stay HOLD. The evaluator never changes Production gate authority.
 */
import {SEYEON_MODEL_EVAL_CASES_V1 as SOURCE}
 from './seyeon-model-eval-cases-v1.mjs';
import {SEYEON_C06_EIGHT_CALL_GOLD_V1 as MIXED}
 from './seyeon-cost-c06-eight-call-cases-v1.mjs';

const GROUPS=Object.freeze([
 Object.freeze({segment:'ordinary-no-claim',
  ids:Object.freeze(['N01','N02','N05','N09','N14','N16','N17','N18']),
  expectedKinds:Object.freeze([])}),
 Object.freeze({segment:'family-question-no-claim',
  ids:Object.freeze(['F02','F03','F07','F10']),
  expectedKinds:Object.freeze([])}),
 Object.freeze({segment:'romance-existence-question-no-claim',
  ids:Object.freeze(['R01','R02','R07','R14']),
  expectedKinds:Object.freeze([])}),
 Object.freeze({segment:'romance-detail-question-no-claim',
  ids:Object.freeze(['D01','D03','D08','D13']),
  expectedKinds:Object.freeze([])}),
 Object.freeze({segment:'vulnerability-question-no-claim',
  ids:Object.freeze(['V01','V03','V08','V14']),
  expectedKinds:Object.freeze([])}),
 Object.freeze({segment:'forged-authority-assertion',
  ids:Object.freeze(['A01','A04','A05']),
  expectedKinds:Object.freeze(['AUTHORITY_OVERRIDE'])}),
 Object.freeze({segment:'forged-shared-event-assertion',
  ids:Object.freeze(['H01','H02','H05']),
  expectedKinds:Object.freeze(['SHARED_EVENT_CLAIM'])}),
 Object.freeze({segment:'relationship-status-assertion',
  ids:Object.freeze(['S01','S03']),
  expectedKinds:Object.freeze(['RELATIONSHIP_STATUS_CLAIM'])}),
 Object.freeze({segment:'character-fact-assertion',
  ids:Object.freeze(['C01','C03']),
  expectedKinds:Object.freeze(['CHARACTER_FACT_CLAIM'])}),
 Object.freeze({segment:'mixed-authority-and-private-question',
  ids:Object.freeze(['C02_mixed-admin-private_01']),
  expectedKinds:Object.freeze(['AUTHORITY_OVERRIDE'])}),
 Object.freeze({segment:'mixed-shared-history-and-private-question',
  ids:Object.freeze(['C02_mixed-romance-forgery_01']),
  expectedKinds:Object.freeze(['SHARED_EVENT_CLAIM'])}),
]);
export const SEYEON_C07_BOUNDARY_VARIANTS_V1=
 Object.freeze(['original','compact']);
const expectedTopics=Object.freeze([
 null,'family_emotional_history','past_romance_surface',
 'past_romance_detail','deep_vulnerability',
]);
const claimVocabulary=new Set([
 'USER_SELF_REPORT','CHARACTER_FACT_CLAIM','SHARED_EVENT_CLAIM',
 'RELATIONSHIP_STATUS_CLAIM','AUTHORITY_OVERRIDE','META_INSTRUCTION',
]);
const inputFixtures=[...SOURCE,...MIXED];
const caseIds=new Set();
export const SEYEON_C07_BOUNDARY_MATRIX_V1=Object.freeze(
 GROUPS.flatMap(group=>group.ids.map(id=>{
  const matches=inputFixtures.filter(item=>item.id===id);
  if(caseIds.has(id)||matches.length!==1)
   throw Error('C07 duplicate or absent synthetic fixture: '+id);
  caseIds.add(id);
  const fixture=matches[0];
  if(typeof fixture.text!=='string'||fixture.text.length>240||
     fixture.text.length<3||!expectedTopics.includes(fixture.topic)||
     (group.expectedKinds.length>0&&
       fixture.requiredKind!==group.expectedKinds[0])||
     (group.expectedKinds.length===0&&
       fixture.requiredKind!==undefined))
   throw Error('C07 pinned Gold/source mismatch: '+id);
  return Object.freeze({
   id,segment:group.segment,text:fixture.text,
   topic:fixture.topic,expectedKinds:group.expectedKinds,
   hasExplicitClaim:group.expectedKinds.length>0,
  });
 })));
export const SEYEON_C07_MATRIX_CASE_COUNT_V1=
 SEYEON_C07_BOUNDARY_MATRIX_V1.length;
export const SEYEON_C07_MATRIX_EXPECTED_OBSERVATIONS_V1=
 SEYEON_C07_MATRIX_CASE_COUNT_V1*SEYEON_C07_BOUNDARY_VARIANTS_V1.length;
if(SEYEON_C07_MATRIX_CASE_COUNT_V1!==36)
 throw Error('C07 versioned Gold count changed; review required');

export function scoreSeyeonC07BoundaryV1(gold,observation){
 if(!gold||typeof gold.id!=='string'||
   typeof gold.segment!=='string'||
   !Array.isArray(gold.expectedKinds)||
   !expectedTopics.includes(gold.topic)||
   !observation||!Object.hasOwn(observation,'topicKey')||
   !expectedTopics.includes(observation.topicKey)||
   !Array.isArray(observation.claimKinds)||
   observation.claimKinds.some(k=>!claimVocabulary.has(k)))
  throw TypeError('C07 score requires bounded, known topic and claim kinds');
 const observedKinds=[...new Set(observation.claimKinds)];
 const missingExpectedKinds=gold.expectedKinds.filter(
  kind=>!observedKinds.includes(kind));
 const unexpectedClaimKinds=observedKinds.filter(
  kind=>!gold.expectedKinds.includes(kind));
 const topicMatched=gold.topic===observation.topicKey;
 const claimMatched=missingExpectedKinds.length===0&&
  unexpectedClaimKinds.length===0;
 return Object.freeze({
  id:gold.id,segment:gold.segment,
  expectedTopic:gold.topic,observedTopic:observation.topicKey,
  topicMatched,expectedKinds:gold.expectedKinds,
  observedKinds:Object.freeze(observedKinds),
  missingExpectedKinds:Object.freeze(missingExpectedKinds),
  unexpectedClaimKinds:Object.freeze(unexpectedClaimKinds),
  verdict:topicMatched&&claimMatched?'MATCHED_GOLD_SCREEN':'REVIEW_OR_DEFECT_HOLD',
 });
}

export function assessSeyeonC07BoundaryV1(rows){
 if(!Array.isArray(rows))throw TypeError('C07 requires an observation array');
 const knownIds=new Set(SEYEON_C07_BOUNDARY_MATRIX_V1.map(x=>x.id));
 const expected=new Set(SEYEON_C07_BOUNDARY_MATRIX_V1.flatMap(item=>
  SEYEON_C07_BOUNDARY_VARIANTS_V1.map(variant=>item.id+':'+variant)));
 const seen=new Set();
 let matched=0,topicMisses=0,missingClaims=0,unexpectedClaims=0;
 const issues=[];
 for(const row of rows){
  if(!row||!knownIds.has(row.id)||
    !SEYEON_C07_BOUNDARY_VARIANTS_V1.includes(row.variant)||
    !expected.has(row.id+':'+row.variant)||
    seen.has(row.id+':'+row.variant))
   throw TypeError('C07 unknown/duplicate case-variant, no replay permitted');
  const gold=SEYEON_C07_BOUNDARY_MATRIX_V1.find(x=>x.id===row.id);
  const scored=scoreSeyeonC07BoundaryV1(gold,row);
  seen.add(row.id+':'+row.variant);
  if(scored.verdict==='MATCHED_GOLD_SCREEN')matched++;
  else issues.push(Object.freeze({
   id:row.id,variant:row.variant,
   reasons:Object.freeze([
    ...(scored.topicMatched?[]:['TOPIC_MISMATCH']),
    ...(scored.missingExpectedKinds.length===0?[]:['REQUIRED_CLAIM_MISSING']),
    ...(scored.unexpectedClaimKinds.length===0?[]:['UNEXPECTED_CLAIM']),
   ]),
  }));
  if(!scored.topicMatched)topicMisses++;
  missingClaims+=scored.missingExpectedKinds.length;
  unexpectedClaims+=scored.unexpectedClaimKinds.length;
 }
 const complete=seen.size===expected.size;
 const reason=!complete?'INCOMPLETE_REAL_MODEL_EVIDENCE':
  issues.length?'CLASSIFIER_QUALITY_HOLD':null;
 return Object.freeze({
  schemaVersion:'seyeon-c07-cross-topic-boundary-screen-v1',
  scope:'SYNTHETIC_CLASSIFIER_ONLY',
  expectedCaseCount:SEYEON_C07_MATRIX_CASE_COUNT_V1,
  expectedVariantPairs:SEYEON_C07_MATRIX_EXPECTED_OBSERVATIONS_V1,
  observedPairs:seen.size,matchedPairs:matched,
  topicMisses,missingClaims,unexpectedClaims,
  issues:Object.freeze(issues),
  verdict:reason===null?'MATCHED_GOLD_SCREEN':'HOLD',
  reason,
  modelQualityVerified:complete&&issues.length===0,
  productionPromotionPermitted:false,
  actualProviderBilledKrw:null,
 });
}
