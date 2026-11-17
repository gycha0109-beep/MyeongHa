/** Owner-dispatched, synthetic-only, one-shot GPT-6 Luna A/B/C measurement. */
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,publicEncrypt,createCipheriv} from 'node:crypto';
const ROUTED_MODEL='openai/gpt-6-luna';
const RECOVERY_MARKER='YEOUL_LUNA_OPENROUTER_REAL_RECOVERY_20261117';
const MODEL='gpt-6-luna', REPO='gycha0109-beep/MyeongHa', LEDGER=3345;
const MARKER='YEOUL_LUNA_20261117_PAID_ONE_SHOT_RESERVATION';
const PREVIOUS_HOLD='YEOUL_LUNA_20261117_AUTH401_ZERO_BILLABLE_CALLS';
const COST_LIMIT_KRW=500, TOKENS=750, INPUT_MAX_BYTES=16000;
const assert=(ok,code)=>{if(!ok)throw Error('YEOUL_LUNA_HOLD_'+code);};
const getJson=async res=>res.json().catch(()=>null);
const api='https://api.github.com/repos/'+REPO+'/issues/'+LEDGER+'/comments';
const headers=(token)=>({Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
function coreFrom(runtime){
  const a=runtime.indexOf('## R1.1 Always-On Core Anchor');
  const b=runtime.indexOf('## R1.2 Runtime Thesis for Yeoul',a);
  assert(a>=0&&b>a,'CORE_SECTION');
  const fence=String.fromCharCode(96).repeat(3);
  const part=runtime.slice(a,b);
  const from=part.indexOf(fence+'text');
  const to=part.indexOf(fence,from+7);
  assert(from>=0&&to>from,'CORE_FENCE');
  const core=part.slice(from+7,to).trim();
  assert(core.includes('실제로 차가운 사람이 아니다')&&core.includes('관계 성장은 더 다정해지는 것이 아니라'),'CORE_CONTENT');
  return '여울 핵심 성격 원문:\n'+core;
}
async function makePlan(sourceRoot){
  const root=join(sourceRoot,'scripts','character-optimization');
  const {digest,createOptimizationRun,validateCandidate}=await import(pathToFileURL(join(root,'contracts-v1.mjs')).href);
  const {compileYeoulLunaABCPromptPlan}=await import(pathToFileURL(join(root,'yeoul-luna-runtime-plan-v1.mjs')).href);
  const runtime=await readFile(join(sourceRoot,'docs','character','YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8');
  const runtimeSha256=digest(runtime.replace(/\r\n/g,'\n'));
  assert(runtimeSha256==='f4aba2d0b9df941176551e3433a8212ffe8c15920f46f35fc46adf25da543db8','RUNTIME_PIN');
  const core=coreFrom(runtime);
  const h=digest('fixed-yeoul-synthetic-one-shot-20261117');
  const profile={
    characterId:'yeoul',
    source:{canonRef:'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',runtimeRef:'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
      contentBundleSha256:runtimeSha256,authorityVersion:'draft-v0.1',authorityState:'DRAFT'},
    student:{provider:'openai',modelId:MODEL,parametersSha256:h,routingPolicySha256:h},
    evalSuite:{developmentRef:'one-synthetic-development-turn',validationRef:'not-available',
      holdoutRef:'not-available',rubricVersion:'8-dimension-v1',splitManifestSha256:h},
    mutableSlots:['character_expression'],reviewRequired:true,privacyPolicyRef:'synthetic-only-encrypted-results',
  };
  const manifest=createOptimizationRun({track:'character',profiles:[profile],immutableSourcesSha256:runtimeSha256,
    baselinePromptSha256:digest(core),optimizerVersion:'no-optimizer-live',evaluatorVersion:'human-unreviewed'});
  const context={questionId:'Y07',userMove:'오늘 기분이 좀 허전해요.',relationshipStage:'no_history',
    historyAvailable:false,approvedFacts:[]};
  const settings={modelId:MODEL,provider:'openai',subprovider:'openai-direct',temperature:null,maxTokens:TOKENS,
    reasoningEffort:'low',allowFallbacks:false,requireParameters:true,dataCollection:'deny',zdr:true};
  // Source-derived research wording; NOT attested as the privately selected GEPA result.
  const expr='여울은 감정이 말보다 행동에 먼저 드러나지만 늘 챙기는 사람은 아닙니다. '+
    '[첫 반응] 사용자의 말이 감정 표현이라면 그 구분을 먼저 받고, 자신의 마음을 물으면 입장을 먼저 답하세요. '+
    '처방과 되묻기는 자동 반응이 아닙니다. 새침함은 실제 맥락에 있을 때만 드러내세요.';
  const candidate=validateCandidate({character_expression:expr},
    {slot:'character_expression',pinnedContextSha256:runtimeSha256});
  return compileYeoulLunaABCPromptPlan({manifest,baselineCore:core,context,settings,runtimeMarkdown:runtime,runtimeSha256,candidate});
}
function quote(plan){
  assert(plan.providerCalls===0&&plan.productionEligible===false&&plan.arms.length===3,'PLAN_BOUNDARY');
  for(const item of plan.arms){
    const p=item.requestPreview;
    assert(p.model===MODEL&&p.max_output_tokens===TOKENS&&p.reasoning.effort==='low'&&p.text.format.type==='json_schema','REQUEST_SHAPE');
    assert(!Object.hasOwn(p,'temperature')&&p.input.length===2,'UNAPPROVED_PARAMETERS');
    const bytes=Buffer.byteLength(JSON.stringify(p.input),'utf8');
    assert(bytes>50&&bytes<=INPUT_MAX_BYTES,'INPUT_BYTES');
  }
  const usdWorst=plan.arms.length*(INPUT_MAX_BYTES*0.10+TOKENS*0.50)/1e6;
  const krwWorst=Math.ceil(usdWorst*3000*2)+plan.arms.length*10;
  assert(krwWorst<COST_LIMIT_KRW,'BUDGET_CAP');
  return krwWorst;
}

function guardEnv(){
  const e=process.env;
  assert(e.GITHUB_REPOSITORY===REPO && e.GITHUB_REF==='refs/heads/main' &&
    e.GITHUB_EVENT_NAME==='push' && e.GITHUB_RUN_ATTEMPT==='1' &&
    /^[0-9]+$/.test(e.GITHUB_RUN_ID||'') &&
    /^[a-f0-9]{40}$/.test(e.GITHUB_SHA||''),'EXACT_MAIN_ONCE_ONLY');
  assert(/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(e.OPENROUTER_API_KEY||''),'OPENROUTER_KEY_UNAVAILABLE');
  assert(typeof e.GH_API_TOKEN==='string' && e.GH_API_TOKEN.length>30,'READ_ONLY_GITHUB_TOKEN');
}


async function modelGet(key){
  // Only a non-billable authentication request. No inference before auth succeeds.
  let r;
  try {r=await fetch('https://openrouter.ai/api/v1/auth/key',{method:'GET',redirect:'error',
    headers:{Authorization:'Bearer '+key,Accept:'application/json'},
    signal:AbortSignal.timeout(12000)});}
  catch {assert(false,'OPENROUTER_AUTH_NETWORK');}
  assert(r.status===200,'OPENROUTER_AUTH_'+r.status);
  const j=await getJson(r);
  assert(j && typeof j.data==='object' && j.data!==null,'OPENROUTER_AUTH_SHAPE');
}


async function reserve(token,amount){
  const comments=[];
  for(let pageNumber=1;pageNumber<=5;pageNumber++){
    const response=await fetch(api+'?per_page=100&page='+pageNumber,{
      headers:headers(token),redirect:'error',signal:AbortSignal.timeout(12000)});
    assert(response.status===200,'READ_BUDGET_AUDIT');
    const page=await getJson(response);
    assert(Array.isArray(page)&&page.every(x=>typeof x?.body==='string'),'AUDIT_READ_SHAPE');
    comments.push(...page);
    if(page.length<100)break;
    assert(pageNumber<5,'AUDIT_TOO_MANY_COMMENTS');
  }
  const ownerEntries=marker=>comments.filter(x=>x.body.includes(marker) && x.user?.login==='gycha0109-beep');
  const reservation=ownerEntries(MARKER);
  const audit=ownerEntries(PREVIOUS_HOLD);
  const recovery=ownerEntries(RECOVERY_MARKER);
  assert(reservation.length===1 && audit.length===1 && recovery.length===1,'BUDGET_TRANSFER_NOT_ATTESTED');
  assert(reservation[0].body.includes('Run ID: 44048122315') &&
    reservation[0].body.includes('KRW 500 reserved') &&
    audit[0].body.includes('POST /v1/responses issued: 0') &&
    recovery[0].body.includes('prior run 44048122315 zero paid POST') &&
    recovery[0].body.includes('reassign the SAME KRW 500 cap to the ONE OpenRouter recovery run') &&
    recovery[0].body.includes('max 3 synthetic GPT-6 Luna calls'),
    'OLD_ZERO_POST_TRANSFER_CONTRACT');
  // Disallow any repeated inference workflow, including rerun of THIS run.
  const listUrl='https://api.github.com/repos/'+REPO+'/actions/workflows/yeoul-luna-openrouter-live-once-v1.yml/runs?per_page=20';
  const resp=await fetch(listUrl,{headers:headers(token),redirect:'error',signal:AbortSignal.timeout(12000)});
  assert(resp.status===200,'ONESHOT_HISTORY_READ');
  const history=await getJson(resp);
  assert(history?.total_count===1 && history?.workflow_runs?.length===1 &&
    String(history.workflow_runs[0].id)===process.env.GITHUB_RUN_ID &&
    history.workflow_runs[0].run_attempt===1,'ALREADY_USED_OR_WRONG_RUN');
  assert(Number.isSafeInteger(amount) && amount>0 && amount<=500,'GLOBAL_BUDGET_LIMIT');
  return Object.freeze({previousReservationId:reservation[0].id,recoveryApprovalId:recovery[0].id});
}


function parseResponse(body,item,elapsed){
  assert(body && (body.model===ROUTED_MODEL || body.model===MODEL),
    'OPENROUTER_MODEL_ID_MISMATCH');
  const usage=body.usage;
  assert(Number.isSafeInteger(usage?.prompt_tokens)&&Number.isSafeInteger(usage?.completion_tokens),'USAGE_RECEIPT_MISSING');
  assert(usage.completion_tokens<=TOKENS,'RECEIPT_TOKEN_LIMIT');
  const message=body.choices?.[0]?.message;
  assert(typeof message?.content==='string' && message.content.length>0,'NO_ANSWER');
  let parsed;
  try{parsed=JSON.parse(message.content);}catch{assert(false,'INVALID_REPLY_JSON');}
  assert(typeof parsed?.reply==='string' && parsed.reply.trim().length>0 &&
    parsed.reply.length<1600 && Object.keys(parsed).join(',')==='reply','INVALID_REPLY_SHAPE');
  return {
    arm:item.arm,promptSha256:item.promptSha256,providerId:body.id,
    model:body.model,inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,
    elapsedMs:elapsed,reply:parsed.reply,
    usdStandardRateEstimate:(usage.prompt_tokens*0.10+usage.completion_tokens*0.50)/1e6,
  };
}


async function execute(key,item){
  const p=item.requestPreview;
  const payload={
    model:ROUTED_MODEL,
    messages:p.input.map(x=>({role:x.role,content:x.content})),
    response_format:{type:'json_schema',json_schema:{
      name:p.text.format.name || 'yeoul_reply',strict:true,schema:p.text.format.schema,
    }},
    reasoning:{effort:'low'},
    max_tokens:TOKENS,
    provider:{only:['OpenAI'],allow_fallbacks:false,require_parameters:true,
      data_collection:'deny',zdr:true},
    stream:false,
  };
  assert(!JSON.stringify(payload).includes('temperature') &&
    payload.model===ROUTED_MODEL && payload.messages.length===2,'ROUTER_PAYLOAD');
  const start=Date.now();
  let response;
  try{response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',redirect:'error',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
      'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'MyeongHa Yeoul synthetic'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(45000),
  });}catch{assert(false,'ROUTER_POST_RESULT_UNKNOWN_BILLING_NO_RETRY');}
  assert(response.status===200,'ROUTER_POST_HTTP_'+response.status+'_BILLING_UNKNOWN_NO_RETRY');
  const receipt=await getJson(response);
  return parseResponse(receipt,item,Date.now()-start);
}

function encrypted(data,publicPem){
  const key=randomBytes(32),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);
  return JSON.stringify({schemaVersion:'yeoul-luna-encrypted-result-v1',
    alg:'RSA-OAEP-SHA256+AES-256-GCM',
    wrappedKey:publicEncrypt({key:publicPem,oaepHash:'sha256'},key).toString('base64'),
    iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
    ciphertext:ciphertext.toString('base64')})+'\n';
}
async function main(){
  const root=process.env.YEOUL_PINNED_SOURCE_ROOT;
  assert(typeof root==='string'&&root.length>8,'PINNED_RESEARCH_ROOT');
  const plan=await makePlan(root);
  const amount=quote(plan);
  if(process.argv.includes('--plan-only')){
    console.log('SYNTHETIC_PLAN_READY',JSON.stringify({model:MODEL,arms:plan.arms.map(x=>x.arm),
      conservativeKrwCeiling:amount,actualCalls:0,qualityMeasured:false}));
    return;
  }
  guardEnv();
  const key=process.env.OPENROUTER_API_KEY;
  await modelGet(key); // OpenRouter non-billable authorization check
  const ledgerReceipt=await reserve(process.env.GH_API_TOKEN,amount);
  const results=[];let failure=null;
  for(const item of plan.arms){
    try{results.push(await execute(key,item));}
    catch(e){failure=String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,100);break;}
  }
  const report={schemaVersion:'yeoul-luna-synthetic-abc-actual-v1',
    runId:process.env.GITHUB_RUN_ID,ledgerReceipt,model:ROUTED_MODEL,transport:'OpenRouter',syntheticOnly:true,
    candidateCProvenance:'manual_source_based_not_attested_gepa_selection',
    privateHumanReview:false,independentQualityGainProven:false,
    question:'오늘 기분이 좀 허전해요.',maxKrw:COST_LIMIT_KRW,
    conservativeKrwCeiling:amount,actualBilledKrw:null,results,failure,
    status:failure?'HOLD_UNKNOWN_BILLING':'ACTUAL_REPLIES_UNREVIEWED'};
  const keyPem=await readFile(join(process.cwd(),'.github','yeoul-luna-eval-public-v1.pem'),'utf8');
  const path=process.env.YEOUL_ENCRYPTED_ARTIFACT_PATH;
  assert(typeof path==='string'&&path.length>8,'ARTIFACT_PATH');
  await writeFile(path,encrypted(report,keyPem),{flag:'wx',mode:0o600});
  for(const record of results){
    // Only synthetic publicly defined prompt replies; no user conversation or prompt authority.
    console.log('YEOUL_SYNTHETIC_REPLY',JSON.stringify({arm:record.arm,reply:record.reply}));
  }
  console.log('LUNA_PAID_ONE_SHOT',JSON.stringify({status:report.status,
    generated:results.length,ledgerReceipt,maxKrw:COST_LIMIT_KRW,
    conservativeKrwCeiling:amount,inputTokens:results.reduce((n,x)=>n+x.inputTokens,0),
    outputTokens:results.reduce((n,x)=>n+x.outputTokens,0),
    estimatedUsdStandard:results.reduce((n,x)=>n+x.usdStandardRateEstimate,0),
    privateEncryptedArtifactOnly:true,qualityNotYetReviewed:true}));
  assert(!failure,'PROVIDER_FAILURE_UNKNOWN_BILLING');
}
await main().catch(err=>{
  console.error('LUNA_ONE_SHOT_HOLD',String(err?.message||'UNEXPECTED').replace(/[^A-Za-z0-9_]/g,'').slice(0,110));
  process.exitCode=1;
});
