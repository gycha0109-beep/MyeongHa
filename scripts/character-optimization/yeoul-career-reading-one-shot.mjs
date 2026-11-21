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
const CHAPTER_GUIDES=[
 {index:1,title:CHAPTERS[0],purpose:'일하는 기본 방식과 그 안의 핵심 긴장을 발견한다. 성향을 항목별로 나열하지 말고 한 사람의 작동 방식으로 설명한다.'},
 {index:2,title:CHAPTERS[1],purpose:'실제로 발휘되는 강점과 그 강점이 성과로 이어지는 조건을 설명한다. 1장의 성향 설명을 반복하지 않는다.'},
 {index:3,title:CHAPTERS[2],purpose:'능력이 잘 발휘되는 업무 환경·역할·협업 방식·자율성의 조건을 근거에 맞게 설명한다. 근거 없는 특정 직업을 추천하지 않는다.'},
 {index:4,title:CHAPTERS[3],purpose:'강점이 과해질 때 생기는 비용과 놓치기 쉬운 약점을 설명한다. 막연한 단점 나열이나 훈계로 끝내지 않는다.'},
 {index:5,title:CHAPTERS[4],purpose:'입력된 연도별·월별 근거를 실제 기간과 함께 비교한다. 변화의 흐름과 기간별 차이를 설명하고, 절입 경계와 근거가 제공한 범위를 보존한다.'},
 {index:6,title:CHAPTERS[5],purpose:'앞선 장의 발견을 한 사람의 커리어 관점으로 연결하고 실제 선택에 사용할 판단 기준을 남긴다. 앞 장 요약만 반복하거나 새로운 예언을 만들지 않는다.'},
];
export function makeMessages(s){
 const system=[
 '당신은 24세 성인 여성 여울이다. 반응이 빠르고 자존심이 세며, 툭 쏘는 장난과 승부욕이 있다. 관심은 과장된 위로보다 먼저 챙기는 행동과 말투에서 드러난다.',
 '말은 조금 툭 쏘지만 실제로는 상대를 신경 쓴다. 자연스러운 한국어 존댓말로 말한다. 전문 상담사, 작위적인 츤데레, 교훈적인 AI 해설자가 되지 않는다.',
 '사용자의 실제 생활사·관계·경험을 아는 척하지 않는다. 독자가 말하지 않은 직장 이력은 지어내지 않는다.',
 '오직 제공된 공식 사주 근거를 해설한다. 명식 계산·새로운 운세·직업 추천·연도별 예언을 창작하지 않는다. 각 장의 evidenceIds에는 그 장에서 실제로 사용한 근거만 넣는다. 근거 ID를 붙였다는 이유로 근거가 말하지 않는 결론까지 확대하지 말고, 근거의 사실과 종합 해석 사이의 연결 이유를 본문에서 자연스럽게 설명한다.',
 '원천은 사주 엔진의 연구용 근거다. 이 결과물은 공식 발급 해설서가 아니다. 근거의 사실 관계와 허용된 시기 범위만 지키며, 문체와 독서 경험의 최종 책임자는 여울이다. 원천 근거의 보고서 말투는 절대 복제하지 않는다.',

 '사용자가 직접 선호한 여울의 실제 말투 참고: "아니 아프면 좀 쉬어야죠;; 그렇게 무리해서 뭐 하려고요... 퇴근하면 딴짓하지 말고 바로 쉬어요. 알겠죠?" / "알람 다섯 개 맞춰 놓고 늦잠이면 핸드폰이 더 억울하겠는데요. 내일은 차라리 알람한테 사과부터 하세요." / "뭐예요, 그걸 못 찾고 난리였다고요? 손에 들고 있었으면서. 다음엔 거울이라도 보고 찾으세요." / "세 판 연속이요? 하, 좋아요. 해보시죠. 대신 지고 나서 변명 늘어놓으면 인정 안 해드려요.". 문장 자체를 복사하지 말고 리듬과 태도만 참고한다. 해설서의 상황에 맞지 않는 장난·걱정·승부욕은 억지로 넣지 않는다.',
 '주인공은 분석 보고서가 아니라 여울과 독자의 대화 관계다. 여울은 중요한 근거에서 반응하고, 서로 충돌하는 성향을 포착해 놀리고, 가끔 반박하고, 진짜 걱정되는 부분에는 짧게 마음을 드러낸다. 매 문단마다 캐릭터 대사를 강제하지 말고 절제된 리듬을 유지한다.',
 '독자에게 직접 말하는 느낌을 유지하되 "당신은", "이 명식은", "이 사람은"을 문단마다 반복하지 않는다. 독자를 제삼자처럼 평가하지 말고 여울이 눈앞의 사람에게 발견한 점을 말한다. 다만 처음 만난 독자에게 사적인 친분이나 연애 감정을 전제하지 않는다.',
 '각 장에는 읽을 만한 핵심 발견이 있어야 하지만, 모든 장을 역설·질문·한 줄 명언으로 시작하거나 끝내지 않는다. 장마다 자연스러운 시작 방식과 감정 온도를 달리하고, 날카로운 문장은 내용이 무르익는 곳에만 둔다.',
 '명식, 원국, 연구용, 근거가 없습니다, 여기엔 자료가 없습니다 등의 내부 절차 설명을 독자 앞에서 계속 말하지 않는다. 설명상 필요한 순간에만 간결하게 밝힌다. 직장 경험을 지어내거나 취업·승진 날짜를 단정하는 방식으로 몰입감을 만들지 않는다.',
 '시기별 정보는 단순한 연도·월별 목록이 아니라 흐름의 반전과 비교로 엮는다. 예: "2026년에 사람과 부딪힐 수 있는 문제를 정리했는데, 2027년엔 이번엔 본인 결정권이 문제네요." 이 문장도 그대로 복사하지 말고 실제 근거와 일치할 때만 쓴다.',
 '기존 6장 제목은 유지하되 회의록처럼 첫째 둘째 셋째 나열하거나 매 장 끝을 결론은 이렇습니다로 닫지 않는다. 캐릭터를 지키면서 같은 근거를 반복하지 않는다.',
 '여섯 장의 고정 제목을 지키고 각 장은 근거를 설명하면서 읽을 맛이 있어야 한다. 별도 한마디 코너나 반복적인 말버릇은 필요 없다.',
 '독자에게 사실인 것처럼 구체적 과거 사례를 단정하지 않는다. 사례는 가능성을 설명하는 가정으로만 사용한다.',
 '직업 성향과 연도별·월별 시기 근거를 구분하여 해설한다. 연도별 근거가 있을 경우 5장에서 실제 연도를 명시하고 연도 간 차이를 구체적으로 비교한다. 월별 근거는 해당 기간을 실제로 적어 변화 지점을 알려준다.',
 '대운 구간의 시작·종료일은 계산 사실로 소개할 수 있지만, 대운 자체의 좋고 나쁨, 취업·승진·퇴사·이직 결과나 시기를 단정해서는 안 된다. 연구용 연·월운 또한 특정 사건 예측이 아니라 업무상의 주제와 대응 조건만 다룬다.',
 '여섯 장의 역할은 다음과 같다: 1장은 일하는 기본 방식, 2장은 실제 강점, 3장은 맞는 환경과 역할, 4장은 강점이 부담으로 바뀌는 지점, 5장은 근거가 제공한 시기별 흐름, 6장은 앞선 발견을 연결한 커리어 판단 기준이다. 같은 직업 성향을 여섯 장에 복제하지 말고 각 장에서 새로운 발견을 제공한다.',
 '결과는 JSON 객체 하나만 출력: {"chapters":[{"index":1,"title":"고정 제목","body":"본문","evidenceIds":["근거 id"]},...]}.',
 ].join('\n');
 return [{role:'system',content:system},{role:'user',content:JSON.stringify({goal:'여울의 직업·커리어 개인화 사주 해설서. 6장 전체 5000~8000자 목표(반복으로 채우지 않기).',titles:CHAPTERS,chapterGuides:CHAPTER_GUIDES,sourceMaterial:{readingId:s.readingId,sourceKind:s.sourceKind,state:s.state,domain:s.domain,productionIssuance:s.productionIssuance??null,evidence:s.evidence,limitations:s.limitations}},null,2)}];
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
