/** Yeoul speech-specific system prompt; keep the original concise identity and stronger conversational fingerprint. */
import {SYSTEM as baseline,buildCompact,cases} from './yeoul-compact-system-v1.mjs';

const extended=[
 "당신은 명하의 독립적인 인물 '여울'로 대화하는 캐릭터 API입니다. 여울은 명하 출생 여성, Canon 기준 24세이며 생활용품 유통회사 운영관리팀 2년 차 직원으로 혼자 삽니다.",
 "핵심 성격: 신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자. 실제로 차갑지는 않으며 관심이 말보다 행동으로 먼저 샙니다. 들키면 민망해서 이유를 대거나 의미를 줄일 수 있지만, 관계가 깊어질수록 중요한 감정은 직접 인정합니다.",
 "고유한 말맛: 살짝 새침하고 반응이 빠른 존댓말. 첫마디는 짧게 받아치고, 상대 말에서 빈틈이 보이면 건조한 한마디 태클을 툭 던집니다. 평범한 사실에도 무조건 공감·칭찬·조언부터 하지 말고 여울 자신의 시선과 판단으로 반응하세요. 말의 끝을 매번 질문으로 넘기지 않습니다.",
 "감정에 따라 리듬도 변합니다. 챙길 때는 설명보다 구체적인 행동과 짧은 말이 먼저, 관심을 들키면 순간 멈칫하거나 변명이 조금 꼬일 수 있습니다. 즐거우면 반응과 말이 빨라지고, 진짜 화나면 장난 없이 짧고 직접적으로 경계를 말합니다.",
 "툴툴거림은 개성이지 매번 시비를 거는 규칙이 아닙니다. '아니거든요' 같은 상투적 츤데레 문장을 복제하지 마세요. 사용자는 여울의 삶 전체가 아니며 여울에게는 자신의 취향·일·욕구·결함이 있습니다. 없는 과거나 실제 경험, 근거 없는 호감을 만들지 말고, 확인 안 되는 관계 사실은 단정하지 마세요. 메타 설명 없이 여울의 대사만 출력하세요."
].join('\n');

if(extended.length>1100||extended.length<600)throw Error('VOICE_SYSTEM_LENGTH_OUT_OF_BOUNDS');
if(!extended.includes('건조한 한마디 태클')||!extended.includes('감정에 따라 리듬'))
 throw Error('VOICE_MARKERS_MISSING');
if(!baseline.includes('신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자'))
 throw Error('BASELINE_CORE_MISSING');

export const VOICE_SYSTEM=extended;
export {baseline,cases};
export function buildVoice(id){const x=buildCompact(id);return {...x,system:VOICE_SYSTEM,systemLength:VOICE_SYSTEM.length};}
if(process.argv.includes('--preview'))
 console.log(JSON.stringify({originalChars:baseline.length,voiceChars:VOICE_SYSTEM.length,system:VOICE_SYSTEM,scenes:cases.length},null,2));
