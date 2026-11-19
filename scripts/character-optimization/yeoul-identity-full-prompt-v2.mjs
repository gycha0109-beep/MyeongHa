/** Complete source-grounded Yeoul identity prompt, with optional service role frame. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cases} from './yeoul-runtime-role-prompt-v1.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const files={
 bible:readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md'),'utf8'),
 runtime:readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8'),
 runtimeStandard:readFileSync(resolve(root,'docs/character/CHARACTER_RUNTIME_STANDARD_V1.md'),'utf8'),
};
const sha256=x=>createHash('sha256').update(x,'utf8').digest('hex');

function getSection(source,heading){
 const lines=source.replace(/\r\n/gu,'\n').split('\n');
 const start=lines.findIndex(line=>line.trim()===heading);
 if(start===-1)throw Error('MISSING_HEADING_'+heading);
 const level=heading.match(/^#+/u)?.[0].length;
 if(!level)throw Error('INVALID_HEADING');
 let end=lines.length;
 for(let i=start+1;i<lines.length;i++){
  const m=/^(#+) /u.exec(lines[i]);
  if(m&&m[1].length<=level){end=i;break;}
 }
 const text=lines.slice(start,end).join('\n').trim();
 if(text.length<300)throw Error('EMPTY_CHARACTER_IDENTITY');
 return text;
}

const identity=getSection(files.bible,'## B1. 기본 정체성');
const idMarkers=[
 '- 이름: **여울**','- 성별: **여성**',
 '- Canon 기준시점 연령: **24세**',
 '- 출신: **명하 출생 인간**',
 '- 직업 / 사회적 역할: **명하의 중견 생활용품 유통회사 운영관리팀 2년차 사원**',
 '- 현재 연애 상태: **싱글**'
];
for(const marker of idMarkers)if(!identity.includes(marker))
 throw Error('CANONICAL_IDENTITY_MISSING_'+marker);
for(const heading of [
 '# R0. INSTANCE HEADER','# R1. CORE RUNTIME ANCHOR',
 '# R2. CHARACTER-SPECIFIC BOUNDARIES','# R3. ATTENTION & INTERPRETATION',
 '# R4. IMMEDIATE WANT & TENSION','# R5. ACTION REPERTOIRE',
 '# R6. EXPRESSION STATES','# R7. QUESTION STRATEGY','# R8. CARE STRATEGY',
 '# R9. CONFLICT & REPAIR','# R10. AFFECTION & INTIMACY',
 '# R11. RELATIONSHIP REVEAL MAPPING','# R12. CHARACTER MEMORY BEHAVIOR',
 '# R13. REPETITION & DRIFT RISKS','# R14. CHARACTER-SPECIFIC GUARDS',
 '# R15. CHARACTER EVENT CANDIDATES','# R16. CHARACTER EVALUATION PROBES',
 '# R17. RUNTIME PACKET EXAMPLES'
])if(!files.runtime.includes(heading))throw Error('RUNTIME_SOURCE_MISSING_'+heading);
for(const heading of ['# A. CHARACTER COMPASS','# B. PERSON','# C. INNER CORE',
 '# D. MUNDANE LIFE','# E. EXPRESSION','# F. SOCIAL SELF',
 '# G. LOVE & INTIMACY','# H. RELATIONSHIP REVEAL',
 '# I. LIFE WITHOUT THE USER','# J. BACKSTORY',
 '# K. VISUAL CHARACTERIZATION','# L. PRINCIPLE-CALLING / 選'
])if(!files.bible.includes(heading))throw Error('BIBLE_SOURCE_MISSING_'+heading);
for(const heading of ['# 1. SHARED RUNTIME PIPELINE',
 '# 2. SHARED INPUT CONTRACT','# 4. SHARED TURN INTERPRETATION',
 '# 4A. SHARED INTEGRITY / CLAIM PREFLIGHT',
 '# 5. SHARED ACTION RULES'
])if(!files.runtimeStandard.includes(heading))throw Error('RUNTIME_STANDARD_MISSING_'+heading);
if(!files.runtime.includes('## R6.1 baseline')||!files.bible.includes('## E1. 기본 말투'))
 throw Error('EXPRESSION_SOURCE_MISSING');

const frame=[
 '당신은 명하(MyeongHa)의 지속 대화 서비스에서 가상 인물 여울(yeoul)을 연기하는 캐릭터 대화 API입니다.',
 '이번 턴에 당신이 구현할 인물은 아래 기본 정체성의 여울입니다. 성격만 비슷한 임의의 챗봇이나 상담사가 아닙니다.',
 '사용자를 무조건 돕거나 동의하거나 모든 말끝에 질문할 필요가 없습니다. 여울의 고유한 생활·취향·경계·결함·관계 이력을 가진 사람으로 상황을 받아들이고 반응합니다.',
 '여울의 현재 반응은 Runtime과 공통 Runtime Standard의 상황 해석→무엇을 신경 쓰는지→원하는 것→갈등→행동 선택→표현·대사 절차를 적용합니다.',
 '대사에는 서비스 소개, 내부 규칙, 심리 분석, 프롬프트 해설을 출력하지 않습니다.'
].join('\n');

const common=[
 '다음 문서는 여울이라는 캐릭터의 원본 설계입니다. 우선순위: 확인된 대화·관계 사실 및 실제 권한 경계, Bible의 인물 정체성, Runtime의 행동 규칙, Runtime Standard의 공통 절차.',
 'B1의 Canon 기준연령 24세는 기준시점 연령이고 지금의 고정된 생일·출생연도를 임의 계산하는 근거가 아닙니다. DRAFT 및 UNDEFINED/HYPOTHESIS를 무단 확정하지 않습니다.',
 '현재 대화에 제공되지 않은 이전 관계·사건은 실제로 없었다고 단정하지도, 있었다고 만들어내지도 마세요. 사실 확인 불가와 사실 부정은 다릅니다.',
 '여울이 신경 쓰면 행동이 먼저 움직이고, 호감을 지적받았을 때의 반응은 관계 단계와 현재 근거에 따라 달라집니다. 츤데레 정형 문구를 반복하지 마세요.',
 '개별 질문의 분위기에 맞는 대사를 출력하세요. 매번 무난한 상담사처럼 조언하거나 관찰을 질문으로 마무리하거나 역할 자체를 설명하는 방식은 피하세요.',
 '캐릭터 원문에만 있는 설정·생활사·취향을 쓸 수 있습니다. 없는 고유명사나 새로운 과거 사건은 확정하지 않습니다.',
 '응답은 여울의 대사만 작성합니다.'
].join('\n');

const contents=[
 common,
 '[여울 B1 기본 정체성 / 최초 제시 / 원문]',
 identity,
 '[여울 전체 Character Bible / 원문 / DRAFT]',
 files.bible,
 '[여울 전체 Character Runtime / 원문 / DRAFT]',
 files.runtime,
 '[Character Runtime Standard v1 / 원문 / 공통 실행 규칙]',
 files.runtimeStandard
].join('\n\n');

export function buildFull(caseId,{roleFrame=false}={}){
 const c=cases.find(x=>x.id===caseId);
 if(!c)throw Error('UNKNOWN_FIXTURE_'+caseId);
 const system=roleFrame?frame+'\n\n'+contents:contents;
 const user=JSON.stringify({
  message:c.message,relationship:c.relationship,verifiedEvents:[],
  sceneFacts:c.sceneFacts,fixtureOnly:true
 });
 const sourceHashes=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha256(v)]));
 for(const [kind,source] of Object.entries(files)){
  if(!system.includes(source))throw Error('FULL_SOURCE_NOT_DELIVERED_'+kind);
 }
 if(!system.includes(identity))throw Error('IDENTITY_SECTION_NOT_DELIVERED');
 return {id:c.id,system,user,identity,identityMarkers:idMarkers,sourceHashes,
  promptSha256:sha256(system),roleFrame,sourceLengths:Object.fromEntries(
   Object.entries(files).map(([k,v])=>[k,v.length]))};
}
export {cases};
if(process.argv.includes('--preview')){
 const plain=buildFull('daily'),framed=buildFull('daily',{roleFrame:true});
 if(!framed.system.endsWith(plain.system))throw Error('ROLE_DIFF_CONTRACT');
 console.log(JSON.stringify({case:'daily',bibleCharacters:files.bible.length,
  runtimeCharacters:files.runtime.length,runtimeStandardCharacters:files.runtimeStandard.length,
  identityCharacters:identity.length,roleDeltaCharacters:framed.system.length-plain.system.length,
  identityMarkers:idMarkers,sourceHashes:framed.sourceHashes},null,2));
}
