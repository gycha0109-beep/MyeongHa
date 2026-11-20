/** Manual, research-only GPT-6 Luna paired v5/v6 comparison (new synthetic scenarios). */
import {writeFileSync} from 'node:fs';
import {V5_SYSTEM,V6_SYSTEM,UNSEEN_CASES,makeComparisonUser} from './yeoul-everyday-reaction-v6.mjs';

const MODEL='openai/gpt-6-luna';
const OUT='yeoul-v6-comparison-results.json';
const HTML='yeoul-v6-comparison.html';
const systems={v5:V5_SYSTEM,v6:V6_SYSTEM};
const PAIRS=UNSEEN_CASES.length, MAX_CALLS=PAIRS*2;
if(PAIRS!==9||MAX_CALLS!==18||V5_SYSTEM===V6_SYSTEM)throw Error('COMPARISON_PLAN_INVALID');
const plan=UNSEEN_CASES.map((c,i)=>({
 id:c.id,message:c.message,relationship:c.relationship,
 verifiedEventCount:c.verifiedEvents?.length??0,
 user:makeComparisonUser(c),order:i%2?['v6','v5']:['v5','v6']
}));
if(plan.some(p=>JSON.parse(p.user).message!==p.message))throw Error('USER_CONTEXT_DRIFT');

if(process.argv.includes('--plan-only')){
 console.log(JSON.stringify({model:MODEL,cases:PAIRS,plannedCalls:MAX_CALLS,paidCalls:0,
  source:'v5-vs-v6',sameContext:plan.every(p=>p.order.length===2),
  unseenCaseIds:plan.map(p=>p.id),confirmedHistoryCases:plan.filter(p=>p.verifiedEventCount>0).map(p=>p.id)},null,2));
 process.exit(0);
}
if(process.env.YEOUL_PAID_APPROVAL!=='true')throw Error('EXPLICIT_OWNER_PAID_APPROVAL_REQUIRED');
if(process.env.GITHUB_ACTIONS==='true'&&
 (process.env.GITHUB_ACTOR!=='gycha0109-beep'||process.env.GITHUB_REF!=='refs/heads/main'||
  process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'))
 throw Error('OWNER_MAIN_ONCE_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const output={model:MODEL,status:'STARTED',syntheticOnly:true,qualityReviewed:false,
 completedCalls:0,plannedCalls:MAX_CALLS,rows:[],error:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){
 writeFileSync(OUT,JSON.stringify(output,null,2)+'\n',{mode:0o600});
 const rows=output.rows.map(r=>'<tr><th>'+esc(r.id)+'<p>'+esc(r.message)+'</p><p>관계 '+esc(r.relationship)+' / 확인된 사건 '+r.verifiedEventCount+'개</p></th><td>'+esc(r.v5?.text||'미완료')+'</td><td>'+esc(r.v6?.text||'미완료')+'</td></tr>').join('');
 const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>여울 v5-v6 새 상황 실측</title><style>body{font:16px/1.6 system-ui;max-width:1200px;margin:28px auto;padding:0 16px;background:#f5f7fb;color:#17243a}table{border-collapse:collapse;width:100%;background:white}th,td{border:1px solid #d8dfeb;padding:14px;white-space:pre-wrap;vertical-align:top;text-align:left}th{background:#eaf0fa;width:22%}td{width:39%}p{font-size:14px;color:#526174}</style></head><body><h1>여울 v5 vs v6 · 미사용 일상/관계 입력 9개</h1><p>동일 모델·동일 입력/관계 사건, 실행 순서 교차. 상태 '+esc(output.status)+' / '+output.completedCalls+'/'+MAX_CALLS+'. 사람 품질 평가 필요. 운영 미적용.</p><table><thead><tr><th>상황</th><th>v5</th><th>v6</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>';
 writeFileSync(HTML,html,{mode:0o600});
}
async function preflight(){
 const headers={Authorization:'Bearer '+key};
 const a=await fetch('https://openrouter.ai/api/v1/auth/key',{headers,signal:AbortSignal.timeout(20000)});
 if(!a.ok)throw Error('AUTH_'+a.status);
 const m=await fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(20000)});
 if(!m.ok)throw Error('CATALOG_'+m.status);
 if(!(await m.json()).data?.some(x=>x.id===MODEL))throw Error('MODEL_MISSING');
}
async function call(system,user){
 let response;
 try{
  response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
    'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul v5-v6 research only'},
   body:JSON.stringify({model:MODEL,messages:[{role:'system',content:system},{role:'user',content:user}],
    max_completion_tokens:750,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
   signal:AbortSignal.timeout(90000)
  });
 }catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!response.ok)throw Error('MODEL_HTTP_'+response.status+'_NO_RETRY');
 const data=await response.json();
 if(![MODEL,'gpt-6-luna'].includes(data.model))throw Error('MODEL_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 output.completedCalls++;
 return{text:answer,usage:data.usage??null};
}
save();
try{
 await preflight();
 for(const p of plan){
  const row={id:p.id,message:p.message,relationship:p.relationship,
   verifiedEventCount:p.verifiedEventCount,v5:null,v6:null};
  output.rows.push(row);save();
  for(const k of p.order){row[k]=await call(systems[k],p.user);save();}
  console.log('YEOUL_V6_PAIR',JSON.stringify({id:p.id,completedCalls:output.completedCalls}));
 }
 output.status='ACTUAL_REPLIES_UNREVIEWED';save();
}catch(e){
 output.status='HOLD_PARTIAL';
 output.error=String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
 save();throw e;
}
