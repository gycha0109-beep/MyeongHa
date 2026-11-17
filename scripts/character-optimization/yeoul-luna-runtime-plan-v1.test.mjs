import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { digest, createOptimizationRun, validateCandidate } from './contracts-v1.mjs';
import { prepareYeoulLunaRuntimeAB, prepareFrozenGepaYeoulLunaABC, prepareBehaviorGepaYeoulLunaABC } from './yeoul-real-response-pilot-v1.mjs';
import { chooseYeoulRuntimeSituation, selectYeoulRuntimeRules,
  compileYeoulLunaABCPromptPlan } from './yeoul-luna-runtime-plan-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..','..');
const runtime = await readFile(resolve(root,
  'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8');
const runtimeSha256 = digest(runtime.replace(/\r\n/g, '\n'));
const hash = digest('offline-only fixture');
const core = '여울의 검증 대기 핵심 성격 앵커 (합성 실험용).';
const profile = {
  characterId:'yeoul',
  source:{canonRef:'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
    runtimeRef:'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    contentBundleSha256:hash,authorityVersion:'draft-v0.3',authorityState:'DRAFT'},
  student:{provider:'openai',modelId:'gpt-6-luna',
    parametersSha256:hash,routingPolicySha256:hash},
  evalSuite:{developmentRef:'legacy-Y01-Y12',validationRef:'pending-independent-review',
    holdoutRef:'unavailable',rubricVersion:'8-dimension-v1',splitManifestSha256:hash},
  mutableSlots:['character_expression'],reviewRequired:true,privacyPolicyRef:'offline-research-only',
};
const manifest = createOptimizationRun({track:'character',profiles:[profile],
  immutableSourcesSha256:hash,baselinePromptSha256:digest(core),
  optimizerVersion:'pinned-synthetic',evaluatorVersion:'v1'});
const settings = {modelId:'gpt-6-luna',provider:'openai',subprovider:'openai-direct',
  temperature:null,maxTokens:1200,reasoningEffort:'low',
  allowFallbacks:false,requireParameters:true,dataCollection:'deny',zdr:true};
const context = {questionId:'Y07',userMove:'오늘 기분이 좀 허전해요.',
  relationshipStage:'no_history',historyAvailable:false,approvedFacts:[]};
const candidate = validateCandidate({character_expression:'사용자의 실제 말에 먼저 반응하고 근거 없는 관계를 단정하지 마세요.'},
  {slot:'character_expression',pinnedContextSha256:hash});
const args = () => ({manifest,baselineCore:core,context,settings,runtimeMarkdown:runtime,runtimeSha256});

test('source-backed Runtime rules are exact excerpts; no history remains no history',()=>{
  const s = selectYeoulRuntimeRules({runtimeMarkdown:runtime,runtimeSha256,userText:context.userMove});
  const lfRuntime=runtime.replace(/\r\n/g, '\n');
  const winRuntime=lfRuntime.replace(/\n/g, '\r\n');
  const fromLf=selectYeoulRuntimeRules({runtimeMarkdown:lfRuntime,runtimeSha256,userText:context.userMove});
  const fromWindows=selectYeoulRuntimeRules({runtimeMarkdown:winRuntime,runtimeSha256,userText:context.userMove});
  assert.deepEqual(fromLf,fromWindows);
  assert.equal(s.situation,'care');
  assert.equal(s.sourceAuthority,'DRAFT_NOT_PRODUCTION');
  assert.ok(s.rules.some(r=>r.sourceSection==='R8.1'));
  assert.ok(s.rules.some(r=>r.sourceSection==='R14.3'));
  for(const r of s.rules){assert.ok(runtime.includes(r.text));assert.equal(digest(r.text),r.textSha256);}
  assert.equal(chooseYeoulRuntimeSituation('여울, 나 좋아해요?'),'caught');
  assert.equal(chooseYeoulRuntimeSituation('안녕하세요.'),'baseline');
});

test('GPT-6 A/B/C keep identical user, reasoning and pinned core, differing by permitted inserts',()=>{
  const plan=compileYeoulLunaABCPromptPlan({...args(),candidate});
  assert.equal(plan.modelId,'gpt-6-luna');
  assert.deepEqual(plan.arms.map(x=>x.arm),['A_core_json','B_selected_runtime','C_gepa_expression']);
  assert.equal(new Set(plan.arms.map(x=>x.settingsSha256)).size,1);
  assert.equal(new Set(plan.arms.map(x=>x.promptSha256)).size,3);
  const [a,b,c]=plan.arms.map(x=>x.requestPreview);
  for(const p of [a,b,c]){
    assert.equal(p.model,'gpt-6-luna');
    assert.deepEqual(p.reasoning,{effort:'low'});
    assert.equal('temperature' in p,false);
    assert.deepEqual(p.input[1],{role:'user',content:context.userMove});
    assert.equal(p.text.format.schema.additionalProperties,false);
  }
  assert.ok(a.input[0].content.startsWith(core));
  assert.ok(!a.input[0].content.includes('runtimeRules'));
  assert.ok(b.input[0].content.includes('runtimeRules'));
  assert.ok(!b.input[0].content.includes(candidate.text));
  assert.ok(c.input[0].content.includes(candidate.text));
  assert.equal(plan.providerCalls,0);assert.equal(plan.productionEligible,false);
  assert.equal(plan.providerRoutingAndZdrUnverified,true);
});

test('bad model parameters, altered source and tampered GEPA candidate fail closed',()=>{
  assert.throws(()=>compileYeoulLunaABCPromptPlan({
    ...args(),settings:{...settings,modelId:'gpt-5.6-luna'}}),/openai_settings/);
  assert.throws(()=>compileYeoulLunaABCPromptPlan({
    ...args(),settings:{...settings,temperature:0.7}}),/openai_settings/);
  assert.throws(()=>compileYeoulLunaABCPromptPlan({
    ...args(),context:{...context,historyAvailable:true}}),/development_context_only/);
  assert.throws(()=>compileYeoulLunaABCPromptPlan({
    ...args(),runtimeMarkdown:runtime+'\nchanged'}),/source_not_pinned_draft/);
  assert.throws(()=>compileYeoulLunaABCPromptPlan({
    ...args(),candidate:{...candidate,text:candidate.text+'changed'}}),/candidate_integrity/);
  assert.throws(()=>compileYeoulLunaABCPromptPlan({
    ...args(),candidate:{...candidate,status:'approved'}}),/candidate_unapproved_shape/);
});

test('without a GEPA proposal the plan remains A/B only',()=>{
  const result=compileYeoulLunaABCPromptPlan(args());
  assert.deepEqual(result.arms.map(x=>x.arm),['A_core_json','B_selected_runtime']);
  assert.equal(result.candidateTextSha256,null);
  assert.equal(result.qualityGainEstablished,false);
});


test('existing frozen GEPA intake is the only C-arm entry from the pilot',()=>{
  const packet = {schemaVersion:'character-gepa-frozen-result-v1',optimizer:'gepa',
    runManifestSha256:manifest.manifestSha256,sourceSeedSha256:hash,proposal:candidate,
    researchEvidence:{bestScoreSyntheticOnly:0.5,totalEvals:2,sourceAuthenticated:false,
      independentQualityGainEstablished:false,ownerReviewGranted:false,
      heldoutPassed:false,releaseApproved:false},
    externalCallsAuthorized:false,externalCalls:0,productionEligible:false};
  const ab=prepareYeoulLunaRuntimeAB(args());
  const abc=prepareFrozenGepaYeoulLunaABC({...args(),packet});
  assert.equal(ab.arms.length,2);
  assert.equal(abc.arms.length,3);
  assert.equal(abc.candidateTextSha256,candidate.textSha256);
  assert.deepEqual(ab.arms.map(x=>x.promptSha256),abc.arms.slice(0,2).map(x=>x.promptSha256));
  assert.throws(()=>prepareFrozenGepaYeoulLunaABC({...args(),packet:{...packet,externalCalls:1}}),/UNTRUSTED|untrusted_optimizer_evidence/i);
});


test('current behavior-first GEPA v2 candidate enters C only after existing guarded admission',()=>{
  const candidateText='여울은 행동이 말보다 먼저인 사람입니다. [첫 반응] 감정 표현에는 감정을 먼저 받고, 직접 질문에는 자신의 입장을 먼저 답하세요.';
  const packet={
    schemaVersion:'yeoul-gepa-behavior-expression-v2',optimizer:'real_pinned_gepa_offline',
    candidateOrigin:'gepa_in_process_behavior_reflector',mutableSlot:'character_expression',
    status:'research_candidate_not_released',
    optimizerExecuted:true,actualStudentRepliesGenerated:0,
    realResponseQualityMeasured:false,independentHoldoutPassed:false,
    qualityGainEstablished:false,externalModelCalls:0,actualSpendKrw:0,
    productionEligible:false,coveredBehaviors:['signal'],
    candidateText,candidateSha256:digest(candidateText),
  };
  const plan=prepareBehaviorGepaYeoulLunaABC({...args(),packet});
  assert.deepEqual(plan.arms.map(r=>r.arm),['A_core_json','B_selected_runtime','C_gepa_expression']);
  assert.equal(plan.candidateTextSha256,digest(candidateText));
  assert.ok(plan.arms[2].requestPreview.input[0].content.includes(candidateText));
  assert.equal(plan.providerCalls,0);
  assert.equal(plan.productionEligible,false);
  assert.throws(()=>prepareBehaviorGepaYeoulLunaABC({...args(),packet:{...packet,qualityGainEstablished:true}}),
    /untrusted_behavior_gepa_candidate/);
  assert.throws(()=>prepareBehaviorGepaYeoulLunaABC({...args(),packet:{...packet,candidateSha256:hash}}),
    /untrusted_behavior_gepa_candidate/);
});