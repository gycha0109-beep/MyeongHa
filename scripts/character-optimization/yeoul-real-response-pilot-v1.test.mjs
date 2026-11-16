import test from 'node:test';
import assert from 'node:assert/strict';
import { createOptimizationRun, digest, validateCandidate } from './contracts-v1.mjs';
import { DIMENSIONS } from './evaluation-v1.mjs';
import {
  YEOUL_MANUAL_EXPRESSION_DRAFT_V1,
  YEOUL_MANUAL_DRAFT_EVIDENCE,
  prepareManualYeoulPilot,
  prepareFrozenGepaYeoulPilot,
  inspectActualYeoulPair,
} from './yeoul-real-response-pilot-v1.mjs';

const h = digest('fixed research-only fixture');
const core = '고정된 여울 Bible/Runtime 핵심 대화 프롬프트 (합성 테스트용).';
const profile = {
  characterId:'yeoul',
  source:{canonRef:'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
    runtimeRef:'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    contentBundleSha256:h, authorityVersion:'draft-v0.3', authorityState:'DRAFT'},
  student:{provider:'openrouter',modelId:'deepseek/deepseek-v4.1-flash-1017',
    parametersSha256:h,routingPolicySha256:h},
  evalSuite:{developmentRef:'legacy-Y01-Y12',validationRef:'new-review-pending',
    holdoutRef:'unavailable',rubricVersion:'8-dimension-v1',splitManifestSha256:h},
  mutableSlots:['character_expression'],reviewRequired:true,privacyPolicyRef:'research-offline',
};
const manifest = createOptimizationRun({
  track:'character',profiles:[profile],immutableSourcesSha256:h,
  baselinePromptSha256:digest(core),optimizerVersion:'research-pinned',evaluatorVersion:'v1',
});
const context = {
  questionId:'Y07',userMove:'오늘 기분이 좀 허전해요.',
  relationshipStage:'no_history',historyAvailable:false,approvedFacts:[],
};
const settings = {
  modelId:'deepseek/deepseek-v4.1-flash-1017',provider:'openrouter',
  subprovider:'synthetic-provider-not-approved',temperature:0.7,
  maxTokens:1200,reasoningEffort:'low',allowFallbacks:false,
  requireParameters:true,dataCollection:'deny',zdr:true,
};
const args = () => ({manifest,baselineCore:core,context:{...context},settings:{...settings}});
const makePacket = () => {
  const candidate = validateCandidate({character_expression:'상대가 한 말에 먼저 자연스럽게 답하고, 관계는 발명하지 마세요.'},{
    slot:'character_expression',pinnedContextSha256:h,
  });
  return {schemaVersion:'character-gepa-frozen-result-v1',optimizer:'gepa',
    runManifestSha256:manifest.manifestSha256,sourceSeedSha256:h,
    proposal:candidate,
    researchEvidence:{bestScoreSyntheticOnly:0.6,totalEvals:2,sourceAuthenticated:false,
      independentQualityGainEstablished:false,ownerReviewGranted:false,
      heldoutPassed:false,releaseApproved:false},
    externalCallsAuthorized:false,externalCalls:0,productionEligible:false,
  };
};
const pair = plan => plan.requests.map((r,i)=>({
  variant:r.variant,generationSource:'actual_student_api',datasetRole:r.datasetRole,
  promptSha256:r.promptSha256,modelId:r.modelId,provider:r.provider,
  subprovider:r.subprovider,settingsSha256:r.settingsSha256,
  questionId:r.questionId,userMove:r.userMove,providerFallbackUsed:false,
  providerRequestId:'fixture-'+i,reply:'합성 검사용 응답 '+i,
  tokens:{input:110,output:60,reasoning:0,cached:0},
  providerReportedCostUsd:0.00001,elapsedMs:400,
}));
const review = () => ['baseline','candidate'].map((variant,i)=>({
  variant,source:'human_review',reviewRef:'synthetic-only-review-fixture',
  scores:Object.fromEntries(DIMENSIONS.map(d=>[d,i===0?0.3:0.7])),
  hardFailures:[],uncertainty:false,
}));

test('manual research draft fixes actual failure types without being a GEPA claim',()=>{
  const plan = prepareManualYeoulPilot(args());
  assert.equal(plan.candidateOrigin,'manual_research');
  assert.deepEqual(YEOUL_MANUAL_DRAFT_EVIDENCE.legacyQuestionIds,['Y03','Y07','Y08','Y11']);
  assert.match(YEOUL_MANUAL_EXPRESSION_DRAFT_V1,/밥·물·휴식/);
  assert.equal(plan.requests.length,2);
  assert.notEqual(plan.requests[0].promptSha256,plan.requests[1].promptSha256);
  assert.equal(plan.requests[0].userMove,plan.requests[1].userMove);
  assert.equal(plan.requests[0].settingsSha256,plan.requests[1].settingsSha256);
  assert.equal(plan.candidate.status,'pending_owner_review');
  assert.equal(plan.providerCalls,0);
  assert.equal(plan.qualityGainEstablished,false);
  assert.equal(plan.productionEligible,false);
  assert.doesNotMatch(plan.requests[0].system,/무조건 밥·물·휴식부터 권하지/);
  assert.match(plan.requests[1].system,/무조건 밥·물·휴식부터 권하지/);
});

test('only pinned one-slot Yeoul development inputs enter the offline pair plan',()=>{
  assert.throws(()=>prepareManualYeoulPilot({...args(),baselineCore:core+'changed'}),/baseline_not_pinned/);
  assert.throws(()=>prepareManualYeoulPilot({...args(),context:{...context,questionId:'H01'}}),/legacy_development_context_only/);
  assert.throws(()=>prepareManualYeoulPilot({...args(),context:{...context,historyAvailable:true}}),/legacy_development_context_only/);
  assert.throws(()=>prepareManualYeoulPilot({...args(),settings:{...settings,allowFallbacks:true}}),/provider_settings_not_frozen/);
  assert.throws(()=>prepareManualYeoulPilot({...args(),settings:{...settings,subprovider:''}}),/provider_settings_not_frozen/);
  assert.throws(()=>prepareManualYeoulPilot({...args(),manifest:{...manifest,externalCallsAuthorized:true}}),/unapproved_yeoul_manifest/);
});

test('frozen real GEPA candidate is distinguishable from manual draft and synthetic score is not improvement',()=>{
  const plan=prepareFrozenGepaYeoulPilot({...args(),packet:makePacket()});
  assert.equal(plan.candidateOrigin,'gepa_frozen_synthetic_unverified');
  assert.equal(plan.candidate.status,'pending_owner_review');
  assert.equal(plan.qualityGainEstablished,false);
  assert.equal(plan.providerCalls,0);
  assert.notEqual(plan.requests[0].promptSha256,plan.requests[1].promptSha256);
  const invalid=makePacket();
  invalid.researchEvidence.ownerReviewGranted=true;
  assert.throws(()=>prepareFrozenGepaYeoulPilot({...args(),packet:invalid}),/UNTRUSTED|untrusted_optimizer_evidence/i);
});

test('post-run pair rejects legacy replay, mismatched model/settings and duplicated provider request',()=>{
  const plan=prepareManualYeoulPilot(args());
  const rows=pair(plan);
  const reviews=review();
  assert.throws(()=>inspectActualYeoulPair({plan,responses:[{...rows[0],generationSource:'legacy_288'},rows[1]],reviews}),/unverified_or_mismatched_actual_response/);
  assert.throws(()=>inspectActualYeoulPair({plan,responses:[rows[0],{...rows[1],modelId:'other'}],reviews}),/unverified_or_mismatched_actual_response/);
  assert.throws(()=>inspectActualYeoulPair({plan,responses:[rows[0],{...rows[1],providerRequestId:rows[0].providerRequestId}],reviews}),/duplicate_provider_request/);
  assert.throws(()=>inspectActualYeoulPair({plan,responses:rows,reviews:[reviews[0],{...reviews[1],source:'automated_claim'}]}),/review_scope/);
});

test('synthetic pair shape may be summarized but never certifies actual quality or owner approval',()=>{
  const plan=prepareManualYeoulPilot(args());
  const result=inspectActualYeoulPair({plan,responses:pair(plan),reviews:review()});
  assert.equal(result.actualStudentResponsesStructurallyChecked,2);
  assert.ok(result.deltaUnverified>0);
  assert.equal(result.providerReceiptAuthenticityVerified,false);
  assert.equal(result.reviewerAuthorityVerified,false);
  assert.equal(result.gepaQualityGainEstablished,false);
  assert.equal(result.productionEligible,false);
  assert.equal(result.totalProviderReportedCostUsd,0.00002);
});
