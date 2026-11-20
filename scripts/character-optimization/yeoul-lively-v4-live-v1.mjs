/** Manual GPT-6 Luna v3 vs v4 side-by-side, same source-backed eight cases. */
import {writeFileSync} from 'node:fs';
import {V3_SYSTEM,LIVELY_SYSTEM,LIVELY_EXAMPLES,cases,buildLively} from './yeoul-lively-voice-v4.mjs';
const MODEL='openai/gpt-6-luna',OUT='yeoul-lively-v4-live-results.json',HTML='yeoul-lively-v4-comparison.html';
const plan=cases.map((c,i)=>({id:c.id,message:c.message,user:buildLively(c.id).user,order:i%2?['v4','v3']:['v3','v4']}));
const systems={v3:V3_SYSTEM,v4:LIVELY_SYSTEM};
if(plan.length!==8||new Set(plan.map(x=>x.id)).size!==8||LIVELY_EXAMPLES.length!==6)throw Error('PLAN_MISMATCH');
if(plan.some(p=>!p.user)||Object.values(systems).some(x=>x.length<400||x.length>3000))throw Error('SYSTEM_INVALID');
if(process.argv.includes('--plan-only')){console.log(JSON.stringify({model:MODEL,cases:plan.length,calls:16,
 systems:Object.fromEntries(Object.entries(systems).map(([k,v])=>[k,v.length])),exampleCount:LIVELY_EXAMPLES.length,contextIdentical:true,paidCalls:0},null,2));process.exit(0);}
if(process.env.GITHUB_ACTIONS==='true'&&(
 process.env.GITHUB_ACTOR!=='gycha0109-beep'||process.env.GITHUB_REF!=='refs/heads/main'||
 process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'))throw Error('OWNER_MAIN_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const res={model:MODEL,status:'STARTED',syntheticOnly:true,qualityReviewed:false,plannedCalls:16,completedCalls:0,rows:[],error:null};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){
 writeFileSync(OUT,JSON.stringify(res,null,2)+'\n',{mode:0o600});
 const rows=res.rows.map(r=>'<tr><th>'+escape(r.id)+'<p>'+escape(r.message)+'</p></th><td>'+escape(r.v3?.text||'미완료')+'</td><td>'+escape(r.v4?.text||'미완료')+'</td></tr>').join('');
 const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
 '<title>여울 938자 vs 생동감 강화 v4 실측</title><style>body{font:16px/1.6 system-ui;max-width:1300px;margin:30px auto;padding:0 16px;background:#f7f9fc}table{width:100%;border-collapse:collapse;background:white}th,td{border:1px solid #ddd;padding:16px;vertical-align:top;text-align:left;white-space:pre-wrap;width:40%}th{width:20%;background:#edf2fb}p{font-size:14px;color:#475569}pre{white-space:pre-wrap}</style>'+
 '<h1>여울 3안(예시 4개) vs 4안(생동감 강화)</h1><p>같은 8개 장면·동일한 User/Bible/Runtime 문맥, 시스템만 변경. 상태 '+escape(res.status)+' / '+res.completedCalls+'/16; 사람 품질 판단 미확정</p>'+
 '<table><tr><th>장면</th><th>기존 938자</th><th>새 여울 v4</th></tr>'+rows+'</table>'+
 '<h2>비교 지표</h2><p>즉각적 반응 · 실제 재미 · 자연스러운 틱틱거림 · 마음을 들킨 반응 · 상황별 진지함 · 허위 간식/우산/기억 생성 · 문구 복붙</p></html>';
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
 let response;try{
 response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
 method:'POST',redirect:'error',
 headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
  'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul Lively Voice V4'},
 body:JSON.stringify({model:MODEL,messages:[{role:'system',content:system},{role:'user',content:user}],
  max_completion_tokens:750,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
 signal:AbortSignal.timeout(90000)
 });}catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!response.ok)throw Error('MODEL_HTTP_'+response.status+'_NO_RETRY');
 const data=await response.json();
 if(![MODEL,'gpt-6-luna'].includes(data.model))throw Error('MODEL_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 res.completedCalls++;return {text:answer,usage:data.usage||null};
}
persist();try{
 await preflight();
 for(const p of plan){
  const row={id:p.id,message:p.message,v3:null,v4:null};res.rows.push(row);persist();
  for(const variant of p.order){row[variant]=await call(systems[variant],p.user);persist();}
  console.log('YEOUL_V4_PAIR',JSON.stringify({id:p.id,completed:res.completedCalls}));
 }
 res.status='ACTUAL_REPLIES_UNREVIEWED';persist();
}catch(err){res.status='HOLD_PARTIAL';res.error=String(err?.message||'UNKNOWN').replace(/[^a-zA-Z0-9_]/g,'').slice(0,80);persist();throw err;}
