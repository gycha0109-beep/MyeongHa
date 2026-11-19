/** Live role framing isolation test for full source-grounded Yeoul prompt packets. */
import {writeFileSync} from 'node:fs';
import {cases,build} from './yeoul-runtime-role-prompt-v1.mjs';

const MODEL='openai/gpt-6-luna';
const RESULT='yeoul-runtime-role-live-results.json';
const plans=cases.map(c=>({id:c.id,plain:build(c.id),framed:build(c.id,{roleFrame:true})}));
for(const p of plans){
 if(p.plain.runtimeSha256!==p.framed.runtimeSha256||p.plain.bibleSha256!==p.framed.bibleSha256)
  throw Error('SOURCE_MISMATCH');
 if(!p.framed.system.endsWith(p.plain.system))throw Error('NOT_ROLE_ONLY_DELTA');
 if(p.plain.user!==p.framed.user)throw Error('USER_INPUT_MISMATCH');
 if(p.plain.system.length<4500||p.plain.runtimeSections.length<20||p.plain.bibleSections.length<12)
  throw Error('EXTRACTION_TOO_SHALLOW');
}
if(process.argv.includes('--plan-only')){
 console.log('YEOUL_RUNTIME_ROLE_PLAN',JSON.stringify({model:MODEL,cases:plans.length,
  plannedCalls:plans.length*2,promptChars:plans.map(x=>({case:x.id,plain:x.plain.system.length,framed:x.framed.system.length})),
  sourceHash:{runtime:plans[0].plain.runtimeSha256,bible:plans[0].plain.bibleSha256},
  paidCalls:0}));
 process.exit(0);
}
if(process.env.GITHUB_ACTIONS==='true'&&(
 process.env.GITHUB_ACTOR!=='gycha0109-beep'||
 process.env.GITHUB_REF!=='refs/heads/main'||
 process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
 process.env.GITHUB_RUN_ATTEMPT!=='1'
))throw Error('OWNER_MAIN_MANUAL_ONLY');
const key=process.env.OPENROUTER_API_KEY;
if(typeof key!=='string'||!key.startsWith('sk-or-v1-'))
 throw Error('OPENROUTER_API_KEY_UNAVAILABLE');
const result={model:MODEL,comparison:'same extracted runtime and bible; add service-role frame only',
 syntheticOnly:true,sourceStatus:'DRAFT_NOT_PRODUCTION',
 status:'STARTED',plannedCalls:plans.length*2,completedCalls:0,
 responses:[],humanReviewed:false,qualityImprovementProven:false,
 sourceHash:{runtime:plans[0].plain.runtimeSha256,bible:plans[0].plain.bibleSha256},
 error:null};
function persist(){writeFileSync(RESULT,JSON.stringify(result,null,2)+'\n',{mode:0o600});}
async function preflight(){
 const headers={Authorization:'Bearer '+key,Accept:'application/json'};
 const auth=await fetch('https://openrouter.ai/api/v1/auth/key',{headers,signal:AbortSignal.timeout(20000)});
 if(auth.status!==200)throw Error('OPENROUTER_AUTH_'+auth.status);
 const models=await fetch('https://openrouter.ai/api/v1/models',{headers,signal:AbortSignal.timeout(20000)});
 if(models.status!==200)throw Error('OPENROUTER_CATALOG_'+models.status);
 if(!(await models.json()).data?.some(x=>x.id===MODEL))throw Error('LUNA_MODEL_UNLISTED');
}
async function infer(item) {
 let response;
 try {
  response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
     'HTTP-Referer':'https://github.com/gycha0109-beep/MyeongHa',
     'X-Title':'Yeoul Runtime Role Framing A/B'},
   body:JSON.stringify({model:MODEL,
    messages:[{role:'system',content:item.system},{role:'user',content:item.user}],
    max_tokens:800,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
   signal:AbortSignal.timeout(90000)
  });
 }catch{throw Error('NETWORK_OR_TIMEOUT_NO_RETRY');}
 if(!response.ok)throw Error('MODEL_HTTP_'+response.status+'_NO_RETRY');
 const data=await response.json();
 if(!['openai/gpt-6-luna','gpt-6-luna'].includes(data.model))throw Error('MODEL_MISMATCH');
 const answer=data.choices?.[0]?.message?.content?.trim();
 if(!answer)throw Error('EMPTY_REPLY');
 result.completedCalls++;
 return {answer,usage:data.usage||null,model:data.model};
}
persist();
try {
 await preflight();
 for(const p of plans){
  const row={id:p.id,input:cases.find(x=>x.id===p.id).message,
   relationship:cases.find(x=>x.id===p.id).relationship,
   sceneFacts:cases.find(x=>x.id===p.id).sceneFacts,
   promptChars:{noRole:p.plain.system.length,roleFramed:p.framed.system.length},
   promptSha256:{noRole:p.plain.promptSha256,roleFramed:p.framed.promptSha256},
   sourceHeadings:{runtime:p.plain.runtimeSections,bible:p.plain.bibleSections},
   noRole:null,roleFramed:null};
  for(const [arm,packet] of [['noRole',p.plain],['roleFramed',p.framed]]){
   row[arm]=await infer(packet);
   persist();
   console.log('YEOUL_ROLE_CALL',JSON.stringify({caseId:p.id,arm,completed:result.completedCalls}));
  }
  result.responses.push(row);
  persist();
  console.log('YEOUL_ROLE_PAIR',JSON.stringify({caseId:p.id,pairs:result.responses.length}));
 }
 result.status='ACTUAL_REPLIES_UNREVIEWED';
 persist();
 console.log('YEOUL_ROLE_COMPLETE',JSON.stringify({calls:result.completedCalls,pairs:result.responses.length}));
} catch(error){
 result.status='HOLD_PARTIAL';
 result.error=String(error?.message||'UNKNOWN_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
 persist();
 throw error;
}
