import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPairedPlan,recoverOriginalExperimentPrompts} from '../../research/character-optimization-gepa/yeoul_288_paid_pair_preflight_v1.mjs';
import {buildBlindReview,summarizeBlindReview} from '../../research/character-optimization-gepa/yeoul_72_blind_comparison_v1.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const model='deepseek/deepseek-v4.1-flash-1017';
function data(){
 const source=recoverOriginalExperimentPrompts(),responses=[];
 for(const q of source.CASES)for(const m of source.MODELS)for(const v of source.VARIANTS)for(const rep of [1,2]){
  responses.push({id:q.id,input:q.text,model:m,variant:v,repeat:rep,
   reply:'과거 검토 응답 <script>alert("private")</script>',evaluation:{rating:'awkward',note:'PRIVATE_FEEDBACK_DO_NOT_EXPORT'}});
 }
 const original={schemaVersion:'yeoul-evaluation-export-v1',scope:'all-288',
  experimentRunId:42572722295,responses};
 const candidateText='여울은 사실을 지어내지 않고 자연스럽게 답합니다.';
 const candidate={schemaVersion:'yeoul-feedback-gepa-optimized-expression-v1',
  optimizer:'real_pinned_gepa_offline',qualityGainEstablished:false,
  externalModelCalls:0,realStudentModelResponses:0,candidateText,candidateSha256:sha(candidateText)};
 const plan=buildPairedPlan(original,candidate);
 const actual={schemaVersion:'yeoul-gepa-deepseek-72-paid-v1',status:'COMPLETE',
  model,originalExperiment:42572722295,candidateSha256:plan.candidateSha256,
  protocolSha256:plan.sourceProtocolSha256,providerReportedCostUsd:0.00072,
  rows:plan.tasks.map(t=>({legacyKey:t.legacyKey,id:t.id,variant:t.variant,repeat:t.repeat,
    model,reply:'새로운 합성 응답 YEOUL',inputTokens:120,outputTokens:60,costUsd:0.00001}))};
 return {original,candidate,actual};
}
test('72 paired human-facing cards are shuffled and old ratings are never displayed',()=>{
 const fixture=data();let i=0;
 const result=buildBlindReview(fixture,()=>i++%2);
 assert.equal(result.pairCount,72);assert.equal(result.keyFile.pairs.length,72);
 assert.equal((result.html.match(/<article data-id=/g)||[]).length,72);
 assert.match(result.html,/&lt;script&gt;alert/);
 assert.doesNotMatch(result.html,/<script>alert\("private"\)<\/script>/);
 assert.doesNotMatch(result.html,/PRIVATE_FEEDBACK_DO_NOT_EXPORT|legacySide|candidateSide/);
 assert.equal(result.keyFile.pairs[0].legacySide,'A');
 assert.equal(result.keyFile.pairs[1].legacySide,'B');
 assert.doesNotMatch(JSON.stringify(result.keyFile),/과거 검토 응답|새로운 합성 응답/);
});
test('review summary compares hidden side map, keeps questions separate and does not infer quality',()=>{
 const r=buildBlindReview(data(),()=>0);
 const fp=sha(JSON.stringify(r.keyFile));
 const reviews=r.keyFile.pairs.map((p,i)=>({id:p.id,vote:i===0?'B':i===1?'A':i===2?'tie':i===3?'uncertain':null,
  note:'사용자 비공개 평가 메모'}));
 const summary=summarizeBlindReview(r.keyFile,
  {schemaVersion:'yeoul-72-blind-review-draft-v1',keyFingerprint:fp,reviews});
 assert.equal(summary.reviewed,4);assert.equal(summary.candidateWins,1);
 assert.equal(summary.legacyWins,1);assert.equal(summary.ties,1);
 assert.equal(summary.uncertain,1);assert.equal(summary.unreviewed,68);
 assert.equal(summary.qualityGainEstablished,false);
 assert.equal(summary.independentHoldoutPassed,false);
 assert.doesNotMatch(JSON.stringify(summary),/사용자 비공개 평가 메모/);
});
test('mismatched candidate, missing reply, duplicate rows, forged blind key reject',()=>{
 const f=data();f.actual.rows[0].reply='';
 assert.throws(()=>buildBlindReview(f),/invalid_or_duplicate_new_response/);
 const g=data();g.actual.candidateSha256='a'.repeat(64);
 assert.throws(()=>buildBlindReview(g),/unverified_actual_run/);
 const h=data();h.actual.rows[1].legacyKey=h.actual.rows[0].legacyKey;
 assert.throws(()=>buildBlindReview(h),/invalid_or_duplicate_new_response/);
 const r=buildBlindReview(data(),()=>0);
 const reviews=r.keyFile.pairs.map(x=>({id:x.id,vote:null,note:''}));
 const draft={schemaVersion:'yeoul-72-blind-review-draft-v1',keyFingerprint:sha(JSON.stringify(r.keyFile)),reviews};
 const fake={...r.keyFile,pairs:r.keyFile.pairs.map((x,i)=>i?x:{...x,legacySide:'B'})};
 assert.throws(()=>summarizeBlindReview(fake,draft),/review_binding/);
 assert.throws(()=>summarizeBlindReview(r.keyFile,{...draft,reviews:[...reviews.slice(1),reviews[1]]}),/invalid_review/);
});

test('human-selected loss reasons are counted only for definite preference, never guessed from notes',()=>{
 const r=buildBlindReview(data(),()=>0);
 const reviews=r.keyFile.pairs.map(p=>({id:p.id,vote:null,note:''}));
 reviews[0]={...reviews[0],vote:'A',issueAxis:'korean_naturalness',note:'only local'};
 reviews[1]={...reviews[1],vote:'B',issueAxis:'persona_fidelity',note:'only local'};
 const draft={schemaVersion:'yeoul-72-blind-review-draft-v1',
  keyFingerprint:sha(JSON.stringify(r.keyFile)),reviews};
 const s=summarizeBlindReview(r.keyFile,draft);
 assert.deepEqual(s.candidateRegressionAxes,{korean_naturalness:1});
 assert.deepEqual(s.legacyRegressionAxes,{persona_fidelity:1});
 assert.equal(s.byQuestion.Y01.candidateRegressionAxes.korean_naturalness,1);
 assert.equal(s.byQuestion.Y01.legacyRegressionAxes.persona_fidelity,1);
 assert.doesNotMatch(JSON.stringify(s),/only local/);
 reviews[0]={...reviews[0],vote:'tie'};
 assert.throws(()=>summarizeBlindReview(r.keyFile,draft),/invalid_review/);
 reviews[0]={...reviews[0],vote:'B',issueAxis:'not_real_axis'};
 assert.throws(()=>summarizeBlindReview(r.keyFile,draft),/invalid_review/);
});