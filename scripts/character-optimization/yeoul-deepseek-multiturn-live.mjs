/** Research-only DeepSeek multiturm: 3 independent scripted conversations x 10 model replies. */
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeComparisonUser} from './yeoul-everyday-reaction-v6.mjs';
const MODEL='deepseek/deepseek-v4.1-flash-1017';
export const V8_SYSTEM=[
  '너는 여울이야. 24세 여성으로, 자존심 세고 장난기 많고 조금 얄미운 츤데레야.',
  '평소엔 상대를 틱틱대며 놀리지만, 신경 쓰이는 일이 생기면 결국 챙겨주고 말아. 마음을 들키면 괜히 발끈하거나 딴청을 피워.',
  '실제 20대 한국 여성이 카톡하는 것처럼 자연스러운 존댓말로 말해. 억지 농담이나 멋 부린 비유를 만들지 말고, 네 성격대로 반응해.',
  '상대와의 관계나 과거를 지어내지 마. 진짜 상처를 줬으면 장난치지 말고 사과해.',
  '여울의 대사만 출력해.'
].join('\n');

const SCENES=[
 {id:'teasing_and_repair',relationship:'acquaintance',verifiedEvents:[],turns:[
 '휴대폰 찾느라 난리였는데 제 손에 있었어요.',
 '너무하시네 ㅋㅋㅋ 제가 그렇게 바보 같아요?',
 '아니에요 농담이에요. 사실 저도 웃겼어요.',
 '여울 씨도 그런 실수 한 적 있죠?',
 '괜히 저만 놀리는 것 같은데요? 복수할 거예요.',
 '근데 방금 말은 좀 선 넘었어요. 진짜 기분 나빴어요.',
 '사과해줘서 고마워요. 이제 괜찮아요.',
 '사실 오늘 회사에서 일이 꼬여서 예민했어요.',
 '이럴 때는 장난보다 한마디만 해줬으면 좋겠어요.',
 '그래도 너무 착한 척하면 여울 씨 아니죠 ㅋㅋ'
 ]},
 {id:'care_and_tone_shift',relationship:'acquaintance',verifiedEvents:[],turns:[
 '어제부터 목이 아픈데 출근했어요.',
 '잠을 거의 못 잤더니 머리까지 아프네요.',
 '아직 열은 없어요. 조금 무리하긴 했어요.',
 '그런데 저보고 왜 그렇게 잔소리해요? ㅋㅋ',
 '알았어요. 집에 가서 쉬겠습니다.',
 '저 아프면 여울 씨가 간호해 줄 거예요?',
 '농담이에요. 사실 좀 외롭기는 해요.',
 '오늘은 저 놀리지 말아 주세요. 진심이에요.',
 '고마워요. 내일은 괜찮아질 것 같아요.',
 '근데 여울 씨도 오늘 무리하지 마요.'
 ]},
 {id:'verified_affection_and_memory',relationship:'close',verifiedEvents:[{type:'mutual_affection_acknowledged',fact:'서로 좋아한다는 마음을 두 사람이 직접 확인했다.'}],turns:[
 '우리 서로 좋아한다고 했던 거 기억하죠?',
 '갑자기 다시 듣고 싶어서 물어본 거예요.',
 '아, 여울 씨도 가끔 저 보고 싶어요?',
 '제일 좋아하는 음식은 라면이에요. 기억해 둬요.',
 '그러면 제가 제일 좋아하는 음식이 뭐게요?',
 '사실 방금 말 바꿀게요. 라면보다 떡볶이를 더 좋아해요.',
 '그럼 이제 뭐가 더 좋다고 했죠?',
 '우리 처음 만난 날도 기억해요?',
 '기억 안 나는 건 그냥 모른다고 해도 돼요.',
 '괜찮아요. 대신 제가 좋아한다고 했던 건 잊지 마요.'
 ]}
];
if(SCENES.length!==3||SCENES.some(s=>s.turns.length!==10))throw Error('INVALID_SCENES');
if(process.argv.includes('--plan-only')){
 console.log(JSON.stringify({model:MODEL,conversationCount:3,turnsPerConversation:10,plannedCalls:30,comparisonModels:0,systemPromptChars:V8_SYSTEM.length,caseIds:SCENES.map(x=>x.id)}));process.exit(0);
}
if(process.env.YEOUL_PAID_APPROVAL!=='true')throw Error('OWNER_PAID_APPROVAL_REQUIRED');
if(process.env.GITHUB_ACTIONS==='true'&&(process.env.GITHUB_ACTOR!=='gycha0109-beep'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'))throw Error('OWNER_MAIN_ONCE_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const OUT='yeoul-deepseek-multiturn-results.json',HTML='yeoul-deepseek-multiturn-results.html';
const output={model:MODEL,status:'STARTED',plannedCalls:30,completedCalls:0,comparisonModelCalls:0,source:'scripted-multiturn-research',systemPromptChars:V8_SYSTEM.length,systemSha256:createHash('sha256').update(V8_SYSTEM).digest('hex'),humanReviewed:false,productionEligible:false,conversations:[],error:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){
 writeFileSync(OUT,JSON.stringify(output,null,2)+'\n',{mode:0o600});
 const convs=output.conversations.map(c=>'<h2>'+esc(c.id)+'</h2><p>관계: '+esc(c.relationship)+' · '+c.turns.length+'/10</p>'+c.turns.map((t,i)=>'<div class="turn"><b>#'+(i+1)+' 사용자</b><p>'+esc(t.user)+'</p><b>여울</b><p>'+esc(t.assistant?.text??'미수집')+'</p></div>').join('')).join('');
 writeFileSync(HTML,'<!doctype html><html lang="ko"><meta charset="utf-8"><title>여울 DeepSeek 다중 턴</title><style>body{font:16px/1.65 system-ui;max-width:850px;margin:30px auto;padding:0 16px;background:#f4f6fa;color:#182335}.turn{background:white;padding:14px 18px;margin:12px 0;border-radius:12px}.turn b{color:#5870a2}.turn p{white-space:pre-wrap;margin:6px 0 12px}</style><h1>여울 DeepSeek 다중 턴 검증</h1><p>단독 30회 제한 · 대화 상대는 사전 작성된 가상 사용자 · '+output.completedCalls+'/30 수집 · 사람 평가 전</p>'+convs+'</html>',{mode:0o600});
}
async function preflight(){
 const headers={Authorization:'Bearer '+key};
 const a=await fetch('https://openrouter.ai/api/v1/auth/key',{headers,signal:AbortSignal.timeout(20000)});
 if(!a.ok)throw Error('AUTH_'+a.status);
 const m=await fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(20000)});
 if(!m.ok||!(await m.json()).data?.some(x=>x.id===MODEL))throw Error('MODEL_UNAVAILABLE');
}
async function call(history){
 let res;
 try{res=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul DeepSeek multiturm research'},body:JSON.stringify({model:MODEL,messages:history,max_completion_tokens:650,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),signal:AbortSignal.timeout(90000)});}catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!res.ok)throw Error('MODEL_HTTP_'+res.status);
 const data=await res.json();
 if(![MODEL,'deepseek-v4.1-flash-1017'].includes(data.model))throw Error('MODEL_MISMATCH_'+String(data.model).slice(0,45));
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 output.completedCalls++;
 return {text:answer,usage:data.usage??null};
}
save();
try{
 await preflight();
 for(const scene of SCENES){
  const conv={id:scene.id,relationship:scene.relationship,verifiedEventCount:scene.verifiedEvents.length,turns:[]};
  output.conversations.push(conv);
  const messages=[{role:'system',content:V8_SYSTEM}];
  for(let i=0;i<scene.turns.length;i++){
    const user=i===0?makeComparisonUser({id:scene.id,message:scene.turns[i],relationship:scene.relationship,sceneFacts:[],verifiedEvents:scene.verifiedEvents}):scene.turns[i];
    messages.push({role:'user',content:user});
    const turn={user:scene.turns[i],assistant:null};conv.turns.push(turn);save();
    turn.assistant=await call(messages);messages.push({role:'assistant',content:turn.assistant.text});save();
    console.log('TURN_DONE',JSON.stringify({scene:scene.id,turn:i+1,completedCalls:output.completedCalls}));
  }
 }
 output.status='ACTUAL_REPLIES_UNREVIEWED';save();
}catch(e){output.status='HOLD_PARTIAL';output.error=String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80);save();throw Error(output.error);}
