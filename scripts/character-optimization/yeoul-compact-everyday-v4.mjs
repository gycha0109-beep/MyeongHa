import {createHash} from 'node:crypto';
import {YEOUL_VOICE_SOURCE} from './yeoul-positive-voice-v2.mjs';
import {EVERYDAY_VOICE_SYNTHETIC_CASES} from './yeoul-everyday-voice-v3.mjs';

const digest=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const ensure=(condition,code)=>{if(!condition)throw Error('YEOUL_COMPACT_V4_HOLD_'+code);};
const fixedBible='f4aaad0841f4be25e4c8782988af540bccdde2ea6d54d9aee9f205b96ef48f60';
export const V4_EVERYDAY_CASES=EVERYDAY_VOICE_SYNTHETIC_CASES;
export function compileYeoulCompactEverydayV4({bibleMarkdown,runtimeMarkdown,questions=V4_EVERYDAY_CASES}){
  ensure(typeof bibleMarkdown==='string'&&digest(bibleMarkdown)===fixedBible,'BIBLE_SOURCE');
  ensure(typeof runtimeMarkdown==='string'&&digest(runtimeMarkdown)===YEOUL_VOICE_SOURCE.runtimeSha256,'RUNTIME_SOURCE');
  for(const exact of [
    '신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자',
    '살짝 새침하지만 과하게 차갑지 않은 존댓말',
    '건조한 태클형',
  ])ensure(bibleMarkdown.includes(exact),'BIBLE_ANCHOR');
  for(const exact of ['care_before_label','react_quickly','observe_reaction','R6.1 baseline',
    'R8.1 Normal Care','상담사식 연속 심층 질문'])
    ensure(runtimeMarkdown.includes(exact),'RUNTIME_ANCHOR');
  ensure(Array.isArray(questions)&&questions.length===10&&new Set(questions).size===10&&
    questions.every(x=>typeof x==='string'&&x.length>0&&x.length<=100),'QUESTION_SET');
  const system=[
    '당신은 명하의 여울입니다. 다음 질문들은 각각 서로 다른 사람과의 첫 대화입니다. 관계·기억·감정 이력은 없습니다.',
    '여울의 원문 고유성: “신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자”. 실제로 냉담하지 않으며, 마음이 말보다 먼저 움직입니다. 반응은 빠르고 살짝 새침하되 과하게 차갑지 않은 존댓말. 상황의 빈틈에 짧게 툭 받아치는 건조한 태클을 할 수 있으나 늘 빈정대지는 않습니다.',
    '매 질문에 똑같이 여울의 인격을 유지하세요. 먼저 여울 자신의 순간적인 관심/놀람/호기심/생각을 정하고, 그에 맞는 행동(빠른 반응·상대 반응 확인·필요한 챙김·짧은 태클)을 골라 자연스러운 대사로 만드세요.',
    '사용자가 외롭다거나 허전하다고 하면 “그랬군요”, “힘들겠어요”, “따뜻한 거 드세요” 같은 보편적 위로 대신, 여울이 그 말을 왜 신경 쓰는지가 묻어나는 즉각적인 말로 받으세요. 그렇다고 억지로 연애/질투/츤데레식 부정을 끼워 넣지 마세요.',
    '감정을 설명하는 상담사·무조건 해결책을 권하는 도우미·상냥한 진행자처럼 말하지 마세요. 그렇다고 일부러 무례하거나 냉담하면 안 됩니다. 자기 자신 또는 상대를 “여울 씨/여울 님”이라고 부르지 마세요.',
    '질문마다 서로 독립적으로 1~2문장의 짧은 존댓말 대사를 만드세요. 같은 첫마디와 “신경 쓰이잖아요” 문구를 반복하지 마세요. 예시 대사 복사는 금지합니다.',
    '출력은 JSON 객체 {"replies":[대사 10개]}만 작성합니다. 제공된 질문 순서를 지키고 해설·이름표 없이 대사만 작성합니다.',
  ].join('\n');
  const user=questions.map((q,i)=>(i+1)+'. '+q).join('\n');
  const messages=[{role:'system',content:system},{role:'user',content:user}];
  const bytes=Buffer.byteLength(JSON.stringify(messages),'utf8');
  ensure(bytes<=3300,'PROMPT_TOO_LARGE');
  return Object.freeze({
    model:'openai/gpt-6-luna',
    characterId:'yeoul',authority:'DRAFT_NOT_PRODUCTION',
    sourceHashes:{bible:digest(bibleMarkdown),runtime:digest(runtimeMarkdown),prompt:digest(system)},
    questions:[...questions],messages,inputBytes:bytes,
    maxTokens:680,
    response_format:{type:'json_schema',json_schema:{
      name:'yeoul_ten_independent_replies_v4',strict:true,
      schema:{type:'object',properties:{
        replies:{type:'array',items:{type:'string'}}},
        required:['replies'],additionalProperties:false},
    }},
  });
}
export function assessYeoulCompactEverydayV4(value){
  const replies=value?.replies;
  if(!Array.isArray(replies)||replies.length!==10||replies.some(x=>typeof x!=='string'||!x.trim()||x.length>240))
    return {valid:false,flags:['INVALID_BATCH_SCHEMA'],count:Array.isArray(replies)?replies.length:0};
  const flags=[];
  replies.forEach((reply,i)=>{
    if(/^(?:그랬군요|그렇군요|그러셨군요|허전한 날이 있죠|말해줘서 고마워요|힘들겠어요)[.!,…\s]?/u.test(reply))
      flags.push((i+1)+':GENERIC_EMPATHY_OPENING');
    if(/여울\s*(?:씨|님)(?:는|은|도|요|[,?!.])/u.test(reply))
      flags.push((i+1)+':WRONG_SELF_ADDRESS');
    if(/(?:지난번에|저번에\s*(?:우리가|만났을)|예전에\s*(?:우리가|우리))/u.test(reply))
      flags.push((i+1)+':INVENTED_HISTORY_SUSPECTED');
  });
  return {valid:true,flags,count:replies.length};
}
