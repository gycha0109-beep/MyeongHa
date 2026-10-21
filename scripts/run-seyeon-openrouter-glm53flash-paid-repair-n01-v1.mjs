import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {getPaidGlm53FlashAdmissionV1,getOpenRouterAccountUsageV1} from './seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';
import {admitGlm53FlashPaidRepairOneShotV1} from './seyeon-openrouter-glm53flash-paid-repair-admission-v1.mjs';
import {createOpenRouterSeyeonEvaluationProviderV1,
 lookupOpenRouterSeyeonGenerationChargeV1,
 OpenRouterSeyeonErrorV1} from '../dist/apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import {runSeyeonCensusFirstThreeCallShadowV1} from '../dist/apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {createIntegrityClassifier,createDisclosureClassifier} from '../dist/apps/api/src/seyeon-production-governance-v1.js';
import {createSeyeonDialoguePathSyntheticCensusV1} from './seyeon-dialogue-path-eval-core-v1.mjs';

// One PUBLIC SYNTHETIC N01 only. No real user, Production model, or memory.
const execution=admitGlm53FlashPaidRepairOneShotV1();
const key=process.env.OPENROUTER_API_KEY?.trim();
if(!key||key.length<20||!process.env.RUNNER_TEMP)throw Error('GLM53FLASH_PAID_KEY_OR_RUNNER_HOLD');
const MODEL='z-ai/glm-5.3-flash',MAX_CALLS=3,MAX_TOKENS=1536;
const TIMEOUT_MS=30000,PER_CALL_RESERVE_MICRO_USD=20000;
const PRIOR_RESERVED_MICRO_USD=916554,OWNER_BUDGET_KRW=5000,FX_MAX=2500;
const stages=Object.freeze(['unified_preflight_shadow','turn_interpret_render_shadow','semantic_review']);
if(Math.ceil((PRIOR_RESERVED_MICRO_USD+3*PER_CALL_RESERVE_MICRO_USD)*FX_MAX/1000000*1000)/1000>OWNER_BUDGET_KRW)
 throw Error('GLM53FLASH_PAID_BUDGET_HOLD');
const dir=join(process.env.RUNNER_TEMP,'seyeon-glm53flash-paid-repaired-three-call-n01');
await mkdir(dir,{recursive:true,mode:0o700});
const ledger=await open(join(dir,'attempts.jsonl'),'wx',0o600);
const record=async x=>{await ledger.appendFile(JSON.stringify(x)+'\n');await ledger.sync();};
const usageNumber=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1000000?Math.round(x*1000000):null;
async function keyUsageMicroUsd(){
 try{
  const r=await fetch('https://openrouter.ai/api/v1/key',{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{authorization:'Bearer '+key,accept:'application/json'}});
  if(r.status!==200)return null;
  if(!/^application\/json(?:\s*;|$)/iu.test(r.headers.get('content-type')??''))return null;
  const body=await r.text();
  if(Buffer.byteLength(body)>65536)return null;
  const data=JSON.parse(body);
  return usageNumber(data?.data?.usage);
 }catch{return null;}
}
const started=performance.now(),observed=[],attempts=[];
let verdict='HOLD',reason='NOT_COMPLETED',guardApproved=false,censusReads=null;
let utteranceHash=null,outputLength=null,hasHangul=null,usageUnknown=false;
let keyBeforeMicroUsd=null,keyAfterMicroUsd=null,chosenProviderTag=null;
let funding=null,route=null,accountUsageBeforeMicroUsd=null,accountUsageAfterMicroUsd=null;
try{
 keyBeforeMicroUsd=await keyUsageMicroUsd();
 if(keyBeforeMicroUsd===null)throw Error('BILLING_PREFLIGHT_HOLD');
 await record({kind:'account_usage_before',usageMicroUsd:keyBeforeMicroUsd});
 const preflight=await getPaidGlm53FlashAdmissionV1(key);
 if(!preflight.ok)throw Error(preflight.reason==='CREDIT_NOT_VERIFIED'?
   'PAID_CREDIT_PREFLIGHT_HOLD':'PAID_PROVIDER_PREFLIGHT_HOLD');
 funding=preflight.funding;route=preflight.route;
 chosenProviderTag=route.providerTag;
 accountUsageBeforeMicroUsd=funding.accountUsageMicroUsd;
 await record({kind:'paid_credit_and_route_admitted',model:MODEL,providerTag:chosenProviderTag,
  availableCreditMicroUsd:funding.availableMicroUsd,
  purchasedCreditsMicroUsd:funding.purchasedMicroUsd,
  accountUsageBeforeMicroUsd,
  inputUsdPerMTokens:route.inputUsdPerMTokens,
  outputUsdPerMTokens:route.outputUsdPerMTokens,
  endpointOnOfficialZdrList:true,responseFormatAdvertised:true,
  requestMustEnforceDataCollectionDeny:true});
 const provider=createOpenRouterSeyeonEvaluationProviderV1({
  apiKey:key,model:MODEL,maxCompletionTokens:MAX_TOKENS,timeoutMs:TIMEOUT_MS,fetchImpl:fetch,providerOnlyTag:chosenProviderTag,
  beforeDispatch:async m=>{
   const index=attempts.length;
   if(index>=MAX_CALLS||m.modelKey!==MODEL||m.purpose!==stages[index]||
      m.requestBodyBytes<1||m.requestBodyBytes>24576||
      (PRIOR_RESERVED_MICRO_USD+(index+1)*PER_CALL_RESERVE_MICRO_USD)*FX_MAX/1e6>OWNER_BUDGET_KRW)
    throw Error('STAGE_OR_COST_HOLD');
   // Durably reserve BEFORE a potentially billable POST.
   await record({kind:'reservation',runId:execution.runId,
    stage:m.purpose,ordinal:index+1,requestBytes:m.requestBodyBytes,
    reservedMicroUsd:PER_CALL_RESERVE_MICRO_USD});
   attempts.push(m.purpose);
  },
  afterOutcome:async m=>{
   const row={
    stage:m.purpose,outcome:m.outcome,failurePhase:m.failurePhase,
    httpStatus:m.httpStatus,elapsedMs:m.elapsedMs,
    inputTokens:m.promptTokens,outputTokens:m.completionTokens,
    cachedTokens:m.cachedPromptTokens,reasoningTokens:m.reasoningTokens,
    responseReportedCostMicroUsd:m.responseReportedCostMicroUsd,
    usageEstimateMicroUsd:
     m.promptTokens!==null&&m.completionTokens!==null
      ? Math.ceil(m.promptTokens*route.inputUsdPerMTokens+
         m.completionTokens*route.outputUsdPerMTokens):null,
    generationLookupStatus:null,generationCostMicroUsd:null,
    generationCostVerified:false,
   };
   if(!stages.includes(m.purpose)||observed.some(o=>o.stage===m.purpose))
    throw Error('DUPLICATE_STAGE_METRICS_HOLD');
   if(row.usageEstimateMicroUsd===null)usageUnknown=true;
   // The generation ID is never printed or placed in the journal/artifact.
   if(m.generationId){
    const verified=await lookupOpenRouterSeyeonGenerationChargeV1({
     apiKey:key,generationId:m.generationId,expectedModel:MODEL,fetchImpl:fetch});
    row.generationLookupStatus=verified.lookupStatus;
    row.generationCostMicroUsd=verified.generationCostMicroUsd;
    row.generationCostVerified=verified.generationCostVerified;
   }
   observed.push(row);
   await record({kind:'observed',runId:execution.runId,...row});
   if(row.usageEstimateMicroUsd!==null&&row.usageEstimateMicroUsd>PER_CALL_RESERVE_MICRO_USD)
    throw Error('USAGE_BUDGET_HOLD');
   if(row.generationCostMicroUsd!==null&&row.generationCostMicroUsd>PER_CALL_RESERVE_MICRO_USD)
    throw Error('GENERATION_BUDGET_HOLD');
  },
 });
 const governance={
  relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
  integrity:{
   classifier:createIntegrityClassifier(provider),
   authorityResolver:{resolve:({claim})=>({
    state:'MISSING',authorityRefs:[],provenanceRefs:['synthetic:unresolved:'+claim.kind]})},
  },
  disclosure:{
   classifier:createDisclosureClassifier(provider),
   sourceDescriptor:{readDescriptor(){throw Error('PRIVATE_SOURCE_FORBIDDEN');}},
   factAuthorityResolver:{resolve(){throw Error('PRIVATE_FACT_FORBIDDEN');}},
   retriever:{retrieve(){throw Error('PRIVATE_RETRIEVAL_FORBIDDEN');}},
  },
 };
 const id='synthetic:N01',text='안녕, 세연아!';
 const census=createSeyeonDialoguePathSyntheticCensusV1('N01',id);
 const result=await runSeyeonCensusFirstThreeCallShadowV1({
  userMessageRef:id,userText:text,
  contextInput:{relationship:null,recentMessages:[{messageId:id,role:'user',text}],retrievedMemories:[]},
  governance,fullThreadCensus:census.port,
  unifiedPreflightProvider:provider,candidateDialogueProvider:provider,
  independentSemanticReviewer:provider,
 });
 censusReads=census.readCount;
 const e=result.envelope;
 guardApproved=result.scope==='SHADOW_ONLY_NOT_PRODUCTION'&&censusReads===4&&
  e.revealLevel==='public'&&e.memoryRefsMentioned.length===0&&
  e.privateSourceRefsMentioned.length===0&&e.disclosureSliceIds.length===0&&
  typeof e.utterance==='string'&&e.utterance.trim().length>0;
 if(guardApproved){
  utteranceHash=createHash('sha256').update(e.utterance).digest('hex');
  outputLength=e.utterance.length;
  hasHangul=/[가-힣]/u.test(e.utterance);
 }
 if(!guardApproved||attempts.length!==3||observed.length!==3||
   observed.some(x=>x.outcome!=='response_received')||usageUnknown)
  throw Error('OUTPUT_OR_STAGE_GUARD_HOLD');
 verdict='PASS';reason='ALL_THREE_STAGES_AND_SERVER_GUARDS_PASS';
}catch(error){
 const codes=new Set(['CREDIT_REQUIRED','HTTP_FAILURE','INVALID_RESPONSE','USAGE_UNKNOWN',
  'NETWORK_FAILURE','TIMEOUT','PRE_DISPATCH_REJECTED','INVALID_REQUEST','METERING_FAILED',
  'FAST_INTERPRETATION_GUARD_REJECTED','FAST_RISK_CAUSALITY_REJECTED',
  'FAST_RENDERER_PACKET_REJECTED','FAST_RENDERER_GUARD_REJECTED',
  'FAST_SEMANTIC_OUTPUT_REJECTED','FAST_THREAD_CENSUS_REJECTED',
  'FAST_SENSITIVE_PREFLIGHT_REJECTED']);
 reason=error instanceof OpenRouterSeyeonErrorV1?
  error.code:codes.has(error?.code)?error.code:
  error?.message==='PAID_CREDIT_PREFLIGHT_HOLD'?'PAID_CREDIT_PREFLIGHT_HOLD':
  error?.message==='PAID_PROVIDER_PREFLIGHT_HOLD'?'PAID_PROVIDER_PREFLIGHT_HOLD':
  error?.message==='BILLING_PREFLIGHT_HOLD'?'BILLING_PREFLIGHT_HOLD':'SERVER_GUARD_OR_UNKNOWN_HOLD';
}finally{
 keyAfterMicroUsd=await keyUsageMicroUsd();
 accountUsageAfterMicroUsd=await getOpenRouterAccountUsageV1(key);
 // Paid inference can increase spend; this aggregate delta is not a per-generation bill.
 if(keyBeforeMicroUsd!==null&&keyAfterMicroUsd!==null&&
    keyAfterMicroUsd-keyBeforeMicroUsd>attempts.length*PER_CALL_RESERVE_MICRO_USD){
  verdict='HOLD';reason='ACCOUNT_SPEND_OVER_RESERVED_CAP';
 }
 const knownGenerations=observed.filter(x=>x.generationCostVerified);
 const estimateAll=observed.every(x=>x.usageEstimateMicroUsd!==null);
 const generatedChargesAll=observed.length===attempts.length&&
  observed.every(x=>x.generationCostVerified);
 const report={
  schemaVersion:'seyeon-openrouter-glm53flash-paid-repair-n01-v1',
  scope:'PUBLIC_SYNTHETIC_SHADOW_ONLY',model:MODEL,
  pinnedProviderTag:chosenProviderTag,officialZdrSchemaOverlapVerified:chosenProviderTag!==null,
  providerInputUsdPerMillion:route?.inputUsdPerMTokens??null,
  providerOutputUsdPerMillion:route?.outputUsdPerMTokens??null,
  purchasedCreditsMicroUsd:funding?.purchasedMicroUsd??null,
  availableCreditBeforeMicroUsd:funding?.availableMicroUsd??null,
  accountUsageBeforeMicroUsd,accountUsageAfterMicroUsd,
  accountUsageDeltaMicroUsd:accountUsageBeforeMicroUsd!==null&&
   accountUsageAfterMicroUsd!==null&&accountUsageAfterMicroUsd>=accountUsageBeforeMicroUsd?
   accountUsageAfterMicroUsd-accountUsageBeforeMicroUsd:null,
  mainSha:execution.sha,runId:execution.runId,caseId:'N01',
  verdict,reason,attemptedCalls:attempts.length,observedCalls:observed.length,
  expectedStages:stages,observed,guardApproved,censusReads,
  utteranceSha256:utteranceHash,outputLength,hasHangul,
  reservedMicroUsd:attempts.length*PER_CALL_RESERVE_MICRO_USD,
  cumulativeMaximumReservedKrw:
   Math.round((PRIOR_RESERVED_MICRO_USD+attempts.length*PER_CALL_RESERVE_MICRO_USD)*FX_MAX/1000)/1000,
  ownerCapKrw:OWNER_BUDGET_KRW,
  estimatedUsageCostMicroUsd:estimateAll?observed.reduce((a,x)=>a+x.usageEstimateMicroUsd,0):null,
  exactGenerationCostsKnown:knownGenerations.length,
  exactGenerationCostTotalMicroUsd:generatedChargesAll?
   knownGenerations.reduce((a,x)=>a+x.generationCostMicroUsd,0):null,
  apiKeyUsageBeforeMicroUsd:keyBeforeMicroUsd,apiKeyUsageAfterMicroUsd:keyAfterMicroUsd,
  apiKeyUsageDeltaMicroUsd:keyBeforeMicroUsd!==null&&keyAfterMicroUsd!==null&&
    keyAfterMicroUsd>=keyBeforeMicroUsd?keyAfterMicroUsd-keyBeforeMicroUsd:null,
  apiKeyDeltaCannotIdentifyConcurrentTraffic:true,
  actualPaymentInvoiceReconciled:false,
  elapsedMs:Math.round(performance.now()-started),
  previousTerraThreeCallBaseline:{elapsedMs:9698,
   inputTokens:7873,outputTokens:735,estimatedMicroUsd:22062},
  characterQualityVerified:false,productionPromotionPermitted:false,
 };
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',
  {flag:'wx',mode:0o600});
 await ledger.close();
 console.log('SEYEON_OPENROUTER_GLM53FLASH_PAID_REPAIR_N01 '+JSON.stringify(report));
}
if(verdict!=='PASS')process.exitCode=1;
