import test from 'node:test';
import assert from 'node:assert/strict';
import { buildY07ReviewSupplement } from './yeoul-y07-review-supplement-v1.mjs';
const MODEL='deepseek/deepseek-v4.1-flash-1017';
const MODELS=['z-ai/glm-5.3-flash',MODEL,'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const VARIANTS=['baseline','language_rules','conversation_examples'];
const PRIVATE='SYNTHETIC_PRIVATE_DO_NOT_LEAK';
function fixture(){
  const responses=[];
  for(let q=1;q<=12;q++) for(const model of MODELS)
    for(const variant of VARIANTS) for(const repeat of [1,2]){
      const id='Y'+String(q).padStart(2,'0');
      const isBad=id==='Y07'&&model===MODEL;
      responses.push({id,model,variant,repeat,input:'synthetic question '+id+' '+PRIVATE,
        reply:'synthetic reply '+[id,model,variant,repeat].join(' ')+' '+PRIVATE,
        evaluation:{rating:isBad?(['soft','awkward','fiction','soft','other','soft'][VARIANTS.indexOf(variant)*2+repeat-1]):'good',
          source:'synthetic_rating',note:'',details:[]},questionDiscrimination:null});
    }
  const queue=[];
  for(let q=1;q<=12;q++) for(const repeat of [1,2]){
    const id='Y'+String(q).padStart(2,'0');
    const r=responses.find(x=>x.id===id&&x.model===MODELS[0]&&x.variant==='baseline'&&x.repeat===repeat);
    queue.push({sourceKey:[id,'baseline',repeat,MODELS[0]].join('|'),sourceQuestionId:id,
      variant:'baseline',repeat,model:MODELS[0],priority:repeat,
      reviewStatus:'pending_canon_and_language_review',datasetRole:'legacy_development_only',
      reviewEvidence:null,userRating:'good',sourcePrompt:r.input,candidateReply:r.reply});
  }
  return {evaluationExport:{schemaVersion:'yeoul-evaluation-export-v1',
    experimentRunId:42572722295,scope:'all-288',
    sourceExperiment:{attemptedCalls:288,successfulCalls:288},
    responses,surveyState:{groups:{}}},
    exampleQueue:{schemaVersion:'yeoul-example-review-queue-v1',
      datasetRole:'legacy_development_only',sourceExperimentRunId:42572722295,
      queuedCount:24,humanApprovedCount:0,queue}};
}
test('six negative Y07 cases remain separate from unchanged 30-item review packet',()=>{
  const input=fixture(),unchanged=structuredClone(input);
  const r=buildY07ReviewSupplement(input);
  assert.equal(r.existingReviewPacket.rules,6);
  assert.equal(r.existingReviewPacket.cleanPositiveExamples,24);
  assert.equal(r.existingReviewPacket.approved,0);
  assert.equal(r.failureSupplement.caseCount,6);
  assert.deepEqual(r.failureSupplement.cases.map(x=>x.originalUserRating),
    ['soft','awkward','fiction','soft','other','soft']);
  assert.ok(r.failureSupplement.cases.every(x=>x.authorizedExample===false&&
    x.reviewStatus==='pending_human_failure_diagnosis'));
  assert.equal(r.ownerReviewVerified,false);
  assert.equal(r.externalCalls,0);
  assert.equal(r.realQualityImprovementEstablished,false);
  assert.equal(JSON.stringify(r).includes(PRIVATE),false);
  assert.deepEqual(input,unchanged);
});
test('legacy unreviewed automatic inputs require explicit known-original mode',()=>{
  const input=fixture();
  for(const row of input.evaluationExport.responses.slice(0,36))row.questionDiscrimination='unreviewed';
  input.evaluationExport.surveyState.groups=Object.fromEntries(
    Array.from({length:9},(_,i)=>['group'+i,{discrimination:'unreviewed'}]));
  assert.throws(()=>buildY07ReviewSupplement(input),/private_row_contract/);
  assert.equal(buildY07ReviewSupplement({...input,knownOriginalAutoFields:true}).failureSupplement.caseCount,6);
  input.evaluationExport.responses[0].questionDiscrimination=null;
  assert.throws(()=>buildY07ReviewSupplement({...input,knownOriginalAutoFields:true}),
    /unrecognized_original_auto_field_counts/);
});
test('a tampered, approved or incomplete positive review queue is rejected',()=>{
  for(const mutate of [
    x=>{x.exampleQueue.humanApprovedCount=1;},
    x=>{x.exampleQueue.queue[0].reviewStatus='approved';},
    x=>{x.exampleQueue.queue[0].candidateReply='forged';},
    x=>{x.exampleQueue.queue[0].sourceQuestionId='Y07';},
    x=>{x.exampleQueue.queue.pop();},
    x=>{x.exampleQueue.queue[0].userRating='fiction';},
    x=>{x.exampleQueue.queue[0].reviewEvidence={reviewedBy:'character_owner'};},
  ]){
    const x=fixture();mutate(x);
    assert.throws(()=>buildY07ReviewSupplement(x),/YEOUL_Y07_SUPPLEMENT_INVALID/);
  }
});
test('Y07 negatives cannot become positive reviewed examples even with valid metadata',()=>{
  const x=fixture();
  const negative=x.evaluationExport.responses.find(r=>r.id==='Y07'&&r.model===MODEL);
  const item=x.exampleQueue.queue.find(r=>r.sourceQuestionId==='Y07');
  Object.assign(item,{sourceKey:[negative.id,negative.variant,negative.repeat,negative.model].join('|'),
    variant:negative.variant,repeat:negative.repeat,model:negative.model,
    sourcePrompt:negative.input,candidateReply:negative.reply});
  assert.throws(()=>buildY07ReviewSupplement(x),/queue_source_does_not_match/);
});
