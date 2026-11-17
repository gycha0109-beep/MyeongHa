/** Owner-dispatched, synthetic-only, one-shot GPT-6 Luna A/B/C measurement. */
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,publicEncrypt,createCipheriv} from 'node:crypto';
const MODEL='gpt-6-luna', REPO='gycha0109-beep/MyeongHa', LEDGER=3345;
const MARKER='YEOUL_LUNA_20261117_PAID_ONE_SHOT_RESERVATION';
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
  assert(process.env.GITHUB_REPOSITORY===REPO&&process.env.GITHUB_REF==='refs/heads/main'&&
    process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.GITHUB_ACTOR==='gycha0109-beep'&&
    process.env.GITHUB_RUN_ATTEMPT==='1'&&/^\d+$/.test(process.env.GITHUB_RUN_ID||''),'ACTOR_OR_RUN');
  assert(/^sk-(proj|svcacct)-[A-Za-z0-9_-]{20,}$/.test(process.env.OPENAI_EVAL_API_KEY||''),'EVAL_KEY_MISSING');
  assert(typeof process.env.GH_API_TOKEN==='string'&&process.env.GH_API_TOKEN.length>30,'LEDGER_TOKEN_MISSING');
}
async function modelGet(key){
  const r=await fetch('https://api.openai.com/v1/models/'+MODEL,{method:'GET',redirect:'error',
    headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  assert(r.status===200,'MODEL_ACCESS_'+r.status);
  const data=await getJson(r);
  assert(data?.id===MODEL&&data?.object==='model','MODEL_ID');
}
async function reserve(token,amount){
  const expected=MARKER+'\nRun ID: '+process.env.GITHUB_RUN_ID+
    '\nTotal pilot cap: KRW 500 reserved in full; remaining authorized paid calls: zero.'+
    '\nThis one-shot ceiling: KRW '+amount+' conservative estimate; no retries. Unknown billing: HOLD.';
  // The read-only workflow cannot create reservations: the owner must issue the
  // immutable GitHub comment for THIS run ID. Re-runs and other run IDs fail closed.
  for(let attempt=0;attempt<45;attempt++){
    const all=[];
    for(let pageNumber=1;pageNumber<=5;pageNumber++){
      const response=await fetch(api+'?per_page=100&page='+pageNumber,{
        headers:headers(token),redirect:'error',signal:AbortSignal.timeout(10000)});
      assert(response.status===200,'LEDGER_READ');
      const page=await getJson(response);
      assert(Array.isArray(page)&&page.every(x=>typeof x.body==='string'),'LEDGER_DATA');
      all.push(...page);
      if(page.length<100)break;
      assert(pageNumber<5,'LEDGER_TOO_LARGE');
    }
    const reserved=all.filter(x=>x.body.includes(MARKER));
    assert(reserved.length<=1,'DUPLICATE_RESERVATION');
    if(reserved.length===1){
      const item=reserved[0];
      assert(item.user?.login==='gycha0109-beep'&&item.body.trim()===expected.trim(),
        'RESERVATION_WRONG_OWNER_OR_RUN');
      assert(Number.isSafeInteger(item.id),'RESERVATION_ID');
      return item.id;
    }
    await new Promise(ok=>setTimeout(ok,2000));
  }
  assert(false,'OWNER_RESERVATION_NOT_FOUND_NO_BILLING');
}
function parseResponse(body,item,elapsed){
  assert(body?.model===MODEL&&body.status==='completed','MODEL_RESPONSE_IDENTITY');
  assert(Number.isSafeInteger(body.usage?.input_tokens)&&Number.isSafeInteger(body.usage?.output_tokens),'USAGE_MISSING');
  assert(body.usage.output_tokens<=TOKENS,'OUTPUT_OVER_CAP');
  const content=(body.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('');
  let result;
  try{result=JSON.parse(content);}catch{throw Error('YEOUL_LUNA_HOLD_INVALID_JSON_OUTPUT');}
  assert(typeof result?.reply==='string'&&result.reply.trim().length>0&&
    result.reply.length<=1600&&Object.keys(result).join(',')==='reply','REPLY_SHAPE');
  return {
    arm:item.arm,promptSha256:item.promptSha256,providerId:body.id,
    model:body.model,inputTokens:body.usage.input_tokens,outputTokens:body.usage.output_tokens,
    elapsedMs:elapsed,reply:result.reply,
    usdStandardRateEstimate:(body.usage.input_tokens*0.10+body.usage.output_tokens*0.50)/1e6,
  };
}
async function execute(key,item){
  const start=Date.now();
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,
      Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({...item.requestPreview,store:false}),
    signal:AbortSignal.timeout(45000),
  });
  assert(r.status===200,'PROVIDER_POST_'+r.status+'_UNKNOWN_BILLING');
  return parseResponse(await getJson(r),item,Date.now()-start);
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
  const key=process.env.OPENAI_EVAL_API_KEY;
  await modelGet(key); // non-billable access check
  const ledgerReceipt=await reserve(process.env.GH_API_TOKEN,amount);
  const results=[];let failure=null;
  for(const item of plan.arms){
    try{results.push(await execute(key,item));}
    catch(e){failure=String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,100);break;}
  }
  const report={schemaVersion:'yeoul-luna-synthetic-abc-actual-v1',
    runId:process.env.GITHUB_RUN_ID,ledgerReceipt,model:MODEL,syntheticOnly:true,
    candidateCProvenance:'manual_source_based_not_attested_gepa_selection',
    privateHumanReview:false,independentQualityGainProven:false,
    question:'오늘 기분이 좀 허전해요.',maxKrw:COST_LIMIT_KRW,
    conservativeKrwCeiling:amount,actualBilledKrw:null,results,failure,
    status:failure?'HOLD_UNKNOWN_BILLING':'ACTUAL_REPLIES_UNREVIEWED'};
  const keyPem=await readFile(join(process.cwd(),'.github','yeoul-luna-eval-public-v1.pem'),'utf8');
  const path=process.env.YEOUL_ENCRYPTED_ARTIFACT_PATH;
  assert(typeof path==='string'&&path.length>8,'ARTIFACT_PATH');
  await writeFile(path,encrypted(report,keyPem),{flag:'wx',mode:0o600});
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
