/** Side-by-side real responses for previous 488-char Yeoul system and stronger 712-char voice system. */
import {writeFileSync} from 'node:fs';
import {cases,baseline,VOICE_SYSTEM,buildVoice} from './yeoul-voice-system-v2.mjs';
const MODEL='openai/gpt-6-luna',OUT='yeoul-voice-ab-live-results.json';
const plan=cases.map(c=>({id:c.id,baseline:buildVoice(c.id),voice:buildVoice(c.id)}));
for(const p of plan){
 p.baseline={...p.baseline,system:baseline};
 if(p.baseline.user!==p.voice.user)throw Error('USER_CONTEXT_MISMATCH');
 if(p.baseline.system===p.voice.system)throw Error('SAME_SYSTEM');
}
if(process.argv.includes('--plan-only')){
 console.log(JSON.stringify({model:MODEL,cases:plan.length,calls:plan.length*2,
  baselineChars:baseline.length,voiceChars:VOICE_SYSTEM.length,contextIdentical:true,
  paidCalls:0},null,2));process.exit(0);
}
if(process.env.GITHUB_ACTIONS==='true'&&(
 process.env.GITHUB_ACTOR!=='gycha0109-beep'||
 process.env.GITHUB_REF!=='refs/heads/main'||
 process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
 process.env.GITHUB_RUN_ATTEMPT!=='1'))throw Error('OWNER_MAIN_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(!key?.startsWith('sk-or-v1-'))throw Error('OPENROUTER_KEY_MISSING');
const result={model:MODEL,modelRoute:MODEL,baselineSystem:baseline,voiceSystem:VOICE_SYSTEM,
 baselineLength:baseline.length,voiceLength:VOICE_SYSTEM.length,
 cases:plan.length,plannedCalls:plan.length*2,completedCalls:0,status:'STARTED',
 qualityReviewed:false,syntheticOnly:true,rows:[],error:null};
function persist(){writeFileSync(OUT,JSON.stringify(result,null,2)+'\n',{mode:0o600});}
async function preflight(){
 const headers={Authorization:'Bearer '+key};
 const a=await fetch('https://openrouter.ai/api/v1/auth/key',{headers,signal:AbortSignal.timeout(20000)});
 if(!a.ok)throw Error('AUTH_'+a.status);
 const m=await fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(20000)});
 if(!m.ok)throw Error('CATALOG_'+m.status);
 if(!(await m.json()).data?.some(x=>x.id===MODEL))throw Error('MODEL_MISSING');
}
async function call(p){
 let response;
 try{response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
  method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,
   'Content-Type':'application/json','HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa',
   'X-Title':'Yeoul speech signature A/B'},
  body:JSON.stringify({model:MODEL,messages:[{role:'system',content:p.system},
   {role:'user',content:p.user}],max_tokens:750,stream:false,
   provider:{allow_fallbacks:false,data_collection:'deny'}}),
  signal:AbortSignal.timeout(90000)
 });}catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!response.ok)throw Error('MODEL_HTTP_'+response.status+'_NO_RETRY');
 const data=await response.json();
 if(![MODEL,'gpt-6-luna'].includes(data.model))throw Error('MODEL_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 result.completedCalls++;
 return {answer,usage:data.usage||null};
}
persist();
try{
 await preflight();
 for(const p of plan){
  const row={id:p.id,user:cases.find(x=>x.id===p.id).message,
   contextLen:p.voice.contextLength,baseline:null,voice:null};
  result.rows.push(row);persist();
  row.baseline=await call(p.baseline);persist();
  row.voice=await call(p.voice);persist();
  console.log('YEOUL_VOICE_PAIR',JSON.stringify({id:p.id,completed:result.completedCalls}));
 }
 result.status='ACTUAL_REPLIES_UNREVIEWED';persist();
}catch(err){
 result.status='HOLD_PARTIAL';result.error=String(err?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
 persist();throw err;
}
