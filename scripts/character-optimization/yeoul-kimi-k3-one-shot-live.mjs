/** Yeoul Kimi K3 single-arm research: exactly the original 9 one-shot prompts. */
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeComparisonUser} from './yeoul-everyday-reaction-v6.mjs';
const MODEL='moonshotai/kimi-k3';
export const V8_SYSTEM=[
  '너는 여울이야. 24세 여성으로, 자존심 세고 장난기 많고 조금 얄미운 츤데레야.',
  '평소엔 상대를 틱틱대며 놀리지만, 신경 쓰이는 일이 생기면 결국 챙겨주고 말아. 마음을 들키면 괜히 발끈하거나 딴청을 피워.',
  '실제 20대 한국 여성이 카톡하는 것처럼 자연스러운 존댓말로 말해. 억지 농담이나 멋 부린 비유를 만들지 말고, 네 성격대로 반응해.',
  '상대와의 관계나 과거를 지어내지 마. 진짜 상처를 줬으면 장난치지 말고 사과해.',
  '여울의 대사만 출력해.'
].join('\n');
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
const PLAN=CASES.map(c=>({id:c.id,message:c.message,relationship:c.relationship,verifiedEventCount:c.verifiedEvents?.length??0,user:makeComparisonUser({...c,sceneFacts:[],verifiedEvents:c.verifiedEvents??[]})}));
if(PLAN.length!==9||new Set(PLAN.map(c=>c.id)).size!==9)throw Error('INVALID_CASES');
if(process.argv.includes('--plan-only')){console.log(JSON.stringify({version:'kimi-k3-one-shot',model:MODEL,systemPromptChars:V8_SYSTEM.length,plannedCalls:9,previousVersionCalls:0,caseIds:PLAN.map(c=>c.id)}));process.exit(0);}
if(process.env.YEOUL_PAID_APPROVAL!=='true')throw Error('OWNER_PAID_APPROVAL_REQUIRED');
if(process.env.GITHUB_ACTIONS==='true'&&(process.env.GITHUB_ACTOR!=='gycha0109-beep'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'))throw Error('OWNER_MAIN_ONCE_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const OUT='yeoul-kimi-k3-one-shot-results.json',HTML='yeoul-kimi-k3-one-shot-results.html';
const output={model:MODEL,version:'kimi-k3-one-shot',status:'STARTED',plannedCalls:9,completedCalls:0,previousVersionCalls:0,source:'kimi-k3-one-shot-existing-v8-248-char',systemSha256:createHash('sha256').update(V8_SYSTEM).digest('hex'),humanReviewed:false,productionEligible:false,rows:[],error:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){
 writeFileSync(OUT,JSON.stringify(output,null,2)+'\n',{mode:0o600});
 const rows=output.rows.map(r=>'<tr><th>'+esc(r.id)+'<p>'+esc(r.message)+'</p></th><td>'+esc(r.v8?.text??'미수집')+'</td></tr>').join('');
 const doc='<!doctype html><html lang="ko"><meta charset="utf-8"><title>여울 Kimi K3 단발 실측</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:25px auto;padding:0 16px;background:#f4f6fa;color:#182335}table{border-collapse:collapse;width:100%;background:white}th,td{padding:15px;border:1px solid #d9e0eb;white-space:pre-wrap;text-align:left;vertical-align:top}th{width:33%;background:#eaf0fa}</style><h1>여울 Kimi K3 단발 실측</h1><p>다른 모델 재호출 없음 · '+output.completedCalls+'/9 · 사람 품질 평가 필요</p><table><tr><th>상황</th><th>v8</th></tr>'+rows+'</table></html>';
 writeFileSync(HTML,doc,{mode:0o600});
}
async function preflight(){
 const headers={Authorization:'Bearer '+key};
 const a=await fetch('https://openrouter.ai/api/v1/auth/key',{headers,signal:AbortSignal.timeout(20000)});
 if(!a.ok)throw Error('AUTH_'+a.status);
 const m=await fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(20000)});
 if(!m.ok||!(await m.json()).data?.some(x=>x.id===MODEL))throw Error('MODEL_UNAVAILABLE');
}
async function call(user){
 let res;
 try{res=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul Kimi K3 single research'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:V8_SYSTEM},{role:'user',content:user}],max_completion_tokens:750,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),signal:AbortSignal.timeout(90000)});}catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!res.ok)throw Error('MODEL_HTTP_'+res.status);
 const data=await res.json();
 if(![MODEL,'kimi-k3'].includes(data.model))throw Error('MODEL_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 output.completedCalls++;
 return {text:answer,usage:data.usage??null};
}
save();
try{
 await preflight();
 for(const c of PLAN){
  const row={id:c.id,message:c.message,relationship:c.relationship,verifiedEventCount:c.verifiedEventCount,v8:null};
  output.rows.push(row);save();row.v8=await call(c.user);save();
  console.log('V8_DONE',JSON.stringify({id:c.id,completedCalls:output.completedCalls}));
 }
 output.status='ACTUAL_REPLIES_UNREVIEWED';save();
}catch(e){output.status='HOLD_PARTIAL';output.error=String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,75);save();throw Error(output.error);}
