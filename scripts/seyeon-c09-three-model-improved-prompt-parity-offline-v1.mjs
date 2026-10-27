#!/usr/bin/env node
/**
 * Three-model C09 improved-persona offline prompt-parity audit.
 * Does not contact OpenRouter, run models, read secrets, alter production,
 * or claim that human-selected moves are autonomous behavior.
 * Requires npm run build for compiled C09 research composer.
 *
 * node scripts/seyeon-c09-three-model-improved-prompt-parity-offline-v1.mjs --dry-run
 * node scripts/seyeon-c09-three-model-improved-prompt-parity-offline-v1.mjs --offline-export
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

const [mode,...other]=process.argv.slice(2);
if(!['--dry-run','--offline-export'].includes(mode)||other.length!==0)
 throw Error('OFFLINE_ONLY_NO_PROVIDER_DISPATCH');
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const models=Object.freeze([
 'openai/gpt-6-luna',
 'z-ai/glm-5.3-flash',
 'minimax/minimax-m2-her',
]);
const ids=Object.freeze([1,2,5,7,10]);
const source=JSON.parse(readFileSync(resolve(
 'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json'),'utf8'));
const realBasic=JSON.parse(readFileSync(resolve(
 'docs/experiments/seyeon-c09-three-model-minimax-luna-glm-five-20261027-raw-v1.json'),'utf8'));
const {buildSeyeonC09LunaAgencyFiveCaseShadowV1}=await import(
 '../dist/apps/api/src/seyeon-c09-luna-agency-five-cases-shadow-v1.js');
const plans=buildSeyeonC09LunaAgencyFiveCaseShadowV1();
if(plans.length!==5||realBasic.records.length!==5||
   models.some(m=>!realBasic.modelComparison.includes(m))||
   new Set(plans.map(p=>p.caseId)).size!==5)throw Error('BASELINE_OR_PLAN_MATRIX_INVALID');
const matrix=[];
for(let i=0;i<ids.length;i++){
 const id=ids[i],p=plans[i],orig=source.records.filter(r=>r.id===id);
 if(p?.caseId!==id||orig.length!==3||
    orig.some(row=>row.prompt!==p.messages?.[1]?.content)||
    realBasic.records[i]?.question!==orig[0].prompt||
    p.modelId!=='openai/gpt-6-luna'||
    p.behaviorPlanSource!=='HUMAN_SELECTED_SYNTHETIC_EVAL_ONLY_NOT_AUTONOMOUS'||
    p.messages.length!==2||
    p.messages[0].role!=='system'||p.messages[1].role!=='user'||
    !p.messages[0].content.includes('공식 기억 장부')||
    !p.messages[0].content.includes('세연의 현재 동기')||
    p.providerCallExecuted||p.productionRoutingAuthorized||
    p.ownerMemoryPermissionVerified||p.independentlyReviewed||
    p.factualAuthorityGrantedByModel)throw Error('UNAUTHORIZED_OR_CHANGED_CASE_'+id);
 for(const model of models)matrix.push(Object.freeze({
  model,questionId:id,question:orig[0].prompt,questionSha256:hash(orig[0].prompt),
  improvedSystemSha256:hash(p.messages[0].content),
  plannedMove:p.plannedMove,currentMotive:p.currentMotive,
  selectedFocuses:p.selectedFocuses,
  planSource:p.behaviorPlanSource,
  messages:p.messages.map(m=>({role:m.role,content:m.content})),
  temperature:0.65,maxTokens:900,modelOutput:null,
  providerCallExecuted:false,productionRoutingAuthorized:false,
  factualAuthorityGrantedByModel:false,ownerMemoryPermissionVerified:false,
  independentlyReviewed:false,
 }));
}
if(matrix.length!==15||new Set(matrix.map(x=>x.model+'#'+x.questionId)).size!==15)
 throw Error('INVALID_IMPROVED_MATRIX');
for(const id of ids){
 const rows=matrix.filter(r=>r.questionId===id);
 if(rows.length!==3||
    new Set(rows.map(r=>r.improvedSystemSha256)).size!==1||
    new Set(rows.map(r=>r.questionSha256)).size!==1||
    new Set(rows.map(r=>JSON.stringify(r.messages))).size!==1)
    throw Error('CROSS_MODEL_PROMPT_PARITY_FAILED_'+id);
}
const result={
 schemaVersion:'seyeon-c09-three-model-improved-prompt-parity-offline-v1',
 mode:'OFFLINE_ONLY_NO_PAID_CALLS',
 modelIds:models,questionIds:ids,matrixSize:matrix.length,
 matrixSha256:hash(JSON.stringify(matrix.map(x=>[x.model,x.questionId,x.improvedSystemSha256,x.questionSha256]))),
 originalBaselineSource:'docs/experiments/seyeon-c09-three-model-minimax-luna-glm-five-20261027-raw-v1.json',
 plannedMoveSource:'HUMAN_SELECTED_SYNTHETIC_EVAL_ONLY_NOT_AUTONOMOUS',
 actualAutonomyProven:false,longTermMemoryVerified:false,
 realIndependentSemanticReviewPerformed:false,realModelOutputsAvailable:false,
 chargedProviderCalls:0,productionRoutingChanged:false,
 perCaseSystemSha256:ids.map(id=>({
  id,hash:matrix.find(r=>r.questionId===id).improvedSystemSha256,
 })),
 matrix,
};
if(mode==='--offline-export'){
 const file=resolve('artifacts/seyeon-c09-three-model-improved-prompt-parity-offline-v1.json');
 mkdirSync(dirname(file),{recursive:true});
 writeFileSync(file,JSON.stringify(result,null,2)+'\n','utf8');
}
console.log(JSON.stringify({mode:result.mode,models,questionIds:ids,
 matrixSize:matrix.length,perCaseSystemSha256:result.perCaseSystemSha256,
 matrixSha256:result.matrixSha256,realModelOutputsAvailable:false,
 chargedProviderCalls:0,productionRoutingChanged:false},null,2));
