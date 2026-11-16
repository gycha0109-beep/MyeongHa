import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildPairedPlan, recoverOriginalExperimentPrompts } from '../../research/character-optimization-gepa/yeoul_288_paid_pair_preflight_v1.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const source = recoverOriginalExperimentPrompts();
const MODEL = 'deepseek/deepseek-v4.1-flash-1017';

function fixture() {
  const responses=[];
  for(const q of source.CASES) for(const model of source.MODELS)
    for(const variant of source.VARIANTS) for(const repeat of [1,2])
      responses.push({id:q.id,input:q.text,model,variant,repeat,
        reply:'합성 응답',evaluation:{rating:'good'}});
  const candidateText='여울은 사용자에게 먼저 자연스럽게 반응하고 모르는 기억을 지어내지 않습니다.';
  return {exported:{schemaVersion:'yeoul-evaluation-export-v1',scope:'all-288',
    experimentRunId:42572722295,responses},
    candidate:{schemaVersion:'yeoul-feedback-gepa-optimized-expression-v1',
      optimizer:'real_pinned_gepa_offline',qualityGainEstablished:false,
      externalModelCalls:0,realStudentModelResponses:0,
      candidateText,candidateSha256:sha(candidateText)}};
}

test('72 exact old questions, variants and repeats bind to immutable protocol',()=>{
  const {exported,candidate}=fixture();
  const plan=buildPairedPlan(exported,candidate);
  assert.equal(plan.tasks.length,72);
  assert.equal(new Set(plan.tasks.map(t=>t.legacyKey)).size,72);
  assert.equal(new Set(plan.tasks.map(t=>t.input)).size,12);
  assert.equal(new Set(plan.tasks.map(t=>t.originalSystemSha256)).size,3);
  assert.deepEqual(Object.fromEntries(source.VARIANTS.map(v=>[v,plan.tasks.filter(t=>t.variant===v).length])),
    {baseline:24,language_rules:24,conversation_examples:24});
  for(const t of plan.tasks){
    assert.equal(t.model,MODEL);
    assert.equal(t.messages[1].content,t.input);
    assert.equal(t.messages[0].content,source.SYSTEMS[t.variant]+'\n'+candidate.candidateText);
    assert.equal(t.originalSystemSha256,sha(source.SYSTEMS[t.variant]));
  }
  assert.equal(plan.settings.max_tokens,1200);
  assert.equal(plan.settings.temperature,0.7);
  assert.equal(plan.settings.reasoning.effort,'low');
  assert.equal(plan.settings.response_format.json_schema.strict,true);
  assert.equal(plan.settings.provider.zdr,true);
  assert.equal(plan.paidTransportReady,false);
  assert.equal(plan.newDeepSeekCallsExecuted,0);
});

test('changed user input or historical matrix cannot silently pass',()=>{
  const {exported,candidate}=fixture();
  exported.responses[0].input='ALTERED';
  assert.throws(()=>buildPairedPlan(exported,candidate),/original_response_matrix/);
  const another=fixture();
  another.exported.responses[1].model=another.exported.responses[0].model;
  another.exported.responses[1].variant=another.exported.responses[0].variant;
  another.exported.responses[1].repeat=another.exported.responses[0].repeat;
  assert.throws(()=>buildPairedPlan(another.exported,another.candidate),/original_response_matrix/);
});

test('mutable candidate and old protocol modifications fail before any dispatch',()=>{
  const {exported,candidate}=fixture();
  candidate.candidateText+='altered';
  assert.throws(()=>buildPairedPlan(exported,candidate),/candidate_identity/);
  assert.throws(()=>recoverOriginalExperimentPrompts('tampered source'),/original_protocol_changed/);
});
