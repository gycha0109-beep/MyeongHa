import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {admitOpenRouterThreeCallV1} from './seyeon-openrouter-three-call-admission-v1.mjs';
import {createOpenRouterSeyeonEvaluationProviderV1,
 OpenRouterSeyeonErrorV1} from
 '../dist/apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import {runSeyeonCensusFirstThreeCallShadowV1} from
 '../dist/apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {createIntegrityClassifier,createDisclosureClassifier} from
 '../dist/apps/api/src/seyeon-production-governance-v1.js';
import {createSeyeonDialoguePathSyntheticCensusV1,
 selectSeyeonDialoguePathCasesV1} from './seyeon-dialogue-path-eval-core-v1.mjs';
import {SEYEON_MODEL_EVAL_CASES_V1} from './seyeon-model-eval-cases-v1.mjs';

// Public N01, evaluation only. No Production route, relationship or DB changes.
const execution=admitOpenRouterThreeCallV1();
const key=process.env.OPENROUTER_API_KEY?.trim();
if(!key||key.length<20)throw Error('OPENROUTER_SECRET_HOLD');
if(!process.env.RUNNER_TEMP)throw Error('RUNNER_TEMP_REQUIRED_HOLD');
const MODEL='openai/gpt-oss-20b',MAX_CALLS=3,MAX_OUTPUT_TOKENS=1536;
const RESERVE_PER_CALL_USD=0.02,MAX_RESERVED_USD=0.06;
const PRIOR_RESERVED_MICRO_USD=816554,FX_KRW_PER_USD=2500;
const OWNER_ADDITIONAL_CAP_KRW=5000;
if((PRIOR_RESERVED_MICRO_USD/1e6+MAX_RESERVED_USD)*FX_KRW_PER_USD>
   OWNER_ADDITIONAL_CAP_KRW)throw Error('OWNER_BUDGET_HOLD');
const stages=Object.freeze([
 'unified_preflight_shadow','turn_interpret_render_shadow','semantic_review',
]);
const cases=selectSeyeonDialoguePathCasesV1(SEYEON_MODEL_EVAL_CASES_V1);
const spec=cases.find(x=>x.id==='N01');
if(!spec||spec.text!=='안녕, 세연아!'||
   cases.filter(x=>x.id==='N01').length!==1)throw Error('FIXTURE_CHANGED_HOLD');
const dir=join(process.env.RUNNER_TEMP,'seyeon-openrouter-full-first-turn');
await mkdir(dir,{recursive:true,mode:0o700});
const ledger=await open(join(dir,'attempts.jsonl'),'wx',0o600);
const journal=async row=>{await ledger.appendFile(JSON.stringify(row)+'\n');await ledger.sync();};
const started=performance.now(),metrics={};
let attempts=0,observed=0,costMicroUsd=0,usageUnknown=false;
let verdict='HOLD',reason='UNKNOWN_HOLD',guardApproved=false,outputFlags=null;
let censusReads=null;
try{
 const provider=createOpenRouterSeyeonEvaluationProviderV1({
  apiKey:key,model:MODEL,maxCompletionTokens:MAX_OUTPUT_TOKENS,
  timeoutMs:30000,fetchImpl:fetch,
  beforeDispatch:async data=>{
   if(attempts>=MAX_CALLS||data.modelKey!==MODEL||
    data.purpose!==stages[attempts]||
    data.requestBodyBytes<1||data.requestBodyBytes>24576||
    (attempts+1)*RESERVE_PER_CALL_USD>MAX_RESERVED_USD+1e-9)
    throw Error('PRE_DISPATCH_TOPOLOGY_OR_BUDGET_HOLD');
   const next=attempts+1;
   await journal({kind:'reserve',runId:execution.runId,
    attempt:next,stage:data.purpose,model:MODEL,
    requestBytes:data.requestBodyBytes,reservedMicroUsd:20000});
   attempts=next;
  },
  afterOutcome:async metric=>{
   observed++;
   if(!stages.includes(metric.purpose)||metrics[metric.purpose])
    throw Error('DUPLICATE_OR_UNKNOWN_STAGE_HOLD');
   const known=metric.promptTokens!==null&&metric.completionTokens!==null;
   const estimate=known?Math.ceil(metric.promptTokens*0.02+
     metric.completionTokens*0.10):null;
   if(!known)usageUnknown=true;
   else costMicroUsd+=estimate;
   const row={stage:metric.purpose,outcome:metric.outcome,
    httpStatus:metric.httpStatus,elapsedMs:metric.elapsedMs,
    inputTokens:metric.promptTokens,outputTokens:metric.completionTokens,
    cachedTokens:metric.cachedPromptTokens,
    reasoningTokens:metric.reasoningTokens,estimatedMicroUsd:estimate};
   metrics[metric.purpose]=row;
   await journal({kind:'observed',runId:execution.runId,model:MODEL,...row});
   if(estimate!==null&&(estimate>20000||costMicroUsd>60000))
    throw Error('POST_DISPATCH_COST_HOLD');
  },
 });
 const governance=Object.freeze({
  relationship:Object.freeze({gate:'PUBLIC',trustBand:'low',
   relevantSharedHistoryRefs:Object.freeze([])}),
  integrity:Object.freeze({
   classifier:createIntegrityClassifier(provider),
   authorityResolver:Object.freeze({resolve:({claim})=>({
    state:'MISSING',authorityRefs:[],provenanceRefs:['synthetic:unresolved:'+claim.kind],
   })}),
  }),
  disclosure:Object.freeze({
   classifier:createDisclosureClassifier(provider),
   sourceDescriptor:Object.freeze({readDescriptor(){
    throw Error('SYNTHETIC_PRIVATE_SOURCE_HOLD');
   }}),
   factAuthorityResolver:Object.freeze({resolve(){
    throw Error('SYNTHETIC_PRIVATE_FACT_HOLD');
   }}),
   retriever:Object.freeze({retrieve(){
    throw Error('SYNTHETIC_PRIVATE_RETRIEVAL_HOLD');
   }}),
  }),
 });
 const id='synthetic:'+spec.id;
 const contextInput=Object.freeze({relationship:null,
  recentMessages:Object.freeze([{messageId:id,role:'user',text:spec.text}]),
  retrievedMemories:Object.freeze([])});
 const census=createSeyeonDialoguePathSyntheticCensusV1(spec.id,id);
 const result=await runSeyeonCensusFirstThreeCallShadowV1({
  userMessageRef:id,userText:spec.text,contextInput,governance,
  fullThreadCensus:census.port,unifiedPreflightProvider:provider,
  candidateDialogueProvider:provider,independentSemanticReviewer:provider,
 });
 censusReads=census.readCount;
 const out=result.envelope;
 if(attempts!==3||observed!==3||usageUnknown||
    stages.some(s=>metrics[s]?.outcome!=='response_received'||
     metrics[s]?.httpStatus!==200)||
    costMicroUsd>60000||census.readCount!==4||
    result.scope!=='SHADOW_ONLY_NOT_PRODUCTION'||
    out?.revealLevel!=='public'||out.memoryRefsMentioned?.length!==0||
    out.privateSourceRefsMentioned?.length!==0||
    out.disclosureSliceIds?.length!==0||
    typeof out.utterance!=='string'||out.utterance.trim().length===0)
  throw Error('OUTPUT_OR_STAGE_GUARD_HOLD');
 outputFlags={utteranceChars:out.utterance.length,
  hasHangul:/[가-힣]/u.test(out.utterance),publicReveal:true,
  emptyMemoryRefs:true,emptyPrivateRefs:true,emptyDisclosureRefs:true};
 guardApproved=true;verdict='PASS';reason='ALL_THREE_GUARDS_ADMITTED';
}catch(error){
 const codes=new Set(['FAST_THREAD_CENSUS_REJECTED',
  'FAST_SENSITIVE_PREFLIGHT_REJECTED','FAST_INTERPRETATION_GUARD_REJECTED',
  'FAST_RISK_CAUSALITY_REJECTED','FAST_RENDERER_PACKET_REJECTED',
  'FAST_RENDERER_GUARD_REJECTED','FAST_SEMANTIC_OUTPUT_REJECTED']);
 reason=error instanceof OpenRouterSeyeonErrorV1?error.code:
  codes.has(error?.code)?error.code:'SERVER_GUARD_OR_UNKNOWN_HOLD';
}finally{
 const evidence={schemaVersion:'seyeon-openrouter-gpt-oss-20b-three-call-v1',
  runId:execution.runId,mainSha:execution.sha,model:MODEL,caseId:'N01',
  scope:'REAL_MODEL_SYNTHETIC_PUBLIC_FIRST_CONTACT_SHADOW',
  verdict,reason,guardApproved,attemptedCalls:attempts,observedCalls:observed,
  expectedStages:stages,measuredStages:metrics,
  syntheticCensusReads:censusReads,outputFlags,
  reservedMicroUsd:attempts*20000,maxPossibleReservedMicroUsd:60000,
  cumulativeAdditionalReservedKrw:Math.round(
   (PRIOR_RESERVED_MICRO_USD+attempts*20000)*FX_KRW_PER_USD/1000)/1000,
  ownerAdditionalCapKrw:OWNER_ADDITIONAL_CAP_KRW,
  estimatedMicroUsd:usageUnknown?null:costMicroUsd,
  actualBilledMicroUsd:null,invoiceReconciled:false,
  elapsedMs:Math.round(performance.now()-started),
  previousTerraThreeCallBaseline:{elapsedMs:9698,inputTokens:7873,
    outputTokens:735,estimatedMicroUsd:22062},
  characterVoiceQualityVerified:false,productionPromotionPermitted:false};
 await writeFile(join(dir,'report.json'),JSON.stringify(evidence,null,2)+'\n',
  {flag:'wx',mode:0o600});
 await ledger.close();
 console.log('SEYEON_OPENROUTER_THREE_CALL '+JSON.stringify(evidence));
}
if(verdict!=='PASS')process.exitCode=1;
