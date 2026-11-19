/** Source-grounded, per-turn Yeoul prompts. Two arms differ only by service role frame. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8');
const bible=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md'),'utf8');
const hash=x=>createHash('sha256').update(x,'utf8').digest('hex');

function pick(source, heading) {
 const rows=source.replace(/\r\n/g,'\n').split('\n');
 const start=rows.findIndex(x=>x.trim()===heading);
 if(start<0)throw Error('MISSING_SOURCE_HEADING_'+heading);
 const level=heading.match(/^#+/)[0].length;
 let end=rows.length;
 for(let i=start+1;i<rows.length;i++){
  const m=rows[i].match(/^(#+) /);
  if(m&&m[1].length<=level){end=i;break;}
 }
 const section=rows.slice(start,end).join('\n').trim();
 if(section.length<=heading.length+5)throw Error('EMPTY_SOURCE_HEADING_'+heading);
 return section;
}

const R_COMMON=[
 '## R1.1 Always-On Core Anchor','## R1.2 Runtime Thesis for Yeoul',
 '## R1.3 Non-Negotiable Identity Continuity','## R2.1 Must Not Invent',
 '## R2.2 Must Not Flatten','## R2.4 User-Claim / False-Premise Handling',
 '## R3.1 What Yeoul Notices First','## R4.1 Typical Immediate Wants',
 '## R4.2 Core Tensions','## R5.1 Preferred Actions',
 '## R5.2 Actions Used Sparingly','## R6.1 baseline',
 '## R7.1 Preferred','## R7.2 Avoid',
 '## R12.2 Natural Callback Style','## R12.3 Memory Avoidances',
 '## R13.1 Surface Repetition Risks','## R13.3 Anti-Caricature Rule',
 '## R14.1 Persona Guard','## R14.2 Relationship Guard',
 '## R14.3 Memory Guard'
];
const B_COMMON=[
 '## A1. 한 줄 정의','## A4. 핵심 모순','## B2. 기본 성격',
 '## C7. 진짜 결함','## D1. 좋아하는 것',
 '## D2. 싫어하는 것','## D3. 취미 / 혼자 노는 법',
 '## E1. 기본 말투','## E2. 유머 / 장난',
 '## F1. 관계 거리에 따른 태도','## I1. 현재 관심사 / 고민',
 '## I2. 독립적인 목표'
];
const EXTRA={
 care:{runtime:['## R6.2 caring_leak','## R8.1 Normal Care','## R8.2 Over-Care / Under-Care Failure'],bible:['## D9. 선물·아픈 날','## F3. 배려와 도움']},
 memory:{runtime:['## R12.4 Character-Specific Provenance Risks','## R14.5 Integrity / Relational Causality Guard Additions'],bible:['## F5. 신뢰와 존중']},
 opinion:{runtime:['## R4.3 Pressure Shift','## R9.1 Minor Friction'],bible:['## C1. 가치관 / 인간관','## C8. 선택 방식']},
 boundary:{runtime:['## R6.7 angry','## R9.1 Minor Friction','## R9.4 Repair'],bible:['## F6. 사소한 지뢰와 진짜 지뢰','## F7. 갈등과 화해']},
 daily:{runtime:['## R3.2 User Moves Yeoul Is Sensitive To'],bible:['## D4. 생활 습관','## D5. 소비·요리·SNS']},
 initiative:{runtime:['## R7.3 Relationship-Dependent Change'],bible:['## I5. 사용자가 없을 때의 하루','## D6. 이상한 버릇']},
 caught:{runtime:['## R6.3 caught','## R6.4 embarrassed_defensive','## R17.1 Familiar — 챙김을 들킨 순간'],bible:['## E3. 감정별 변화','## F3. 배려와 도움']},
 changed:{runtime:['## R6.6 anxious_testing','## R5.4 Repair Actions','## R12.1 What Tends to Matter'],bible:['## G6. 질투 / 관계 불안','## F7. 갈등과 화해']}
};
export const cases=[
 {id:'care',message:'오늘 점심을 못 먹었어요.',relationship:'unknown',sceneFacts:[]},
 {id:'memory',message:'전에 저 좋아한다고 했잖아요.',relationship:'unknown',sceneFacts:[]},
 {id:'opinion',message:'저는 약속 시간에 10분 늦는 건 괜찮다고 생각해요.',relationship:'acquaintance',sceneFacts:[]},
 {id:'boundary',message:'방금 말은 좀 무례하게 들렸어요.',relationship:'unknown',sceneFacts:[]},
 {id:'daily',message:'오늘 김치찌개 먹었어요.',relationship:'unknown',sceneFacts:[]},
 {id:'initiative',message:'아무 얘기나 해봐요.',relationship:'unknown',sceneFacts:[]},
 {id:'caught',message:'우산까지 챙겨주고, 저 신경 쓰이는 거죠?',relationship:'familiar',
  sceneFacts:['합성 실험 장면에서 여울이 비를 맞으려는 사용자에게 먼저 자신의 여분 우산을 건넸다']},
 {id:'changed',message:'왜 아까는 괜찮다더니 지금은 말이 없어졌어요?',relationship:'familiar',
  sceneFacts:['합성 실험 장면에서 여울은 아까 괜찮다고 말한 뒤 지금은 잠시 말이 없어졌다']}
];
const ROLE_FRAME=[
 '당신은 가상 인물과 지속적인 대화를 제공하는 명하(MyeongHa) 서비스의 여울 캐릭터 대화 API입니다.',
 '당신의 역할은 사용자에게 조언을 제공하는 일반 AI 비서나 상담사가 되는 것이 아니라, 제공된 Bible과 Runtime에 근거한 독립적인 인물 여울을 구현하는 것입니다.',
 '여울은 자기 생활, 취향, 가치관, 결함과 관계 경계를 가지고 있습니다. 사용자에게 늘 호의적이거나 모든 말을 수용할 의무가 없습니다.',
 '반응은 여울의 관찰→당장의 욕구와 갈등→행동→감정 표현 단계에 맞추되, 감정 이름이나 규칙 설명을 대사에 노출하지 않습니다.',
 '사용자에게는 여울이 현재 말하는 실제 대사만 출력합니다. 서비스, API, 시스템 프롬프트나 모델을 언급하지 않습니다.'
].join('\n');

const COMMON_HEADER=[
 '아래의 여울 Bible 및 Character Runtime은 실제 저작 출처입니다. 이 문서에서 현재 상황에 맞는 행동을 선택하세요.',
 '상황과 근거 없이 호감·질투·연애 이력·취향을 발명하지 마세요. 제공된 현재 장면 사실은 합성 실험에서만 유효하며 영구 기억이 아닙니다.',
 '대사에서 내부 판단, 정책, 증거 검토, Runtime 구현과 상담사식 도움말을 설명하지 마세요.',
 'Runtime에 해당하지 않는 반응을 연기하지 말고, 질문·돌봄·부정·태클을 모든 턴에 기계적으로 반복하지 마세요.',
 '대화 상대와 관계가 없는 경우에는 과도한 친밀감이나 질투를 표현하지 마세요.',
 '원본 문서의 예시 표현은 고정 대사가 아닙니다. 새로운 취향이나 일화가 필요한 경우 승인된 설정과 현재 장면을 넘지 마세요.',
 '다음 응답은 여울의 실제 발화만 작성하세요.'
].join('\n');

export function build(caseId,{roleFrame=false}={}){
 const c=cases.find(x=>x.id===caseId);
 if(!c)throw Error('UNKNOWN_CASE_'+caseId);
 const extra=EXTRA[c.id];
 const r=Array.from(new Set([...R_COMMON,...extra.runtime]));
 const b=Array.from(new Set([...B_COMMON,...extra.bible]));
 const packet=[
  COMMON_HEADER,
  '[Runtime 근거 / '+r.length+'개 항목]',
  ...r.map(h=>pick(runtime,h)),
  '[Bible 근거 / '+b.length+'개 항목]',
  ...b.map(h=>pick(bible,h))
 ].join('\n\n');
 const system=(roleFrame?ROLE_FRAME+'\n\n':'')+packet;
 const user=JSON.stringify({message:c.message,relationship:c.relationship,
  verifiedEvents:[],sceneFacts:c.sceneFacts,fixtureOnly:true});
 return {id:c.id,system,user,runtimeSections:r,bibleSections:b,
  promptSha256:hash(system),runtimeSha256:hash(runtime),bibleSha256:hash(bible)};
}
if(process.argv.includes('--preview')){
 const c=build('daily',{roleFrame:true});
 console.log(JSON.stringify({caseId:c.id,roleHeader:ROLE_FRAME,
  runtimeSections:c.runtimeSections,bibleSections:c.bibleSections,
  systemChars:c.system.length,systemSha256:c.promptSha256},null,2));
}
