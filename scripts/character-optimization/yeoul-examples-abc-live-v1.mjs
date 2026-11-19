/** Manual, bounded GPT-6 Luna ABC test: unchanged 488 vs 712 voice vs 488+four examples. */
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BASELINE_SYSTEM,VOICE_SYSTEM,EXAMPLE_SYSTEM,EXAMPLES,cases,buildWithExamples}
 from './yeoul-compact-examples-v3.mjs';

const MODEL='openai/gpt-6-luna';
const OUT='yeoul-examples-abc-live-results.json';
const HTML='yeoul-examples-abc-live-comparison.html';
const sha=x=>createHash('sha256').update(x).digest('hex');
const SYSTEMS={baseline:BASELINE_SYSTEM,voice:VOICE_SYSTEM,examples:EXAMPLE_SYSTEM};
const plans=cases.map((c,i)=>{
 const base=buildWithExamples(c.id);
 const order=[['baseline','voice','examples'],['voice','examples','baseline'],['examples','baseline','voice']][i%3];
 return {id:c.id,message:c.message,user:base.user,contextLength:base.contextLength,order};
});
if(plans.length!==8||new Set(plans.map(p=>p.id)).size!==8)throw Error('CASE_SET_DRIFT');
if(EXAMPLES.length!==4||!EXAMPLE_SYSTEM.startsWith(BASELINE_SYSTEM+'\n\n'))
 throw Error('EXAMPLES_CORE_CHANGED');
if(Object.values(SYSTEMS).some(x=>!x||x.length>1300))throw Error('INVALID_SYSTEM_SIZE');
if(process.argv.includes('--plan-only')){
 console.log(JSON.stringify({model:MODEL,cases:plans.length,variants:Object.keys(SYSTEMS),
 plannedCalls:plans.length*3,systemLengths:Object.fromEntries(Object.entries(SYSTEMS).map(([k,x])=>[k,x.length])),
 sharedUserContext:true,examples:EXAMPLES.length,paidCalls:0},null,2));
 process.exit(0);
}
if(process.env.GITHUB_ACTIONS==='true'&&(
 process.env.GITHUB_ACTOR!=='gycha0109-beep'||
 process.env.GITHUB_REF!=='refs/heads/main'||
 process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
 process.env.GITHUB_RUN_ATTEMPT!=='1'))throw Error('OWNER_MAIN_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const result={
 model:MODEL,status:'STARTED',qualityReviewed:false,syntheticOnly:true,plannedCalls:plans.length*3,
 completedCalls:0,systemLengths:Object.fromEntries(Object.entries(SYSTEMS).map(([k,x])=>[k,x.length])),
 systemHashes:Object.fromEntries(Object.entries(SYSTEMS).map(([k,x])=>[k,sha(x)])),
 systems:SYSTEMS,examples:EXAMPLES,rows:[],error:null
};
const e=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function report(){
 const rows=result.rows.map(r=>'<tr><th>'+e(r.id)+'<div class="small">'+e(r.userMessage)+'</div></th>'+
  ['baseline','voice','examples'].map(k=>'<td>'+e(r.answers[k]?.text||'미완료')+'</td>').join('')+'</tr>').join('\n');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>여울 GPT-6 Luna 3안 비교</title><style>body{font:16px/1.65 system-ui,-apple-system,sans-serif;background:#f7f8fb;color:#162133;margin:32px auto;max-width:1400px;padding:0 18px}h1{font-size:26px}p{color:#475569}table{border-collapse:collapse;width:100%;background:white}td,th{border:1px solid #d9dfec;text-align:left;vertical-align:top;padding:14px;min-width:210px;white-space:pre-wrap}th{background:#edf2fc}.small{font-weight:400;color:#64748b;margin-top:7px}td{font-size:15px}@media(max-width:900px){table{display:block;overflow-x:auto}}details{margin:20px 0;background:white;padding:16px;border:1px solid #dde3ed;border-radius:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>'+
 '<h1>여울 말투 비교 · 실제 GPT-6 Luna 응답</h1>'+
 '<p>동일한 8개 상황·동일한 Bible/Runtime 맥락을 사용했습니다. 시스템 메시지만 다릅니다. 상태: '+e(result.status)+
 ' · 성공 호출: '+e(result.completedCalls)+' / '+e(result.plannedCalls)+' · 품질 판정 미확정</p>'+
 '<p>비교 기준: 활발한 틱틱거림, 여울 고유 리듬, 친절한 AI 비서 말투 회피, 예시 문구 반복 여부, 근거 없는 과거·행동 생성, 진지한 갈등 대응.</p>'+
 '<table><thead><tr><th>장면·입력</th><th>488자 기존</th><th>712자 말투 강화</th><th>488자 + 대사 예시 4개 ('+e(EXAMPLE_SYSTEM.length)+'자)</th></tr></thead><tbody>'+rows+'</tbody></table>'+
 '<details><summary>네 가지 시스템 대사 예시</summary><pre>'+e(EXAMPLES.map(x=>x.kind+'\n상대: '+x.input+'\n여울: '+x.reply).join('\n\n'))+'</pre></details>'+
 '<details><summary>시스템 지침 원문</summary>'+Object.entries(SYSTEMS).map(([k,v])=>'<h3>'+e(k)+'</h3><pre>'+e(v)+'</pre>').join('')+'</details>'+
 '<p>이 파일은 합성 테스트 결과이며 운영 캐릭터 응답의 품질을 자동으로 보증하지 않습니다.</p></body></html>';
}
function save(){writeFileSync(OUT,JSON.stringify(result,null,2)+'\n',{mode:0o600});writeFileSync(HTML,report(),{mode:0o600});}
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
 try{response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
  method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,
   'Content-Type':'application/json','HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa',
   'X-Title':'Yeoul speech four-example ABC'},
  body:JSON.stringify({model:MODEL,messages:[{role:'system',content:system},
   {role:'user',content:user}],max_completion_tokens:750,stream:false,
   provider:{allow_fallbacks:false,data_collection:'deny'}}),
  signal:AbortSignal.timeout(90000)
 });}catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!response.ok)throw Error('MODEL_HTTP_'+response.status+'_NO_RETRY');
 const data=await response.json();
 if(![MODEL,'gpt-6-luna'].includes(data.model))throw Error('MODEL_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 result.completedCalls++;
 return {text:answer,usage:data.usage||null};
}
save();
try{
 await preflight();
 for(const p of plans){
  const r={id:p.id,userMessage:p.message,contextLength:p.contextLength,
   order:p.order,answers:{}};
  result.rows.push(r);save();
  for(const k of p.order){r.answers[k]=await call(SYSTEMS[k],p.user);save();}
  console.log('YEOUL_EXAMPLE_ABC_CASE',JSON.stringify({id:p.id,completed:result.completedCalls}));
 }
 result.status='ACTUAL_REPLIES_UNREVIEWED';save();
}catch(err){
 result.status='HOLD_PARTIAL';
 result.error=String(err?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
 save();throw err;
}
