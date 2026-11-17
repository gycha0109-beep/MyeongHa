import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {recoverOriginalExperimentPrompts,buildPairedPlan} from '../../research/character-optimization-gepa/yeoul_288_paid_pair_preflight_v1.mjs';
import {buildBlindReview} from '../../research/character-optimization-gepa/yeoul_72_blind_comparison_v1.mjs';
import {buildYeoulHumanGepaEvidence} from '../../research/character-optimization-gepa/yeoul_72_human_gepa_evidence_v1.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const MODEL='deepseek/deepseek-v4.1-flash-1017';
function fixture(){
 const src=recoverOriginalExperimentPrompts(),responses=[];
 for(const q of src.CASES)for(const model of src.MODELS)
  for(const variant of src.VARIANTS)for(const repeat of [1,2])
   responses.push({id:q.id,input:q.text,model,variant,repeat,
    reply:'원본 응답',evaluation:{rating:'good',note:'PRIVATE_USER_NOTE'}});
 const original={schemaVersion:'yeoul-evaluation-export-v1',
  scope:'all-288',experimentRunId:42572722295,responses};
 const candidateText='여울의 현재 대화 내용에 맞게 존댓말로 답합니다.';
 const candidate={schemaVersion:'yeoul-feedback-gepa-optimized-expression-v1',
  optimizer:'real_pinned_gepa_offline',qualityGainEstablished:false,externalModelCalls:0,
  realStudentModelResponses:0,candidateText,candidateSha256:sha(candidateText)};
 const plan=buildPairedPlan(original,candidate);
 const actual={schemaVersion:'yeoul-gepa-deepseek-72-paid-v1',status:'COMPLETE',
  model:MODEL,originalExperiment:42572722295,candidateSha256:candidate.candidateSha256,
  protocolSha256:plan.sourceProtocolSha256,providerReportedCostUsd:0.00072,
  rows:plan.tasks.map(t=>({legacyKey:t.legacyKey,id:t.id,variant:t.variant,repeat:t.repeat,
   model:MODEL,reply:'새 응답',inputTokens:120,outputTokens:60,costUsd:0.00001,
   promptSha256:sha(JSON.stringify(t.messages))}))};
 const blind=buildBlindReview({original,candidate,actual},()=>0);
 const reviews=blind.keyFile.pairs.map(p=>({id:p.id,vote:'B',note:'비공개 상세 판정'}));
 const review={schemaVersion:'yeoul-72-blind-review-draft-v1',
  keyFingerprint:sha(JSON.stringify(blind.keyFile)),reviews};
 return {original,candidate,actual,key:blind.keyFile,review};
}

test('a complete 72-vote human sheet produces 12 development-family scores but never promotion',()=>{
 const r=buildYeoulHumanGepaEvidence(fixture());
 assert.equal(r.reviewed,72);assert.equal(r.unreviewed,0);
 assert.equal(r.candidateWins,72);assert.equal(r.legacyWins,0);
 assert.equal(r.familyEvidence.length,12);
 assert.ok(r.familyEvidence.every(x=>x.reviewed===6&&x.observedCandidateShare===1));
 assert.equal(r.developmentDiagnosticsComplete,true);
 assert.equal(r.scoresUsableToJudgeUnseenGepaMutations,false);
 assert.equal(r.qualityGainEstablished,false);
 assert.equal(r.productionEligible,false);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_USER_NOTE|비공개 상세 판정|새 응답/);
});

test('partial and uncertainty votes do not become wins or invented GEPA scores',()=>{
 const f=fixture();
 f.review.reviews.forEach((r,i)=>{r.vote=i===0?'A':i===1?'tie':i===2?'uncertain':null;});
 const r=buildYeoulHumanGepaEvidence(f);
 assert.equal(r.reviewed,3);assert.equal(r.legacyWins,1);
 assert.equal(r.ties,1);assert.equal(r.uncertain,1);
 assert.equal(r.unreviewed,69);
 assert.equal(r.developmentDiagnosticsComplete,false);
 assert.equal(r.familyEvidence.reduce((x,f)=>x+f.reviewed,0),3);
 assert.equal(r.qualityGainEstablished,false);
});

test('candidate/model/response mismatch, duplicate pairing or inconsistent draft is refused',()=>{
 const a=fixture();a.actual.candidateSha256='a'.repeat(64);
 assert.throws(()=>buildYeoulHumanGepaEvidence(a),/unverified_actual_run/);
 const b=fixture();b.actual.rows[0].reply='';
 assert.throws(()=>buildYeoulHumanGepaEvidence(b),/invalid_or_duplicate_new_response/);
 const c=fixture();c.key.pairs[1]={...c.key.pairs[1],id:c.key.pairs[0].id};
 assert.throws(()=>buildYeoulHumanGepaEvidence(c),/invalid_blind_key/);
 const d=fixture();d.review.keyFingerprint='b'.repeat(64);
 assert.throws(()=>buildYeoulHumanGepaEvidence(d),/review_binding/);
 const e=fixture();e.actual.rows[0].reply='아무도 검토하지 않은 새 답변';
 assert.throws(()=>buildYeoulHumanGepaEvidence(e),/blind_key_not_bound_to_actual_run/);
 const f=fixture();f.actual.rows[0].promptSha256='a'.repeat(64);
 assert.throws(()=>buildYeoulHumanGepaEvidence(f),/actual_prompt_binding/);
});

test('GEPA feedback retains named human regression axes without inventing model-quality proof',()=>{
 const f=fixture();
 f.review.reviews[0]={...f.review.reviews[0],vote:'A',issueAxis:'relationship_fit',note:'private user note'};
 f.review.reviews[1]={...f.review.reviews[1],vote:'A',issueAxis:'korean_naturalness',note:''};
 f.review.reviews[2]={...f.review.reviews[2],vote:'A',issueAxis:'relationship_fit',note:''};
 const result=buildYeoulHumanGepaEvidence(f);
 assert.deepEqual(result.candidateRegressionAxes,{relationship_fit:2,korean_naturalness:1});
 assert.equal(result.reviewedCandidateRegressionAxisRanking[0].axis,'relationship_fit');
 assert.equal(result.reviewedCandidateRegressionAxisRanking[0].count,2);
 assert.equal(result.familyEvidence[0].candidateRegressionAxes.relationship_fit,2);
 assert.equal(result.feedbackAxisAttribution,'human_selected_on_definite_preference_only');
 assert.equal(result.qualityGainEstablished,false);
 assert.doesNotMatch(JSON.stringify(result),/private user note/);
});