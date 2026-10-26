#!/usr/bin/env node
/**
 * Owner-approved 2026-10-26: exactly five public-synthetic improved Luna calls.
 * Shadow-only. No private DB/Grant/Canon, no fallback, no retries, no production.
 * Dry run (0 network calls) unless BOTH explicit execution flags are passed.
 */
import {readFileSync, writeFileSync, renameSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

const VERSION='seyeon-c09-luna-agency-five-paid-once-20261026-v1';
const MODEL='openai/gpt-6-luna';
const IDS=Object.freeze([1,2,5,7,10]);
const MAX_CALLS=5;
const MAX_OUTPUT_TOKENS=900;
const QUOTED_MAX_INPUT_TOKENS=16000;
const BUDGET_USD=0.05;
const args=process.argv.slice(2);
const dry=args.length===1&&args[0]==='--dry-run';
const execute=args.length===2&&args.includes('--execute')&&
  args.includes('--owner-approved-c09-improved-luna-five');
if(!dry&&!execute)throw Error('EXPLICIT_DRY_RUN_OR_OWNER_APPROVED_EXECUTE_REQUIRED');
if(execute&&!process.env.OPENROUTER_API_KEY)throw Error('OPENROUTER_SECRET_MISSING_ZERO_CALLS');

const file=resolve('artifacts/seyeon-c09-luna-agency-five-paid-once-20261026-v1.json');
const report=resolve('artifacts/seyeon-c09-luna-agency-five-paid-once-20261026-v1.md');
if(execute&&(existsSync(file)||existsSync(report)))throw Error('EXPERIMENT_ARTIFACT_EXISTS_NO_RERUN');
const {buildSeyeonC09LunaAgencyFiveCaseShadowV1}=await import(
  '../dist/apps/api/src/seyeon-c09-luna-agency-five-cases-shadow-v1.js');
const {auditSeyeonC09LunaUtteranceShadowV1}=await import(
  '../dist/apps/api/src/seyeon-c09-luna-surface-audit-shadow-v1.js');
const baseline=JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-gpt6-luna-five-20261026-baseline-v1.json'),'utf8'));
const source=JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json'),'utf8'));
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const plans=buildSeyeonC09LunaAgencyFiveCaseShadowV1();
if(plans.length!==5||baseline.records.length!==5||
   baseline.source?.originalModel!==MODEL||baseline.source?.workflowRunId!==40261419279||
   baseline.completed!==5||baseline.improvedModelCalls!==0||
   IDS.some((id,i)=>plans[i]?.caseId!==id||baseline.records[i]?.id!==id)){
  throw Error('BASELINE_OR_PLAN_MATRIX_CHANGED_ZERO_CALLS');
}
const matrix=plans.map((p,i)=>{
  const same=source.records.filter(x=>x.id===p.caseId);
  if(same.length!==3||same.some(x=>x.prompt!==p.messages[1]?.content)||
     p.messages.length!==2||p.messages[0]?.role!=='system'||
     p.messages[1]?.role!=='user'||p.modelId!==MODEL||
     p.providerCallExecuted!==false||p.productionRoutingAuthorized!==false||
     p.ownerMemoryPermissionVerified!==false||p.independentlyReviewed!==false||
     p.behaviorPlanSource!=='HUMAN_SELECTED_SYNTHETIC_EVAL_ONLY_NOT_AUTONOMOUS'||
     p.messages[0].content.length>8000||
     p.messages.some(m=>typeof m.content!=='string'||!m.content.trim())){
    throw Error('UNAUTHORIZED_OR_MUTATED_CANDIDATE_ZERO_CALLS_'+p.caseId);
  }
  return Object.freeze({
    id:p.caseId,model:MODEL,
    question:p.messages[1].content,
    questionSha256:sha(p.messages[1].content),
    systemSha256:sha(p.messages[0].content),
    selectedFocuses:p.selectedFocuses,
    plannedMove:p.plannedMove,currentMotive:p.currentMotive,
    baseline:baseline.records[i].text,
    baselineElapsedMs:baseline.records[i].latencyMs,
    baselineRecordedUsd:baseline.records[i].recordedUsd,
    messages:p.messages,
  });
});
const matrixSha256=sha(JSON.stringify(matrix.map(x=>[
  x.id,x.model,x.questionSha256,x.systemSha256,x.plannedMove,x.currentMotive
])));
if(dry){
  console.log(JSON.stringify({version:VERSION,dryRun:true,networkCalls:0,
    model:MODEL,questionIds:IDS,matrixSha256,
    maxApprovedCalls:MAX_CALLS,quotedBudgetCapUsd:BUDGET_USD,
    output:file,allPublicSynthetic:true},null,2));
  process.exit(0);
}
const headers={'Accept':'application/json'};
const catalogReply=await fetch('https://openrouter.ai/api/v1/models',{
  headers,signal:AbortSignal.timeout(25000)});
if(!catalogReply.ok)throw Error('PUBLIC_MODEL_CATALOG_UNAVAILABLE_ZERO_PAID_CALLS');
const catalog=await catalogReply.json();
const found=Array.isArray(catalog.data)?catalog.data.find(x=>x.id===MODEL):null;
if(!found)throw Error('EXACT_LUNA_MODEL_UNAVAILABLE_ZERO_PAID_CALLS');
const inRate=Number(found.pricing?.prompt),outRate=Number(found.pricing?.completion);
if(!Number.isFinite(inRate)||!Number.isFinite(outRate)||
  inRate<0||outRate<0)throw Error('INVALID_CATALOG_PRICES_ZERO_PAID_CALLS');
const perCallQuote=QUOTED_MAX_INPUT_TOKENS*inRate+
  MAX_OUTPUT_TOKENS*outRate;
if(!(perCallQuote>0)||perCallQuote*MAX_CALLS>BUDGET_USD){
  throw Error('QUOTED_FIVE_CALL_BUDGET_OVER_CAP_ZERO_PAID_CALLS');
}
const entries=[];
function reservedOrEstimatedUsd(){
  return entries.reduce((sum,r)=>sum+
    (Number.isFinite(r.actualOrEstimatedUsd)?r.actualOrEstimatedUsd:
      r.reservedMaxUsd||0),0);
}
function save(){
  mkdirSync(dirname(file),{recursive:true});
  const result={
    schemaVersion:VERSION,model:MODEL,questionIds:IDS,
    matrixSha256,originalRunId:40261419279,
    originalProviderCalls:5,newMaximumPaidCalls:MAX_CALLS,
    newAttempted:entries.length,
    newCompleted:entries.filter(x=>x.status==='COMPLETED').length,
    budgetCapUsd:BUDGET_USD,
    perCallMaxQuotedUsd:perCallQuote,
    reservationOrEstimateTotalUsd:reservedOrEstimatedUsd(),
    costIsInvoice:false,realIndependentSemanticReviewPerformed:false,
    realMemoryAuthorizationPerformed:false,productionRouteChanged:false,
    entries,
  };
  writeFileSync(file+'.tmp',JSON.stringify(result,null,2)+'\n','utf8');
  renameSync(file+'.tmp',file);
  return result;
}
function extract(content){
  return typeof content==='string'?content.trim():
    Array.isArray(content)?content.filter(x=>x.type==='text'&&typeof x.text==='string')
      .map(x=>x.text).join('\n').trim():'';
}
console.log('PRECHECK',JSON.stringify({modelVerified:MODEL,matrixSha256,
  fiveCallQuotedMaxUsd:perCallQuote*5,budgetCapUsd:BUDGET_USD,
  noRetries:true,noFallback:true,realPrivateMemory:false}));
for(const m of matrix){
  if(entries.length>=MAX_CALLS)break;
  if(reservedOrEstimatedUsd()+perCallQuote>BUDGET_USD)break;
  const row={
    id:m.id,question:m.question,questionSha256:m.questionSha256,
    systemSha256:m.systemSha256,selectedFocuses:m.selectedFocuses,
    plannedMove:m.plannedMove,currentMotive:m.currentMotive,
    baselineOutput:m.baseline,baselineElapsedMs:m.baselineElapsedMs,
    baselineRecordedUsd:m.baselineRecordedUsd,
    status:'IN_FLIGHT_NO_RETRY',reservedMaxUsd:perCallQuote,
    actualOrEstimatedUsd:null,costSource:null,
    improvedOutput:null,improvedHeuristicFlags:[],
    elapsedMs:null,httpStatus:null,finishReason:null,
    usage:null,errorCode:null,
  };
  entries.push(row);
  save(); // persist before paid request: never automatically retry uncertain billing
  const started=Date.now();
  try{
    const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',headers:{
        Authorization:'Bearer '+process.env.OPENROUTER_API_KEY,
        'Content-Type':'application/json',
        'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa',
        'X-Title':'MyeongHa C09 Luna approved agency five, one-shot',
      },
      body:JSON.stringify({
        model:MODEL,temperature:0.65,max_tokens:MAX_OUTPUT_TOKENS,
        messages:m.messages,
      }),
      signal:AbortSignal.timeout(75000),
    });
    row.elapsedMs=Date.now()-started;
    row.httpStatus=response.status;
    let body={};
    try{body=await response.json();}catch{}
    if(!response.ok){
      row.status='PROVIDER_ERROR_NO_RETRY';
      row.errorCode='HTTP_'+response.status;
      save();
      break;
    }
    const output=extract(body.choices?.[0]?.message?.content);
    row.improvedOutput=output||null;
    row.status=output?'COMPLETED':'EMPTY_NO_RETRY';
    row.finishReason=body.choices?.[0]?.finish_reason??null;
    row.usage={
      inputTokens:Number(body.usage?.prompt_tokens||0),
      outputTokens:Number(body.usage?.completion_tokens||0),
      totalTokens:Number(body.usage?.total_tokens||0),
    };
    if(typeof body.usage?.cost==='number'&&Number.isFinite(body.usage.cost)){
      row.actualOrEstimatedUsd=body.usage.cost;
      row.costSource='openrouter_usage_cost_not_invoice';
    }else if(row.usage.inputTokens>0||row.usage.outputTokens>0){
      row.actualOrEstimatedUsd=row.usage.inputTokens*inRate+
        row.usage.outputTokens*outRate;
      row.costSource='model_catalog_rate_estimate';
    }
    row.improvedHeuristicFlags=output?
      auditSeyeonC09LunaUtteranceShadowV1(output).flags:[];
    save();
    console.log('CASE',JSON.stringify({id:m.id,status:row.status,
      elapsedMs:row.elapsedMs,recordedOrEstimatedUsd:row.actualOrEstimatedUsd,
      heuristicFlags:row.improvedHeuristicFlags,output:row.improvedOutput}));
    if(row.status!=='COMPLETED'||row.finishReason==='length')break;
  }catch{
    row.status='TRANSPORT_UNCERTAIN_BILLING_NO_RETRY';
    row.elapsedMs=Date.now()-started;
    row.errorCode='STOP_WITHOUT_RETRY';
    save();
    break;
  }
}
const done=save();
const md=[
  '# 명하 C09 개선 GPT-6 Luna 기존·개선 실측 (공개 합성 5문항)',
  '',
  '- 기존 출처: GitHub Actions run 40261419279',
  '- 동일 모델: '+MODEL+', temperature 0.65, output cap 900',
  '- 개선 프롬프트: C09 기존 Bible/Runtime Composer + 공개 행동/동기 계획',
  '- 개선 5문항 시도: '+done.newAttempted+'/5, 유효 응답: '+done.newCompleted+'/5',
  '- 새 호출 비용 추정·사용량/예약 합계 USD: '+done.reservationOrEstimateTotalUsd,
  '- 실제 청구 명세 검증: 별도. 독립 의미 검토·운영 권한 검증·Production 연결: 없음',
  '',
  '| 문항 | 이전 Luna | 개선 Luna | 이전(ms) | 개선(ms) | 이전 비용(USD) | 개선 비용(USD) | 표면 휴리스틱 |',
  '|---|---|---|---:|---:|---:|---:|---|',
  ...done.entries.map(r=>[
    '|',r.id,'|',String(r.baselineOutput).replaceAll('|','/').replaceAll('\n',' '),
    '|',String(r.improvedOutput??'NO_RESULT').replaceAll('|','/').replaceAll('\n',' '),
    '|',r.baselineElapsedMs,'|',r.elapsedMs??'-',
    '|',r.baselineRecordedUsd,'|',r.actualOrEstimatedUsd??'-',
    '|',r.improvedHeuristicFlags.join(', ')||'없음','|',
  ].join(' ')),
  '',
  '표면 휴리스틱은 기억 정확도·안전 승인이나 캐릭터성 점수가 아닙니다.',
];
writeFileSync(report,md.join('\n')+'\n','utf8');
console.log('SUMMARY',JSON.stringify({attempted:done.newAttempted,completed:done.newCompleted,
  costOrReservedUsd:done.reservationOrEstimateTotalUsd,artifact:file,summary:report}));
if(done.newCompleted!==MAX_CALLS)process.exitCode=2;
