/** Live role framing isolation test for full source-grounded Yeoul prompt packets. */
import {writeFileSync} from 'node:fs';
import {cases,buildFull} from './yeoul-identity-full-prompt-v2.mjs';

const MODEL='openai/gpt-6-luna';
const RESULT='yeoul-identity-full-live-results.json';
const plans=cases.map(c=>({id:c.id,plain:buildFull(c.id),framed:buildFull(c.id,{roleFrame:true})}));
for(const p of plans){
 if(JSON.stringify(p.plain.sourceHashes)!==JSON.stringify(p.framed.sourceHashes))
  throw Error('SOURCE_MISMATCH');
 if(!p.framed.system.endsWith(p.plain.system))throw Error('NOT_ROLE_ONLY_DELTA');
 if(p.plain.user!==p.framed.user)throw Error('USER_INPUT_MISMATCH');
 if(p.plain.system.length<95000)throw Error('FULL_SOURCES_NOT_INCLUDED');
 if(p.plain.identityMarkers.length<6||!p.plain.system.includes('## B1. 기본 정체성'))
  throw Error('IDENTITY_B1_NOT_INCLUDED');
}
if(process.argv.includes('--plan-only')){
 console.log('YEOUL_RUNTIME_ROLE_PLAN',JSON.stringify({model:MODEL,cases:plans.length,
  plannedCalls:plans.length*2,roleOnlyDifference:true,identityExplicit:true,promptChars:plans.map(x=>({case:x.id,plain:x.plain.system.length,framed:x.framed.system.length})),
  sourceHash:plans[0].plain.sourceHashes,
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
const result={model:MODEL,comparison:'same complete Bible, Runtime and Runtime Standard plus B1 identity; service-role framing only',
 syntheticOnly:true,sourceStatus:'DRAFT_NOT_PRODUCTION',
 status:'STARTED',plannedCalls:plans.length*2,completedCalls:0,
 responses:[],humanReviewed:false,qualityImprovementProven:false,
 sourceHash:plans[0].plain.sourceHashes,
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
     'X-Title':'Yeoul Complete Bible Runtime Identity Role A/B'},
   body:JSON.stringify({model:MODEL,
    messages:[{role:'system',content:item.system},{role:'user',content:item.user}],
    max_tokens:1000,stream:false,provider:{allow_fallbacks:false,data_collection:'deny'}}),
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
   sourceLengths:p.plain.sourceLengths,identityMarkers:p.plain.identityMarkers,
   noRole:null,roleFramed:null};
  result.responses.push(row);
  persist();
  for(const [arm,packet] of [['noRole',p.plain],['roleFramed',p.framed]]){
   row[arm]=await infer(packet);
   persist();
   console.log('YEOUL_IDENTITY_FULL_CALL',JSON.stringify({caseId:p.id,arm,completed:result.completedCalls}));
  }
  persist();
  console.log('YEOUL_IDENTITY_FULL_PAIR',JSON.stringify({caseId:p.id,pairs:result.responses.length}));
 }
 result.status='ACTUAL_REPLIES_UNREVIEWED';
 persist();
 console.log('YEOUL_IDENTITY_FULL_COMPLETE',JSON.stringify({calls:result.completedCalls,pairs:result.responses.length}));
} catch(error){
 result.status='HOLD_PARTIAL';
 result.error=String(error?.message||'UNKNOWN_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
 persist();
 throw error;
}
