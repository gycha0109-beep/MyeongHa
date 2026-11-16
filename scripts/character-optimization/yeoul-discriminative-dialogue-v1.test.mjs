import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectYeoulDialogueDiagnostics} from './yeoul-discriminative-dialogue-v1.mjs';
const models=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017','minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const variants=['baseline','language_rules','conversation_examples'];
const focuses=['care_before_label','emotional_specificity','independent_agency','affection-not-assumed','jealousy_without_history','repair_after_pushback','directness_growth','memory-truth','tone_shift','anti_repetition'];
const stages=['no_history','first_contact','acquaintance','friend','trusted_partner'];
function fixture(){
 const responses=[];
 for(let i=1;i<=12;i++)for(const model of models)for(const variant of variants)for(const repeat of [1,2])
 responses.push({id:'Y'+String(i).padStart(2,'0'),input:'합성 역사 질문 '+i,model,variant,repeat,
  reply:'비공개 응답 SAMPLE_PRIVATE_REPLY',questionDiscrimination:null,
  evaluation:{rating:i===7?'awkward':'good',note:'PRIVATE_USER_NOTE'}});
 const original={schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
  scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},responses};
 const draft={schemaVersion:'yeoul-discriminative-dialogue-draft-v1',
  characterId:'yeoul',sourceClass:'assistant_synthetic_unreviewed',
  datasetRole:'development_diagnostic_only',neverUseAsSealedHoldout:true,
  characterAuthority:'DRAFT',families:focuses.map((focus,i)=>({
   id:'scenario-'+i,relationshipStage:stages[i%5],
   historyAvailable:i%5>=3,focus,syntheticContext:'명시적으로 합성된 상황이며 실제 기억은 아님 '+i,
   userTurns:['가상의 사용자 첫 발화 '+i,'가상의 사용자 두번째 발화 '+i,'가상의 사용자 세번째 발화 '+i],
   expectedSignals:['구체적인 첫 번째 기대 행동 '+i,'구체적인 두 번째 기대 행동 '+i],
   regressionSignals:['첫 번째 회귀 오류 위험 '+i,'두 번째 회귀 오류 위험 '+i],ownerReviewed:false
  }))};
 return {original,draft};
}
test('historical 288 ratings and ten distinct three-turn scenario families remain diagnostic only',()=>{
 const {original,draft}=fixture();
 const r=inspectYeoulDialogueDiagnostics({original,draft});
 assert.equal(r.originalResponsesChecked,288);assert.equal(r.deepseekResponsesChecked,72);
 assert.equal(r.deepseekRatings.good,66);assert.equal(r.deepseekRatings.awkward,6);
 assert.equal(r.weakestDevelopmentQuestions[0].id,'Y07');
 assert.equal(r.scenarioFamilies,10);assert.equal(r.scenarioTurns,30);
 assert.equal(r.relationshipStagesCovered,5);assert.equal(r.uniqueFocusAxes,10);
 assert.equal(r.discriminativePowerMeasured,false);assert.equal(r.independentFinalHoldoutReady,false);
 assert.equal(r.ownerReviewComplete,false);assert.equal(r.modelCalls,0);
 assert.doesNotMatch(JSON.stringify(r),/SAMPLE_PRIVATE_REPLY|PRIVATE_USER_NOTE|가상의 사용자/);
});
test('rejects duplicated historical prompts and scenario turns',()=>{
 const {original,draft}=fixture();
 draft.families[0].userTurns[0]=original.responses[0].input;
 assert.throws(()=>inspectYeoulDialogueDiagnostics({original,draft}),/exposed_or_repeated_turn/);
 draft.families[0].userTurns[0]='다른 합성 문장 여기에 작성';
 draft.families[1].userTurns[1]=draft.families[0].userTurns[1];
 assert.throws(()=>inspectYeoulDialogueDiagnostics({original,draft}),/exposed_or_repeated_turn/);
});
test('rejects fabricated approval, missing history and fake sealed evaluation',()=>{
 const {original,draft}=fixture();
 draft.families[0].ownerReviewed=true;
 assert.throws(()=>inspectYeoulDialogueDiagnostics({original,draft}),/family_contract/);
 draft.families[0].ownerReviewed=false;draft.neverUseAsSealedHoldout=false;
 assert.throws(()=>inspectYeoulDialogueDiagnostics({original,draft}),/draft_contract/);
 draft.neverUseAsSealedHoldout=true;draft.families[0].historyAvailable=true;
 assert.throws(()=>inspectYeoulDialogueDiagnostics({original,draft}),/family_contract/);
});
test('rejects missing scenarios, focus collapse and incomplete source',()=>{
 const {original,draft}=fixture();
 draft.families.pop();
 assert.throws(()=>inspectYeoulDialogueDiagnostics({original,draft}),/draft_contract/);
 const a=fixture();a.draft.families[1].focus=a.draft.families[0].focus;
 assert.throws(()=>inspectYeoulDialogueDiagnostics(a),/family_contract/);
 const b=fixture();b.original.responses.pop();
 assert.throws(()=>inspectYeoulDialogueDiagnostics(b),/YEOUL_PRIVATE_INTAKE_INVALID/);
});
