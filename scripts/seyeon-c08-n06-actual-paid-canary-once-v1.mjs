/**
 * Owner-preapproved C08 actual paid N06 CANARY (not the 6-call paired run).
 * Exactly one guarded public synthetic POST at most, no retries/fallbacks.
 * The ZDR-catalog endpoint is a request-level research route candidate,
 * NOT proof of strict JSON, billing hardcap, or production suitability.
 */
import {execFileSync} from 'node:child_process';
import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';

export const C08_N06_CANARY_REPO='gycha0109-beep/MyeongHa';
export const C08_N06_CANARY_WORKFLOW='seyeon-c08-n06-paid-canary-once-v1.yml';
export const C08_N06_CANARY_MARKER='.github/seyeon-c08-n06-paid-canary-once.trigger';
export const C08_N06_CANARY_MODEL='openai/gpt-oss-120b';
export const C08_N06_CANARY_TEXT='오늘은 네가 먼저 이야기해 줘.';
export const C08_N06_CANARY_MAX_COMPLETION=256;
export const C08_N06_CANARY_MAX_REQUEST_BYTES=4096;
export const C08_N06_CANARY_MAX_PRICE=Object.freeze({
  inputUsdPerMillion:0.15,outputUsdPerMillion:0.40,
});
export const C08_N06_CANARY_OWNER_RESERVED_MICROUSD=4000; // 10 KRW @ 2500/USD
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const re=/^[a-f0-9]{40}$/u;
const tagRe=/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/u;
const token=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const microMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1000000?
  Math.floor(x*1e6):null;
const rate=x=>{
  if(typeof x!=='string'&&typeof x!=='number')return null;
  if(typeof x==='string'&&!x.trim())return null;
  const n=Number(x);
  return Number.isFinite(n)&&n>0&&n<=0.00001?
    Math.ceil(n*1e12-1e-8)/1e6:null;
};

export function admitSeyeonC08N06PaidCanaryOnceV1(env,history,commit,contract={
  repo:C08_N06_CANARY_REPO,marker:C08_N06_CANARY_MARKER,
}){
  if(!record(contract)||typeof contract.repo!=='string'||
    typeof contract.marker!=='string')throw new TypeError('C08_N06_PAID_CANARY_ADMISSION_HOLD');
  if(env?.GITHUB_REPOSITORY!==contract.repo||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_RUN_ATTEMPT!=='1'||!re.test(env.GITHUB_SHA??'')||
    env.EXPECTED_HEAD_SHA!==env.GITHUB_SHA||
    !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'')||
    !record(history)||history.total_count!==1||
    !Array.isArray(history.workflow_runs)||history.workflow_runs.length!==1||
    !record(commit)||commit.sha!==env.GITHUB_SHA||
    !Array.isArray(commit.files)||
    commit.files.filter(f=>record(f)&&f.filename===contract.marker&&
      f.status==='added').length!==1)
    throw new TypeError('C08_N06_PAID_CANARY_ADMISSION_HOLD');
  const x=history.workflow_runs[0];
  if(!record(x)||String(x.id)!==env.GITHUB_RUN_ID||
    x.head_sha!==env.GITHUB_SHA||x.head_branch!=='main'||
    x.event!=='push'||x.run_attempt!==1)
    throw new TypeError('C08_N06_PAID_CANARY_REPLAY_HOLD');
  return Object.freeze({sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID});
}

export function chooseSeyeonC08N06CanaryZdrRouteV1(zdr,key,credits){
  if(!Array.isArray(zdr)||!record(key)||!record(credits)||
    key.is_management_key===true)return null;
  const available=microMoney(credits.total_credits),spent=microMoney(credits.total_usage);
  const remain=key.limit_remaining===null?null:microMoney(key.limit_remaining);
  if(available===null||spent===null||available-spent<
    C08_N06_CANARY_OWNER_RESERVED_MICROUSD||
    (remain!==null&&(remain===null||remain<C08_N06_CANARY_OWNER_RESERVED_MICROUSD)))
    return null;
  const eligible=zdr.flatMap(x=>{
    if(!record(x)||x.model_id!==C08_N06_CANARY_MODEL||
      x.status!==0||typeof x.tag!=='string'||!tagRe.test(x.tag)||
      !Array.isArray(x.supported_parameters)||
      !x.supported_parameters.includes('response_format')||
      !Number.isSafeInteger(x.max_completion_tokens)||
      x.max_completion_tokens<C08_N06_CANARY_MAX_COMPLETION||
      !record(x.pricing)||Number(x.pricing.request)!==0||
      x.pricing.request===undefined)return [];
    const p=rate(x.pricing.prompt),c=rate(x.pricing.completion);
    if(p===null||c===null||p>C08_N06_CANARY_MAX_PRICE.inputUsdPerMillion||
      c>C08_N06_CANARY_MAX_PRICE.outputUsdPerMillion)return [];
    return [{tag:x.tag,inputRate:p,outputRate:c}];
  });
  const tags=new Set(eligible.map(x=>x.tag));
  if(tags.size!==eligible.length||eligible.length===0)return null;
  eligible.sort((a,b)=>a.inputRate+a.outputRate-b.inputRate-b.outputRate||
    a.tag.localeCompare(b.tag));
  return Object.freeze({...eligible[0],availableCreditMicroUsd:available-spent,
    zdrCatalogAdvertisedOnly:true,strictJsonRuntimeVerified:false,
    hardBillingCapVerified:false});
}

/** Single exact GET to ZDR catalog plus account credit reads; no model inference. */
export async function preflightSeyeonC08N06CanaryV1(key,fetchImpl=fetch){
  if(typeof key!=='string'||key.trim().length<20||
    typeof fetchImpl!=='function')return null;
  const paths=['/api/v1/key','/api/v1/credits','/api/v1/endpoints/zdr'];
  const rows=[];
  for(const path of paths){
    try{
      const res=await fetchImpl('https://openrouter.ai'+path,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{authorization:'Bearer '+key.trim(),accept:'application/json'},
      });
      if(res.status!==200||
        !/^application\/json(?:\s*;|$)/iu.test(res.headers.get('content-type')??'')||
        Number(res.headers.get('content-length')??0)>1000000)return null;
      const raw=await res.text();
      if(Buffer.byteLength(raw,'utf8')>1000000)return null;
      const body=JSON.parse(raw);
      if(!record(body))return null;
      rows.push(body.data);
    }catch{return null;}
  }
  return chooseSeyeonC08N06CanaryZdrRouteV1(rows[2],rows[0],rows[1]);
}

/**
 * Corrected research preflight: OpenRouter /endpoints/zdr returned HTTP 200
 * with data:null in actual run #40002833132. The standard per-model endpoint
 * returned the exact model with 24 endpoints. Do NOT treat that model endpoint
 * as a ZDR claim: enforce ZDR on the actual request using provider.zdr=true.
 * /credits is a management-key API; this research key uses GET /key and lets
 * the router reject insufficient account balance rather than invent it.
 */
export function chooseSeyeonC08N06ModelEndpointRouteV2(details,key){
  if(!record(details)||details.id!==C08_N06_CANARY_MODEL||
     !Array.isArray(details.endpoints)||!record(key)||
     key.is_management_key===true||
     !(key.limit_remaining===null||
       (typeof key.limit_remaining==='number'&&
        Number.isFinite(key.limit_remaining)&&key.limit_remaining>=0)))
    return null;
  const cap=key.limit_remaining===null?null:microMoney(key.limit_remaining);
  if(key.limit_remaining!==null&&
     (cap===null||cap<C08_N06_CANARY_OWNER_RESERVED_MICROUSD))return null;
  const list=details.endpoints.flatMap(e=>{
    if(!record(e)||e.status!==0||
      typeof e.tag!=='string'||!tagRe.test(e.tag)||
      !Array.isArray(e.supported_parameters)||
      !e.supported_parameters.includes('response_format')||
      !Number.isSafeInteger(e.max_completion_tokens)||
      e.max_completion_tokens<C08_N06_CANARY_MAX_COMPLETION||
      !record(e.pricing)||e.pricing.request===undefined||
      Number(e.pricing.request)!==0)return [];
    const inputRate=rate(e.pricing.prompt);
    const outputRate=rate(e.pricing.completion);
    if(inputRate===null||outputRate===null||
       inputRate>C08_N06_CANARY_MAX_PRICE.inputUsdPerMillion||
       outputRate>C08_N06_CANARY_MAX_PRICE.outputUsdPerMillion)return [];
    const body=buildSeyeonC08N06CanaryBodyV1(e.tag,{
      inputUsdPerMillion:inputRate,outputUsdPerMillion:outputRate,
    });
    try{
      reserveSeyeonC08N06CanaryV1(body,{inputRate,outputRate});
    }catch{return [];}
    return [{tag:e.tag,inputRate,outputRate}];
  });
  if(list.length===0||new Set(list.map(e=>e.tag)).size!==list.length)return null;
  list.sort((a,b)=>a.inputRate+a.outputRate-b.inputRate-b.outputRate||
    a.tag.localeCompare(b.tag));
  return Object.freeze({...list[0],
    zdrEnforcedByActualPost:true,notCatalogZdrAttested:true,
    accountBalanceUnverified:true,strictJsonRuntimeVerified:false,
    hardBillingCapVerified:false});
}
export async function preflightSeyeonC08N06ModelEndpointV2(key,fetchImpl=fetch){
  if(typeof key!=='string'||key.trim().length<20||
    typeof fetchImpl!=='function')return null;
  const paths=['/api/v1/key',
    '/api/v1/models/'+C08_N06_CANARY_MODEL+'/endpoints'];
  const results=[];
  for(const path of paths){
    try{
      const r=await fetchImpl('https://openrouter.ai'+path,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{authorization:'Bearer '+key.trim(),accept:'application/json'},
      });
      if(r.status!==200||
         !/^application\/json(?:\s*;|$)/iu.test(r.headers.get('content-type')??'')||
         Number(r.headers.get('content-length')??'0')>1000000)return null;
      const raw=await r.text();
      if(Buffer.byteLength(raw,'utf8')>1000000)return null;
      const parsed=JSON.parse(raw);
      if(!record(parsed)||!record(parsed.data))return null;
      results.push(parsed.data);
    }catch{return null;}
  }
  return chooseSeyeonC08N06ModelEndpointRouteV2(results[1],results[0]);
}

export function buildSeyeonC08N06CanaryBodyV1(tag,prices=C08_N06_CANARY_MAX_PRICE){
  if(!record(prices)||!positiveRate(prices.inputUsdPerMillion)||
    !positiveRate(prices.outputUsdPerMillion)||
    prices.inputUsdPerMillion>C08_N06_CANARY_MAX_PRICE.inputUsdPerMillion||
    prices.outputUsdPerMillion>C08_N06_CANARY_MAX_PRICE.outputUsdPerMillion)
    throw new TypeError('C08_N06_CANARY_PRICE_HOLD');
  if(typeof tag!=='string'||!tagRe.test(tag))
    throw new TypeError('C08_N06_CANARY_TAG_HOLD');
  return JSON.stringify({
    model:C08_N06_CANARY_MODEL,stream:false,
    max_completion_tokens:C08_N06_CANARY_MAX_COMPLETION,
    messages:[
      {role:'system',content:'Single public fictional first-contact prompt. Do not claim private memory, relationship history, privileged access, or hidden facts. Return only the strict JSON object.'},
      {role:'user',content:C08_N06_CANARY_TEXT},
    ],
    provider:{
      only:[tag],zdr:true,data_collection:'deny',
      allow_fallbacks:false,require_parameters:true,
      max_price:{prompt:prices.inputUsdPerMillion,
        completion:prices.outputUsdPerMillion},
    },
    response_format:{type:'json_schema',json_schema:{
      name:'myeongha_n06_canary_v1',strict:true,
      schema:{type:'object',additionalProperties:false,
        required:['utterance'],properties:{
          utterance:{type:'string',minLength:1,maxLength:200},
        }},
    }},
  });
}

export function reserveSeyeonC08N06CanaryV1(body,route){
  if(typeof body!=='string'||!record(route)||
    !positiveRate(route.inputRate)||!positiveRate(route.outputRate)||
    route.inputRate>C08_N06_CANARY_MAX_PRICE.inputUsdPerMillion||
    route.outputRate>C08_N06_CANARY_MAX_PRICE.outputUsdPerMillion)
    throw new TypeError('C08_N06_CANARY_QUOTE_HOLD');
  const bytes=Buffer.byteLength(body,'utf8');
  if(bytes<1||bytes>C08_N06_CANARY_MAX_REQUEST_BYTES)
    throw new TypeError('C08_N06_CANARY_BODY_BOUND_HOLD');
  const reservedMicroUsd=Math.ceil(bytes*route.inputRate+
    C08_N06_CANARY_MAX_COMPLETION*route.outputRate);
  if(reservedMicroUsd>C08_N06_CANARY_OWNER_RESERVED_MICROUSD)
    throw new TypeError('C08_N06_CANARY_BUDGET_HOLD');
  return Object.freeze({bodyBytes:bytes,reservedMicroUsd,
    maxPaidCalls:1,reservedKrw:reservedMicroUsd*2500/1000000,
    invoicedChargeHardCapped:false});
}
function positiveRate(x){return typeof x==='number'&&Number.isFinite(x)&&x>0;}

export async function runSeyeonC08N06ActualCanaryV1({
  apiKey,fetchImpl=fetch,journal,
  routePreflight=preflightSeyeonC08N06CanaryV1,
}={}){
  if(typeof journal!=='function'||typeof apiKey!=='string'||
    apiKey.length<20)throw new TypeError('C08_N06_CANARY_RUNTIME_HOLD');
  const route=await routePreflight(apiKey,fetchImpl);
  if(!route)return Object.freeze({verdict:'HOLD',reason:'NO_CHEAP_ZDR_CREDIT_ROUTE',
    attemptedPaidCalls:0,approvedForProduction:false});
  const body=buildSeyeonC08N06CanaryBodyV1(route.tag,{
    inputUsdPerMillion:route.inputRate,
    outputUsdPerMillion:route.outputRate,
  });
  const reserve=reserveSeyeonC08N06CanaryV1(body,route);
  // Durable fsynced journal must finish BEFORE one chargeable POST.
  await journal({kind:'reserved_before_post',model:C08_N06_CANARY_MODEL,
    providerTag:route.tag,...reserve});
  const started=performance.now();
  let resp=null,parsed=null,err='UNKNOWN_OR_NETWORK_FAILURE';
  try{
    resp=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{authorization:'Bearer '+apiKey.trim(),
        accept:'application/json','content-type':'application/json'},
      body,
    });
    if(resp.status!==200){err='HTTP_FAILURE';}
    else if(!/^application\/json(?:\s*;|$)/iu.test(resp.headers.get('content-type')??'')){
      err='BAD_RESPONSE_TYPE';
    }else{
      const raw=await resp.text();
      if(Buffer.byteLength(raw,'utf8')>262144)err='OVERSIZED_RESPONSE';
      else{parsed=JSON.parse(raw);err=null;}
    }
  }catch{err='TIMEOUT_NETWORK_OR_BAD_JSON';}
  const duration=Math.round(performance.now()-started);
  const usage=parsed?.usage;
  const inTokens=token(usage?.prompt_tokens),
    outTokens=token(usage?.completion_tokens);
  let content=null,parsedObject=null;
  try{
    const msg=parsed?.choices?.[0]?.message?.content;
    if(typeof msg==='string'&&msg.length<=4096){
      const obj=JSON.parse(msg);
      if(record(obj)&&Object.keys(obj).length===1&&
        typeof obj.utterance==='string'&&
        obj.utterance.trim().length>=1&&obj.utterance.length<=200)
        parsedObject=obj;
    }
  }catch{/* malformed JSON => HOLD */}
  const strictSchemaObserved=!!parsedObject;
  const valid=err===null&&resp?.status===200&&
    parsed?.choices?.[0]?.finish_reason==='stop'&&
    strictSchemaObserved&&inTokens!==null&&outTokens!==null&&
    outTokens<=C08_N06_CANARY_MAX_COMPLETION;
  const report=Object.freeze({
    schema:'seyeon-c08-n06-actual-paid-canary-v1',
    caseId:'N06',scope:'PUBLIC_SYNTHETIC_SINGLE_POST_RESEARCH_ONLY',
    model:C08_N06_CANARY_MODEL,providerTag:route.tag,
    attemptedPaidCalls:1,
    verdict:valid?'OBSERVED_VALID_JSON':'HOLD',
    reason:valid?'SCHEMA_AND_USAGE_OK':err??'GUARD_USAGE_OR_LENGTH_HOLD',
    httpStatus:resp?.status??null,elapsedMs:duration,
    bodyBytes:reserve.bodyBytes,reservedMicroUsd:reserve.reservedMicroUsd,
    inputTokens:inTokens,completionTokens:outTokens,
    estimatedUsageMicroUsd:inTokens!==null&&outTokens!==null?
      Math.ceil(inTokens*route.inputRate+outTokens*route.outputRate):null,
    jsonShapeObserved:strictSchemaObserved,
    hasKoreanUtterance:parsedObject?/[가-힣]/u.test(parsedObject.utterance):false,
    textLength:parsedObject?.utterance.length??null,
    strictJsonRuntimeObservedForOneCall:valid,
    outputGuardedThreeCallVerified:false,
    requestZdrClaimed:true,requestZdrProviderIndependentlyAudited:false,
    hardBillingCapVerified:false,invoiceReconciled:false,
    qualityHumanReviewed:false,productionPromotionAuthorized:false,
  });
  await journal({kind:'observed_paid_call',verdict:report.verdict,
    httpStatus:report.httpStatus,elapsedMs:report.elapsedMs,
    estimatedUsageMicroUsd:report.estimatedUsageMicroUsd});
  return report;
}

export async function executeSeyeonC08N06ResearchWorkflowV2({
  workflow=C08_N06_CANARY_WORKFLOW,
  marker=C08_N06_CANARY_MARKER,
  routePreflight=preflightSeyeonC08N06CanaryV1,
}={}){
  const env=process.env;
  if(!env.GH_TOKEN||!env.OPENROUTER_API_KEY||!env.RUNNER_TEMP)
    throw new TypeError('C08_N06_CANARY_MISSING_ENV_HOLD');
  const api=p=>JSON.parse(execFileSync('gh',['api',p],{
    encoding:'utf8',timeout:15000,maxBuffer:2000000,env,
  }));
  const h=api('repos/'+C08_N06_CANARY_REPO+'/actions/workflows/'+
    workflow+'/runs?per_page=100');
  const c=api('repos/'+C08_N06_CANARY_REPO+'/commits/'+env.GITHUB_SHA);
  const admitted=admitSeyeonC08N06PaidCanaryOnceV1(env,h,c,{
    repo:C08_N06_CANARY_REPO,marker,
  });
  const dir=join(env.RUNNER_TEMP,workflow.replace(/\\.yml$/u,''));
  await mkdir(dir,{recursive:true,mode:0o700});
  const ledger=await open(join(dir,'journal.jsonl'),'wx',0o600);
  const journal=async x=>{
    await ledger.appendFile(JSON.stringify(x)+'\n');
    await ledger.sync();
  };
  let result;
  try{
    result=await runSeyeonC08N06ActualCanaryV1({
      apiKey:env.OPENROUTER_API_KEY,fetchImpl:fetch,journal,routePreflight,
    });
    await writeFile(join(dir,'report.json'),JSON.stringify({
      ...result,commitSha:admitted.sha,workflowRunId:admitted.runId,
    },null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('C08_N06_ACTUAL_PAID_CANARY '+JSON.stringify({
      verdict:result.verdict,reason:result.reason,
      attemptedPaidCalls:result.attemptedPaidCalls,
      model:result.model,elapsedMs:result.elapsedMs??null,
      productionPromotionAuthorized:false,
    }));
  }finally{await ledger.close();}
  if(result?.verdict!=='OBSERVED_VALID_JSON')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  executeSeyeonC08N06ResearchWorkflowV2().catch(()=>{
    console.error('C08_N06_CANARY_PAID_RUN_HOLD');process.exitCode=1;
  });
