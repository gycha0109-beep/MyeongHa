import{mkdir,open,writeFile}from'node:fs/promises';
import{join}from'node:path';
import{performance}from'node:perf_hooks';
import{createHash}from'node:crypto';
import{admit}from'./seyeon-openrouter-three-call-n01-admission-v1.mjs';
import{createOpenRouterSeyeonEvaluationProviderV1}from'../dist/apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import{runSeyeonCensusFirstThreeCallShadowV1}from'../dist/apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import{createIntegrityClassifier,createDisclosureClassifier}from'../dist/apps/api/src/seyeon-production-governance-v1.js';
import{createSeyeonDialoguePathSyntheticCensusV1}from'./seyeon-dialogue-path-eval-core-v1.mjs';
const execution=admit(),key=process.env.OPENROUTER_API_KEY?.trim();
if(!key||key.length<20||!process.env.RUNNER_TEMP)throw Error('KEY_OR_RUNNER_HOLD');
const model='openai/gpt-oss-20b',stages=['unified_preflight_shadow','turn_interpret_render_shadow','semantic_review'];
const MAX_CALLS=3,MAX_COMPLETION_TOKENS=1536,PER_CALL_RESERVE_USD=0.01;
const PREVIOUS_RESERVE_USD=(6554+160000+640000+10000)/1e6;
if((PREVIOUS_RESERVE_USD+MAX_CALLS*PER_CALL_RESERVE_USD)*2500>5000)throw Error('CUMULATIVE_BUDGET_HOLD');
const dir=join(process.env.RUNNER_TEMP,'seyeon-openrouter-three-call-n01');
await mkdir(dir,{recursive:true,mode:0o700});
const log=await open(join(dir,'attempts.jsonl'),'wx',0o600);
const record=async data=>{await log.appendFile(JSON.stringify(data)+'\n');await log.sync();};
const attempts=[],observed=[];let verdict='HOLD',reason='UNKNOWN',estimatedMicroUsd=0,guardApproved=false,censusReads=0,utteranceHash=null;
const start=performance.now();
try{
 const provider=createOpenRouterSeyeonEvaluationProviderV1({
  apiKey:key,model,maxCompletionTokens:MAX_COMPLETION_TOKENS,timeoutMs:30000,fetchImpl:fetch,
  beforeDispatch:async m=>{
   if(attempts.length>=MAX_CALLS||m.purpose!==stages[attempts.length]||m.modelKey!==model||m.requestBodyBytes<1||m.requestBodyBytes>24576)throw Error('REQUEST_SCOPE_HOLD');
   attempts.push(m.purpose);
   await record({kind:'reserve',runId:execution.runId,stage:m.purpose,callNumber:attempts.length,bodyBytes:m.requestBodyBytes,reservedMicroUsd:10000});
  },
  afterOutcome:async m=>{
   const row={stage:m.purpose,outcome:m.outcome,httpStatus:m.httpStatus,elapsedMs:m.elapsedMs,inputTokens:m.promptTokens,outputTokens:m.completionTokens,cachedInputTokens:m.cachedPromptTokens,reasoningTokens:m.reasoningTokens};
   observed.push(row);
   if(m.promptTokens!==null&&m.completionTokens!==null)estimatedMicroUsd+=Math.ceil(m.promptTokens*0.02+m.completionTokens*0.10);
   await record({kind:'observed',runId:execution.runId,...row,estimatedCumulativeMicroUsd:estimatedMicroUsd});
  },
 });
 const governance={
  relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
  integrity:{classifier:createIntegrityClassifier(provider),authorityResolver:{resolve:({claim})=>({state:'MISSING',authorityRefs:[],provenanceRefs:['synthetic:unresolved:'+claim.kind]})}},
  disclosure:{classifier:createDisclosureClassifier(provider),sourceDescriptor:{readDescriptor(){throw Error('PRIVATE_DESCRIPTOR_FORBIDDEN');}},factAuthorityResolver:{resolve(){throw Error('PRIVATE_FACT_FORBIDDEN');}},retriever:{retrieve(){throw Error('PRIVATE_RETRIEVAL_FORBIDDEN');}}},
 };
 const id='synthetic:N01',text='안녕, 세연아!',census=createSeyeonDialoguePathSyntheticCensusV1('N01',id);
 const result=await runSeyeonCensusFirstThreeCallShadowV1({
  userMessageRef:id,userText:text,contextInput:{relationship:null,recentMessages:[{messageId:id,role:'user',text}],retrievedMemories:[]},
  governance,fullThreadCensus:census.port,unifiedPreflightProvider:provider,candidateDialogueProvider:provider,independentSemanticReviewer:provider,
 });
 censusReads=census.readCount;
 const e=result.envelope;
 guardApproved=result.scope==='SHADOW_ONLY_NOT_PRODUCTION'&&censusReads===4&&e.revealLevel==='public'&&e.memoryRefsMentioned.length===0&&e.privateSourceRefsMentioned.length===0&&e.disclosureSliceIds.length===0&&typeof e.utterance==='string'&&e.utterance.trim().length>0;
 if(guardApproved)utteranceHash=createHash('sha256').update(e.utterance).digest('hex');
 if(!guardApproved||attempts.length!==3||observed.length!==3||observed.some(o=>o.outcome!=='response_received')||estimatedMicroUsd<1||estimatedMicroUsd>30000)throw Error('POST_GUARD_OR_COST_HOLD');
 verdict='GUARD_SAMPLE_PASS';reason='PUBLIC_FIRST_TURN_GUARDS_ACCEPTED';
}catch(error){
 const allow=new Set(['CREDIT_REQUIRED','HTTP_FAILURE','INVALID_RESPONSE','USAGE_UNKNOWN','NETWORK_FAILURE','TIMEOUT','PRE_DISPATCH_REJECTED','INVALID_REQUEST','METERING_FAILED','FAST_INTERPRETATION_GUARD_REJECTED','FAST_RISK_CAUSALITY_REJECTED','FAST_RENDERER_PACKET_REJECTED','FAST_RENDERER_GUARD_REJECTED','FAST_SEMANTIC_OUTPUT_REJECTED','FAST_THREAD_CENSUS_REJECTED','FAST_SENSITIVE_PREFLIGHT_REJECTED']);
 reason=allow.has(error?.code)?error.code:'SERVER_GUARD_OR_UNKNOWN_HOLD';
}finally{
 const report={schemaVersion:'seyeon-openrouter-three-call-n01-v1',scope:'PUBLIC_SYNTHETIC_SHADOW_ONLY',model,caseId:'N01',runId:execution.runId,sha:execution.sha,verdict,reason,maxCalls:MAX_CALLS,attemptedCalls:attempts.length,observedCalls:observed.length,stages:attempts,observed,censusReads,guardApproved,utteranceSha256:utteranceHash,estimatedMicroUsd,actualBilledMicroUsd:null,invoiceReconciled:false,providerHardLimitVerified:false,reservedMicroUsd:attempts.length*10000,cumulativeMaximumReservedKrw:Math.round((PREVIOUS_RESERVE_USD+attempts.length*PER_CALL_RESERVE_USD)*2500*1000)/1000,ownerCapKrw:5000,elapsedMs:Math.round(performance.now()-start),characterQualityVerified:false,productionPromotionPermitted:false};
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 await log.close();
 console.log('SEYEON_OPENROUTER_THREE_CALL_N01 '+JSON.stringify(report));
}
if(verdict!=='GUARD_SAMPLE_PASS')process.exitCode=1;
