import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileYeoulCompactEverydayV4,assessYeoulCompactEverydayV4} from './yeoul-compact-everyday-v4.mjs';

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const privateDir=join(process.env.USERPROFILE||'','Documents','MyeongHa-Yeoul-AB-Results','compact-everyday-v4-20261118');
const load=rel=>readFileSync(join(repo,rel),'utf8');
const plan=compileYeoulCompactEverydayV4({
  bibleMarkdown:load('docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md'),
  runtimeMarkdown:load('docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),
});
const previousCapKrw=481,globalCapKrw=500;
const hold=(message)=>{throw Error('YEOUL_COMPACT_V4_HOLD_'+message);};
const ensure=(condition,code)=>{if(!condition)hold(code);};
const get=async(url,opts={})=>fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),...opts});
function localKey(){
  const envFile=join(process.env.USERPROFILE||'','Documents','MyeongHa','.env');
  const line=process.env.OPENROUTER_API_KEY?null:
    readFileSync(envFile,'utf8').split(/\r?\n/).find(x=>/^\s*OPENROUTER_API_KEY\s*=/.test(x));
  const key=process.env.OPENROUTER_API_KEY||line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
  ensure(/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(key||''),'EXISTING_KEY');
  return key;
}
async function preflight(key){
  const authentication=await get('https://openrouter.ai/api/v1/auth/key',{
    headers:{Authorization:'Bearer '+key}});
  ensure(authentication.status===200,'AUTH_'+authentication.status);
  const auth=await authentication.json();
  const model=await get('https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints');
  ensure(model.status===200,'MODEL_PRICE_'+model.status);
  const rows=(await model.json())?.data?.endpoints;
  ensure(Array.isArray(rows)&&rows.length>0,'MODEL_UNAVAILABLE');
  let promptCost=0,completionCost=0;
  for(const item of rows){
    const p=Number(item.pricing?.prompt),c=Number(item.pricing?.completion);
    ensure(Number.isFinite(p)&&p>=0&&Number.isFinite(c)&&c>=0,'PRICE_UNVERIFIED');
    promptCost=Math.max(promptCost,p);completionCost=Math.max(completionCost,c);
  }
  const usdWorst=plan.inputBytes*promptCost+plan.maxTokens*completionCost;
  const krwWorst=Math.ceil(usdWorst*3000*2)+10;
  ensure(previousCapKrw+krwWorst<=globalCapKrw,'KRW500_CAP');
  const balance=Number(auth?.data?.limit_remaining);
  if(Number.isFinite(balance)&&auth?.data?.limit_remaining!==null)
    ensure(balance>=usdWorst,'CREDIT_TOO_LOW');
  return {usdWorst,krwWorst,source:plan.sourceHashes,providerCount:rows.length,inputBytes:plan.inputBytes,maxTokens:plan.maxTokens};
}
function save(data){writeFileSync(join(privateDir,'actual-report.json'),JSON.stringify(data,null,2)+'\n',{mode:0o600});}
async function main(){
  if(!process.argv.includes('--execute')){
    console.log('COMPACT_V4_DRY_RUN',JSON.stringify({count:plan.questions.length,inputBytes:plan.inputBytes,maxTokens:plan.maxTokens,
      model:plan.model,priorConservativeKrw:previousCapKrw,budgetKrw:globalCapKrw,billableCalls:0}));
    return;
  }
  ensure(process.argv.includes('--owner-approved-500'),'OWNER_APPROVAL_FLAG');
  ensure(!resolve(privateDir).startsWith(repo),'PRIVATE_STORAGE');
  const quote=await preflight(localKey());
  mkdirSync(privateDir,{recursive:true});
  writeFileSync(join(privateDir,'one-shot.lock'),JSON.stringify({time:new Date().toISOString(),quote,
    previousCapKrw,globalCapKrw}),{flag:'wx',mode:0o600});
  const report={status:'REQUEST_IN_FLIGHT',model:plan.model,authority:plan.authority,
    quote,previousCapKrw,globalCapKrw,questionCount:plan.questions.length};
  save(report);
  let res,body;
  try{
    res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),
      headers:{Authorization:'Bearer '+localKey(),
        'Content-Type':'application/json',
        'X-Title':'MyeongHa Yeoul compact ten synthetic prompts v4',
        'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa'},
      body:JSON.stringify({model:plan.model,messages:plan.messages,
        response_format:plan.response_format,reasoning:{effort:'low'},
        max_tokens:plan.maxTokens,stream:false}),
    });
    body=await res.json().catch(()=>null);
  }catch(e){
    report.status='HOLD_UNKNOWN_BILLING';
    report.error=String(e?.message||e).slice(0,160);
    save(report);console.log('YEOUL_V4_HOLD_UNKNOWN_BILLING');return;
  }
  report.responseId=body?.id||null;
  report.usage=body?.usage||null;
  report.modelReturned=body?.model||null;
  report.finishReason=body?.choices?.[0]?.finish_reason||null;
  if(!res.ok || body?.model!==plan.model){
    report.status='HOLD_PROVIDER_RESPONSE';
    report.httpStatus=res.status;report.providerError=body?.error?.message||null;
    save(report);console.log('YEOUL_V4_HOLD_PROVIDER',res.status);return;
  }
  const content=body?.choices?.[0]?.message?.content;
  let parsed=null;
  try{parsed=JSON.parse(content);}catch{}
  report.replies=parsed?.replies||null;
  report.assessment=assessYeoulCompactEverydayV4(parsed);
  report.questions=plan.questions;
  report.status=report.assessment.valid?'TEN_BATCHED_RESPONSES':'HOLD_INVALID_BATCH';
  save(report);
  console.log('YEOUL_V4_RESULT',JSON.stringify({status:report.status,
    validation:report.assessment,costUsd:report.usage?.cost??null,conservativeKrw:quote.krwWorst,
    localReport:join(privateDir,'actual-report.json')}));
  if(report.assessment.valid){
    for(let i=0;i<plan.questions.length;i++)
      console.log('CASE',i+1,plan.questions[i],'⇒',report.replies[i]);
  }
}
await main().catch(e=>{console.error('YEOUL_V4_HOLD',String(e?.message||e).slice(0,160));process.exitCode=1;});
