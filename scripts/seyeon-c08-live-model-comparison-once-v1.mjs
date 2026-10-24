import {execFileSync} from 'node:child_process';
import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

export const BENCH_REPO='gycha0109-beep/MyeongHa';
export const BENCH_WORKFLOW='seyeon-c08-live-model-comparison-once-v1.yml';
export const BENCH_MARKER='.github/seyeon-c08-live-model-comparison-once-v1.trigger';
export const BENCH_MODELS=Object.freeze([
  'openai/gpt-oss-120b',
  'z-ai/glm-5.3-flash',
  'qwen/qwen3.5-flash-02-23',
  'google/gemini-3.1-flash-lite',
]);
export const BENCH_CASES=Object.freeze([
  {id:'initiative',text:'오늘은 네가 먼저 이야기해 줘.'},
  {id:'empathy',text:'오늘 하루가 좀 지쳤어. 짧게 이야기해 줄래?'},
  {id:'memory_boundary',text:'우리 예전에 같이 바다 갔던 거 기억해?'},
]);
export const MAX_OUTPUT_TOKENS=384;
export const MAX_INPUT_BYTES=4096;
export const MAX_PER_CALL_MICROUSD=4000;
export const MAX_TOTAL_MICROUSD=48000;
export const MAX_CALLS=BENCH_MODELS.length*BENCH_CASES.length;
export const FX_KRW_USD=2500;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hash=/^[a-f0-9]{40}$/u;
const tagPattern=/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/u;
const userAgent='MyeongHa-C08-Public-Synthetic-Benchmark/1';
const finiteMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const mUSD=x=>typeof x==='string'||typeof x==='number'
  ?(Number.isFinite(Number(x))&&Number(x)>0&&Number(x)<0.00001
    ?Math.ceil(Number(x)*1e12-1e-8)/1e6:null):null;
const nint=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const endpointHost='https://openrouter.ai';
export function admit({env,history,commit}){
  if(env?.GITHUB_REPOSITORY!==BENCH_REPO||env.GITHUB_EVENT_NAME!=='push'||
    env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !hash.test(env.GITHUB_SHA??'')||env.GITHUB_SHA!==env.EXPECTED_HEAD_SHA||
    !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'')||
    !obj(history)||history.total_count!==1||
    !Array.isArray(history.workflow_runs)||history.workflow_runs.length!==1||
    !obj(commit)||commit.sha!==env.GITHUB_SHA||!Array.isArray(commit.files)||
    commit.files.filter(x=>obj(x)&&x.filename===BENCH_MARKER&&x.status==='added').length!==1)
    throw Error('BENCHMARK_SINGLE_RUN_ADMISSION_HOLD');
  const r=history.workflow_runs[0];
  if(!obj(r)||String(r.id)!==env.GITHUB_RUN_ID||r.head_sha!==env.GITHUB_SHA||
    r.head_branch!=='main'||r.event!=='push'||r.run_attempt!==1)
    throw Error('BENCHMARK_REPLAY_HOLD');
}
const headers=k=>({authorization:'Bearer '+k,accept:'application/json','user-agent':userAgent});
async function readJson(url,key,fetchImpl){
  const resp=await fetchImpl(url,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(15000),headers:headers(key)});
  if(resp.status!==200||
    !/^application\/json(?:\s*;|$)/iu.test(resp.headers.get('content-type')??''))
    throw Error('BENCHMARK_METADATA_HTTP_'+resp.status);
  const txt=await resp.text();
  if(Buffer.byteLength(txt,'utf8')>2000000)throw Error('BENCHMARK_METADATA_SIZE_HOLD');
  const parsed=JSON.parse(txt);
  if(!obj(parsed)||!obj(parsed.data))throw Error('BENCHMARK_METADATA_SHAPE_HOLD');
  return parsed.data;
}
export function chooseProvider(details,model){
  if(!obj(details)||details.id!==model||!Array.isArray(details.endpoints))return null;
  const eligible=details.endpoints.flatMap(e=>{
    if(!obj(e)||e.status!==0||typeof e.tag!=='string'||
      !tagPattern.test(e.tag)||!obj(e.pricing)||
      !Number.isSafeInteger(e.max_completion_tokens)||
      e.max_completion_tokens<MAX_OUTPUT_TOKENS||
      (e.pricing.request!==undefined&&Number(e.pricing.request)!==0))return [];
    const input=mUSD(e.pricing.prompt),output=mUSD(e.pricing.completion);
    if(input===null||output===null||input>2||output>4)return [];
    return [{tag:e.tag,input,output,reasoningSupported:
      Array.isArray(e.supported_parameters)&&e.supported_parameters.includes('reasoning')}];
  });
  if(eligible.length===0||new Set(eligible.map(x=>x.tag)).size!==eligible.length)return null;
  eligible.sort((a,b)=>(a.input+a.output)-(b.input+b.output)||
    a.tag.localeCompare(b.tag));
  return eligible[0];
}
export function buildBody(model,route,prompt){
  if(!BENCH_MODELS.includes(model)||!obj(route)||!tagPattern.test(route.tag)||
    typeof prompt!=='string'||prompt.length<5)throw Error('BENCHMARK_REQUEST_HOLD');
  const body=JSON.stringify({
    model,stream:false,temperature:0.4,max_completion_tokens:MAX_OUTPUT_TOKENS,
    reasoning:{effort:'low'},
    messages:[
      {role:'system',content:'당신은 대화형 캐릭터 세연입니다. 처음 만난 상대에게 존댓말로 자연스럽고 주도적으로 답하세요. 이전 만남, 실제 관계, 비공개 기억을 지어내지 마세요. 짧은 한국어 1~3문장으로 답하고 과장된 상담 화법을 피하세요. 이 대화는 공개 합성 비교용입니다.'},
      {role:'user',content:prompt},
    ],
    provider:{only:[route.tag],zdr:true,data_collection:'deny',
      allow_fallbacks:false,require_parameters:false,
      max_price:{prompt:route.input,completion:route.output}},
  });
  if(Buffer.byteLength(body,'utf8')>MAX_INPUT_BYTES)throw Error('BENCHMARK_INPUT_LIMIT_HOLD');
  return body;
}
export function reserve(body,route){
  if(!obj(route)||typeof route.input!=='number'||typeof route.output!=='number'||
    route.input<=0||route.output<=0)throw Error('BENCHMARK_PRICING_HOLD');
  const bytes=Buffer.byteLength(body,'utf8');
  if(bytes>MAX_INPUT_BYTES)throw Error('BENCHMARK_BYTES_HOLD');
  // One byte per token is deliberately pessimistic for the input side.
  const estimatedCeiling=Math.ceil(bytes*route.input+MAX_OUTPUT_TOKENS*route.output);
  if(estimatedCeiling>MAX_PER_CALL_MICROUSD)throw Error('BENCHMARK_PRICE_CEILING_HOLD');
  return estimatedCeiling;
}
const shapeErr=(s)=>typeof s==='string'?s.slice(0,80):'UNKNOWN';
export async function compare({apiKey,fetchImpl=fetch,journal,models=BENCH_MODELS,
  cases=BENCH_CASES}){
  if(typeof apiKey!=='string'||apiKey.length<20||typeof journal!=='function'||
    !Array.isArray(models)||!Array.isArray(cases)||models.length>4||
    cases.length>3||models.length*cases.length>MAX_CALLS)
    throw Error('BENCHMARK_ARGUMENT_HOLD');
  const key=await readJson(endpointHost+'/api/v1/key',apiKey,fetchImpl);
  if(key.is_management_key===true)throw Error('BENCHMARK_KEY_TYPE_HOLD');
  if(key.limit_remaining!==null&&
    (finiteMoney(key.limit_remaining)===null||
    key.limit_remaining*1e6<MAX_TOTAL_MICROUSD))
    throw Error('BENCHMARK_KEY_BUDGET_HOLD');
  const rows=[],routes=new Map();
  for(const model of models){
    try{
      const details=await readJson(endpointHost+'/api/v1/models/'+model+'/endpoints',
        apiKey,fetchImpl);
      routes.set(model,chooseProvider(details,model));
    }catch{routes.set(model,null);}
  }
  let attempted=0,reserved=0,estimated=0;
  // Case-major order: each case is answered by every model under identical text.
  for(const cs of cases)for(const model of models){
    const route=routes.get(model);
    const base={model,caseId:cs.id,provider:route?.tag??null};
    if(!route){rows.push({...base,status:'NOT_AVAILABLE',reason:'NO_ELIGIBLE_PINNED_PROVIDER'});continue;}
    const body=buildBody(model,route,cs.text);
    const quote=reserve(body,route);
    if(reserved+quote>MAX_TOTAL_MICROUSD){
      rows.push({...base,status:'HOLD',reason:'TOTAL_BUDGET_EXHAUSTED'});continue;
    }
    // Reservation must be durably fsynced before any chargeable POST.
    await journal({kind:'reserved',model,caseId:cs.id,provider:route.tag,
      microUsd:quote,sequence:attempted+1});
    reserved+=quote;attempted++;
    const start=performance.now();
    let result;
    try{
      const resp=await fetchImpl(endpointHost+'/api/v1/chat/completions',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(40000),
        headers:{...headers(apiKey),'content-type':'application/json'},body});
      const ms=Math.round(performance.now()-start);
      let decoded=null;
      if(resp.status===200){
        const raw=await resp.text();
        if(Buffer.byteLength(raw,'utf8')<200000)decoded=JSON.parse(raw);
      }
      const usage=decoded?.usage;
      const inputTokens=nint(usage?.prompt_tokens);
      const completionTokens=nint(usage?.completion_tokens);
      const reasoningTokens=nint(usage?.completion_tokens_details?.reasoning_tokens);
      const content=decoded?.choices?.[0]?.message?.content;
      const isText=typeof content==='string'&&/[가-힣]/u.test(content)&&
        content.trim().length>0;
      const finish=decoded?.choices?.[0]?.finish_reason;
      const valid=resp.status===200&&isText&&
        content.length<=1000&&finish==='stop'&&
        inputTokens!==null&&completionTokens!==null&&completionTokens<=MAX_OUTPUT_TOKENS;
      const estimatedMicroUsd=inputTokens!==null&&completionTokens!==null
        ?Math.ceil(inputTokens*route.input+completionTokens*route.output):null;
      if(estimatedMicroUsd!==null)estimated+=estimatedMicroUsd;
      result={...base,status:valid?'OK':'HOLD',
        reason:valid?null:(resp.status!==200?'HTTP_'+resp.status:
          finish==='length'?'COMPLETION_LIMIT':'EMPTY_OR_INVALID_KOREAN_OUTPUT'),
        httpStatus:resp.status,ms,inputTokens,completionTokens,reasoningTokens,
        reservedMicroUsd:quote,estimatedMicroUsd,
        response:valid?content.slice(0,400):null,
        outputLength:typeof content==='string'?content.length:null,
        finishReason:['stop','length','content_filter'].includes(finish)?finish:null};
    }catch(e){
      result={...base,status:'HOLD',reason:'NETWORK_TIMEOUT_OR_INVALID_JSON',
        ms:Math.round(performance.now()-start),reservedMicroUsd:quote,
        estimatedMicroUsd:null,response:null};
    }
    await journal({kind:'observed',caseId:cs.id,model,
      status:result.status,reason:result.reason??null,ms:result.ms,
      estimatedMicroUsd:result.estimatedMicroUsd});
    rows.push(result);
    // Authentication or exhausted credits: stop all future chargeable requests.
    if([401,402,403].includes(result.httpStatus))return {
      rows,attempted,reservedMicroUsd:reserved,estimatedMicroUsd:estimated,
      stoppedEarly:'KEY_OR_CREDIT_REJECTED'};
  }
  return {rows,attempted,reservedMicroUsd:reserved,
    estimatedMicroUsd:estimated,stoppedEarly:null};
}
export function reportMarkdown(report){
  const fmt=n=>typeof n==='number'?String(n):'—';
  const lines=[
    '# 세연 AI · 동일 프롬프트 4모델 실측 비교',
    '',
    '측정: 모델별 동일 시스템 프롬프트·3개 공개 합성 한국어 입력·384 출력토큰 상한, 추론 low 요청. ZDR 요청 고정/Provider 핀/재시도 없음.',
    '비용은 Provider 공개 토큰 단가 기준 추정이며 실제 청구액이 아닙니다. 전체 챗봇 3회 경로 검증이 아닙니다.',
    '',
    '| 모델 | 사례 | 결과 | 응답 ms | 입력/출력 토큰 | 추정 비용 원 | Provider |',
    '|---|---|---|---:|---:|---:|---|',
  ];
  for(const r of report.rows)lines.push('| '+[
    r.model,r.caseId,r.status,fmt(r.ms),
    fmt(r.inputTokens)+'/'+fmt(r.completionTokens),
    r.estimatedMicroUsd===null||r.estimatedMicroUsd===undefined?'—':
      (r.estimatedMicroUsd*FX_KRW_USD/1e6).toFixed(4),
    r.provider??'—'].join(' | ')+' |');
  lines.push('','## 실제 한국어 응답 (공개 합성 입력에 대한 응답)');
  for(const r of report.rows){
    lines.push('','### '+r.model+' · '+r.caseId+' · '+r.status,
      r.response??('응답 없음 / '+(r.reason??'불명')));
  }
  lines.push('','호출 '+report.attempted+'/'+MAX_CALLS+
    ', 사전 예약 총액 '+(report.reservedMicroUsd*FX_KRW_USD/1e6).toFixed(4)+
    '원, 토큰 추정 합계 '+(report.estimatedMicroUsd*FX_KRW_USD/1e6).toFixed(4)+
    '원. 실제 청구 미정산. 사람 품질 평가 미완료.');
  return lines.join('\n')+'\n';
}
async function main(){
  const env=process.env;
  if(!env.OPENROUTER_API_KEY||!env.GH_TOKEN||!env.RUNNER_TEMP)
    throw Error('BENCHMARK_MISSING_ENV_HOLD');
  const api=p=>JSON.parse(execFileSync('gh',['api',p],{
    encoding:'utf8',timeout:15000,maxBuffer:2000000,env}));
  admit({env,
    history:api('repos/'+BENCH_REPO+'/actions/workflows/'+BENCH_WORKFLOW+'/runs?per_page=100'),
    commit:api('repos/'+BENCH_REPO+'/commits/'+env.GITHUB_SHA)});
  const dir=join(env.RUNNER_TEMP,'seyeon-c08-live-model-comparison-once-v1');
  await mkdir(dir,{recursive:true,mode:0o700});
  const ledger=await open(join(dir,'journal.jsonl'),'wx',0o600);
  try{
    const report=await compare({apiKey:env.OPENROUTER_API_KEY,
      journal:async row=>{await ledger.appendFile(JSON.stringify(row)+'\n');await ledger.sync();}});
    await writeFile(join(dir,'report.json'),JSON.stringify({
      ...report,runId:env.GITHUB_RUN_ID,headSha:env.GITHUB_SHA,
      invoiceReconciled:false,productionAuthorized:false,
    },null,2)+'\n',{flag:'wx',mode:0o600});
    await writeFile(join(dir,'comparison.md'),reportMarkdown(report),{flag:'wx',mode:0o600});
    console.log('C08_MULTI_MODEL_BENCHMARK '+JSON.stringify({
      attempted:report.attempted,valid:report.rows.filter(x=>x.status==='OK').length,
      reservedMicroUsd:report.reservedMicroUsd,
      estimatedMicroUsd:report.estimatedMicroUsd,
      stoppedEarly:report.stoppedEarly,
      modelResults:BENCH_MODELS.map(model=>({
        model,ok:report.rows.filter(x=>x.model===model&&x.status==='OK').length,
        ms:report.rows.filter(x=>x.model===model&&x.status==='OK').map(x=>x.ms)})),
    }));
    if(report.rows.filter(x=>x.status==='OK').length===0)process.exitCode=1;
  }finally{await ledger.close();}
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(e=>{console.error('C08_MULTI_MODEL_BENCHMARK_HOLD',shapeErr(e.message));process.exitCode=1;});
