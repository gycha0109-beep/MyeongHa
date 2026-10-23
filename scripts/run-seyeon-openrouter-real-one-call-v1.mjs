import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {admitOpenRouterOneCallV1} from './seyeon-openrouter-real-one-call-admission-v1.mjs';
import {createOpenRouterSeyeonEvaluationProviderV1,
 OpenRouterSeyeonErrorV1} from
 '../dist/apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import {createSeyeonUnifiedPreflightShadowV1} from
 '../dist/apps/api/src/seyeon-unified-preflight-shadow-v1.js';
// User-approved one POST, public synthetic N01 only. No retry or production routing.
const execution=admitOpenRouterOneCallV1();
const apiKey=process.env.OPENROUTER_API_KEY?.trim();
if(!apiKey||apiKey.length<20)throw Error('OPENROUTER_SECRET_MISSING_HOLD');
if(!process.env.RUNNER_TEMP)throw Error('OPENROUTER_RUNNER_TEMP_HOLD');
const MODEL='openai/gpt-oss-20b',MAX_CALLS=1,MAX_COMPLETION_TOKENS=1024;
const MAX_RESERVE_USD=0.01;
const PREVIOUS_RESERVED_USD=(6554+160000+640000)/1000000;
const OWNER_ADDITIONAL_CAP_KRW=5000,FX_KRW_PER_USD=2500;
if((PREVIOUS_RESERVED_USD+MAX_RESERVE_USD)*FX_KRW_PER_USD>
   OWNER_ADDITIONAL_CAP_KRW)throw Error('OPENROUTER_BUDGET_HOLD');
const dir=join(process.env.RUNNER_TEMP,'seyeon-openrouter-one-call');
await mkdir(dir,{recursive:true,mode:0o700});
const ledger=await open(join(dir,'attempts.jsonl'),'wx',0o600);
const journal=async obj=>{await ledger.appendFile(JSON.stringify(obj)+'\n');await ledger.sync();};
let attempts=0,observed=0,verdict='HOLD',reason='UNKNOWN_HOLD';
let metricSummary=null,estimatedMicroUsd=null,guardApproved=false;
const started=performance.now();
try{
 const provider=createOpenRouterSeyeonEvaluationProviderV1({
  apiKey,model:MODEL,maxCompletionTokens:MAX_COMPLETION_TOKENS,timeoutMs:30000,
  fetchImpl:fetch,
  beforeDispatch:async data=>{
   if(attempts!==0||data.modelKey!==MODEL||
      data.purpose!=='unified_preflight_shadow'||
      data.requestBodyBytes<1||data.requestBodyBytes>24576)
    throw Error('OPENROUTER_ATTEMPT_OR_SCOPE_HOLD');
   attempts++;
   await journal({kind:'reserve',runId:execution.runId,
    stage:data.purpose,model:MODEL,reservedMicroUsd:10000,
    bodyBytes:data.requestBodyBytes});
  },
  afterOutcome:async data=>{
   observed++;
   metricSummary={outcome:data.outcome,httpStatus:data.httpStatus,
    elapsedMs:data.elapsedMs,inputTokens:data.promptTokens,
    outputTokens:data.completionTokens,cachedInputTokens:data.cachedPromptTokens,
    reasoningTokens:data.reasoningTokens};
   if(data.promptTokens!==null && data.completionTokens!==null)
    estimatedMicroUsd=Math.ceil(data.promptTokens*0.02+
      data.completionTokens*0.10);
   await journal({kind:'observed',runId:execution.runId,
    model:MODEL,stage:data.purpose,...metricSummary,estimatedMicroUsd});
  },
 });
 const decision=await createSeyeonUnifiedPreflightShadowV1(provider).classify({
   characterId:'seyeon',userText:'안녕, 세연아!',
 });
 guardApproved=decision.integrity.claims.length===0 &&
  decision.disclosure.topicKey===null;
 if(attempts!==1||observed!==1||!guardApproved||
    estimatedMicroUsd===null||estimatedMicroUsd>10000)
  throw Error('OPENROUTER_REAL_PROBE_OUTPUT_OR_COST_HOLD');
 verdict='PASS';reason='PUBLIC_CLASSIFICATION_ADMITTED';
}catch(error){
 reason=error instanceof OpenRouterSeyeonErrorV1?
  error.code:'SERVER_GUARD_OR_UNKNOWN_HOLD';
}finally{
 const report={schemaVersion:'seyeon-openrouter-real-one-call-v1',
  model:MODEL,scope:'PUBLIC_SYNTHETIC_N01_UNIFIED_PREFLIGHT',
  runId:execution.runId,mainSha:execution.sha,verdict,reason,
  maxCalls:MAX_CALLS,attemptedCalls:attempts,observedCalls:observed,
  guardApproved,maxReservedMicroUsd:10000,
  estimatedMicroUsd,actualBilledMicroUsd:null,invoiceReconciled:false,
  previousReservedMicroUsd:Math.round(PREVIOUS_RESERVED_USD*1000000),
  maximumAdditionalReservedKrw:Math.round(
   (PREVIOUS_RESERVED_USD+MAX_RESERVE_USD)*FX_KRW_PER_USD*1000)/1000,
  ownerAdditionalCapKrw:OWNER_ADDITIONAL_CAP_KRW,
  elapsedMs:Math.round(performance.now()-started),
  ...(metricSummary??{}),productionPromotionPermitted:false};
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',
  {flag:'wx',mode:0o600});
 await ledger.close();
 // No prompts, completions, response body, secret or personal data ever logged.
 console.log('SEYEON_OPENROUTER_REAL_ONE_CALL '+JSON.stringify(report));
}
if(verdict!=='PASS')process.exitCode=1;
