import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const [sourcePath,outputPath,stage]=process.argv.slice(2);
if(!sourcePath||!outputPath||!['claude','deepseek'].includes(stage))throw Error('Usage: node script.mjs SOURCE OUT claude|deepseek');
const source=JSON.parse(readFileSync(resolve(sourcePath),'utf8'));
if(source.sourceKind!=='saju_engine_derived_research_only'||source.productionIssuance!==false||source.evidence?.length!==32)throw Error('RESEARCH_SOURCE_MISMATCH');
const hash=createHash('sha256').update(JSON.stringify(source)).digest('hex');
const out=resolve(outputPath);mkdirSync(dirname(out),{recursive:true});
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const MODEL=stage==='claude'?'anthropic/claude-sonnet-4.6':'deepseek/deepseek-v4.1-flash-1017';
const headers={Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul Claude DeepSeek Research'};
const maxOutput=stage==='claude'?8500:14500,maxInput=stage==='claude'?17000:24000,maxBudget=stage==='claude'?.28:.06;
if(existsSync(out)||existsSync(out+'.lock'))throw Error('EXISTING_OUTPUT_OR_LOCK_NO_DUPLICATE_PAID_CALL');
const modelResp=await fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(25000)});
if(!modelResp.ok)throw Error('MODEL_DIRECTORY_HTTP_'+modelResp.status);
const metadata=(await modelResp.json()).data.find(x=>x.id===MODEL);
if(!metadata)throw Error('MODEL_NOT_AVAILABLE_'+MODEL);
const inRate=Number(metadata.pricing?.prompt),outRate=Number(metadata.pricing?.completion);
const estimatedWorst=maxInput*inRate+maxOutput*outRate;
if(!(inRate>0&&outRate>0)||estimatedWorst>maxBudget)throw Error('MODEL_PRICING_BUDGET_EXCEEDED_'+estimatedWorst);
let system,user,claude=null,claudePath=null;
if(stage==='claude'){
 system=`당신은 한국어 문학 에디터이자 캐릭터 작가입니다. 24세 여성 '여울'이 직접 들려주는 개인화 직업·커리어 사주 해설서 6장을 작성합니다.
이 글은 상담 보고서가 아니고 대화의 온도와 문학적 서사를 가진 해설서입니다. 여울은 눈치 빠르고 새침하며 약간 짓궂지만, 독자의 약점을 건드릴 때는 배려합니다. 전문 상담사식 정의·논문·지침·메모·명식 분석 소개가 아닙니다. 정중한 한국어 존댓말로, 친근하지만 선을 지키고 오글거리지 않습니다.
이런 태도의 예: "아니, 규칙을 좋아한다면서요. 근데 그걸 그냥 두진 못하겠다는 거잖아요. 꽤 피곤하겠는데요?" / "무기라는 말 듣고 칭찬 나올 줄 알았죠? 좀 아쉽게 됐네요." / "잘할 수 있다는 것과 내가 맡아야 한다는 건 다른 말이에요." 이는 문체 참고로만 사용하고 실제 문장을 복제하지 않습니다.
각 장에는 한 가지 개인적인 모순·발견을 중심으로 서사가 전개되고, 때때로 독자의 반응을 상상하며 짧게 놀리거나 조심스럽게 걱정합니다. 글의 첫 문장에서 핵심 발견을 제시하고, 원인과 선택의 결과를 풀고, 마지막에는 여울다운 한 마디로 남깁니다. 매 문장마다 야단치거나 질문으로 끝내지 않습니다. 원국을 핑계로 독자의 실제 과거 경험을 아는 척하지 않습니다.
6개 장의 제목은 정확히 유지합니다: 1 나는 어떤 방식으로 일하는 사람인가; 2 내가 가진 직업적 무기; 3 나에게 맞는 일과 환경; 4 내 발목을 잡는 것들; 5 내 커리어의 흐름; 6 나의 커리어를 종합하면.
사주 엔진 근거 32개를 유일한 명리적 사실로 사용합니다. 신비한 사건이나 명식의 확인되지 않은 길흉을 지어내지 않습니다. 숫자 32개를 텍스트 전부에 되풀이하지 말고 각 장에 의미 있는 것을 선별합니다. 특정 직업·취업·승진·해고·이직·돈을 단정하지 않습니다.
5장은 2026~2030년의 연도별 차이를 빠짐없이 다루고 2026-11~2027-04의 월별 흐름을 절입 전후 구분이 필요한 곳에서 설명합니다. 시기의 변화를 이야기로 엮되 달별 로그를 낭독하는 느낌은 피합니다. 대운은 계산상 날짜 경계로만 언급하고 좋고 나쁨을 창작하지 않습니다.
타고난 성향의 문장을 세 장에서 반복해서 분량을 채우지 마세요. 목표는 전체 약 5500~7000자, 각 장 고유한 발견과 감정의 결말이 있어야 합니다.
반드시 JSON 객체 하나만 반환: {"chapters":[{"index":1,"title":"정확한 장 제목","body":"장 본문 (단락 구분은 \\n\\n)","evidenceIds":["natal-01"]},...6장]}. 근거 id는 입력에 존재하는 것만 쓰고 본문에서 언급한 모든 실질 명리 주제에는 상응하는 id가 있어야 합니다.`;
 user=JSON.stringify({project:'명하 여울 해설서',case:'synthetic research; not an official issuance',evidence:source.evidence,limitations:source.limitations});
}else{
 claudePath=out.replace(/\.deepseek-review(?:-retry)?\.json$/u,'.claude-draft.json');
 if(!existsSync(claudePath))throw Error('CLAUDE_DRAFT_NOT_FOUND_'+claudePath);
 claude=JSON.parse(readFileSync(claudePath,'utf8'));
 if(claude.status!=='CLAUDE_DRAFT_SAVED'||claude.sourceHash!==hash||claude.chapters?.length!==6)throw Error('CLAUDE_DRAFT_NOT_READY');
 system=`당신은 명하 Saju 해설의 명리 근거 감수자 DeepSeek입니다. 당신의 임무는 Claude가 작성한 여울의 해설서 6장을 엄격하게 검토하고 각 장을 보완할 수 있는 근거 설명을 제공하는 것입니다.
본문을 다시 쓰거나 캐릭터 말투를 변경하지 마십시오. 절대로 6장 본문을 새로 생성하지 마십시오. 근거 자료에 없는 주장, 연도·월 오류, 절입 전후 혼동, 대운의 임의 길흉 판단, 독자 과거 사건 단정 등을 구체적으로 지적하세요.
각 장의 진짜 강점을 설명할 때는 실제 id를 명시하여 간결한 '명리 근거 풀이' 텍스트를 작성하세요(100~220자). 여기서 학술 용어를 남발하지 말고 독자가 왜 이런 이야기가 나온 것인지 쉽게 이해하게 하세요. 5장은 연도 구분과 월별 절입 구간이 근거와 일치하는지 우선 검토합니다.
JSON만 반환 {"reviews":[{"index":1,"evidenceIds":["..."],"explanation":"근거 풀이","issues":[{"quote":"본문 원문 짧은 구절","problem":"이유","suggestedCorrection":"수정 권고"}],"status":"PASS|REVIEW"}...6개],"overall":"총평","mayPublish":false}. explanation에서 새로운 예언을 만들지 않습니다. 원문은 절대로 덮어쓰지 않습니다.`;
 user=JSON.stringify({originalSource:source.evidence,limitations:source.limitations,claudeDraft:claude.chapters});
}
const journal=out+'.journal.json';
const mark=(status,add={})=>writeFileSync(journal,JSON.stringify({status,model:MODEL,sourceHash:hash,at:new Date().toISOString(),...add},null,2),'utf8');
writeFileSync(out+'.lock',JSON.stringify({stage,model:MODEL,sourceHash:hash,estimatedWorst,maxBudget,at:new Date().toISOString()}),{flag:'wx'});
mark('REQUEST_STARTED',{estimatedWorst,maxBudget});
const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers,signal:AbortSignal.timeout(240000),body:JSON.stringify({model:MODEL,messages:[{role:'system',content:system},{role:'user',content:user}],max_completion_tokens:maxOutput,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}})});
if(!response.ok){mark('HTTP_ERROR',{httpStatus:response.status});throw Error('MODEL_HTTP_'+response.status)}
const data=await response.json();mark('RESPONSE_RECEIVED',{responseModel:data.model??null,usage:data.usage??null,finishReason:data.choices?.[0]?.finish_reason??null});
writeFileSync(out+'.raw-response.json',JSON.stringify(data,null,2),{flag:'wx'});
const raw=data.choices?.[0]?.message?.content??'';
let parsed;try{parsed=JSON.parse(raw.replace(/^\x60\x60\x60(?:json)?\s*/u,'').replace(/\s*\x60\x60\x60$/u,''))}catch{parsed=null}
let payload={stage,sourceHash:hash,model:MODEL,usage:data.usage??null,finishReason:data.choices?.[0]?.finish_reason??null,status:'REVIEW_REQUIRED',rawContent:raw,parsed};
const titles=['나는 어떤 방식으로 일하는 사람인가','내가 가진 직업적 무기','나에게 맞는 일과 환경','내 발목을 잡는 것들','내 커리어의 흐름','나의 커리어를 종합하면'];
const allowed=new Set(source.evidence.map(x=>x.id));
if(stage==='claude'&&Array.isArray(parsed?.chapters)&&parsed.chapters.length===6){
 const valid=parsed.chapters.every((c,i)=>c.index===i+1&&c.title===titles[i]&&typeof c.body==='string'&&c.body.length>200&&Array.isArray(c.evidenceIds)&&c.evidenceIds.length>0&&c.evidenceIds.every(id=>allowed.has(id)));
 if(valid){payload={...payload,status:'CLAUDE_DRAFT_SAVED',chapters:parsed.chapters,bodyCharacters:parsed.chapters.reduce((a,c)=>a+c.body.length,0)};delete payload.rawContent}
}else if(stage==='deepseek'&&Array.isArray(parsed?.reviews)&&parsed.reviews.length===6){
 const valid=parsed.reviews.every((r,i)=>r.index===i+1&&typeof r.explanation==='string'&&Array.isArray(r.issues)&&Array.isArray(r.evidenceIds)&&r.evidenceIds.every(id=>allowed.has(id)));
 if(valid){payload={...payload,status:'DEEPSEEK_REVIEW_SAVED',reviews:parsed.reviews,overall:parsed.overall,mayPublish:false,claudeFile:claudePath};delete payload.rawContent}
}
writeFileSync(out,JSON.stringify(payload,null,2)+'\n',{flag:'wx'});mark(payload.status,{usage:data.usage,bodyCharacters:payload.bodyCharacters??null});
console.log(JSON.stringify({status:payload.status,model:MODEL,characters:payload.bodyCharacters,usageCost:data.usage?.cost,output:out}));
