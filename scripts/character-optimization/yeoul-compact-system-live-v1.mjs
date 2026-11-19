/** Real GPT-6 Luna pilot using one concise system message and relevant context. */
import {writeFileSync} from 'node:fs';
import {cases,buildCompact,SYSTEM} from './yeoul-compact-system-v1.mjs';
const MODEL='openai/gpt-6-luna';
const OUT='yeoul-compact-system-live-results.json';
const packets=cases.map(c=>buildCompact(c.id));
if(SYSTEM.length>800||new Set(packets.map(x=>x.system)).size!==1)throw Error('SYSTEM_NOT_COMPACT_OR_STABLE');
if(packets.some(x=>x.contextLength>7500||x.systemLength!==SYSTEM.length))throw Error('SCENE_CONTEXT_INVALID');
if(process.argv.includes('--plan-only')){
 console.log('YEOUL_COMPACT_PLAN',JSON.stringify({model:MODEL,systemChars:SYSTEM.length,
  cases:packets.length,contextChars:packets.map(x=>({id:x.id,chars:x.contextLength})),paidCalls:0}));
 process.exit(0);
}
if(process.env.GITHUB_ACTIONS==='true'&&(
 process.env.GITHUB_ACTOR!=='gycha0109-beep'||process.env.GITHUB_REF!=='refs/heads/main'||
 process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'))
 throw Error('OWNER_MAIN_MANUAL_ONCE_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const result={model:MODEL,system:SYSTEM,status:'STARTED',responses:[],completedCalls:0,
 plannedCalls:packets.length,qualityReviewed:false,syntheticOnly:true,error:null};
const persist=()=>writeFileSync(OUT,JSON.stringify(result,null,2)+'\n',{mode:0o600});
async function ensureModel(){
 const h={Authorization:'Bearer '+key,Accept:'application/json'};
 const a=await fetch('https://openrouter.ai/api/v1/auth/key',{headers:h,signal:AbortSignal.timeout(20000)});
 if(!a.ok)throw Error('OPENROUTER_AUTH_'+a.status);
 const m=await fetch('https://openrouter.ai/api/v1/models',{headers:h,signal:AbortSignal.timeout(20000)});
 if(!m.ok)throw Error('OPENROUTER_MODELS_'+m.status);
 if(!(await m.json()).data?.some(x=>x.id===MODEL))throw Error('LUNA_NOT_LISTED');
}
async function call(p){
 let r;
 try{r=await fetch('https://openrouter.ai/api/v1/chat/completions',{
  method:'POST',redirect:'error',
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
   'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa','X-Title':'Yeoul compact system core'},
  body:JSON.stringify({model:MODEL,messages:[{role:'system',content:p.system},{role:'user',content:p.user}],
   max_tokens:800,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
  signal:AbortSignal.timeout(90000)
 });}catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!r.ok)throw Error('HTTP_'+r.status+'_NO_RETRY');
 const data=await r.json();
 if(![MODEL,'gpt-6-luna'].includes(data.model))throw Error('MODEL_ID_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 result.completedCalls++;
 return {answer,usage:data.usage,model:data.model};
}
persist();
try{
 await ensureModel();
 for(const p of packets){
  const row={id:p.id,message:cases.find(c=>c.id===p.id).message,
    sourceHeadings:p.sourceHeadings,contextChars:p.contextLength,output:null};
  result.responses.push(row);persist();
  row.output=await call(p);persist();
  console.log('YEOUL_COMPACT_REPLY',JSON.stringify({id:p.id,completed:result.completedCalls}));
 }
 result.status='ACTUAL_REPLIES_UNREVIEWED';persist();
 console.log('YEOUL_COMPACT_DONE',JSON.stringify({completedCalls:result.completedCalls}));
}catch(e){
 result.status='HOLD_PARTIAL';result.error=String(e?.message||'ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
 persist();throw e;
}
