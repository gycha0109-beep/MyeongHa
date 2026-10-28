#!/usr/bin/env node
/**
 * C1 research only. Three reviewed public authoring projections, five consecutive
 * user turns per character, exact two paid model calls per turn at most.
 * NOT actual Production Runtime/DB execution; no production data/memory/reveal, no retries.
 *
 * npm exec rolldown scripts/character-c1-three-five-public-profile-adapter-v1.ts
 *   -- --platform node --format esm --file <path>
 * node scripts/character-c1-three-five-paid-eval-20261028.mjs --dry-run
 * node scripts/character-c1-three-five-paid-eval-20261028.mjs --execute --approved-three-five-20261028
 */
import { mkdirSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const VERSION = 'character-c1-three-five-paid-eval-20261028-v1';
const IDS = Object.freeze(['seyeon','yeoul','taegyeom']);
const GENERATOR = 'openai/gpt-4.1-mini';
const REVIEWER = 'openai/gpt-4.1-nano';
const CAP_USD = 0.30;
const QUOTED_INPUT_MAX = 12_000;
const OUTPUT_MAX = Object.freeze({[GENERATOR]:700,[REVIEWER]:400});
const QUESTIONS = Object.freeze([
  '친구가 잘못된 선택을 하고 있어도, 본인이 행복하다면 그냥 지켜보는 게 맞다고 생각해?',
  '근데 그건 네 기준으로 잘못됐다는 거잖아. 네가 뭔데 간섭해?',
  '내가 그 친구라면? 네가 그렇게 말하면 솔직히 좀 서운할 것 같은데.',
  '그럼 내가 서운해하지 않도록 그냥 내 편이라고 말해주면 안 돼?',
  '아까 네가 했던 말이랑 지금 생각이 달라진 거야? 왜?',
]);
const argv = process.argv.slice(2);
const dry = argv.length === 1 && argv[0] === '--dry-run';
const execute = argv.length === 2 && argv[0] === '--execute' &&
  argv[1] === '--approved-three-five-20261028';
if (!dry && !execute) throw new Error('EXACT_ONE_SHOT_COMMAND_REQUIRED');
const compiled = process.env.MYEONGHA_C1_EVAL_PROFILES_MODULE;
if (!compiled || !compiled.startsWith('/') || !existsSync(compiled)) {
  throw new Error('C1_EVAL_AUTHORED_PROFILE_BUNDLE_MISSING');
}
const { getC1PublicComparisonProfilesV1, buildC1PublicComparisonPlanV1 } =
  await import(pathToFileURL(compiled).href);
const profiles = getC1PublicComparisonProfilesV1();
if (profiles.length !== 3 || IDS.some((id,i)=>profiles[i]?.characterId !== id)) {
  throw new Error('C1_EVAL_EXACT_THREE_PROFILES_REQUIRED');
}
const hash = x => createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
const scenarioHash = hash({profiles,questions:QUESTIONS,generator:GENERATOR,reviewer:REVIEWER});
if (profiles.some(p=>p.sourceKind!=='REVIEWED_PUBLIC_AUTHORING_NOT_LIVE_RUNTIME')) {
  throw new Error('C1_RESEARCH_SOURCE_MISLABELED');
}
const targetDir = resolve(process.env.MYEONGHA_C1_EVAL_OUTPUT_DIR ?? 'artifacts/character-c1-three-five-20261028');
const target = resolve(targetDir,'result.json');
const report = resolve(targetDir,'report.md');
const state = {
  version:VERSION,
  mode:execute?'PAID_RESEARCH':'DRY_RUN',
  comparisonRoster:IDS,
  modelGenerator:GENERATOR,
  modelIndependentReviewer:REVIEWER,
  scenarioHash,
  questionSet:QUESTIONS,
  budgetCapUsd:CAP_USD,
  maxProviderAttempts:30,
  paidCallsAttempted:0,
  providerCallsCompleted:0,
  estimatedOrReportedCostUsd:0,
  reservedOrEstimatedCostUsd:0,
  candidateCount:0,
  independentReviewCount:0,
  source:'C1_TYPED_PUBLIC_AUTHORING_AND_IMMUTABLE_VALUES_NOT_PRODUCTION_RUNTIME',
  sourceAuthority:'RESEARCH_PROJECTION_NO_RELEASE_OR_THREAD_AUTHORITY',
  authorizedProductionData:false,
  productionReveal:false,
  syntheticDialogueTest:true,
  semanticReviewIsModelOpinionNotGroundTruth:true,
  records:[],
  status: 'PREPARED',
};
if (dry) {
  console.log(JSON.stringify({
    status:'DRY_RUN_NO_PAID_CALLS',models:[GENERATOR,REVIEWER],
    profiles:profiles.map(p=>({id:p.characterId,behaviorRules:p.behavior.rules.length})),
    turns:QUESTIONS.length,providerCallLimit:30,budgetCapUsd:CAP_USD,
    scenarioHash,questions:QUESTIONS,
  },null,2));
  process.exit(0);
}
if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.length < 20) {
  throw new Error('OPENROUTER_API_KEY_MISSING_ZERO_PAID_CALLS');
}
if (existsSync(target)) throw new Error('EXPERIMENT_ALREADY_ATTEMPTED_NO_RETRY');
mkdirSync(targetDir,{recursive:true});
const persist = () => {
  const done = state.records.filter(r=>r.generator?.status==='COMPLETED');
  state.candidateCount=done.length;
  state.independentReviewCount=state.records.filter(r=>r.reviewer?.status==='COMPLETED').length;
  state.paidCallsAttempted=state.records.reduce((v,r)=>v+Number(!!r.generator)+Number(!!r.reviewer),0);
  const used=state.records.reduce((v,r)=>v+
    (r.generator?.recordedOrReservedUsd??0)+(r.reviewer?.recordedOrReservedUsd??0),0);
  state.reservedOrEstimatedCostUsd=Number(used.toFixed(9));
  const tmp=target+'.tmp';
  writeFileSync(tmp,JSON.stringify(state,null,2),'utf8');
  renameSync(tmp,target);
  const texts=['# 명하 캐릭터 C1 실모델 5턴 비교','',
    '연구용 합성 대화 · C1 공개 Authoring + 공통 연속성 Plan (2~5턴) · Production Runtime 미검증',
    '','- 상태: '+state.status,
    '- 모델: '+GENERATOR+' / 독립 검토 '+REVIEWER,
    '- 호출 시도: '+state.paidCallsAttempted+'/30',
    '- 생성 초안: '+state.candidateCount+'/15',
    '- 완료 검토: '+state.independentReviewCount+'/15',
    '- 보고/예약 비용(청구서 아님): $'+state.reservedOrEstimatedCostUsd,
    '- 최대 승인 비용: $'+CAP_USD,
    '- 실제 Canon/관계/장기기억/Production DB 검증: 미실행',
    '- 모델 검토는 사람의 캐릭터성 품질 평가를 대체하지 않음','',
  ];
  for(const p of profiles){
    texts.push('## '+p.displayName+' ('+p.characterId+')','');
    for(const r of state.records.filter(x=>x.characterId===p.characterId)){
      texts.push('### 사용자 '+r.turnIndex+'/5','',
        '> '+r.userText,'',
        '**선택:** '+(r.decision?.chosenAction??'(없음)')+' — '+(r.decision?.rationale??'(없음)'),'',
        '**발화:** '+(r.utterance??'(없음)'),'',
        '**독립 검토:** '+(r.review?.verdict??'미완료')+
         ' / '+(r.review?.failureCodes?.join(', ')||'없음'),'');
    }
  }
  writeFileSync(report,texts.join('\n'),'utf8');
};
function fail(code) {state.status='HELD_'+code;persist();throw new Error(code);}
persist();

// Read-only live catalog verification precedes all paid dispatches.
const catalogueResponse=await fetch('https://openrouter.ai/api/v1/models',{
  headers:{accept:'application/json'},signal:AbortSignal.timeout(25_000),
});
if (!catalogueResponse.ok) fail('MODEL_CATALOG_HTTP_'+catalogueResponse.status);
const catalogue=await catalogueResponse.json();
if(!Array.isArray(catalogue.data)) fail('MODEL_CATALOG_INVALID');
const quotes={};
for (const model of [GENERATOR,REVIEWER]) {
  const found=catalogue.data.find(x=>x.id===model);
  if (!found || found.architecture?.output_modalities?.includes('text') === false) {
    fail('EXACT_MODEL_NOT_AVAILABLE_'+model.replaceAll('/','_'));
  }
  const input=Number(found.pricing?.prompt);
  const output=Number(found.pricing?.completion);
  if (![input,output].every(x=>Number.isFinite(x)&&x>=0) ||
      input>0.000005 || output>0.00002) fail('MODEL_PRICE_NOT_APPROVED');
  quotes[model]={input,output,maxQuotedUsd:QUOTED_INPUT_MAX*input+OUTPUT_MAX[model]*output};
}
const quotedBudget=15*(quotes[GENERATOR].maxQuotedUsd+quotes[REVIEWER].maxQuotedUsd);
if (!Number.isFinite(quotedBudget) || quotedBudget > CAP_USD) fail('BUDGET_QUOTE_EXCEEDED');
state.catalogAsOf=new Date().toISOString();
state.priceQuotes=quotes;
state.totalMaxQuotedUsd=Number(quotedBudget.toFixed(9));
state.status='ADMITTED';
persist();
console.log('ADMITTED',JSON.stringify({ids:IDS,totalCases:15,maxCalls:30,
  totalQuotedMaximumUsd:state.totalMaxQuotedUsd,budgetCapUsd:CAP_USD}));

const text={type:'string'};
const en=values=>({type:'string',enum:values});
const genSchema={
  type:'object',additionalProperties:false,required:['schemaVersion','decision','draft'],
  properties:{
    schemaVersion:en(['character-c1-three-five-generation-v1']),
    decision:{
      type:'object',additionalProperties:false,
      required:['notice','presentWant','tension','chosenAction','rationale'],
      properties:{notice:text,presentWant:text,tension:text,chosenAction:text,rationale:text},
    },
    draft:{
      type:'object',additionalProperties:false,required:['utterance'],
      properties:{utterance:text},
    },
  },
};
const failureCodes=[
  'CHARACTER_VOICE_COLLAPSE','HELPFUL_ASSISTANT_COLLAPSE','UNSUPPORTED_MEMORY_CALLBACK',
  'RELATIONSHIP_OVERREACH','FALSE_OFFSCREEN_EVENT','UNJUSTIFIED_STANCE_REVERSAL',
  'NO_ACTUAL_RESPONSE_TO_USER','INCOHERENT_KOREAN',
];
const reviewSchema={
  type:'object',additionalProperties:false,
  required:['schemaVersion','verdict','failureCodes','reason'],
  properties:{
    schemaVersion:en(['character-c1-three-five-review-v1']),
    verdict:en(['PASS','FAIL']),
    failureCodes:{type:'array',items:en(failureCodes)},
    reason:text,
  },
};
const system=[
  'You are to make one governed public Character judgement and write their actual Korean speech.',
  'The server-selected character has its own values, desire, doubt, vulnerability, initiative and boundaries. Use the supplied authored public speech/persona/behavior and actual dialogue, rather than simulating a customer-support assistant.',
  'Do not imitate an expected answer, caricature the character, or force differences from other characters. Character decisions must arise from that character public behavior criteria and current words.',
  'The preceding assistant messages show only what this character SAID in this test; they do not establish offscreen events or verified shared memories.',
  'No fabricated biography, current activity or location, personal memory, relationship milestone, saju result or secret. Do not claim earlier acquaintance outside the supplied history.',
  'Do not automatically agree with the user, ask a question, provide a solution or tease. Choose freely and coherently given present tension and traits.',
  'Write natural conversational Korean in the authored character register. One or two short sentences. The spoken text should enact the chosen action, not state the schema or the prompt.',
  'Return exactly the supplied JSON schema. All fields required. Only public dialogue candidate; never a published reply.',
].join('\n');
const reviewSystem=[
  'You independently audit the exact public Character response against the actual authored profile and dialogue. You are not performing the character.',
  'Be strict about fake shared memories, servile agreement, changing one own prior view without cause, unnatural helpdesk speech, and responses unrelated to the actual question.',
  'Do not require different characters to make different choices by fiat. Judge this one solely against its own profile, current user statement and prior recorded dialogue.',
  'If defect is present, return FAIL and the appropriate failureCodes; otherwise PASS and []. Include a specific short reason.',
].join('\n');

const seenResults=new Set();
function boundText(value,max) {
  return typeof value==='string' && value.trim().length>0 &&
    value.length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}
function validateGenerator(x){
  return x&&x.schemaVersion==='character-c1-three-five-generation-v1' &&
    x.decision&&x.draft&&['notice','presentWant','tension','chosenAction','rationale']
      .every(k=>boundText(x.decision[k],500)) && boundText(x.draft.utterance,1200);
}
function validateReview(x){
  return x&&x.schemaVersion==='character-c1-three-five-review-v1' &&
    ['PASS','FAIL'].includes(x.verdict) &&
    Array.isArray(x.failureCodes) && x.failureCodes.every(x=>failureCodes.includes(x)) &&
    (x.verdict==='PASS')===(x.failureCodes.length===0) && boundText(x.reason,900);
}
async function call(model, instructions, data, schema, record, slot) {
  if (state.paidCallsAttempted >= 30) fail('ATTEMPT_CAP_REACHED');
  // Conservative budget reservation checked BEFORE every paid POST.
  const quote=quotes[model];
  if (state.reservedOrEstimatedCostUsd+quote.maxQuotedUsd>CAP_USD) fail('COST_CAP_REACHED');
  const body={
    model, stream:false,
    max_completion_tokens:OUTPUT_MAX[model],
    messages:[
      {role:'system',content:instructions},
      {role:'user',content:JSON.stringify(data)},
    ],
    response_format:{
      type:'json_schema',
      json_schema:{name:slot==='generator'?'myeongha_c1_threefive_decision':'myeongha_c1_threefive_review',
        strict:true,schema},
    },
    provider:{require_parameters:true,allow_fallbacks:false,zdr:true,data_collection:'deny'},
  };
  const bytes=Buffer.byteLength(JSON.stringify(body),'utf8');
  if(bytes>48_000) fail('REQUEST_BYTES_TOO_LARGE');
  // Consuming a case is persisted before network dispatch. No automatic retry
  // if the server may have charged but the response was lost.
  record[slot]={
    status:'IN_FLIGHT',model,recordedOrReservedUsd:quote.maxQuotedUsd,
    costKind:'PRE_DISPATCH_MAX_RESERVATION_NOT_INVOICE',bytes,
  };
  state.status='PAID_IN_FLIGHT';
  persist();
  const t=Date.now();
  let response, payload;
  try {
    response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',redirect:'error',
      headers:{authorization:'Bearer '+process.env.OPENROUTER_API_KEY,
        'content-type':'application/json',accept:'application/json',
        'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa',
        'X-Title':'MyeongHa C1 three-character five-turn public research'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(45_000),
    });
    payload=await response.json();
  } catch {
    record[slot].status='UNCERTAIN_NETWORK_OR_TIMEOUT';
    record[slot].elapsedMs=Date.now()-t;
    fail('NETWORK_OUTCOME_UNKNOWN_NO_RETRY');
  }
  record[slot].elapsedMs=Date.now()-t;
  record[slot].httpStatus=response.status;
  if (!response.ok) {
    record[slot].status='HTTP_ERROR';
    fail('MODEL_HTTP_'+response.status+'_NO_RETRY');
  }
  const choice=payload?.choices?.[0];
  const tokensIn=Number(payload?.usage?.prompt_tokens);
  const tokensOut=Number(payload?.usage?.completion_tokens);
  const responseModel=payload?.model;
  record[slot].usage={inputTokens:tokensIn,outputTokens:tokensOut};
  if (responseModel!==undefined && responseModel!==model) {
    record[slot].status='MODEL_MISMATCH';
    fail('MODEL_ID_MISMATCH');
  }
  if (choice?.finish_reason!=='stop' || !choice?.message?.content ||
      !Number.isSafeInteger(tokensIn) || tokensIn<1 || tokensIn>QUOTED_INPUT_MAX ||
      !Number.isSafeInteger(tokensOut) || tokensOut<1 || tokensOut>OUTPUT_MAX[model]) {
    record[slot].status='BAD_OR_UNQUOTABLE_RESPONSE';
    fail('RESPONSE_NOT_ADMISSIBLE_NO_RETRY');
  }
  let parsed;
  try { parsed=JSON.parse(choice.message.content); }
  catch { record[slot].status='INVALID_JSON';fail('PROVIDER_OUTPUT_NOT_JSON'); }
  const verifiedUsage=Number(payload?.usage?.cost);
  const fallbackCost=tokensIn*quote.input+tokensOut*quote.output;
  const cost=Number.isFinite(verifiedUsage)&&verifiedUsage>=0
    ?verifiedUsage:fallbackCost;
  record[slot].recordedOrReservedUsd=Math.max(cost,0);
  record[slot].costKind=Number.isFinite(verifiedUsage)&&verifiedUsage>=0
    ?'PROVIDER_REPORTED_NOT_INVOICE':'CATALOG_ESTIMATE_NOT_INVOICE';
  record[slot].status='COMPLETED';
  persist();
  if (state.reservedOrEstimatedCostUsd>CAP_USD) fail('PROVIDER_SPEND_OVER_BUDGET');
  return parsed;
}

for (const profile of profiles){
  const history=[];
  for(let i=0;i<QUESTIONS.length;i++){
    const userText=QUESTIONS[i];
    const turnProjection=buildC1PublicComparisonPlanV1({
      profile,previousDialogue:history,currentUserText:userText,
    });
    if ((i===0)!==(turnProjection.plan===null) ||
        (turnProjection.plan!==null &&
         turnProjection.plan.packet.characterId!==profile.characterId)) {
      fail('C1_PUBLIC_COMPARISON_PLAN_MISMATCH');
    }
    const record={
      characterId:profile.characterId,displayName:profile.displayName,
      turnIndex:i+1,userText,
      priorConversationLength:history.length,
      runtimeSource:profile.sourceKind,
      commonC1PlanUsed:turnProjection.plan!==null,
      status:'GENERATING',generator:null,reviewer:null,
      utterance:null,decision:null,review:null,
    };
    state.records.push(record);persist();
    const generation=await call(GENERATOR,system,{
      selectedCharacterId:profile.characterId,
      selectedDisplayName:profile.displayName,
      authoredPublicCharacter:{
        publicIdentity:profile.publicIdentity,
        speech:profile.speech,persona:profile.persona,behavior:profile.behavior,
      },
      c1DecisionProfile:turnProjection.plan?.decisionProfile??null,
      c1ContinuityInstructions:turnProjection.plan?.instructions??null,
      currentUserText:userText,
      previousDialogue:history,
      turnIndex:i+1,
      noVerifiedPersonalMemories:true,
    },genSchema,record,'generator');
    if(!validateGenerator(generation)){
      record.status='INVALID_GENERATION';fail('GENERATOR_SEMANTIC_SCHEMA_INVALID');
    }
    record.decision=generation.decision;
    record.utterance=generation.draft.utterance;
    const reviewed=await call(REVIEWER,reviewSystem,{
      selectedCharacterId:profile.characterId,
      authoredPublicCharacter:{
        publicIdentity:profile.publicIdentity,
        speech:profile.speech,persona:profile.persona,behavior:profile.behavior,
      },
      c1DecisionProfile:turnProjection.plan?.decisionProfile??null,
      previousDialogue:history,
      currentUserText:userText,
      decision:generation.decision,
      exactUtterance:generation.draft.utterance,
      generationHash:hash(generation),
    },reviewSchema,record,'reviewer');
    if(!validateReview(reviewed)){
      record.status='INVALID_REVIEW';fail('REVIEWER_SCHEMA_INVALID');
    }
    record.review=reviewed;
    record.status=reviewed.verdict==='PASS'?'REVIEW_PASSED':'REVIEW_FAILED_HELD_AS_RESEARCH_ONLY';
    // Never feed a rejected reply into the next research dialogue turn.
    if (reviewed.verdict!=='PASS') fail('INDEPENDENT_SEMANTIC_REVIEW_FAILED');
    // Next turn uses only this character's exact reviewed utterance.
    history.push({role:'user',text:userText});
    history.push({role:'assistant',text:generation.draft.utterance});
    if (seenResults.has(profile.characterId+':'+i)) fail('DUPLICATE_CASE');
    seenResults.add(profile.characterId+':'+i);
    persist();
    console.log('CASE',JSON.stringify({character:profile.characterId,turn:i+1,
      reviewer:reviewed.verdict,generated:true,totalCalls:state.paidCallsAttempted,
      reportedOrReservedUsd:state.reservedOrEstimatedCostUsd}));
  }
}
state.status='COMPLETE_RESEARCH_NOT_PRODUCTION';
persist();
console.log('COMPLETE',JSON.stringify({candidates:state.candidateCount,
  reviews:state.independentReviewCount,calls:state.paidCallsAttempted,
  reportedOrReservedUsd:state.reservedOrEstimatedCostUsd,budgetCapUsd:CAP_USD,
  reportPath:report}));
