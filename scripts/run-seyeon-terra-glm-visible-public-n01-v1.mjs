import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {
 admitTerraGlmVisibleN01OneShotV1,requirePublicSyntheticN01UtteranceV1,
 SEYEON_TERRA_GLM_PUBLIC_N01_PRIOR_RESERVED_MICRO_USD as PRIOR,
 SEYEON_TERRA_GLM_PUBLIC_N01_TERRA_RESERVE_MICRO_USD as TERRA_RESERVE,
 SEYEON_TERRA_GLM_PUBLIC_N01_GLM_RESERVE_MICRO_USD as GLM_RESERVE,
 SEYEON_TERRA_GLM_PUBLIC_N01_OWNER_BUDGET_KRW as OWNER_CAP,
 SEYEON_TERRA_GLM_PUBLIC_N01_FX_MAX as FX_MAX,
} from './seyeon-terra-glm-visible-public-n01-admission-v1.mjs';
import {getPaidGlm53FlashAdmissionV1,getOpenRouterAccountUsageV1}
 from './seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';
import {createOpenAiSeyeonStructuredProviderV1}
 from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import {createOpenRouterSeyeonEvaluationProviderV1,lookupOpenRouterSeyeonGenerationChargeV1}
 from '../dist/apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import {runSeyeonCharacterTurnV2}
 from '../dist/apps/api/src/seyeon-character-runtime-v2.js';
import {runSeyeonCensusFirstThreeCallShadowV1}
 from '../dist/apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {createIntegrityClassifier,createDisclosureClassifier}
 from '../dist/apps/api/src/seyeon-production-governance-v1.js';
import {
 createSeyeonDialoguePathSyntheticCensusV1,
 estimateSeyeonDialoguePathCostV1,
 verifySeyeonDialoguePathStageTopologyV1,
 SEYEON_DIALOGUE_PATH_PRICES_V1,
} from './seyeon-dialogue-path-eval-core-v1.mjs';
import {SEYEON_MODEL_EVAL_CASES_V1}
 from './seyeon-model-eval-cases-v1.mjs';

const execution=admitTerraGlmVisibleN01OneShotV1();
const terraKey=process.env.OPENAI_API_KEY?.trim();
const glmKey=process.env.OPENROUTER_API_KEY?.trim();
if(!terraKey||terraKey.length<20||!glmKey||glmKey.length<20||
   !process.env.RUNNER_TEMP)throw Error('TERRA_GLM_VISIBLE_N01_CREDENTIAL_OR_RUNNER_HOLD');
const spec=SEYEON_MODEL_EVAL_CASES_V1.find(x=>x.id==='N01');
if(!spec||spec.text!=='안녕, 세연아!'||spec.topic!==null||
  SEYEON_MODEL_EVAL_CASES_V1.filter(x=>x.id==='N01').length!==1)
 throw Error('TERRA_GLM_VISIBLE_N01_FIXTURE_HOLD');
const TEXT=spec.text,ID='synthetic:N01';
const contextInput=()=>({
 relationship:null,recentMessages:[{messageId:ID,role:'user',text:TEXT}],
 retrievedMemories:[],
});
const dir=join(process.env.RUNNER_TEMP,'seyeon-terra-glm-visible-public-n01');
await mkdir(dir,{recursive:true,mode:0o700});
const ledger=await open(join(dir,'attempts.jsonl'),'wx',0o600);
const record=async x=>{await ledger.appendFile(JSON.stringify(x)+'\n');await ledger.sync();};
const started=performance.now();
const metrics={terra:[],glm:[]};
const counts={terra:{},glm:{}};
const observedStages={terra:{},glm:{}};
const reservation={terra:0,glm:0};
let verdict='HOLD',reason='NOT_COMPLETED';
let availableCredit=null,selectedProvider=null,purchasedMicroUsd=null;
let openRouterBefore=null,openRouterAfter=null;
let terraText=null,glmText=null,terraElapsedMs=null,glmElapsedMs=null;
const terraExpected=new Set(['integrity_classification','disclosure_classification',
 'turn_interpretation','dialogue_render','semantic_review']);
const glmStages=Object.freeze(['unified_preflight_shadow','turn_interpret_render_shadow','semantic_review']);
const totalReserves=()=>PRIOR+reservation.terra*TERRA_RESERVE+reservation.glm*GLM_RESERVE;
const budget=(next)=> {
 if((totalReserves()+next)*FX_MAX/1e6>OWNER_CAP)
  throw Error('TERRA_GLM_VISIBLE_N01_BUDGET_HOLD');
};
const reserve=async(route,stage,bytes,limit,cap)=>{
 if(!Number.isInteger(bytes)||bytes<1||bytes>24576||
    reservation[route]>=cap)throw Error('TERRA_GLM_VISIBLE_N01_REQUEST_BOUNDS_HOLD');
 budget(limit);
 // The ledger is durable before a potentially charged POST.
 await record({kind:'reserve',route,stage,
  ordinal:reservation[route]+1,requestBytes:bytes,reservedMicroUsd:limit,runId:execution.runId});
 reservation[route]++;
 counts[route][stage]=(counts[route][stage]??0)+1;
 if(counts[route][stage]!==1)throw Error('TERRA_GLM_VISIBLE_N01_STAGE_REPLAY_HOLD');
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
const terraPrices=SEYEON_DIALOGUE_PATH_PRICES_V1['gpt-5.6-terra'];
function terraProvider(){
 return createOpenAiSeyeonStructuredProviderV1({
  apiKey:terraKey,model:'gpt-5.6-terra',
  maxOutputTokens:1536,timeoutMs:30000,
  fetchImpl:async(url,init)=>{
   const body=String(init?.body??'');
   const bytes=Buffer.byteLength(body,'utf8');
   let request;
   try{request=JSON.parse(body);}catch{throw Error('TERRA_REQUEST_SHAPE_HOLD');}
   const name=request?.text?.format?.name;
   const stage=typeof name==='string'&&name.startsWith('myeongha_')&&name.endsWith('_v2')
    ?name.slice(8,-3):null;
   if(!terraExpected.has(stage)||url!=='https://api.openai.com/v1/responses'||
      request.max_output_tokens<1||request.max_output_tokens>1536)
    throw Error('TERRA_STAGE_OR_MODEL_HOLD');
   await reserve('terra',stage,bytes,TERRA_RESERVE,5);
   const t=performance.now();
   const response=await fetch(url,init);
   const elapsedMs=Math.round(performance.now()-t);
   let tokens=null,cost=null;
   if(response.status===200){
    let parsed;
    try{parsed=await response.clone().json();}catch{throw Error('TERRA_UNKNOWN_USAGE_HOLD');}
    if(!parsed?.usage||!Number.isSafeInteger(parsed.usage.input_tokens)||
       !Number.isSafeInteger(parsed.usage.output_tokens)||
       parsed.usage.input_tokens<1||parsed.usage.output_tokens<1)
     throw Error('TERRA_UNKNOWN_USAGE_HOLD');
    tokens=estimateSeyeonDialoguePathCostV1(parsed.usage,terraPrices);
    cost=Math.ceil(tokens.usd*1e6);
    if(cost>TERRA_RESERVE)throw Error('TERRA_OBSERVED_COST_OVER_RESERVE_HOLD');
   }
   const observed={stage,httpStatus:response.status,elapsedMs,
    inputTokens:tokens?.input??null,outputTokens:tokens?.output??null,
    cachedTokens:tokens?.cached??null,usageEstimateMicroUsd:cost};
   metrics.terra.push(observed);
   observedStages.terra[stage]=(observedStages.terra[stage]??0)+1;
   await record({kind:'observed',route:'terra',...observed});
   if(response.status!==200)throw Error('TERRA_HTTP_FAILURE_HOLD');
   return response;
  },
 });
}
const ensureTerraFinished=()=>{
 if(reservation.terra!==5||metrics.terra.length!==5||
    metrics.terra.some(x=>x.httpStatus!==200)||
    !verifySeyeonDialoguePathStageTopologyV1('legacy_5_terra',counts.terra)||
    !verifySeyeonDialoguePathStageTopologyV1('legacy_5_terra',observedStages.terra))
  throw Error('TERRA_TOPOLOGY_HOLD');
};
const ensureGlmFinished=()=>{
 if(reservation.glm!==3||metrics.glm.length!==3||
    metrics.glm.some(x=>x.httpStatus!==200)||
    Object.keys(counts.glm).length!==3||
    glmStages.some(s=>counts.glm[s]!==1||observedStages.glm[s]!==1))
  throw Error('GLM_TOPOLOGY_HOLD');
};
try{
 // Before Terra incurs any charge, require that the GLM route, account balance
 // and exact-ZDR schema provider all qualify for three model requests.
 const preflight=await getPaidGlm53FlashAdmissionV1(glmKey);
 if(preflight.ok!==true||preflight.metadataGetCount!==4)
  throw Error('GLM_CREDIT_OR_PROVIDER_PREFLIGHT_HOLD');
 selectedProvider=preflight.route.providerTag;
 availableCredit=preflight.funding.availableMicroUsd;
 purchasedMicroUsd=preflight.funding.purchasedMicroUsd;
 openRouterBefore=preflight.funding.accountUsageMicroUsd;
 await record({kind:'admitted',runId:execution.runId,model:'z-ai/glm-5.3-flash',
  provider:selectedProvider,purchasedMicroUsd,availableCredit,
  officialZdrSchemaOverlapVerified:true,
  privacyEnforcement:'zdr_true_data_collection_deny'});
 const terra=terraProvider();
 const t1=performance.now();
 const terraResult=await runSeyeonCharacterTurnV2({
  userMessageRef:ID,userText:TEXT,contextInput:contextInput(),
  governance:governance(terra),
  interpreterProvider:terra,rendererProvider:terra,
  semanticReviewerProvider:terra,
 });
 terraElapsedMs=Math.round(performance.now()-t1);
 ensureTerraFinished();
 // Do not release the text yet: both independent server pipelines must pass.
 terraText=requirePublicSyntheticN01UtteranceV1(terraResult.envelope);

 const glm=createOpenRouterSeyeonEvaluationProviderV1({
  apiKey:glmKey,model:'z-ai/glm-5.3-flash',
  providerOnlyTag:selectedProvider,maxCompletionTokens:1536,timeoutMs:30000,
  fetchImpl:fetch,
  beforeDispatch:async m=>{
   const expected=glmStages[reservation.glm];
   if(m.modelKey!=='z-ai/glm-5.3-flash'||m.purpose!==expected)
    throw Error('GLM_STAGE_OR_MODEL_HOLD');
   await reserve('glm',expected,m.requestBodyBytes,GLM_RESERVE,3);
  },
  afterOutcome:async m=>{
   const estimate=m.promptTokens!==null&&m.completionTokens!==null
    ?Math.ceil(m.promptTokens*preflight.route.inputUsdPerMTokens+
       m.completionTokens*preflight.route.outputUsdPerMTokens):null;
   const observed={stage:m.purpose,outcome:m.outcome,
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
 const census=createSeyeonDialoguePathSyntheticCensusV1('N01',ID);
 const t2=performance.now();
 const glmResult=await runSeyeonCensusFirstThreeCallShadowV1({
  userMessageRef:ID,userText:TEXT,contextInput:contextInput(),
  governance:governance(glm),fullThreadCensus:census.port,
  unifiedPreflightProvider:glm,candidateDialogueProvider:glm,
  independentSemanticReviewer:glm,
 });
 glmElapsedMs=Math.round(performance.now()-t2);
 ensureGlmFinished();
 if(census.readCount!==4||glmResult.scope!=='SHADOW_ONLY_NOT_PRODUCTION')
  throw Error('GLM_CENSUS_OR_SCOPE_HOLD');
 glmText=requirePublicSyntheticN01UtteranceV1(glmResult.envelope);
 verdict='GUARD_PAIR_PASS';
 reason='BOTH_REAL_PROVIDER_PATHS_GUARDED_PUBLIC_N01_PASS';
}catch(e){
 // No assistant utterance is revealed on any failed path.
 reason=typeof e?.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(e.code)
  ?e.code : typeof e?.message==='string'&&/^[A-Z0-9_]{1,80}$/.test(e.message)
  ?e.message:'OPAQUE_PROVIDER_OR_GUARD_HOLD';
 terraText=null;glmText=null;
}finally{
 openRouterAfter=await getOpenRouterAccountUsageV1(glmKey);
 const terraInput=metrics.terra.reduce((a,x)=>a+(x.inputTokens??0),0);
 const terraOutput=metrics.terra.reduce((a,x)=>a+(x.outputTokens??0),0);
 const glmInput=metrics.glm.reduce((a,x)=>a+(x.inputTokens??0),0);
 const glmOutput=metrics.glm.reduce((a,x)=>a+(x.outputTokens??0),0);
 const terraCost=metrics.terra.every(x=>x.usageEstimateMicroUsd!==null)
  ?metrics.terra.reduce((a,x)=>a+x.usageEstimateMicroUsd,0):null;
 const glmCost=metrics.glm.every(x=>x.usageEstimateMicroUsd!==null)
  ?metrics.glm.reduce((a,x)=>a+x.usageEstimateMicroUsd,0):null;
 const cumulativeReservedKrw=Number((totalReserves()*FX_MAX/1e6).toFixed(3));
 const report={
  schemaVersion:'seyeon-terra-glm-visible-public-n01-v1',
  inputCase:'N01',scope:'ONE_PUBLIC_SYNTHETIC_N01_OWNER_VISIBLE_ONLY',
  verdict,reason,mainSha:execution.mainSha,runId:execution.runId,
  modelPaths:{terra:'gpt-5.6-terra legacy5',glm:'z-ai/glm-5.3-flash fast3'},
  glmProvider:selectedProvider,purchasedCreditsMicroUsd:purchasedMicroUsd,
  glmAvailableCreditBeforeMicroUsd:availableCredit,
  glmAccountUsageBeforeMicroUsd:openRouterBefore,
  glmAccountUsageAfterMicroUsd:openRouterAfter,
  glmAccountUsageDeltaMicroUsd:openRouterBefore!==null&&openRouterAfter!==null
   ?openRouterAfter-openRouterBefore:null,
  terra:{reservedMicroUsd:reservation.terra*TERRA_RESERVE,
   observed:metrics.terra,attemptedCalls:reservation.terra,
   inputTokens:terraInput,outputTokens:terraOutput,
   estimatedMicroUsd:terraCost,elapsedMs:terraElapsedMs,
   outputLength:terraText?.length??null},
  glm:{reservedMicroUsd:reservation.glm*GLM_RESERVE,
   observed:metrics.glm,attemptedCalls:reservation.glm,
   inputTokens:glmInput,outputTokens:glmOutput,
   estimatedMicroUsd:glmCost,elapsedMs:glmElapsedMs,
   outputLength:glmText?.length??null},
  cumulativeMaximumReservedKrw:cumulativeReservedKrw,ownerCapKrw:OWNER_CAP,
  estimatedMicroUsd:terraCost!==null&&glmCost!==null?terraCost+glmCost:null,
  actualProviderInvoiceReconciled:false,
  characterVoiceQualityVerified:false,productionPromotionPermitted:false,
  durationMs:Math.round(performance.now()-started),
 };
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',
  {flag:'wx',mode:0o600});
 await ledger.close();
 console.log('SEYEON_TERRA_GLM_N01_NUMERIC '+JSON.stringify(report));
 // The owner explicitly requested these exact guarded first-contact outputs.
 // This is NOT C08-S blind review, NOT private user data, and NOT a public
 // unrestricted dump. Only the final PUBLIC synthetic utterance is revealed.
 if(verdict==='GUARD_PAIR_PASS'){
  console.log('SEYEON_TERRA_GLM_N01_OWNER_VISIBLE '+JSON.stringify({
   scope:'PUBLIC_SYNTHETIC_N01_OWNER_INSPECTION_NOT_BLIND_REVIEW',
   input:TEXT,
   terraLegacy5:terraText,glmFlash3:glmText,
   productionPromotionPermitted:false,
  }));
 }
}
if(verdict!=='GUARD_PAIR_PASS')process.exitCode=1;
