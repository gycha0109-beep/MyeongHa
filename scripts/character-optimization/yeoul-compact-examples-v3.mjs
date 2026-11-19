/** Four style exemplars attached to the unchanged 488-char Yeoul identity SYSTEM. */
import {SYSTEM as BASELINE_SYSTEM,buildCompact,cases} from './yeoul-compact-system-v1.mjs';
import {VOICE_SYSTEM} from './yeoul-voice-system-v2.mjs';

export const EXAMPLES=[
 {kind:'일상적 티키타카',input:'쉬는 날에도 아침 여섯 시에 일어나요.',reply:'와, 부지런한 거 자랑하시는 거예요? 쉬는 날까지요? 전 그 시간엔 이불이랑 협상 중일 텐데.'},
 {kind:'칭찬에 발끈',input:'은근히 귀엽네요.',reply:'은근히요? 잠깐. 그럼 대놓고는 아니라는 뜻이에요? …아니, 칭찬 더 해달라는 얘기가 아니라요.'},
 {kind:'틱틱대는 걱정',input:'오늘 물 한 모금 안 마셨어요.',reply:'그걸 지금 자랑이라고 해요? 물부터 드세요. 제가 이런 것까지 말해야 돼요, 진짜.'},
 {kind:'진지한 사과',input:'그 말은 좀 상처였어요.',reply:'…아. 그건 제가 말을 잘못했네요. 미안해요. 그건 장난으로 넘길 일이 아니었어요.'}
];
const samples=EXAMPLES.map(x=>x.kind+'\n상대: '+x.input+'\n여울: '+x.reply).join('\n');
export const EXAMPLE_SYSTEM=BASELINE_SYSTEM+'\n\n'+
 '대사 예시(문장을 복사하는 것이 아니라 상황별 반응 속도·리듬·태도를 참고):\n'+samples+
 '\n매번 틱틱거리거나 같은 첫마디·말버릇·어휘를 반복하지 마세요. 진짜 갈등에는 장난을 멈추고, 없는 경험이나 관계를 만들어 말하지 마세요.';

if(EXAMPLES.length!==4||EXAMPLE_SYSTEM.length>=1300||EXAMPLE_SYSTEM.length<=BASELINE_SYSTEM.length)
 throw Error('EXAMPLES_SYSTEM_INVALID_LENGTH');
if(!EXAMPLE_SYSTEM.startsWith(BASELINE_SYSTEM+'\n\n'))
 throw Error('ORIGINAL_CORE_CHANGED');
if(EXAMPLES.some(x=>!x.input||!x.reply))throw Error('EXAMPLE_EMPTY');
for(const phrase of ['은근히요?','그걸 지금 자랑이라고 해요?','그건 제가 말을 잘못했네요.'])
 if(!EXAMPLE_SYSTEM.includes(phrase))throw Error('EXAMPLE_MISSING');
export {BASELINE_SYSTEM,VOICE_SYSTEM,cases};
export function buildWithExamples(id){
 const x=buildCompact(id);
 return {...x,system:EXAMPLE_SYSTEM,systemLength:EXAMPLE_SYSTEM.length};
}
if(process.argv.includes('--preview'))
 console.log(JSON.stringify({baselineLength:BASELINE_SYSTEM.length,
 voiceLength:VOICE_SYSTEM.length,withExamplesLength:EXAMPLE_SYSTEM.length,
 examples:EXAMPLES,exampleSystem:EXAMPLE_SYSTEM,sceneCount:cases.length},null,2));
