import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectHistoricalDeepseekFailures } from './yeoul-deepseek-legacy-triage-v1.mjs';

const MODELS=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017',
  'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const VARIANTS=['baseline','language_rules','conversation_examples'];
const PRIVATE='SYNTHETIC_PRIVATE_TEXT_NEVER_EXPORT';
const fixture = ({knownOriginal=false}={})=>{
  const responses=[];
  for(let q=1;q<=12;q++)for(const model of MODELS)
    for(const variant of VARIANTS)for(const repeat of [1,2]){
      const id='Y'+String(q).padStart(2,'0');
      const isY07=id==='Y07' && model===MODELS[1];
      const bad=isY07 ? (
        variant==='baseline' ? (repeat===1?'awkward':'soft') :
        variant==='language_rules' ? (repeat===1?'other':'soft') :
        repeat===1?'soft':'fiction') : 'good';
      responses.push({id, model,variant,repeat,
        input:'Synthetic '+id+' '+PRIVATE,reply:'Synthetic answer '+PRIVATE,
        evaluation:{rating:bad,source:'synthetic_user_rating',note:PRIVATE,details:[]},
        questionDiscrimination:null});
    }
  const surveyState={groups:{}};
  if(knownOriginal){
    for(const row of responses.slice(0,36))row.questionDiscrimination='unreviewed';
    surveyState.groups=Object.fromEntries(Array.from({length:9},(_,i)=>
      ['synthetic-'+i,{discrimination:'unreviewed'}]));
  }
  return {schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
    scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},
    responses,surveyState};
};

test('Y07 historical failure is prioritized without promoting any user label to verified violation',()=>{
  const source=fixture();
  const before=structuredClone(source);
  const report=inspectHistoricalDeepseekFailures(source);
  assert.equal(report.deepseekRowsChecked,72);
  assert.equal(report.independentQuestionFamilies,12);
  assert.equal(report.reviewPriorityQuestionIds[0],'Y07');
  const y07=report.byQuestion.find(x=>x.questionId==='Y07');
  assert.equal(y07.userRatedGood,0);
  assert.equal(y07.userRatedNonGood,6);
  assert.equal(y07.ratings.soft,3);
  assert.equal(y07.ratings.fiction,1);
  assert.equal(y07.byVariant.baseline.count,2);
  assert.equal(y07.ownerReviewStatus,'pending');
  assert.equal(report.historicalRatingIsHumanConfirmedHardFailure,false);
  assert.equal(report.independentQualityGainEstablished,false);
  assert.equal(report.productionEligible,false);
  assert.equal(report.externalCalls,0);
  assert.equal(report.decision,'HOLD_PENDING_HUMAN_REVIEW_NOT_NEW_HOLDOUT');
  assert.equal(JSON.stringify(report).includes(PRIVATE),false);
  assert.deepEqual(source,before);
});

test('all matched comparisons are descriptive repeated cells, not independent improvements',()=>{
  const result=inspectHistoricalDeepseekFailures(fixture());
  for(const variant of ['language_rules','conversation_examples']){
    const p=result.matchedHistoricalRatingChanges[variant];
    assert.equal(p.pairedRepeatedCells,24);
    assert.equal(p.independentQuestionFamilies,12);
    assert.equal(p.causalImprovementEstablished,false);
    assert.equal(p.bothGood+p.bothNonGood+p.nonGoodToGood+p.goodToNonGood,24);
  }
  assert.equal(result.rawConversationExported,false);
  assert.equal(result.userNotesExported,false);
  assert.equal(result.privateSourceHashExported,false);
});

test('original-only auto-field exclusion requires explicit consent and exact known counts',()=>{
  const archived=fixture({knownOriginal:true});
  assert.throws(()=>inspectHistoricalDeepseekFailures(archived),/private_row_contract/);
  const copied=structuredClone(archived);
  const report=inspectHistoricalDeepseekFailures(archived,{knownOriginalAutoFields:true});
  assert.equal(report.archivedUnreviewedAutoFieldsExcluded,true);
  assert.equal(report.originalRowsChecked,288);
  assert.equal(report.deepseekRowsChecked,72);
  assert.deepEqual(archived,copied);
  archived.responses[0].questionDiscrimination=null;
  assert.throws(()=>inspectHistoricalDeepseekFailures(archived,{knownOriginalAutoFields:true}),
    /unrecognized_original_auto_field_counts/);
});

test('unverified model identity, missing repeated responses and forged approvals are rejected',()=>{
  const dup=fixture();dup.responses[1]=dup.responses[0];
  assert.throws(()=>inspectHistoricalDeepseekFailures(dup),/duplicate_row_key/);
  const bad=fixture();bad.responses[0].evaluation.rating='approved';
  assert.throws(()=>inspectHistoricalDeepseekFailures(bad),/private_row_contract/);
  const incomplete=fixture();incomplete.responses.pop();
  assert.throws(()=>inspectHistoricalDeepseekFailures(incomplete),/original_288_source_required/);
  const injected=fixture();injected.responses[0].ownerApprovalVerified=true;
  assert.equal(inspectHistoricalDeepseekFailures(injected).ownerReviewVerified,false);
});
