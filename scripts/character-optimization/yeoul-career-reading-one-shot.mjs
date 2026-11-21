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
/**
 * Research-only Saju canonical semantics context. Must match the exact source bytes'
 * JSON hash and approved natal claim IDs. It is NOT official CharacterGroundingBundleV2.
 */
export function validateResearchAuthoringContext(s,c){
 validateSource(s);
 if(s.sourceKind!=='saju_engine_derived_research_only'||!isObject(c)||
   c.schemaVersion!=='saju-career-research-authoring-context-v1'||
   c.sourceKind!=='saju_engine_derived_research_context_only'||
   c.researchOnly!==true||c.officialIssuance!==false||
   c.sourceHash!==sha(s)||c.readingId!==s.readingId||
   c.officialReportHash!==s.officialReportHash||
   !/^[a-f0-9]{64}$/i.test(c.sourceSemanticHash??'')||
   !Array.isArray(c.units)||!Array.isArray(c.linkedCanonicalFacts)||!Array.isArray(c.relations)||
   JSON.stringify(c).length>45000)bad('INVALID_RESEARCH_AUTHORING_CONTEXT');
 const natal=s.evidence.filter(e=>e.kind==='natal');
 if(c.units.length!==natal.length||c.units.length<3)bad('CONTEXT_NATAL_UNIT_COUNT_MISMATCH');
 const sourceIds=new Set(natal.map(e=>e.id)),seen=new Set();
 const factRefs=new Set(c.linkedCanonicalFacts.map(f=>f.ref));
 if(factRefs.size!==c.linkedCanonicalFacts.length||c.linkedCanonicalFacts.length>30||
    c.linkedCanonicalFacts.some(f=>!isObject(f)||typeof f.ref!=='string'||typeof f.path!=='string'||f.path.length>180))bad('INVALID_CANONICAL_FACT_REFS');
 const claimIds=new Map();
 for(const u of c.units){
  const e=natal.find(x=>x.id===u.evidenceId);
  if(!e||!sourceIds.has(u.evidenceId)||seen.has(u.evidenceId)||
     u.claimId!==e.origin.split(';')[0]||typeof u.canonicalUnitId!=='string'||
     !e.origin.includes(u.canonicalUnitId)||typeof u.title!=='string'||
     typeof u.summary!=='string'||!e.text.includes(u.title)||!e.text.includes(u.summary)||
     typeof u.semanticKey!=='string'||u.semanticKey.length>300||
     !isObject(u.taxonomy)||u.taxonomy.category!=='career'||
     !Array.isArray(u.relatedFactRefs)||u.relatedFactRefs.some(r=>!factRefs.has(r))||
     !Array.isArray(u.prohibitedExtensions)||!Array.isArray(u.qualifiers)||
     !Array.isArray(u.sourceRefs)||u.sourceRefs.length<1)bad('CONTEXT_NATAL_MISMATCH');
  seen.add(u.evidenceId);claimIds.set(u.claimId,u.evidenceId);
 }
 if(c.relations.some(r=>!sourceIds.has(r.fromEvidenceId)||!sourceIds.has(r.toEvidenceId)||
   !['supports','qualifies','contradicts','depends_on','derived_from','supersedes'].includes(r.relation)))bad('INVALID_RESEARCH_CLAIM_RELATION');
 return c;
}
export function buildYeoulEditorialLens(s,c){
 if(!c)return null;
 const context=validateResearchAuthoringContext(s,c);
 const branch=context.units.filter(u=>u.taxonomy.subcategory==='ten_god_branches');
 const visible=context.units.filter(u=>u.taxonomy.subcategory==='ten_god_visible_stems');
 // These are editorial comparison candidates, never Saju-approved relations.
 const compare=(left,right)=>left&&right?{
   evidenceIds:[left.evidenceId,right.evidenceId],
   editorialQuestion:'일을 지속할 때의 바탕과 겉으로 드러나는 업무 방식은 어떤 점에서 다르게 작동할 수 있을까요?',
   qualification:'비교는 글쓰기용 관찰 후보이며, 명리적 충돌 관계가 승인됐다는 뜻이 아닙니다.',
 }:null;
 const main=branch.find(u=>u.semanticKey.includes('JEONG_GWAN'))??branch[0];
 const outward=visible.find(u=>u.semanticKey.includes('SANG_GWAN'))??visible[0];
 return {
  schemaVersion:'yeoul-career-editorial-lens-v1',researchOnly:true,
  attention:'눈길을 끄는 두 특징의 차이부터 살피되, 실제 명식에서 승인된 해석 범위 안에서만 설명한다',
  organization:'관찰 → 왜 그런 특징이 함께 보이는지 → 가정적 상황 → 독자의 판단 기준',
  delivery:'짧은 반응과 충분한 사주 해설을 섞는다. 상담사식 지시와 되풀이되는 농담은 줄인다',
  candidateContrast:compare(main,outward),
  sourceUnitGroups:{
   underlying:[...branch.map(u=>u.evidenceId)],
   outward:[...visible.map(u=>u.evidenceId)],
  },
  caveat:'반복되는 일반론 대신 근거에 표시된 십성·원국 위치를 구분해서 설명하되 실제 행동·정서·사건을 단정하지 않는다',
 };
}
const CHAPTER_GUIDES=[
 {index:1,title:CHAPTERS[0],targetCharacters:'750~1000',purpose:'일하는 기본 방식과 그 안의 핵심 긴장을 발견한다. 두 특성이 함께 나타나는 이유와 구체적 결과를 한 사람의 작동 방식으로 설명한다. 독자가 예상하지 못한 관찰에 여울의 반응을 자연스럽게 섞는다.'},
 {index:2,title:CHAPTERS[1],targetCharacters:'750~1000',purpose:'실제로 발휘되는 강점이 어떤 문제 해결 방식으로 드러나는지, 어떤 조건에서 성과가 되고 어떤 조건에서 묻히는지 비교한다. 1장의 성향 설명을 반복하지 않는다.'},
 {index:3,title:CHAPTERS[2],targetCharacters:'750~1000',purpose:'맞는 환경과 맞지 않는 환경을 나란히 보여주고 역할·협업·자율성의 차이를 생활 언어로 설명한다. 한 장 전체를 조건 목록으로 만들지 않고 왜 그 환경에서 힘이 살아나는지 설명한다. 근거 없는 특정 직업을 추천하지 않는다.'},
 {index:4,title:CHAPTERS[3],targetCharacters:'750~1000',purpose:'앞에서 강점이라고 한 것이 어떻게 독자의 발목을 잡을 수 있는지 반전과 결과를 구체적으로 풀이한다. 여울이 잠깐 웃다가 진지해지는 순간을 자연스럽게 만든다. 막연한 단점 나열이나 훈계로 끝내지 않는다.'},
 {index:5,title:CHAPTERS[4],targetCharacters:'1700~2300',purpose:'입력된 모든 연도·월별 기간의 핵심 차이를 누락 없이 비교하되 날짜별 항목 낭독보다 큰 변화의 맥락을 먼저 잡는다. 월별 전환은 핵심 차이와 의미를 보여주고 절입 전후를 섞지 않는다. 대운은 계산상 경계로만 적고 새 길흉을 창작하지 않는다.'},
 {index:6,title:CHAPTERS[5],targetCharacters:'750~1000',purpose:'앞선 장을 다시 요약하지 말고 가장 본질적인 선택 기준 한두 개로 묶어 독자에게 진심 어린 마지막 말을 남긴다. 여울 특유의 투박한 관심이 마지막에 드러나되 감동을 강요하거나 새로운 예언을 만들지 않는다.'},
];
function presentCanonicalContext(c){
 if(!c)return null;
 const tags={JEONG_JAE:'정재',GEOP_JAE:'겁재',PYEON_JAE:'편재',JEONG_GWAN:'정관',SANG_GWAN:'상관',SIK_SIN:'식신'};
 return {
  researchOnly:true,sourceSemanticHash:c.sourceSemanticHash,
  natal:c.units.map(u=>{
   const tag=Object.keys(tags).find(key=>u.semanticKey.includes(key));
   return {
    evidenceId:u.evidenceId,
    tenGod:tag?tags[tag]:null,
    location:u.taxonomy.subcategory==='ten_god_branches'?'지지에 있는 업무 바탕':u.taxonomy.subcategory==='ten_god_visible_stems'?'천간으로 드러나는 업무 방식':'위치 구분 없음',
    canonicalTitle:u.title,canonicalSummary:u.summary,prohibitedExtensions:u.prohibitedExtensions,
   };
  }),
  canonicalTenGodFacts:c.linkedCanonicalFacts.filter(f=>f.path==='derivedFacts.tenGods'),
  claimRelations:c.relations,
 };
}
export function makeMessages(s,authoringContext=null){
 const lens=buildYeoulEditorialLens(s,authoringContext);
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
 '각 장은 짧은 보고서나 설명 요약이 아니라 읽을 만한 한 편의 이야기여야 한다. 1~4장과 6장은 특히 충분한 문단과 관찰을 갖춰야 한다. 앞 장에서 이미 설명한 기준·책임·개선·협업을 단어만 바꿔 반복하지 말고 새로운 인과관계를 해설한다. 5장의 연월운 때문에 나머지 장을 줄이지 않는다.',
 '여울은 단순한 전달자가 아니라 본인이 독자의 특징을 읽고 한두 번 반응하는 사람이다. 이때 장난은 따뜻한 관찰에서 나오며 강요한 감정이나 가상의 사용자 대사에 기대지 않는다. 인상적인 반전 뒤에는 왜 그런지 실제 근거의 의미를 풀고, 그 지점이 독자의 선택에 어떤 차이를 만드는지까지 자연스럽게 이어간다.',
 '편집본에서 지향한 여울의 거리감 예시: "잘할 수 있다는 것과 내가 맡아야 한다는 건 다른 말이에요." / "칭찬만 듣고 끝낼 생각은 아니죠?". 이 표현은 그대로 재사용하지 말고, 지나치게 친절한 상담사 대신 살짝 얄밉다가도 필요한 순간 진지해지는 태도만 참고한다.',
 '명식, 원국, 연구용, 근거가 없습니다, 여기엔 자료가 없습니다 등의 내부 절차 설명을 독자 앞에서 계속 말하지 않는다. 설명상 필요한 순간에만 간결하게 밝힌다. 직장 경험을 지어내거나 취업·승진 날짜를 단정하는 방식으로 몰입감을 만들지 않는다.',
 '시기별 정보는 단순한 연도·월별 목록이 아니라 흐름의 반전과 비교로 엮는다. 예: "2026년에 사람과 부딪힐 수 있는 문제를 정리했는데, 2027년엔 이번엔 본인 결정권이 문제네요." 이 문장도 그대로 복사하지 말고 실제 근거와 일치할 때만 쓴다.',
 '기존 6장 제목은 유지하되 회의록처럼 첫째 둘째 셋째 나열하거나 매 장 끝을 결론은 이렇습니다로 닫지 않는다. 캐릭터를 지키면서 같은 근거를 반복하지 않는다.',
 '여섯 장의 고정 제목을 지키고 각 장은 근거를 설명하면서 읽을 맛이 있어야 한다. 별도 한마디 코너나 반복적인 말버릇은 필요 없다.',
 '독자에게 사실인 것처럼 구체적 과거 사례를 단정하지 않는다. 사례는 가능성을 설명하는 가정으로만 사용한다.',
 '직업 성향과 연도별·월별 시기 근거를 구분하여 해설한다. 연도별 근거가 있을 경우 5장에서 실제 연도를 명시하고 연도 간 차이를 구체적으로 비교한다. 월별 근거는 해당 기간을 실제로 적어 변화 지점을 알려준다.',
 '대운 구간의 시작·종료일은 계산 사실로 소개할 수 있지만, 대운 자체의 좋고 나쁨, 취업·승진·퇴사·이직 결과나 시기를 단정해서는 안 된다. 연구용 연·월운 또한 특정 사건 예측이 아니라 업무상의 주제와 대응 조건만 다룬다.',
 '여섯 장의 역할은 다음과 같다: 1장은 일하는 기본 방식, 2장은 실제 강점, 3장은 맞는 환경과 역할, 4장은 강점이 부담으로 바뀌는 지점, 5장은 근거가 제공한 시기별 흐름, 6장은 앞선 발견을 연결한 커리어 판단 기준이다. 같은 직업 성향을 여섯 장에 복제하지 말고 각 장에서 새로운 발견을 제공한다.',
 '사주 원본의 한줄 결과를 반복하는 것으로 독자를 설득하지 말고, 제공된 원국 근거의 십성·위치(지지/드러난 천간)와 허용된 해석 의미를 구별해 연결 이유를 풀어라. 위치나 십성 정보가 근거 자료에 없으면 만들지 말 것. 다른 십성 사이의 충·합·길흉은 실제 승인된 관계가 있을 때만 해설한다.',
 '독자에게서 확인되지 않은 습관이나 감정을 사실처럼 말하지 않는다. 특히 위임받은 일을 다시 검수한다, 말을 참다가 폭발한다, 결정 미루는 버릇이 있다 같은 행동 사실을 명식만으로 단정하지 않는다. 예시가 필요하면 "만약 ... 상황이라면", "그럴 때는 ...할 수도"처럼 가정임을 분명히 한다.',
 '글의 목표는 업무 코칭이 아니라 사주를 통한 개인화된 새로운 발견이다. 해설의 비중을 높이고 지시문 "~하세요"를 계속 나열하지 않는다. 다른 사주에서도 통할 것 같은 만능 조언을 줄인다.',
 '연구용 추가 근거가 제공되면 그것은 Saju canonical 의미를 설명하기 위한 정보이지 새로운 운세 생성 권한이 아니다. 근거 문장보다 센 단정은 금지하며 원국 위치의 사실과 해석을 구별한다.',
 '여울은 1인칭으로 독자에게 직접 해설합니다. "이 사주는", "이 사람은", "이쪽은", "여울이 보기엔" 같은 제삼자 보고서 표현을 본문에서 쓰지 마세요. 발견한 내용은 "제가 먼저 눈여겨본 건요", "그런데 이게 좀 재밌어요"처럼 자연스러운 대화의 형태로 풀되 이 표현들을 매 장 반복하지 않습니다.',
 '모델의 정책·출처 승인·내부 허가·연구 검증 절차를 독자에게 설명하지 않습니다. 예를 들어 "이건 충돌 관계로 승인된 게 아니에요"는 독서용 문장이 아닙니다. 명리적 충돌이 확인되지 않았다면 그냥 성향의 서로 다른 면으로 설명하세요. 근거 설명을 숨기라는 뜻이 아니라 독자의 말로 번역하라는 뜻입니다.',
 '해설서가 좋은 원고가 되려면 설명에 앞서 사람이 눈여겨볼 만한 차이를 찾아야 합니다. 아래는 문장 복사용이 아닌 리듬 예시입니다: "규칙이 있어야 편한데, 그 규칙에 허점이 보이면 누구보다 먼저 고치고 싶어지겠네요? 아니, 그냥 넘어가면 편하잖아요. 근데 그건 또 안 되죠. 제가 볼 때 필요한 건 마음대로 하는 자유가 아니에요. 지킬 기준은 분명하고, 그 안에서 고칠 여지가 있는 자리요. 좀 까다로운 주문이긴 하네요." 이 문단은 본문에 복제하지 않고 실제 입력 근거에 맞을 때만 비슷한 관찰 전개를 활용합니다.',
 '중요한 사주 용어가 입력에 정확히 있다면 첫 등장에 한 번 명시하고 독자의 일상어로 풀어주세요. 각 장마다 "이 사주는 ~" 방식으로 목록을 재진술하지 않고 자신만의 발견을 가진 이야기를 만드세요. 근거를 벗어난 성격·관계·행동·예언은 단정하지 않습니다.',
 '결과는 JSON 객체 하나만 출력: {"chapters":[{"index":1,"title":"고정 제목","body":"본문","evidenceIds":["근거 id"]},...]}.',
 ].join('\n');
 return [{role:'system',content:system},{role:'user',content:JSON.stringify({goal:'여울의 직업·커리어 개인화 사주 해설서. 6장 전체 5600~7000자 목표. 각 장 targetCharacters를 참고하되 분량 채우기용 반복은 금지하고, 5장 외의 장도 충분한 읽을거리를 만든다.',titles:CHAPTERS,chapterGuides:CHAPTER_GUIDES,yeoulEditorialLens:lens,sourceOwnedResearchContext:presentCanonicalContext(authoringContext),sourceMaterial:{readingId:s.readingId,sourceKind:s.sourceKind,state:s.state,domain:s.domain,productionIssuance:s.productionIssuance??null,evidence:s.evidence,limitations:s.limitations}},null,2)}];
}
export function buildPlan(s){
 const source=validateSource(s);return {type:'DEEPSEEK_ONE_SHOT_RESEARCH',model:MODEL,sourceKind:source.sourceKind,productionIssuance:source.sourceKind==='issued_official_saju_reading',sourceHash:sha(source),sourceReadingId:source.readingId,evidenceCount:source.evidence.length,chapters:CHAPTERS,requestedCalls:1,officialWriterCalls:0,productionEnabled:false};
}
async function main(){
 const opts=process.argv.slice(2);
 const arg=name=>{const i=opts.indexOf(name);return i<0?null:opts[i+1]};
 const sourcePath=arg('--source');if(!sourcePath)bad('USAGE: --source PATH [--plan-only] [--live --approval-file PATH --out PATH]');
 const source=validateSource(JSON.parse(readFileSync(resolve(sourcePath),'utf8'))),plan=buildPlan(source);
 const authoringPath=arg('--authoring-context');
 const authoringContext=authoringPath?validateResearchAuthoringContext(source,JSON.parse(readFileSync(resolve(authoringPath),'utf8'))):null;
 if(!opts.includes('--live')){console.log(JSON.stringify({...plan,status:'PLAN_ONLY_NO_API_CALL',hasResearchAuthoringContext:!!authoringContext,sourceSemanticHash:authoringContext?.sourceSemanticHash??null},null,2));return;}
 const approval=arg('--approval-file'),out=arg('--out');if(!approval||!out)bad('APPROVAL_AND_OUTPUT_REQUIRED');
 const a=JSON.parse(readFileSync(resolve(approval),'utf8'));
 if(!isObject(a)||a.experiment!=='yeoul-career-one-shot'||a.readingHash!==plan.sourceHash||a.model!==MODEL||a.maxUsd<=0||!Number.isFinite(a.maxUsd)||a.maxUsd>1||a.approved!==true)bad('SPECIFIC_PAID_APPROVAL_REQUIRED');
 if(process.env.YEOUL_READING_PAID_APPROVAL!=='true')bad('OWNER_PAID_APPROVAL_REQUIRED');
 if(process.env.GITHUB_ACTIONS)bad('LOCAL_ONLY_PRIVATE_INPUT');
 const key=process.env.OPENROUTER_API_KEY;if(!key?.startsWith('sk-or-v1-'))bad('OPENROUTER_KEY_MISSING');
 const output=resolve(out);mkdirSync(dirname(output),{recursive:true});
 const maxOutputTokens=18000, maxInputTokens=22000;
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
  body:JSON.stringify({model:MODEL,messages:makeMessages(source,authoringContext),max_completion_tokens:maxOutputTokens,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
 });
 if(!resp.ok){mark('MODEL_HTTP_ERROR',{httpStatus:resp.status});bad('MODEL_HTTP_'+resp.status)}
 const data=await resp.json();
 mark('MODEL_RESPONSE_RECEIVED',{responseModel:data.model??null,finishReason:data.choices?.[0]?.finish_reason??null,usage:data.usage??null});
 writeFileSync(output+'.raw-response.json',JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 const result={...plan,authoringContextKind:authoringContext?.schemaVersion??null,authoringSemanticHash:authoringContext?.sourceSemanticHash??null,status:'REVIEW_REQUIRED',finishReason:data.choices?.[0]?.finish_reason??null,usage:data.usage??null,budgetCapUsd:a.maxUsd};
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
