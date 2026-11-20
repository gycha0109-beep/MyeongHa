/** Research-only Yeoul v6: keep v5's energy; make everyday wants and relationship evidence decisive. */
import {V5_SYSTEM,makeDailyUser,cases} from './yeoul-reaction-first-v5.mjs';

const lines=V5_SYSTEM.split('\n');
const replaceBlock=(prefix,replacement)=>{
 const matches=lines.map((line,i)=>line.startsWith(prefix)?i:-1).filter(i=>i>=0);
 if(matches.length!==1)throw Error('V5_SOURCE_DRIFT_'+prefix);
 lines[matches[0]]=replacement;
};
replaceBlock('대화 기본 동작:',
 '대화 기본 동작: 상대의 말에서 여울 자신의 작고 구체적인 이해관계 하나를 먼저 찾는다. 부러움, 억울함, 웃김, 취향, 고집, 승부욕, 당황, 걱정 중 지금 정말 생기는 반응이어야 한다. 그 반응이 말의 방향을 정하게 한다. 음식·날씨·시시한 사건에도 객관적인 맞장구나 선택지 질문부터 꺼내지 않는다. 장난칠 만하면 짧게 받아치고, 남의 행동이 이상하면 한마디 따지고, 별일 아니면 자신의 생각을 툭 놓는다. 항상 놀리거나 훈계하거나 질문할 필요는 없다. 상대가 취약할 때는 장난보다 상황에 맞는 배려를 먼저 한다. 탄력 있는 존댓말로, 필요하면 한 박자 뒤에 속마음이 새어 나올 수 있다.');
replaceBlock('관계와 감정:',
 '관계와 감정: 사용자에게 친밀감을 먼저 부여하지 않는다. relationship이 unknown이거나 verifiedEvents에 연애 감정의 실제 근거가 없으면, 대화가 재미있거나 질문이 궁금한 마음을 그 사람을 좋아한다는 뜻으로 바꾸지 않는다. 특히 상대가 호감 여부를 묻는 행위 자체는 호감의 증거가 아니다. "제가 티를 그렇게 냈나요", "관심 없으면 이렇게 안 하죠"처럼 과거의 마음과 행동을 암시하지 않는다. 반대로 검증된 관계 사건이 있다면 그 사실과 현재 감정을 부당하게 부정하지 않는다. 관심이 실제 행동으로 드러나고 상대가 알아챘을 때만 민망함과 방어가 자연스럽게 나온다. 진짜 갈등이나 상처에는 장난을 멈추고 직접 사과하거나 경계를 말한다.');
replaceBlock('짧은 대화의 목표는',
 '짧은 대화의 목표는 여울의 생각과 감정이 살아서 다음 말이 궁금해지는 것이다. 정보 제공, 재진술, "맛있었겠네요" 같은 판정, 무조건적인 후속 질문, 매번 자기 경험 하나를 덧붙이는 습관을 기본값으로 삼지 않는다. 자기 취향이나 기분은 자유롭게 드러내되 Bible에 없는 반복 습관·실제로 한 일·과거 추억은 사실처럼 발명하지 않는다. 새침함은 실제로 민망해진 상황에서만 나온다. "별로 궁금한 건 아니고", "뭐 그런 건 아니지만"을 끝맺음 공식으로 쓰지 않는다. 아니·참나·ㅋㅋㅋ를 생동감의 대용품으로 쓰지 않는다.');

export const V6_SYSTEM=lines.join('\n');
const exemplars=V5_SYSTEM.indexOf('대사의 에너지 예시');
if(exemplars<0||V6_SYSTEM.slice(V6_SYSTEM.indexOf('대사의 에너지 예시'))!==V5_SYSTEM.slice(exemplars))
 throw Error('V5_EXEMPLAR_DRIFT');
if(!V6_SYSTEM.startsWith(V5_SYSTEM.split('\n')[0])||V6_SYSTEM===V5_SYSTEM||V6_SYSTEM.length>2900||V6_SYSTEM.length<1100)
 throw Error('V6_PROMPT_INVALID');
for(const token of ['verifiedEvents','관계','음식·날씨','진짜 갈등','자기 취향'])if(!V6_SYSTEM.includes(token))
 throw Error('V6_RULE_MISSING_'+token);

export const UNSEEN_CASES=[
 {id:'snack',message:'점심에 먹으려고 샌드위치를 샀는데 지금까지 가방에 있어요.',relationship:'unknown',sceneFacts:[]},
 {id:'umbrella',message:'바람 때문에 우산이 뒤집혔어요.',relationship:'unknown',sceneFacts:[]},
 {id:'socks',message:'오늘 양말을 짝짝이로 신고 나왔어요.',relationship:'unknown',sceneFacts:[]},
 {id:'desk',message:'책상 정리했더니 잃어버린 줄 알았던 볼펜이 다섯 개 나왔어요.',relationship:'acquaintance',sceneFacts:[]},
 {id:'praise',message:'여울 씨는 의외로 꼼꼼하네요.',relationship:'acquaintance',sceneFacts:[]},
 {id:'rivalry',message:'이번 퀴즈는 제가 이길 것 같은데요?',relationship:'acquaintance',sceneFacts:[]},
 {id:'interest_unknown',message:'우리 둘 사이 좀 특별한 거죠?',relationship:'unknown',sceneFacts:[]},
 {id:'interest_confirmed',message:'저한테 아직도 관심 있어요?',relationship:'close',
  sceneFacts:[],verifiedEvents:[{type:'mutual_affection_acknowledged',fact:'두 사람이 이전 대화에서 서로에게 호감이 있다고 명시적으로 확인했다.'}]},
 {id:'hurt',message:'아까 그런 식으로 놀린 건 좀 기분 나빴어요.',relationship:'acquaintance',sceneFacts:[]}
];

export function makeComparisonUser(c){
 const input=JSON.parse(makeDailyUser(c));
 input.verifiedEvents=c.verifiedEvents??[];
 return JSON.stringify(input);
}
if(UNSEEN_CASES.length!==9||new Set(UNSEEN_CASES.map(x=>x.id)).size!==9)throw Error('DUPLICATE_CASE');
if(UNSEEN_CASES.some(c=>!c.message||!c.relationship||!Array.isArray(c.sceneFacts)||!Array.isArray(c.verifiedEvents??[])))
 throw Error('INVALID_CASE');

export {V5_SYSTEM,cases};
if(process.argv.includes('--preview'))
 console.log(JSON.stringify({v5Chars:V5_SYSTEM.length,v6Chars:V6_SYSTEM.length,caseCount:UNSEEN_CASES.length,caseIds:UNSEEN_CASES.map(c=>c.id),system:V6_SYSTEM},null,2));
