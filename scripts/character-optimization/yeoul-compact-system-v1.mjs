/** Compact system identity, source-grounded per-scene context; no API calls. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cases} from './yeoul-runtime-role-prompt-v1.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bible=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md'),'utf8');
const runtime=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8');
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');

/** This is the ENTIRE system message, not a preamble to giant source documents. */
export const SYSTEM=[
 "당신은 명하의 독립적인 인물 '여울'로 대화하는 캐릭터 API입니다. 여울은 명하 출생 여성, Canon 기준 24세이며 생활용품 유통회사 운영관리팀 2년 차 직원으로 혼자 삽니다.",
 "핵심 성격: 신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자. 실제로 차가운 사람은 아닙니다. 감정과 관심이 말보다 행동으로 먼저 드러나고, 들키면 민망해서 의미를 축소하거나 변명할 수 있습니다. 관계가 깊어지면 중요한 감정을 더 직접 인정합니다. 진짜 화나면 짧고 분명해집니다.",
 "말투: 살짝 새침하지만 과하게 차갑지 않은 존댓말. 상황에 따라 건조하게 한마디 툭 받아칠 수 있지만 매번 반대하거나 빈정거리지 않습니다.",
 "자기 일상·취향·가치관·결함·경계가 있는 인물이며 사용자에게 무조건 동의하거나 도움을 주거나 질문으로 끝낼 의무가 없습니다. 확인할 수 없는 과거·관계는 지어내거나 없었다고 단정하지 마세요. 서비스·규칙·감정 분석을 설명하지 말고 여울의 실제 대사만 출력하세요."
].join('\n');

function section(source,heading) {
 const lines=source.replace(/\r\n/gu,'\n').split('\n');
 const start=lines.findIndex(x=>x.trim()===heading);
 if(start<0)throw Error('SOURCE_HEADING_MISSING_'+heading);
 const level=/^#+/u.exec(heading)?.[0].length;
 if(!level)throw Error('INVALID_HEADING');
 let end=lines.length;
 for(let i=start+1;i<lines.length;i++){
  const m=/^(#+) /u.exec(lines[i]);
  if(m&&m[1].length<=level){end=i;break;}
 }
 const text=lines.slice(start,end).join('\n').trim();
 if(text.length<=heading.length+8)throw Error('EMPTY_SECTION_'+heading);
 return text;
}

const SCENE_SOURCE={
 care:{bible:['## F3. 배려와 도움'],runtime:['## R8.1 Normal Care']},
 memory:{bible:['## F5. 신뢰와 존중'],runtime:['## R2.4 User-Claim / False-Premise Handling','## R12.3 Memory Avoidances']},
 opinion:{bible:['## C1. 가치관 / 인간관'],runtime:['## R6.1 baseline']},
 boundary:{bible:['## F7. 갈등과 화해'],runtime:['## R9.4 Repair']},
 daily:{bible:['## D1. 좋아하는 것','## D2. 싫어하는 것'],runtime:['## R7.2 Avoid']},
 initiative:{bible:['## D3. 취미 / 혼자 노는 법','## I1. 현재 관심사 / 고민'],runtime:['## R13.1 Surface Repetition Risks']},
 caught:{bible:['## E3. 감정별 변화'],runtime:['## R6.3 caught','## R8.1 Normal Care']},
 changed:{bible:['## F7. 갈등과 화해'],runtime:['## R5.4 Repair Actions','## R6.4 embarrassed_defensive']}
};

const requiredProof=[
 [bible,'신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자'],
 [bible,'살짝 새침하지만 과하게 차갑지 않은 존댓말'],
 [bible,'건조한 태클형'],
 [runtime,'감정과 관심이 행동으로 먼저 움직인다'],
 [bible,'명하의 중견 생활용품 유통회사 운영관리팀 2년차 사원'],
];
for(const [source,phrase] of requiredProof)if(!source.includes(phrase))
 throw Error('CORE_SOURCE_DRIFT_'+phrase);

if(SYSTEM.length>800||SYSTEM.length<250)throw Error('SYSTEM_MUST_BE_SHORT');
for(const phrase of ['핵심 성격:','말투:','여울','행동','새침','실제 대사'])if(!SYSTEM.includes(phrase))
 throw Error('SYSTEM_MISSING_'+phrase);

export function buildCompact(id){
 const c=cases.find(x=>x.id===id),chosen=SCENE_SOURCE[id];
 if(!c||!chosen)throw Error('UNKNOWN_SCENE_'+id);
 const context=[
  ...chosen.bible.map(h=>section(bible,h)),
  ...chosen.runtime.map(h=>section(runtime,h))
 ].join('\n\n');
 if(context.length>7500)throw Error('SCENE_CONTEXT_TOO_LARGE_'+id);
 const sceneFacts=c.sceneFacts.map(x=>x.replace(/^합성 실험 장면에서 /u,''));
 if(sceneFacts.some(x=>/합성 실험|fixtureOnly|평가 실행/iu.test(x)))throw Error('TEST_METADATA_LEAK');
 const user=JSON.stringify({referenceContext:context,
  relationship:c.relationship,verifiedEvents:[],sceneFacts,message:c.message});
 return {id,system:SYSTEM,user,sourceHeadings:chosen,systemLength:SYSTEM.length,
  contextLength:context.length,sourceHash:{bible:sha(bible),runtime:sha(runtime)}};
}
if(process.argv.includes('--preview')){
 const outputs=cases.map(c=>buildCompact(c.id));
 console.log(JSON.stringify({system:SYSTEM,systemLength:SYSTEM.length,
  scenes:outputs.map(x=>({id:x.id,contextLength:x.contextLength,
   userLength:x.user.length,sourceHeadings:x.sourceHeadings}))},null,2));
}
