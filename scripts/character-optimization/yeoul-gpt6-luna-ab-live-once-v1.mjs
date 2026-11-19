/** One manual GPT-6 Luna A/B execution; synthetic prompts only, no retries. */
import {spawnSync} from 'node:child_process';
const key=process.env.OPENAI_EVAL_API_KEY;
if(!key)throw Error('OPENAI_EVAL_API_KEY_REQUIRED');
const plan=spawnSync(process.execPath,['scripts/character-optimization/yeoul-gpt6-luna-ab-plan-v1.mjs'],{encoding:'utf8'});
if(plan.status!==0)throw Error('PLAN_FAILED: '+plan.stderr);
const parsed=JSON.parse(plan.stdout);
if(parsed.model!=='gpt-6-luna'||parsed.cases.length!==6)throw Error('PLAN_CONTRACT');
const results=[];
for(const c of parsed.cases){
 for(const arm of ['baseline','decisionFirst']){
  const req=c[arm];
  if(req.model!=='gpt-6-luna'||req.store!==false||req.max_output_tokens>600)throw Error('REQUEST_CONTRACT');
  const response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify(req),signal:AbortSignal.timeout(60000)
  });
  if(!response.ok)throw Error('MODEL_HTTP_'+response.status+'_AFTER_'+results.length+'_CALLS_NO_RETRY');
  const body=await response.json();
  if(body.model!=='gpt-6-luna'||body.status!=='completed')throw Error('MODEL_ID_OR_STATUS');
  const reply=(body.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('').trim();
  if(!reply)throw Error('EMPTY_REPLY_AFTER_'+results.length+'_CALLS');
  results.push({id:c.id,arm,reply,model:body.model,usage:body.usage});
  console.log('COMPLETED',c.id,arm);
 }
}
const {writeFileSync}=await import('node:fs');
writeFileSync('yeoul-gpt6-luna-ab-results.json',JSON.stringify({model:parsed.model,qualityStatus:'UNREVIEWED',results},null,2)+'\n',{flag:'wx',mode:0o600});
console.log('FINISHED',results.length,'UNREVIEWED');
