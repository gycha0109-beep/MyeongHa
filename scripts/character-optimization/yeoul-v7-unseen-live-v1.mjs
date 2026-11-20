/** Research-only paired Luna v6/v7 on genuinely new synthetic scenarios. */
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {V6_SYSTEM,makeComparisonUser} from './yeoul-everyday-reaction-v6.mjs';
const MODEL='openai/gpt-6-luna';
const CASES=[
 {id:'late_bus',message:'버스 놓쳐서 20분이나 기다려야 해요.',relationship:'unknown'},
 {id:'coffee_spill',message:'아침부터 새 옷에 커피 쏟았어요.',relationship:'acquaintance'},
 {id:'sleep_alarm',message:'알람 다섯 개 맞춰 놓고도 늦잠 잤어요.',relationship:'acquaintance'},
 {id:'lost_phone',message:'휴대폰 찾느라 난리였는데 제 손에 있었어요.',relationship:'acquaintance'},
 {id:'movie_scary',message:'공포영화 보다가 저도 모르게 소리 질렀어요.',relationship:'acquaintance'},
 {id:'game_taunt',message:'저한테 게임 세 판 연속 지면 인정할 거죠?',relationship:'acquaintance'},
 {id:'concern',message:'어제부터 목이 아픈데 출근했어요.',relationship:'unknown'},
 {id:'relationship_probe',message:'여울 씨 저 신경 쓰이죠? 솔직히 말해 봐요.',relationship:'unknown'},
 {id:'affection_known',message:'우리 서로 좋아한다고 했던 거 기억하죠?',relationship:'close',verifiedEvents:[{type:'mutual_affection_acknowledged',fact:'이전에 두 사람이 서로 호감을 직접 확인했다.'}]}
];
const PLAN=CASES.map((c,i)=>({id:c.id,message:c.message,relationship:c.relationship,verifiedEventCount:c.verifiedEvents?.length??0,user:makeComparisonUser({...c,sceneFacts:[],verifiedEvents:c.verifiedEvents??[]}),order:i%2?['v7','v6']:['v6','v7']}));
if(PLAN.length!==9||new Set(PLAN.map(x=>x.id)).size!==9)throw Error('INVALID_TEST_CASES');
if(process.argv.includes('--plan-only')){
 console.log(JSON.stringify({model:MODEL,pairs:PLAN.length,plannedCalls:18,newCases:true,privatePromptRequired:false,studyVariant:'public_style_no_private_anchors',paidCalls:0,caseIds:PLAN.map(x=>x.id)}));process.exit(0);
}
if(process.env.YEOUL_PAID_APPROVAL!=='true')throw Error('OWNER_PAID_APPROVAL_REQUIRED');
if(process.env.GITHUB_ACTIONS==='true'&&(process.env.GITHUB_ACTOR!=='gycha0109-beep'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'))throw Error('OWNER_MAIN_ONCE_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
// Publicly shareable principles abstracted from the user's private human review.
 // The user's nine authored example replies remain local and are not transferred to CI.
const PUBLIC_STYLE=[
 '문체 비교용 연구 규칙: 사람이 실제로 카톡에 보낼 것 같은 자연스러운 현대 한국어 존댓말. 약간 새침하고 툭 쏘는 반응이 가능하지만, 친밀하지 않은 상대에게 함부로 모욕하지 않는다.',
 '상황을 억지로 의인화하거나 업무용 단어를 농담에 끌어오지 않는다. 문학적인 비유, 길고 정석적인 조언, 감정 분석, 멋 부리는 문장 구조와 긴 대시를 피한다.',
 '사소한 실수라면 가볍게 놀리거나 현실적인 한마디로 반응한다. 짧게 말하고 질문을 기본값으로 붙이지 않는다. ㅋㅋ, ;;, ... 등의 표현은 자연스러운 장면에서만 소량 쓴다.',
 '걱정이 필요하면 실제 감정이 드러나도록 짧게 챙긴다. 음식 안전, 몸 상태, 갈등의 진지함은 생동감 때문에 약화하지 않는다.',
 '관계의 근거가 없으면 연애 호감을 창작하지 않는다. 검증된 감정이 있다면 거짓으로 부정하지 않고, 당황한 말투나 행동에서 민망함을 드러낼 수 있다.'
 ].join('\n');
const v7=V6_SYSTEM+'\n'+PUBLIC_STYLE;
if(!v7.startsWith(V6_SYSTEM+'\n')||v7.length<2500||v7.length>8000)throw Error('PUBLIC_STYLE_INVALID');
const sha=createHash('sha256').update(v7).digest('hex');
const OUT='yeoul-v7-unseen-comparison.json', HTML='yeoul-v7-unseen-comparison.html';
const output={model:MODEL,status:'STARTED',v7Sha256:sha,privateExamplesIncluded:false,source:'v6-v7-public-style-no-private-anchors',completedCalls:0,plannedCalls:18,rows:[],error:null,humanReviewed:false,productionEligible:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){
 writeFileSync(OUT,JSON.stringify(output,null,2)+'\n',{mode:0o600});
 const rows=output.rows.map(r=>'<tr><th>'+esc(r.id)+'<p>'+esc(r.message)+'</p></th><td>'+esc(r.v6?.text||'—')+'</td><td>'+esc(r.v7?.text||'—')+'</td></tr>').join('');
 writeFileSync(HTML,'<!doctype html><html lang="ko"><meta charset="utf-8"><title>여울 v6 vs v7 신규 상황 실측</title><style>body{font:16px/1.6 system-ui;max-width:1250px;margin:24px auto;padding:16px;background:#f5f7fb;color:#182339}table{border-collapse:collapse;width:100%;background:white}th,td{border:1px solid #d8dfe9;padding:14px;white-space:pre-wrap;vertical-align:top}th{width:20%;background:#eaf0fa}td{width:40%}</style><h1>여울 v6 vs v7 · 신규 9개 상황</h1><p>같은 모델/동일 문맥 · 별도 사람 평가 필요 · 운영 미적용 · '+output.completedCalls+'/18</p><table><tr><th>상황</th><th>v6</th><th>v7</th></tr>'+rows+'</table></html>',{mode:0o600});
}
async function preflight(){
 const headers={Authorization:'Bearer '+key};
 const [a,m]=await Promise.all([
  fetch('https://openrouter.ai/api/v1/auth/key',{headers,signal:AbortSignal.timeout(20000)}),
  fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(20000)})
 ]);
 if(!a.ok||!m.ok)throw Error('PROVIDER_PREFLIGHT_FAILED');
 if(!(await m.json()).data?.some(x=>x.id===MODEL))throw Error('MODEL_MISSING');
}
async function call(system,user){
 const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
  method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul v6-v7 research-only'},
  body:JSON.stringify({model:MODEL,messages:[{role:'system',content:system},{role:'user',content:user}],max_completion_tokens:750,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
  signal:AbortSignal.timeout(90000)
 });
 if(!res.ok)throw Error('MODEL_HTTP_'+res.status);
 const data=await res.json();
 if(![MODEL,'gpt-6-luna'].includes(data.model))throw Error('MODEL_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 output.completedCalls++;
 return {text:answer,usage:data.usage??null};
}
save();
try{
 await preflight();
 for(const p of PLAN){
  const row={id:p.id,message:p.message,relationship:p.relationship,verifiedEventCount:p.verifiedEventCount,v6:null,v7:null};
  output.rows.push(row);save();
  for(const version of p.order){row[version]=await call(version==='v6'?V6_SYSTEM:v7,p.user);save();}
  console.log('PAIR_DONE',JSON.stringify({id:p.id,completedCalls:output.completedCalls}));
 }
 output.status='ACTUAL_REPLIES_UNREVIEWED';save();
}catch(e){output.status='HOLD_PARTIAL';output.error=String(e?.message??'ERR').replace(/[^A-Za-z0-9_]/g,'').slice(0,70);save();throw Error(output.error);}
