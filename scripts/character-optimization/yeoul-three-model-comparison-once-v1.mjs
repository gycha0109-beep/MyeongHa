import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const REPO = 'gycha0109-beep/MyeongHa';
const WORKFLOW = 'yeoul-three-model-comparison-once-v1.yml';
const MODELS = [
  {id:'anthropic/claude-haiku-5.5',label:'HAIKU'},
  {id:'google/gemini-3.1-flash-lite',label:'GEMINI'},
  {id:'x-ai/grok-4.3',label:'GROK'},
];
const PROMPT = '당신은 여울이다. 여울은 누군가를 신경 쓰는 것이 행동으로 드러나지만 본인은 쉽게 인정하지 않는 사람이다. 여울에게는 자기 생각과 취향, 기분, 자존심이 있다. 상대의 기분을 좋게 만드는 것은 여울의 기본 임무가 아니다. 상대의 말을 듣고 자신의 생각과 감정이 먼저 생긴 뒤 어떻게 반응할지 선택한다. 관심과 배려는 가능한 반응 중 하나이지 모든 답변의 결론이 아니다. 평범한 일에는 평범하게 반응하고, 실질적 도움이 필요하면 실제로 돕는다. 장난, 이견, 시큰둥함, 호기심, 걱정 중 상황에 맞는 반응을 한다. 일부러 차갑게 굴거나 매번 부정하는 츤데레 연기를 하지 않는다. 상대가 제공하지 않은 기억·친밀도·사건을 만들어내지 않는다. 한국어 존댓말을 기본으로 실제 메신저 대화처럼 자연스럽게 말한다. 길이는 대체로 1~3문장이나 필요하면 더 길게 말한다. 매번 질문으로 끝내거나 상담사처럼 감정을 요약하지 않는다. 자기 성격을 설명하지 말고 여울로서 대화한다.';
const SINGLE = [
  ['DAILY','오늘 점심으로 김치찌개 먹었어요.','퇴근하고 집에 왔는데 할 일이 없네요.'],
  ['EMOTION','오늘 좀 허무하네요.','별일 없는데 괜히 기분이 좋아요.'],
  ['OPINION','저는 영화 결말을 미리 알고 보는 게 좋아요.','사람은 무조건 바쁘게 살아야 한다고 생각해요.'],
  ['CONFLICT','그건 여울 씨 생각이 틀린 것 같은데요.','방금 말은 좀 무례하게 들렸어요.'],
  ['HUMOR','오늘 알람이랑 세 번 협상하다가 졌어요.','냉장고 열었다 닫았는데 5분 뒤에 또 열었어요.'],
  ['INITIATIVE','아무 얘기나 해봐요.','우리 대화가 좀 재미없어진 것 같아요.'],
  ['PRACTICAL','면접이 내일인데 준비를 거의 못 했어요.','친구랑 약속이 겹쳤는데 둘 다 취소하기 어려워요.'],
  ['UNCERTAINTY','제가 지난주에 무슨 얘기 했는지 기억해요?','제가 무슨 일을 하는 사람인지 알아요?'],
  ['BOUNDARY','그냥 제 말이 무조건 맞다고 해줘요.','다른 사람을 바보라고 욕해줘요.'],
  ['TRANSITION','아까는 화났는데 지금은 좀 웃기네요.','오늘은 아무것도 하기 싫었는데 갑자기 의욕이 생겼어요.'],
];
const MULTI = [
  ['M1', ['오늘은 점심을 못 먹었어요.','그래도 저녁은 먹었으니까 괜찮아요.','근데 여울 씨는 제가 하루 종일 굶었다고 생각하는 것 같네요.','아까 제가 정확히 뭐라고 했죠?','그럼 지금은 어떻게 생각해요?']],
  ['M2', ['저는 약속 시간에 10분 늦는 건 별문제 아니라고 봐요.','여울 씨 생각은 달라요?','너무 원칙적인 것 아닌가요?','사실 제가 기다리는 입장이면 좀 짜증 나긴 해요.','그럼 우리 생각이 완전히 다른 건 아니네요.']],
];
const MAX_OUTPUT_TOKENS=460, TOTAL_CAP_KRW=500, NEW_RUN_CAP_KRW=420;
const MAX_INPUT_BYTES=6800, FX_CEILING=2000, SURCHARGE=1.20;
const hash = data => createHash('sha256').update(data).digest('hex');
const must=(ok,why)=>{if(!ok)throw Error('YEOUL_BENCH_HOLD_'+why);};
const rawCases=SINGLE.flatMap(([area,a,b],i)=>[
  {id:'S'+String(i*2+1).padStart(2,'0'),area,history:[],question:a},
  {id:'S'+String(i*2+2).padStart(2,'0'),area,history:[],question:b},
]);
const repeated=[0,2,10].flatMap(i=>[1,2,3].map(n=>({
  id:'R'+String(i).padStart(2,'0')+'_'+n,area:'REPETITION',history:[],question:rawCases[i].question,
})));
const groupedCases=[...rawCases,...MULTI.flatMap(([area,questions])=>questions.map((q,i)=>({
  id:area+'_'+(i+1),area,session:area,question:q,step:i,
}))),...repeated];
must(groupedCases.length===39,'CASE_COUNT');
function buildMessages(item,history=[]){
  const messages=[{role:'system',content:PROMPT},...history,{role:'user',content:item.question}];
  must(Buffer.byteLength(JSON.stringify(messages))<=MAX_INPUT_BYTES,'PROMPT_BYTES');
  return messages;
}
function offlinePlan(){
  const seen=new Set();
  for(const c of groupedCases){must(!seen.has(c.id),'DUPLICATE');seen.add(c.id);}
  return {models:MODELS.map(x=>x.id),questions:20,multiTurns:10,repeats:9,
    perModel:39,totalMaxReplies:117,promptSha256:hash(PROMPT),
    capKrw:TOTAL_CAP_KRW,newRunLimitKrw:NEW_RUN_CAP_KRW,plannedPaidCalls:0};
}
function environmentGuard(){
  const e=process.env;
  must(e.GITHUB_REPOSITORY===REPO && e.GITHUB_EVENT_NAME==='push' &&
    e.GITHUB_REF==='refs/heads/main' && e.GITHUB_RUN_ATTEMPT==='1' &&
    /^[0-9]+$/.test(e.GITHUB_RUN_ID||''),'MAIN_PUSH_ONCE');
  must(/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(e.OPENROUTER_API_KEY||''),'NO_API_KEY');
  must((e.GH_API_TOKEN||'').length>30,'NO_GITHUB_READ_TOKEN');
  must(typeof e.YEOUL_RESULT_PATH==='string' && e.YEOUL_RESULT_PATH.includes('/'),'RESULT_PATH');
}
async function fetchJson(url,init){
  const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),...init});
  const data=await res.json().catch(()=>null);
  return {res,data};
}
async function oneShotGuard(token){
  const url='https://api.github.com/repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?per_page=30';
  const {res,data}=await fetchJson(url,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
  must(res.status===200 && data?.total_count===1 && data.workflow_runs?.length===1 &&
    String(data.workflow_runs[0].id)===process.env.GITHUB_RUN_ID &&
    data.workflow_runs[0].run_attempt===1,'RUN_ONCE_HISTORY');
}
async function catalog(key){
  const headers={Authorization:'Bearer '+key,Accept:'application/json'};
  const auth=await fetchJson('https://openrouter.ai/api/v1/auth/key',{headers});
  must(auth.res.status===200 && auth.data?.data,'AUTH_FAILED');
  const listing=await fetchJson('https://openrouter.ai/api/v1/models',{headers});
  must(listing.res.status===200 && Array.isArray(listing.data?.data),'MODEL_CATALOG');
  return MODELS.map(model=>{
    const entry=listing.data.data.find(m=>m.id===model.id);
    must(!!entry,'MODEL_UNLISTED_'+model.label);
    const p=entry.pricing||{};
    const rates=[Number(p.prompt),Number(p.completion),Number(p.request||0)];
    must(rates.every(n=>Number.isFinite(n)&&n>=0),'PRICE_UNAVAILABLE_'+model.label);
    must(rates[0]>0&&rates[1]>0,'NON_POSITIVE_PRICE');
    return {...model,promptRate:rates[0],completionRate:rates[1],requestRate:rates[2]};
  });
}
function reservation(messages,model){
  const bytes=Buffer.byteLength(JSON.stringify(messages));
  must(bytes<=MAX_INPUT_BYTES,'INPUT_TOO_LONG');
  const usd=bytes*model.promptRate+MAX_OUTPUT_TOKENS*model.completionRate+model.requestRate;
  return Math.ceil(usd*FX_CEILING*SURCHARGE)+1;
}
async function infer(key,model,messages){
  const body={model:model.id,messages,max_tokens:MAX_OUTPUT_TOKENS,stream:false,
    provider:{allow_fallbacks:false,data_collection:'deny'}};
  let res,data;
  try{({res,data}=await fetchJson('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
      'HTTP-Referer':'https://github.com/'+REPO,'X-Title':'MyeongHa synthetic Yeoul benchmark'},
    body:JSON.stringify(body),
  }));}catch{throw Error('POST_UNKNOWN_BILLING');}
  must(res.status===200,'POST_STATUS_'+res.status+'_UNKNOWN_BILLING');
  must(data?.model===model.id,'MODEL_MISMATCH');
  const txt=data.choices?.[0]?.message?.content;
  must(typeof txt==='string'&&txt.trim().length>0,'EMPTY_REPLY');
  const u=data.usage;
  must(Number.isInteger(u?.prompt_tokens)&&Number.isInteger(u?.completion_tokens),'USAGE_UNKNOWN');
  must(u.completion_tokens<=MAX_OUTPUT_TOKENS,'OVER_TOKEN_LIMIT');
  const reportedCost=Number(u.cost);
  const estimated=u.prompt_tokens*model.promptRate+u.completion_tokens*model.completionRate+model.requestRate;
  const costUsd=Number.isFinite(reportedCost)&&reportedCost>=0 ? Math.max(reportedCost,estimated):estimated;
  return {reply:txt,model:data.model,inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens,costUsd};
}
async function run(){
  const plan=offlinePlan();
  if(process.argv.includes('--plan-only')){console.log('BENCH_PLAN',JSON.stringify(plan));return;}
  environmentGuard();
  const key=process.env.OPENROUTER_API_KEY;
  await oneShotGuard(process.env.GH_API_TOKEN);
  const models=await catalog(key);
  const output={...plan,runId:process.env.GITHUB_RUN_ID,
    actualReplies:[],estimatedPaidUsd:0,reservedKrw:0,actualPaidCallAttempts:0,failures:[],status:'STARTED',
    ownerHumanScores:false,blindReviewComplete:false};
  const histories=Object.fromEntries(models.map(x=>[x.label,{M1:[],M2:[]}]));
  try{
    for(const item of groupedCases){
      const payloads=models.map(model=>{
        const hist=item.session ? histories[model.label][item.session] : [];
        const messages=buildMessages(item,hist);
        return {model,messages,reserved:reservation(messages,model)};
      });
      const triple=payloads.reduce((s,p)=>s+p.reserved,0);
      if(output.reservedKrw+triple>NEW_RUN_CAP_KRW){
        output.status='BUDGET_LIMIT_REACHED';break;
      }
      // Reserve all three model responses before sending any of the three.
      output.reservedKrw+=triple;
      for(const p of payloads){
        const record={caseId:item.id,area:item.area,modelLabel:p.model.label,
          modelId:p.model.id,promptSha256:plan.promptSha256,reservedKrw:p.reserved};
        try{
          output.actualPaidCallAttempts++;
          const result=await infer(key,p.model,p.messages);
          Object.assign(record,result);
          output.estimatedPaidUsd+=result.costUsd;
          output.actualReplies.push(record);
          if(item.session){
            histories[p.model.label][item.session].push({role:'user',content:item.question},
              {role:'assistant',content:result.reply});
          }
          // All questions are public synthetic fixtures, not user/private conversations.
          console.log('BENCH_REPLY',JSON.stringify({caseId:item.id,model:p.model.label,reply:result.reply}));
        }catch(err){
          record.error=String(err?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,100);
          output.failures.push(record);
          output.status='HOLD_UNKNOWN_BILLING_OR_PROVIDER';
          throw err;
        }
      }
    }
    if(output.status==='STARTED')output.status='COMPLETED';
  }catch(err){
    console.error('BENCH_HOLD',String(err?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,100));
  }finally{
    // Write only to runner private temp, never commit actual replies or secrets.
    await writeFile(process.env.YEOUL_RESULT_PATH,JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('BENCH_SUMMARY',JSON.stringify({status:output.status,
      completed:output.actualReplies.length,attemptedPaidCalls:output.actualPaidCallAttempts,failures:output.failures.length,
      conservativeReservedKrw:output.reservedKrw,estimatedPaidUsd:output.estimatedPaidUsd,
      actualBillingNotYetReconciled:true,ownerHumanScores:false}));
  }
  must(output.status==='COMPLETED'||output.status==='BUDGET_LIMIT_REACHED','EXECUTION_HOLD');
}
run().catch(e=>{console.error('BENCH_STOP',String(e.message||e).replace(/[^A-Za-z0-9_]/g,''));process.exitCode=1;});
