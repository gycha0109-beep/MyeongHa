/** Owner-dispatched synthetic GPT-6 Luna A/B: direct baseline vs Luna planner + Luna renderer. */
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const MODEL='gpt-6-luna', RESULT='yeoul-gpt6-luna-ab-results.json';
const planProcess=spawnSync(process.execPath,['scripts/character-optimization/yeoul-gpt6-luna-ab-plan-v1.mjs'],{encoding:'utf8'});
if(planProcess.status!==0)throw Error('YEOUL_PLAN_FAILED: '+String(planProcess.stderr).slice(0,250));
const plan=JSON.parse(planProcess.stdout);
if(plan.model!==MODEL||plan.cases?.length!==6)throw Error('YEOUL_PLAN_CONTRACT');
if(process.argv.includes('--plan-only')){
 console.log('YEOUL_LUNA_LIVE_PLAN',JSON.stringify({model:MODEL,cases:plan.cases.length,
    plannedInferences:plan.cases.length*3,paidCalls:0}));
 process.exit(0);
}
if(process.env.GITHUB_ACTIONS==='true' &&
 (process.env.GITHUB_ACTOR!=='gycha0109-beep'||process.env.GITHUB_REF!=='refs/heads/main'||
  process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'))
 throw Error('OWNER_MANUAL_MAIN_ONCE_ONLY');
const key=process.env.OPENAI_EVAL_API_KEY;
if(typeof key!=='string'||!key.startsWith('sk-'))throw Error('OPENAI_EVAL_API_KEY_UNAVAILABLE');

const result={model:MODEL,sourceStatus:'DRAFT_NOT_PRODUCTION',syntheticOnly:true,
 humanReviewed:false,qualityImprovementProven:false,
 plannedCases:6,plannedInferences:18,completedInferences:0,status:'STARTED',answers:[],error:null};
function persist(){
 writeFileSync(RESULT,JSON.stringify(result,null,2)+'\n',{mode:0o600});
}
async function infer(request){
 if(request.model!==MODEL||request.store!==false||request.max_output_tokens>1000)
  throw Error('INVALID_MODEL_OR_OUTPUT_ENVELOPE');
 let res;
 try {
  res=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});
 } catch {throw Error('MODEL_NETWORK_OR_TIMEOUT_NO_RETRY_BILLING_UNKNOWN');}
 if(!res.ok)throw Error('MODEL_HTTP_'+res.status+'_NO_RETRY');
 const data=await res.json();
 if(data.model!==MODEL||data.status!=='completed')throw Error('MODEL_ID_OR_STATUS');
 const text=(data.output||[]).flatMap(x=>x.content||[])
  .filter(x=>x.type==='output_text').map(x=>x.text||'').join('').trim();
 if(!text)throw Error('EMPTY_MODEL_REPLY');
 result.completedInferences++;
 return {text,usage:data.usage||null};
}
const decisionSchema={type:'object',additionalProperties:false,
 properties:{
  attention:{type:'string'},stance:{type:'string'},intent:{type:'string'},
  emotionalState:{type:'string'},evidenceLimit:{type:'string'}
 },
 required:['attention','stance','intent','emotionalState','evidenceLimit']};
function planningRequest(c){
 const baseline=c.baseline;
 const core=baseline.input[0].content;
 return {model:MODEL,store:false,reasoning:{effort:'low'},max_output_tokens:900,
  text:{format:{type:'json_schema',name:'yeoul_turn_decision',strict:true,schema:decisionSchema}},
  input:[{role:'system',content:core+'\n\n당신은 여울 본인입니다. 사용자에게 바로 답하지 말고, 이번 상황에서 여울이 무엇을 신경 쓰고, 어떤 입장을 취하고, 무엇을 하려 하고, 무엇을 사실로 볼 수 없는지 자기 기준으로 결정하세요. 정해진 감정이나 결과를 강요하지 않습니다. 관계 이력이 없으면 과거와 호감을 발명하지 않습니다. JSON 항목만 작성하세요.'},
   baseline.input[1]]};
}
function rendererRequest(c,decision){
 const request=c.decisionFirst;
 return {...request,max_output_tokens:900,
  input:[{role:'system',content:c.baseline.input[0].content+
   '\n\n[여울 본인이 현재 상황을 판단한 결과]\n'+JSON.stringify(decision)+
   '\n이 판단과 사실 제약을 따르되 사용자에게 계획이나 메타 정보를 말하지 마세요. 실제 여울의 대사만 자연스럽게 하세요.'},
   c.baseline.input[1]]};
}
persist();
for(const c of plan.cases){
 try {
  const baseline=await infer(c.baseline);
  const decisionResponse=await infer(planningRequest(c));
  let decision;
  try{decision=JSON.parse(decisionResponse.text);}
  catch{throw Error('INVALID_LUNA_DECISION_JSON');}
  if(Object.keys(decision).sort().join('|')!==Object.keys(decisionSchema.properties).sort().join('|'))
   throw Error('LUNA_DECISION_KEYS');
  const generated=await infer(rendererRequest(c,decision));
  result.answers.push({caseId:c.id,input:c.message,baseline:baseline.text,
   lunaDecision:decision,decisionFirst:generated.text,
   baselineUsage:baseline.usage,decisionUsage:decisionResponse.usage,renderUsage:generated.usage});
  persist();
  console.log('YEOUL_LUNA_AB_PAIR_COMPLETE',JSON.stringify({caseId:c.id,
    pairs:result.answers.length,completedInferences:result.completedInferences}));
 }catch(err){
  result.status='HOLD_PARTIAL';
  result.error={caseId:c.id,message:String(err?.message||'ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,100)};
  persist();
  throw err;
 }
}
result.status='ACTUAL_REPLIES_UNREVIEWED';
persist();
console.log('YEOUL_LUNA_AB_COMPLETE',JSON.stringify({pairs:result.answers.length,
 calls:result.completedInferences,qualityNotYetReviewed:true}));
