import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileYeoulPositiveVoiceV2,YEOUL_VOICE_SOURCE} from './yeoul-positive-voice-v2.mjs';

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const privateRoot=join(process.env.USERPROFILE||'','Documents','MyeongHa-Yeoul-AB-Results');
const out=join(privateRoot,'positive-voice-v2-20261118');
const cases=Object.freeze([
  ['care','오늘 기분이 좀 허전해요.'],
  ['caught','저한테 관심 있는 거 아니에요?'],
  ['baseline','그냥 재미있는 이야기 하나 해봐요.'],
]);
const priorConservativeKrw=282,overallCapKrw=500,model='openai/gpt-6-luna',maxTokens=900;
const fail=code=>{throw Error('YEOUL_LUNA_V2_HOLD_'+code);};
const assert=(ok,code)=>{if(!ok)fail(code);};
const load=rel=>readFileSync(join(repo,rel),'utf8');
const plan=cases.map(([label,text])=>({
  label,...compileYeoulPositiveVoiceV2({
    bibleMarkdown:load(YEOUL_VOICE_SOURCE.bible),
    runtimeMarkdown:load(YEOUL_VOICE_SOURCE.runtime),
    userMove:text,
  }),
}));
function keyFromPrivateEnv(){
  const local=join(process.env.USERPROFILE||'','Documents','MyeongHa','.env');
  const line=process.env.OPENROUTER_API_KEY
    ?null:readFileSync(local,'utf8').split(/\r?\n/).find(x=>/^\s*OPENROUTER_API_KEY\s*=/.test(x));
  const key=process.env.OPENROUTER_API_KEY||line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
  assert(/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(key||''),'EXISTING_OPENROUTER_KEY');
  return key;
}
const safeFetch=(url,options={})=>fetch(url,{
  redirect:'error',signal:AbortSignal.timeout(45000),...options,
});
async function preflight(key){
  const auth=await safeFetch('https://openrouter.ai/api/v1/auth/key',{
    headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  assert(auth.status===200,'READONLY_AUTH_'+auth.status);
  const balance=await auth.json();
  assert(balance?.data && typeof balance.data==='object','READONLY_AUTH_SHAPE');
  const providers=await safeFetch('https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints',{
    signal:AbortSignal.timeout(12000)});
  assert(providers.status===200,'READONLY_MODEL_'+providers.status);
  const endpoints=(await providers.json())?.data?.endpoints;
  assert(Array.isArray(endpoints)&&endpoints.length>=1,'MODEL_UNAVAILABLE');
  let maxInput=0,maxOutput=0;
  for(const e of endpoints){
    const i=Number(e.pricing?.prompt),o=Number(e.pricing?.completion);
    assert(Number.isFinite(i)&&Number.isFinite(o)&&i>=0&&o>=0,'PRICE_UNVERIFIED');
    maxInput=Math.max(maxInput,i);maxOutput=Math.max(maxOutput,o);
  }
  const maximumInputBytes=Math.max(...plan.map(x=>Buffer.byteLength(JSON.stringify(x.messages),'utf8')));
  assert(maximumInputBytes<=16000,'INPUT_TOO_LARGE');
  const usdWorst=cases.length*(maximumInputBytes*maxInput+maxTokens*maxOutput);
  const krwWorst=Math.ceil(usdWorst*3000*2)+30;
  assert(priorConservativeKrw+krwWorst<=overallCapKrw,'KRW500_LIMIT');
  if(Number.isFinite(balance.data.limit_remaining))
    assert(balance.data.limit_remaining>=usdWorst,'EXISTING_BALANCE_TOO_LOW');
  return {krwWorst,usdWorst,maximumInputBytes,providers:endpoints.length};
}
function save(report){
  writeFileSync(join(out,'actual-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
async function generate(key,entry){
  const started=Date.now();
  let response,body;
  const payload={
    model, messages:entry.messages,response_format:entry.response_format,
    reasoning:{effort:'low'},max_tokens:maxTokens,stream:false,
  };
  try{
    response=await safeFetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
        'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa',
        'X-Title':'MyeongHa Yeoul positive voice synthetic test'},
      body:JSON.stringify(payload),
    });
    body=await response.json().catch(()=>null);
  }catch(e){
    return {label:entry.label,situation:entry.situation,status:'HOLD_UNKNOWN_BILLING',
      errorType:String(e?.message||e).slice(0,120)};
  }
  if(!response.ok)return {label:entry.label,situation:entry.situation,
    status:'HOLD_HTTP_'+response.status,
    errorCode:String(body?.error?.code??''),
    errorMessage:String(body?.error?.message??'').slice(0,300),
    elapsedMs:Date.now()-started};
  const content=body?.choices?.[0]?.message?.content;
  let reply=null;
  try{reply=JSON.parse(content||'')?.reply;}catch{}
  if(typeof reply!=='string'||!reply.trim()||reply.length>1500)
    return {label:entry.label,situation:entry.situation,status:'HOLD_INVALID_JSON',
      responseId:body?.id,usage:body?.usage,elapsedMs:Date.now()-started};
  if(body?.model!==model)
    return {label:entry.label,situation:entry.situation,status:'HOLD_WRONG_MODEL',
      receivedModel:body?.model,usage:body?.usage,elapsedMs:Date.now()-started};
  return {label:entry.label,situation:entry.situation,status:'OK',
    reply:reply.trim(),model:body.model,responseId:body.id,
    usage:body.usage,elapsedMs:Date.now()-started};
}
async function main(){
  if(!process.argv.includes('--execute')){
    console.log('YEOUL_POSITIVE_VOICE_PLAN',JSON.stringify({
      cases:plan.map(x=>({label:x.label,situation:x.situation,
        userText:x.messages[1].content,systemBytes:Buffer.byteLength(x.messages[0].content,'utf8')})),
      model,authority:'DRAFT_NOT_PRODUCTION',billableCalls:0}));
    return;
  }
  assert(process.argv.includes('--owner-approved-500'),'EXPLICIT_OWNER_LIMIT_FLAG');
  assert(!resolve(out).startsWith(repo),'PRIVATE_DIRECTORY_MUST_NOT_BE_REPO');
  const key=keyFromPrivateEnv();
  const quote=await preflight(key);
  mkdirSync(out,{recursive:true});
  const lock=join(out,'one-shot.lock');
  writeFileSync(lock,JSON.stringify({startedAt:new Date().toISOString(),quote,
    previousConservativeKrw:priorConservativeKrw,capKrw:overallCapKrw}),{flag:'wx',mode:0o600});
  const report={schema:'yeoul-positive-voice-v2-synthetic-actual',source:'pinned-bible-and-runtime',
    model,capKrw:overallCapKrw,previousConservativeKrw:priorConservativeKrw,quote,
    status:'RUNNING',results:[]};
  save(report);
  for(const entry of plan){
    const response=await generate(key,entry);
    report.results.push(response);
    report.status=response.status==='OK'?'PARTIAL':'HOLD';
    save(report);
    if(response.status!=='OK'){
      console.log('YEOUL_V2_STOP',JSON.stringify({label:entry.label,status:response.status,
        errorCode:response.errorCode,errorMessage:response.errorMessage}));
      return;
    }
    console.log('YEOUL_V2_ACTUAL',JSON.stringify({label:entry.label,reply:response.reply,
      usage:response.usage?.cost??null}));
  }
  report.status='THREE_REAL_REPLIES';
  save(report);
  console.log('YEOUL_V2_COMPLETE',JSON.stringify({generated:report.results.length,
    reportedCostUsd:report.results.reduce((n,x)=>n+Number(x.usage?.cost||0),0),
    localReport:join(out,'actual-report.json')}));
}
await main().catch(e=>{console.error('YEOUL_V2_HOLD',String(e?.message||e).slice(0,130));process.exitCode=1;});
