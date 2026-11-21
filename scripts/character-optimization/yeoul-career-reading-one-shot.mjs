/** Research only. Requires an independently issued, sanitized official career Reading. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
const MODEL='deepseek/deepseek-v4.1-flash-1017';
const CHAPTERS=[
 '나는 어떤 방식으로 일하는 사람인가',
 '내가 가진 직업적 무기',
 '나에게 맞는 일과 환경',
 '내 발목을 잡는 것들',
 '내 커리어의 흐름',
 '나의 커리어를 종합하면',
];
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
const bad=(m)=>{throw Error(m)};
export function validateSource(s){
 const issued=s?.sourceKind==='issued_official_saju_reading'&&['delivered','delivered_with_fallback'].includes(s.state);
 const research=s?.sourceKind==='saju_engine_derived_research_only'&&s.state==='research_only'&&s.productionIssuance===false&&/^[a-f0-9]{64}$/i.test(s.officialReportHash??'');
 if(!isObject(s)||!(issued||research)||s.domain!=='career'||typeof s.readingId!=='string'||!s.readingId.trim()||!Array.isArray(s.evidence)||s.evidence.length<3||!Array.isArray(s.limitations))bad('AUTHORIZED_SOURCE_KIND_REQUIRED');
 const ids=new Set();
 for(const e of s.evidence){
  if(!isObject(e)||typeof e.id!=='string'||!/^[A-Za-z0-9_-]{3,64}$/.test(e.id)||ids.has(e.id)||typeof e.text!=='string'||e.text.trim().length<20||e.text.length>2200||typeof e.origin!=='string'||!e.origin.trim())bad('INVALID_SOURCE_EVIDENCE');
  ids.add(e.id);
 }
 if(s.evidence.length>60||s.limitations.some(x=>typeof x!=='string')||JSON.stringify(s).length>100000)bad('SOURCE_LIMIT_EXCEEDED');
 return s;
}
export function validateDraft(s,raw){
 if(!isObject(raw)||!Array.isArray(raw.chapters)||raw.chapters.length!==6)bad('SIX_CHAPTERS_REQUIRED');
 const known=new Set(s.evidence.map(e=>e.id));let length=0;
 for(let i=0;i<6;i++){
  const c=raw.chapters[i];
  if(!isObject(c)||c.index!==i+1||c.title!==CHAPTERS[i]||typeof c.body!=='string'||c.body.trim().length<150||!Array.isArray(c.evidenceIds)||c.evidenceIds.length<1||c.evidenceIds.some(id=>!known.has(id)))bad('INVALID_CHAPTER_'+(i+1));
  length+=c.body.length;
 }
 if(length<3000||length>10000)bad('MANUAL_REVIEW_REQUIRED_LENGTH_'+length);
 return {chapters:raw.chapters,bodyCharacters:length};
}
export function makeMessages(s){
 const system=[
 '당신은 24세 성인 여성 여울이다. 새침하고 자존심이 세며, 눈치가 빠르고 은근히 놀리지만 관심을 행동으로 먼저 드러낸다.',
 '말은 조금 툭 쏘지만 실제로는 상대를 신경 쓴다. 자연스러운 한국어 존댓말로 말한다. 전문 상담사, 작위적인 츤데레, 교훈적인 AI 해설자가 되지 않는다.',
 '사용자의 실제 생활사·관계·경험을 아는 척하지 않는다. 독자가 말하지 않은 직장 이력은 지어내지 않는다.',
 '오직 제공된 공식 사주 근거를 해설한다. 명식 계산·새로운 운세·직업 추천·연도별 예언을 창작하지 않는다.',
 '사주 근거를 그대로 나열하지 말고 여울 특유의 반응, 짓궂은 관찰, 현실적인 대비가 살아 있는 개인화 해설서 본문 전체를 작성한다.',
 '여섯 장의 고정 제목을 지키고 각 장은 근거를 설명하면서 읽을 맛이 있어야 한다. 별도 한마디 코너나 반복적인 말버릇은 필요 없다.',
 '독자에게 사실인 것처럼 구체적 과거 사례를 단정하지 않는다. 사례는 가능성을 설명하는 가정으로만 사용한다.',
 '직업 성향과 연도별·월별 시기 근거를 구분하여 해설한다. 연도별 근거가 있을 경우 5장에서 실제 연도를 명시하고 연도 간 차이를 구체적으로 비교한다. 월별 근거는 해당 기간을 실제로 적어 변화 지점을 알려준다.',
 '대운 구간의 시작·종료일은 계산 사실로 소개할 수 있지만, 대운 자체의 좋고 나쁨, 취업·승진·퇴사·이직 결과나 시기를 단정해서는 안 된다. 연구용 연·월운 또한 특정 사건 예측이 아니라 업무상의 주제와 대응 조건만 다룬다.',
 '같은 직업 성향을 여섯 장에 복제하지 않는다. 각 장마다 새로운 근거, 다른 관찰, 시기별 대조, 실천적인 판단 기준을 제시한다.',
 '결과는 JSON 객체 하나만 출력: {"chapters":[{"index":1,"title":"고정 제목","body":"본문","evidenceIds":["근거 id"]},...]}.',
 ].join('\n');
 return [{role:'system',content:system},{role:'user',content:JSON.stringify({goal:'여울의 직업·커리어 개인화 사주 해설서. 6장 전체 5000~8000자 목표(반복으로 채우지 않기).',titles:CHAPTERS,sourceMaterial:{readingId:s.readingId,sourceKind:s.sourceKind,state:s.state,domain:s.domain,productionIssuance:s.productionIssuance??null,evidence:s.evidence,limitations:s.limitations}},null,2)}];
}
export function buildPlan(s){
 const source=validateSource(s);return {type:'DEEPSEEK_ONE_SHOT_RESEARCH',model:MODEL,sourceKind:source.sourceKind,productionIssuance:source.sourceKind==='issued_official_saju_reading',sourceHash:sha(source),sourceReadingId:source.readingId,evidenceCount:source.evidence.length,chapters:CHAPTERS,requestedCalls:1,officialWriterCalls:0,productionEnabled:false};
}
async function main(){
 const opts=process.argv.slice(2);
 const arg=name=>{const i=opts.indexOf(name);return i<0?null:opts[i+1]};
 const sourcePath=arg('--source');if(!sourcePath)bad('USAGE: --source PATH [--plan-only] [--live --approval-file PATH --out PATH]');
 const source=validateSource(JSON.parse(readFileSync(resolve(sourcePath),'utf8'))),plan=buildPlan(source);
 if(!opts.includes('--live')){console.log(JSON.stringify({...plan,status:'PLAN_ONLY_NO_API_CALL'},null,2));return;}
 const approval=arg('--approval-file'),out=arg('--out');if(!approval||!out)bad('APPROVAL_AND_OUTPUT_REQUIRED');
 const a=JSON.parse(readFileSync(resolve(approval),'utf8'));
 if(!isObject(a)||a.experiment!=='yeoul-career-one-shot'||a.readingHash!==plan.sourceHash||a.model!==MODEL||a.maxUsd<=0||!Number.isFinite(a.maxUsd)||a.maxUsd>1||a.approved!==true)bad('SPECIFIC_PAID_APPROVAL_REQUIRED');
 if(process.env.YEOUL_READING_PAID_APPROVAL!=='true')bad('OWNER_PAID_APPROVAL_REQUIRED');
 if(process.env.GITHUB_ACTIONS)bad('LOCAL_ONLY_PRIVATE_INPUT');
 const key=process.env.OPENROUTER_API_KEY;if(!key?.startsWith('sk-or-v1-'))bad('OPENROUTER_KEY_MISSING');
 const output=resolve(out);mkdirSync(dirname(output),{recursive:true});
 const maxOutputTokens=14000, maxInputTokens=22000;
 // Fail closed unless caller supplies currently verified, conservative per-million prices.
 const inRate=Number(a.inputUsdPerMillion),outRate=Number(a.outputUsdPerMillion);
 if(!(inRate>0&&outRate>0))bad('VERIFIED_PRICES_REQUIRED');
 const worst=(maxInputTokens*inRate+maxOutputTokens*outRate)/1e6;
 if(worst>a.maxUsd)bad('BUDGET_WORST_CASE_EXCEEDS_APPROVAL');
 const lock=output+'.lock';
 const journal=output+'.journal.json';
 const mark=(status,additional={})=>writeFileSync(journal,JSON.stringify({status,at:new Date().toISOString(),model:MODEL,sourceHash:plan.sourceHash,...additional},null,2)+'\n',{mode:0o600});
 writeFileSync(lock,JSON.stringify({model:MODEL,sourceHash:plan.sourceHash,approvedBudgetUsd:a.maxUsd,created:new Date().toISOString()}),{flag:'wx',mode:0o600});
 mark('STARTED');
 const headers={Authorization:'Bearer '+key};
 const models=await fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(20000)});
 if(!models.ok||!(await models.json()).data?.some(m=>m.id===MODEL))bad('MODEL_NOT_AVAILABLE');
 mark('MODEL_REQUEST_STARTED');
 const resp=await fetch('https://openrouter.ai/api/v1/chat/completions',{ 
  method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),
  headers:{...headers,'Content-Type':'application/json','HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul Career Reading One Shot Research'},
  body:JSON.stringify({model:MODEL,messages:makeMessages(source),max_completion_tokens:maxOutputTokens,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
 });
 if(!resp.ok){mark('MODEL_HTTP_ERROR',{httpStatus:resp.status});bad('MODEL_HTTP_'+resp.status)}
 const data=await resp.json();
 mark('MODEL_RESPONSE_RECEIVED',{responseModel:data.model??null,finishReason:data.choices?.[0]?.finish_reason??null,usage:data.usage??null});
 writeFileSync(output+'.raw-response.json',JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 const result={...plan,status:'REVIEW_REQUIRED',finishReason:data.choices?.[0]?.finish_reason??null,usage:data.usage??null,budgetCapUsd:a.maxUsd};
 if(![MODEL,'deepseek-v4.1-flash-1017'].includes(data.model)||result.finishReason!=='stop'||!data.usage)bad('UNVERIFIED_MODEL_OR_TRUNCATED_RESPONSE');
 const content=data.choices?.[0]?.message?.content;if(typeof content!=='string')bad('EMPTY_RESPONSE');
 let parsed;try{parsed=JSON.parse(content.replace(/^\x60\x60\x60(?:json)?\s*/,'').replace(/\s*\x60\x60\x60$/,''))}catch{parsed=null}
 try{const draft=validateDraft(source,parsed);Object.assign(result,{draft,structurallyValid:true});}
 catch(err){Object.assign(result,{rawContent:content,structurallyValid:false,validationError:String(err.message)});}
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 mark('RESULT_SAVED',{structurallyValid:result.structurallyValid,bodyCharacters:result.draft?.bodyCharacters??null});
 console.log(JSON.stringify({status:result.status,output,structurallyValid:result.structurallyValid,bodyCharacters:result.draft?.bodyCharacters??null,sourceHash:plan.sourceHash}));
}
if(process.argv[1]&&import.meta.url===new URL('file:///'+resolve(process.argv[1]).replaceAll('\\','/')).href)main().catch(e=>{console.error(String(e.message||e));process.exitCode=1});
