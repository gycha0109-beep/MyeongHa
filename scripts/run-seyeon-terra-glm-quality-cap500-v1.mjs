import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {
 requireSeyeonTrioOpenAiStageV1,
 requirePublicSyntheticQualityUtteranceV1,
 SEYEON_TERRA_GLM_QUALITY_TRIO_LUNA_RESERVE_MICRO_USD as LUNA_RESERVE,
 SEYEON_TERRA_GLM_QUALITY_TRIO_GLM_RESERVE_MICRO_USD as GLM_RESERVE,
 SEYEON_TERRA_GLM_QUALITY_TRIO_FX_MAX as FX_MAX,
} from './seyeon-terra-glm-quality-trio-admission-v1.mjs';
import {
 admitN06Cap500OneShotV1,assertN06Cap500ReservationV1,
 N06_MAX_RESERVED_KRW,N06_CAP500_OWNER_KRW as OWNER_CAP,
 N06_RESERVED_MICRO_USD,
 N06_TERRA_RESERVE_MICRO_USD as TERRA_RESERVE,
} from './seyeon-terra-glm-quality-cap500-admission-v1.mjs';
import {getPaidGlm53FlashAdmissionV1,getOpenRouterAccountUsageV1}
 from './seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';
import {createOpenAiSeyeonStructuredProviderV1}
 from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import {createOpenRouterSeyeonEvaluationProviderV1,lookupOpenRouterSeyeonGenerationChargeV1}
 from '../dist/apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import {runSeyeonCensusFirstThreeCallShadowV1}
 from '../dist/apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {createIntegrityClassifier,createDisclosureClassifier}
 from '../dist/apps/api/src/seyeon-production-governance-v1.js';
import {

 estimateSeyeonDialoguePathCostV1,
 verifySeyeonDialoguePathStageTopologyV1,
 SEYEON_DIALOGUE_PATH_PRICES_V1,
} from './seyeon-dialogue-path-eval-core-v1.mjs';
import {createSeyeonQualityTrioSyntheticCensusV1}
 from './seyeon-terra-glm-quality-trio-census-v1.mjs';
import {SEYEON_MODEL_EVAL_CASES_V1}
 from './seyeon-model-eval-cases-v1.mjs';
import {buildSeyeonTerraGlmFailureDiagnosticV1}
 from './seyeon-terra-glm-failure-diagnostic-v1.mjs';

const execution=admitN06Cap500OneShotV1();
const terraKey=process.env.OPENAI_API_KEY?.trim();
const glmKey=process.env.OPENROUTER_API_KEY?.trim();
if(!terraKey||terraKey.length<20||!glmKey||glmKey.length<20||
   !process.env.RUNNER_TEMP)throw Error('TERRA_GLM_QUALITY_TRIO_CREDENTIAL_OR_RUNNER_HOLD');
// Owner-approved narrow paid scope: ONE N06 pair, six calls, under 500 KRW.
const QUALITY_CASES=Object.freeze([
 Object.freeze({id:'N06',text:'오늘은 네가 먼저 이야기해 줘.',dimension:'initiative'}),
]);
if(QUALITY_CASES.some(spec=>SEYEON_MODEL_EVAL_CASES_V1.filter(x=>
 x.id===spec.id&&x.text===spec.text&&x.topic===null).length!==1))
 throw Error('TERRA_GLM_QUALITY_TRIO_FIXTURE_HOLD');
const contextInput=(spec,id)=>({
 relationship:null,recentMessages:[{messageId:id,role:'user',text:spec.text}],
 retrievedMemories:[],
});
const dir=join(process.env.RUNNER_TEMP,'seyeon-terra-glm-quality-cap500');
await mkdir(dir,{recursive:true,mode:0o700});
const ledger=await open(join(dir,'attempts.jsonl'),'wx',0o600);
const record=async x=>{await ledger.appendFile(JSON.stringify(x)+'\n');await ledger.sync();};
const started=performance.now();
const metrics={candidate:[],glm:[]};
let counts={candidate:{},glm:{}};
let observedStages={candidate:{},glm:{}};
const completePairs=[];
let currentCase=null;
const reservation={luna:0,terra:0,glm:0};
let verdict='HOLD',reason='NOT_COMPLETED';
let failureDiagnostic=null;
let availableCredit=null,selectedProvider=null,purchasedMicroUsd=null;
let openRouterBefore=null,openRouterAfter=null;
let candidateText=null,glmText=null,candidateElapsedMs=null,glmElapsedMs=null;
const candidateModels=Object.freeze({
 unified_preflight_shadow:'gpt-5.6-luna',
 turn_interpret_render_shadow:'gpt-5.6-terra',
 semantic_review:'gpt-5.6-terra',
});
const glmStages=Object.freeze(Object.keys(candidateModels));
const totalReserves=()=>reservation.luna*LUNA_RESERVE+
 reservation.terra*TERRA_RESERVE+reservation.glm*GLM_RESERVE;
const budget=(next,route,bytes)=>assertN06Cap500ReservationV1(
  reservation,next,route,bytes,1536,
);
const reserve=async(route,stage,bytes,limit,cap)=>{
 if(!Number.isInteger(bytes)||bytes<1||reservation[route]>=cap)
  throw Error('TERRA_GLM_QUALITY_TRIO_REQUEST_BOUNDS_HOLD');
 budget(limit,route,bytes);
 await record({kind:'reserve',route,caseId:currentCase.id,stage,
  ordinal:reservation[route]+1,requestBytes:bytes,reservedMicroUsd:limit,runId:execution.runId});
 reservation[route]++;
 const type=route==='glm'?'glm':'candidate';
 counts[type][stage]=(counts[type][stage]??0)+1;
 if(counts[type][stage]!==1)throw Error('TERRA_GLM_QUALITY_TRIO_STAGE_REPLAY_HOLD');
};
const governance=provider=>({
 relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
 integrity:{
  classifier:createIntegrityClassifier(provider),
  authorityResolver:{resolve:({claim})=>({
   state:'MISSING',authorityRefs:[],provenanceRefs:['synthetic:unresolved:'+claim.kind],
  })},
 },
 disclosure:{
  classifier:createDisclosureClassifier(provider),
  sourceDescriptor:{readDescriptor(){throw Error('SYNTHETIC_PRIVATE_DESCRIPTOR_HOLD');}},
  factAuthorityResolver:{resolve(){throw Error('SYNTHETIC_PRIVATE_FACT_HOLD');}},
  retriever:{retrieve(){throw Error('SYNTHETIC_PRIVATE_RETRIEVAL_HOLD');}},
 },
});
function openAiProvider(model,expectedStage){
 if(candidateModels[expectedStage]!==model)throw Error('LUNA_TERRA_STAGE_MODEL_MISMATCH_HOLD');
 const route=model==='gpt-5.6-luna'?'luna':'terra';
 const limit=route==='luna'?LUNA_RESERVE:TERRA_RESERVE;
 const cap=route==='luna'?1:2;
 const prices=SEYEON_DIALOGUE_PATH_PRICES_V1[model];
 const noteFailure=async(phase,httpStatus,error=null)=>{
  const diagnostic=buildSeyeonTerraGlmFailureDiagnosticV1({
   phase,httpStatus,error,caseId:currentCase.id,stage:expectedStage,model,route,
  });
  failureDiagnostic=diagnostic;
  // Fixed vocabulary only. Never log messages, stacks, URLs, prompts,
  // request/response bodies, credentials or personal identifiers.
  console.error('SEYEON_TERRA_GLM_QUALITY_TRIO_FAILURE '+JSON.stringify(diagnostic));
  try{
   await record({kind:'provider_failure',runId:execution.runId,...diagnostic});
  }catch{
   console.error('SEYEON_TERRA_GLM_QUALITY_TRIO_FAILURE_PERSIST_HOLD');
  }
 };
 return createOpenAiSeyeonStructuredProviderV1({
  apiKey:terraKey,model,maxOutputTokens:1536,timeoutMs:30000,
  meteredBeforeDispatch:async(metadata,body)=>{
   let request;
   try{request=JSON.parse(body);}catch{throw Error('LUNA_TERRA_REQUEST_SHAPE_HOLD');}
   const stage=requireSeyeonTrioOpenAiStageV1(
    request?.text?.format?.name,expectedStage);
   if(metadata.purpose!==expectedStage||metadata.modelKey!==model||
      metadata.requestBodyBytes!==Buffer.byteLength(body,'utf8')||
      request.model!==model||
      !Number.isInteger(request.max_output_tokens)||
      request.max_output_tokens<1||request.max_output_tokens>1536)
    throw Error('LUNA_TERRA_STAGE_OR_MODEL_HOLD');
   await reserve(route,stage,metadata.requestBodyBytes,limit,cap);
  },
  fetchImpl:async(url,init)=>{
   if(url!=='https://api.openai.com/v1/responses'){
    await noteFailure('provider_origin',null);
    throw Error('LUNA_TERRA_PROVIDER_ORIGIN_HOLD');
   }
   const t=performance.now();
   let response;
   try{
    response=await fetch(url,init);
   }catch(error){
    await noteFailure('transport',null,error);
    throw Error('LUNA_TERRA_TRANSPORT_FAILURE_HOLD');
   }
   const elapsedMs=Math.round(performance.now()-t);
   if(response.status!==200){
    await noteFailure('http_status',response.status);
    throw Error('LUNA_TERRA_HTTP_STATUS_HOLD');
   }
   let parsed;
   try{
    parsed=await response.clone().json();
   }catch(error){
    await noteFailure('response_parse',response.status,error);
    throw Error('LUNA_TERRA_RESPONSE_PARSE_FAILURE_HOLD');
   }
   if(!parsed?.usage||!Number.isSafeInteger(parsed.usage.input_tokens)||
      !Number.isSafeInteger(parsed.usage.output_tokens)||
      parsed.usage.input_tokens<1||parsed.usage.output_tokens<1){
    await noteFailure('usage_validation',response.status);
    throw Error('LUNA_TERRA_USAGE_INVALID_HOLD');
   }
   let tokens,cost;
   try{
    tokens=estimateSeyeonDialoguePathCostV1(parsed.usage,prices);
    cost=Math.ceil(tokens.usd*1e6);
   }catch(error){
    await noteFailure('usage_validation',response.status,error);
    throw Error('LUNA_TERRA_USAGE_INVALID_HOLD');
   }
   if(!Number.isSafeInteger(cost)||cost<0||cost>limit){
    await noteFailure('cost_validation',response.status);
    throw Error('LUNA_TERRA_COST_LIMIT_HOLD');
   }
   // 'stage' was local to meteredBeforeDispatch, not visible here.
   // Use the immutable allowlisted expectedStage in observed metrics.
   const observed={caseId:currentCase.id,stage:expectedStage,model,
    httpStatus:response.status,elapsedMs,inputTokens:tokens.input,
    outputTokens:tokens.output,cachedTokens:tokens.cached,
    usageEstimateMicroUsd:cost};
   try{
    await record({kind:'observed',route,...observed});
   }catch(error){
    await noteFailure('observation_write',response.status,error);
    throw Error('LUNA_TERRA_OBSERVATION_WRITE_HOLD');
   }
   metrics.candidate.push(observed);
   observedStages.candidate[expectedStage]=(observedStages.candidate[expectedStage]??0)+1;
   return response;
  },
 });
}
const ensureCandidateFinished=()=>{
 const completed=completePairs.length+1;
 const current=metrics.candidate.filter(x=>x.caseId===currentCase.id);
 if(reservation.luna!==completed||reservation.terra!==2*completed||
    current.length!==3||current.some(x=>x.httpStatus!==200)||
    current.filter(x=>x.model==='gpt-5.6-luna').length!==1||
    current.filter(x=>x.model==='gpt-5.6-terra').length!==2||
    !verifySeyeonDialoguePathStageTopologyV1('fast_3_luna_terra',counts.candidate)||
    !verifySeyeonDialoguePathStageTopologyV1('fast_3_luna_terra',observedStages.candidate))
  throw Error('LUNA_TERRA_TOPOLOGY_HOLD');
};
const ensureGlmFinished=()=>{
 if(reservation.glm!==3*(completePairs.length+1)||
    metrics.glm.filter(x=>x.caseId===currentCase.id).length!==3||
    metrics.glm.some(x=>x.httpStatus!==200)||
    Object.keys(counts.glm).length!==3||
    glmStages.some(s=>counts.glm[s]!==1||observedStages.glm[s]!==1))
  throw Error('GLM_TOPOLOGY_HOLD');
};
try{
 // Before Terra incurs any charge, require that the GLM route, account balance
 // and exact-ZDR schema provider all qualify for three model requests.
 const preflight=await getPaidGlm53FlashAdmissionV1(glmKey);
 if(preflight.ok!==true||preflight.metadataGetCount!==4||
    preflight.funding?.availableMicroUsd<180000)
  throw Error('GLM_CREDIT_OR_PROVIDER_PREFLIGHT_HOLD');
 selectedProvider=preflight.route.providerTag;
 availableCredit=preflight.funding.availableMicroUsd;
 purchasedMicroUsd=preflight.funding.purchasedMicroUsd;
 openRouterBefore=preflight.funding.accountUsageMicroUsd;
 await record({kind:'admitted',runId:execution.runId,model:'z-ai/glm-5.3-flash',
  provider:selectedProvider,purchasedMicroUsd,availableCredit,
  officialZdrSchemaOverlapVerified:true,
  privacyEnforcement:'zdr_true_data_collection_deny'});
 for(const spec of QUALITY_CASES){
  currentCase=spec;
  counts={candidate:{},glm:{}};observedStages={candidate:{},glm:{}};
  candidateText=null;glmText=null;
  const ID='synthetic:'+spec.id,TEXT=spec.text;
  const luna=openAiProvider('gpt-5.6-luna','unified_preflight_shadow');
  const terraDialogue=openAiProvider('gpt-5.6-terra','turn_interpret_render_shadow');
  const terraReviewer=openAiProvider('gpt-5.6-terra','semantic_review');
  const candidateCensus=createSeyeonQualityTrioSyntheticCensusV1(spec.id,ID);
  const t1=performance.now();
  const candidateResult=await runSeyeonCensusFirstThreeCallShadowV1({
   userMessageRef:ID,userText:TEXT,contextInput:contextInput(spec,ID),
   governance:governance(luna),fullThreadCensus:candidateCensus.port,
   unifiedPreflightProvider:luna,candidateDialogueProvider:terraDialogue,
   independentSemanticReviewer:terraReviewer,
  });
  candidateElapsedMs=Math.round(performance.now()-t1);
  ensureCandidateFinished();
  if(candidateCensus.readCount!==4||candidateResult.scope!=='SHADOW_ONLY_NOT_PRODUCTION')
   throw Error('LUNA_TERRA_CENSUS_OR_SCOPE_HOLD');
  candidateText=requirePublicSyntheticQualityUtteranceV1(candidateResult.envelope);

 const glm=createOpenRouterSeyeonEvaluationProviderV1({
  apiKey:glmKey,model:'z-ai/glm-5.3-flash',
  providerOnlyTag:selectedProvider,maxCompletionTokens:1536,timeoutMs:30000,
  fetchImpl:fetch,
  beforeDispatch:async m=>{
   const expected=glmStages[reservation.glm%glmStages.length];
   if(m.modelKey!=='z-ai/glm-5.3-flash'||m.purpose!==expected)
    throw Error('GLM_STAGE_OR_MODEL_HOLD');
   await reserve('glm',expected,m.requestBodyBytes,GLM_RESERVE,3);
  },
  afterOutcome:async m=>{
   const estimate=m.promptTokens!==null&&m.completionTokens!==null
    ?Math.ceil(m.promptTokens*preflight.route.inputUsdPerMTokens+
       m.completionTokens*preflight.route.outputUsdPerMTokens):null;
   const observed={caseId:currentCase.id,stage:m.purpose,outcome:m.outcome,
    httpStatus:m.httpStatus,elapsedMs:m.elapsedMs,
    inputTokens:m.promptTokens,outputTokens:m.completionTokens,
    cachedTokens:m.cachedPromptTokens,reasoningTokens:m.reasoningTokens,
    responseReportedCostMicroUsd:m.responseReportedCostMicroUsd,
    usageEstimateMicroUsd:estimate,
    generationLookupStatus:null,generationCostMicroUsd:null,
    generationCostVerified:false};
   if(!glmStages.includes(m.purpose)||observedStages.glm[m.purpose])
    throw Error('GLM_STAGE_METRICS_HOLD');
   if(m.generationId){
    const verified=await lookupOpenRouterSeyeonGenerationChargeV1({
     apiKey:glmKey,generationId:m.generationId,expectedModel:'z-ai/glm-5.3-flash',fetchImpl:fetch});
    observed.generationLookupStatus=verified.lookupStatus;
    observed.generationCostMicroUsd=verified.generationCostMicroUsd;
    observed.generationCostVerified=verified.generationCostVerified;
   }
   metrics.glm.push(observed);
   observedStages.glm[m.purpose]=1;
   await record({kind:'observed',route:'glm',...observed});
   if(estimate===null||estimate>GLM_RESERVE||
      observed.generationCostMicroUsd!==null&&observed.generationCostMicroUsd>GLM_RESERVE)
    throw Error('GLM_USAGE_UNKNOWN_OR_OVER_RESERVE_HOLD');
  },
 });
 const census=createSeyeonQualityTrioSyntheticCensusV1(spec.id,ID);
 const t2=performance.now();
 const glmResult=await runSeyeonCensusFirstThreeCallShadowV1({
  userMessageRef:ID,userText:TEXT,contextInput:contextInput(spec,ID),
  governance:governance(glm),fullThreadCensus:census.port,
  unifiedPreflightProvider:glm,candidateDialogueProvider:glm,
  independentSemanticReviewer:glm,
 });
 glmElapsedMs=Math.round(performance.now()-t2);
 ensureGlmFinished();
 if(census.readCount!==4||glmResult.scope!=='SHADOW_ONLY_NOT_PRODUCTION')
  throw Error('GLM_CENSUS_OR_SCOPE_HOLD');
 glmText=requirePublicSyntheticQualityUtteranceV1(glmResult.envelope);
 completePairs.push({id:spec.id,dimension:spec.dimension,input:TEXT,
  lunaTerra3:candidateText,glmFlash3:glmText,candidateElapsedMs,glmElapsedMs});
 }
 verdict='GUARD_N06_PAIR_PASS';
 reason='N06_BOTH_THREE_CALL_PATHS_GUARD_PASS';
}catch(e){
 // No assistant utterance is revealed on any failed path.
 // Prefer trusted fixed-vocabulary phase evidence over generic NETWORK_FAILURE.
 reason=failureDiagnostic?.reason??(
  typeof e?.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(e.code)
  ?e.code : typeof e?.message==='string'&&/^[A-Z0-9_]{1,80}$/.test(e.message)
  ?e.message:'OPAQUE_PROVIDER_OR_GUARD_HOLD');
 candidateText=null;glmText=null;
}finally{
 openRouterAfter=await getOpenRouterAccountUsageV1(glmKey);
 const candidateInput=metrics.candidate.reduce((a,x)=>a+(x.inputTokens??0),0);
 const candidateOutput=metrics.candidate.reduce((a,x)=>a+(x.outputTokens??0),0);
 const glmInput=metrics.glm.reduce((a,x)=>a+(x.inputTokens??0),0);
 const glmOutput=metrics.glm.reduce((a,x)=>a+(x.outputTokens??0),0);
 const candidateCost=metrics.candidate.length>0&&
  metrics.candidate.every(x=>x.usageEstimateMicroUsd!==null)
  ?metrics.candidate.reduce((a,x)=>a+x.usageEstimateMicroUsd,0):null;
 const glmCost=metrics.glm.length>0&&metrics.glm.every(x=>x.usageEstimateMicroUsd!==null)
  ?metrics.glm.reduce((a,x)=>a+x.usageEstimateMicroUsd,0):null;
 const cumulativeReservedKrw=Number((totalReserves()*FX_MAX/1e6).toFixed(3));
 const report={
  schemaVersion:'seyeon-n06-luna-terra-glm-cap500-public-quality-pair-v1',
  caseIds:QUALITY_CASES.map(x=>x.id),completedPairIds:completePairs.map(x=>x.id),
   scope:'N06_PUBLIC_SYNTHETIC_PERSONA_CASE_OWNER_VISIBLE_ONLY',
  verdict,reason,failureDiagnostic,mainSha:execution.mainSha,runId:execution.runId,
  modelPaths:{candidate:'gpt-5.6-luna x1 + gpt-5.6-terra x2 fast3',glm:'z-ai/glm-5.3-flash x3 fast3'},
  glmProvider:selectedProvider,purchasedCreditsMicroUsd:purchasedMicroUsd,
  glmAvailableCreditBeforeMicroUsd:availableCredit,
  glmAccountUsageBeforeMicroUsd:openRouterBefore,
  glmAccountUsageAfterMicroUsd:openRouterAfter,
  glmAccountUsageDeltaMicroUsd:openRouterBefore!==null&&openRouterAfter!==null
   ?openRouterAfter-openRouterBefore:null,
  candidate:{reservedMicroUsd:reservation.luna*LUNA_RESERVE+
    reservation.terra*TERRA_RESERVE,
   lunaCalls:reservation.luna,terraCalls:reservation.terra,
   observed:metrics.candidate,attemptedCalls:reservation.luna+reservation.terra,
   inputTokens:candidateInput,outputTokens:candidateOutput,
   estimatedMicroUsd:candidateCost,elapsedMs:candidateElapsedMs,
   completedOutputLengths:completePairs.map(x=>({id:x.id,length:x.lunaTerra3.length}))},
  glm:{reservedMicroUsd:reservation.glm*GLM_RESERVE,
   observed:metrics.glm,attemptedCalls:reservation.glm,
   inputTokens:glmInput,outputTokens:glmOutput,
   estimatedMicroUsd:glmCost,elapsedMs:glmElapsedMs,
   completedOutputLengths:completePairs.map(x=>({id:x.id,length:x.glmFlash3.length}))},
  cumulativeMaximumReservedKrw:cumulativeReservedKrw,ownerCapKrw:OWNER_CAP,
  approvedScopeReservedMicroUsd:N06_RESERVED_MICRO_USD,
  approvedScopeMaxReservedKrw:N06_MAX_RESERVED_KRW,
  estimatedMicroUsd:candidateCost!==null&&glmCost!==null?candidateCost+glmCost:null,
  actualProviderInvoiceReconciled:false,
  characterVoiceQualityVerified:false,productionPromotionPermitted:false,
  durationMs:Math.round(performance.now()-started),
 };
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',
  {flag:'wx',mode:0o600});
 await ledger.close();
 console.log('SEYEON_TERRA_GLM_QUALITY_TRIO_NUMERIC '+JSON.stringify(report));
 // Reveal only guarded PUBLIC synthetic final replies, never drafts.
 if(completePairs.length>0){
  console.log('SEYEON_TERRA_GLM_QUALITY_TRIO_OWNER_VISIBLE '+JSON.stringify({
   verdict,reason,scope:'N06_PUBLIC_SYNTHETIC_PERSONA_OWNER_REVIEW',
   pairs:completePairs,productionPromotionPermitted:false,
  }));
 }
}
if(verdict!=='GUARD_N06_PAIR_PASS')process.exitCode=1;
