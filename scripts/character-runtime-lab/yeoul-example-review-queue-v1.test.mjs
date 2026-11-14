import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExampleReviewQueue } from './yeoul-example-review-queue-v1.mjs';

const target = 'deepseek/deepseek-v4.1-flash-1017';
const mini = 'minimax/minimax-m3.1-flash';
const example = (id, model, variant = 'baseline', repeat = 1) => {
  const key = [id,variant,repeat,model].join('|');
  return { candidateId: key, situation: { referenceQuestionId:id, userMove:'가상 입력' },
    sourcePrompt:'가상 입력', candidateReply:'가상 응답', sourceEvaluation: { rating:'good', source:'synthetic_test' },
    preconditions: { relationshipStage:'no_history', historyAvailable:false, approvedFacts:[] },
    provenance: { experimentRunId:42572722295, sourceKey:key }, reviewStatus:'pending_canon_and_language_review' };
};

test('review queue picks two per question, never claims approval, exposes target-model gaps', () => {
  const examples = Array.from({length:12},(_,i)=>`Y${String(i+1).padStart(2,'0')}`).flatMap(id=>[
    example(id, id==='Y07' ? mini : target),
    example(id, mini, 'conversation_examples'),
    example(id, target, 'language_rules'),
  ].filter((_,i) => id!=='Y07' || i!==2));
  const inputSnapshot = JSON.stringify(examples);
  const r = buildExampleReviewQueue(examples);
  assert.equal(r.queuedCount,24);
  assert.equal(r.humanApprovedCount,0);
  assert.equal(r.externalCalls,0);
  assert.equal(r.productionEligible,false);
  assert.deepEqual(r.coverage.filter(x=>x.missingPreferredModelCandidate).map(x=>x.questionId),['Y07']);
  assert.ok(r.queue.every(x=>x.reviewStatus==='pending_canon_and_language_review' && x.reviewEvidence === null));
  assert.equal(JSON.stringify(examples),inputSnapshot);
});

test('missing question remains an explicit gap rather than fabricated positive material', () => {
  const result = buildExampleReviewQueue([example('Y01',target)],{perQuestion:2});
  assert.equal(result.queuedCount,1);
  assert.equal(result.coverage.filter(x=>x.needsAdditionalCandidates).length,12);
  assert.equal(result.coverage.find(x=>x.questionId==='Y12').cleanCandidateCount,0);
});

test('does not admit caveated, elevated or forged example candidates', () => {
  const valid=example('Y01',target);
  assert.throws(()=>buildExampleReviewQueue([valid,valid]),/duplicate_candidate/);
  assert.throws(()=>buildExampleReviewQueue([{...valid,sourceEvaluation:{rating:'good',details:['register']}}]),/unreviewed_clean_legacy_source_required/);
  assert.throws(()=>buildExampleReviewQueue([{...valid,reviewStatus:'approved'}]),/unreviewed_clean_legacy_source_required/);
  assert.throws(()=>buildExampleReviewQueue([{...valid,preconditions:{relationshipStage:'partner',historyAvailable:true,approvedFacts:['invented']}}]),/unreviewed_clean_legacy_source_required/);
  assert.throws(()=>buildExampleReviewQueue([{...valid,provenance:{experimentRunId:42572722295,sourceKey:'Y12|wrong'}}]),/unreviewed_clean_legacy_source_required/);
  assert.throws(()=>buildExampleReviewQueue([valid],{preferredModel:mini}),/selection_parameters/);
});
