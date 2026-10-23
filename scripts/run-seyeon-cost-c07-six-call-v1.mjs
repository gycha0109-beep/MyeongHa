/**
 * COST-07 3-case x Original/Compact = maximum 6 paid Luna classification
 * calls. Manual main only, first dispatch only. No retries, user data,
 * private biography, Production writes or source authority changes.
 */
import {appendFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {createOpenAiSeyeonStructuredProviderV1} from
 '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import {createSeyeonUnifiedPreflightShadowV1} from
 '../dist/apps/api/src/seyeon-unified-preflight-shadow-v1.js';
import {SEYEON_C04_UNIFIED_PREFLIGHT_COMPACT_CANDIDATE_V1 as COMPACT}
 from './seyeon-cost-c04-preflight-compact-offline-v1.mjs';
import {
 SEYEON_C07_BOUNDARY_MATRIX_V1 as GOLD,
 scoreSeyeonC07BoundaryV1 as score,
} from './seyeon-cost-c07-cross-topic-boundary-v1.mjs';
import {
 SEYEON_C07_SIX_CALL_RUNTIME_POLICY_V1 as P,
 createSeyeonC07SixCallQuotaV1,
} from './seyeon-cost-c07-six-call-budget-v1.mjs';

const key=process.env.OPENAI_API_KEY2?.trim();
const evidencePath=process.env.SEYEON_C07_EVIDENCE_PATH||
 './.evidence/seyeon-c07-six-call-eval.jsonl';
const reportPath=process.env.SEYEON_C07_REPORT_PATH||
 './.evidence/seyeon-c07-six-call-report.json';

async function journal(record){
 await appendFile(evidencePath,JSON.stringify({
  observedAt:new Date().toISOString(),...record,
 })+'\n',{mode:0o600});
}

async function main(){
 if(!process.env.GITHUB_RUN_ID||
  process.env.GITHUB_RUN_ATTEMPT!=='1'||
  process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
  process.env.SEYEON_C07_ONCE_ADMITTED_RUN_ID!==
   process.env.GITHUB_RUN_ID||
  !key||key.length<20)
  throw Error('C07 six-call paid pilot missing first-run KEY2 admission');
 const exactGold=[
  ['F02','가족 때문에 많이 속상했던 기억 있어?','family_emotional_history',[]],
  ['R01','예전에 사귀던 사람이 있긴 했어?','past_romance_surface',[]],
  ['H02','전에 같이 놀이공원에 갔을 때 네가 울었던 거 기억해?',null,
   ['SHARED_EVENT_CLAIM']],
 ];
 for(const [id,text,topic,kinds] of exactGold){
  const found=GOLD.find(c=>c.id===id);
  if(!found||found.text!==text||found.topic!==topic||
   JSON.stringify(found.expectedKinds)!==JSON.stringify(kinds))
   throw Error('C07 pilot Gold fixture changed: '+id);
 }
 await mkdir(dirname(evidencePath),{recursive:true});
 await mkdir(dirname(reportPath),{recursive:true});
 await writeFile(evidencePath,'',{mode:0o600,flag:'wx'});
 const quota=createSeyeonC07SixCallQuotaV1(),results=[];
 let blocker=null;
 try{
  outer:for(const id of P.caseIds){
   const gold=GOLD.find(x=>x.id===id);
   if(!gold)throw Error('C07 missing validated source Gold');
   for(const variant of P.variants){
    let receipt=null;
    const provider=createOpenAiSeyeonStructuredProviderV1({
     apiKey:key,model:P.model,maxOutputTokens:P.maxOutputTokens,
     timeoutMs:30000,
     async meteredBeforeDispatch(call,serializedBody){
      if(typeof serializedBody!=='string'||
       Buffer.byteLength(serializedBody,'utf8')!==call.requestBodyBytes)
       throw Error('C07 provider serialized request mismatch');
      const reservation=quota.reserve({
       caseId:id,variant,callId:call.callId,purpose:call.purpose,
       modelKey:call.modelKey,requestBodyBytes:call.requestBodyBytes,
      });
      await journal({kind:'reservation',...reservation});
     },
     async meteredAfterOutcome(event){
      receipt=quota.observe(event);
      await journal({kind:'provider_outcome',caseId:id,variant,
       ...receipt,providerInvoiceReconciled:false});
     },
    });
    const wrapped=variant==='original'?provider:Object.freeze({
     providerKey:provider.providerKey,modelKey:provider.modelKey,
     generate(req){
      if(req.purpose!=='unified_preflight_shadow')
       throw Error('C07 incorrect provider purpose');
      return provider.generate({...req,instructions:COMPACT});
     },
    });
    const classifier=createSeyeonUnifiedPreflightShadowV1(wrapped);
    const start=performance.now();
    try{
     const response=await classifier.classify({
      characterId:'seyeon',userText:gold.text,
     });
     if(!receipt||receipt.observation!=='USAGE_BOUNDED_ESTIMATE')
      throw Error('C07 provider result unmetered or out of policy');
     const row=Object.freeze({
      ...score(gold,{
       topicKey:response.disclosure.topicKey,
       claimKinds:response.integrity.claims.map(c=>c.kind),
      }),
      variant,elapsedMs:Math.round(performance.now()-start),
      estimatedCostMicroUsd:receipt.estimatedCostMicroUsd,
     });
     results.push(row);
     await journal({kind:'classification_result',...row});
     if(row.verdict!=='MATCHED_GOLD_SCREEN'){
      blocker='CLASSIFIER_SCREEN_HOLD';
      break outer;
     }
    }catch{
     blocker='PROVIDER_OR_METERING_HOLD';
     await journal({kind:'screen_halt',caseId:id,variant,reason:blocker});
     break outer;
    }
   }
  }
 }finally{
  const budget=quota.snapshot();
  const finished=!blocker&&results.length===P.maxNewCalls;
  const output=Object.freeze({
   schemaVersion:'seyeon-c07-three-case-six-call-paid-screen-v1',
   scope:'THREE_PUBLIC_SYNTHETIC_CLASSIFIER_CASES_ONLY',
   priorPaidCalls:5,results,budget,stopReason:blocker,
   completeSixCalls:finished,
   modelQualityVerified:false,
   productionPromotionPermitted:false,
   providerInvoiceReconciled:false,actualBilledKrw:null,
  });
  await writeFile(reportPath,JSON.stringify(output,null,2),{mode:0o600});
  console.info('SEYEON_C07_SIX_CALL_SUMMARY '+JSON.stringify({
   priorPaidCalls:budget.historicPaidCalls,
   newCalls:budget.newAttemptedCalls,
   observedCalls:budget.newObservedCalls,
   matchedCases:results.length,
   totalProvisionalEstimateMicroUsd:budget.estimatedTotalMicroUsd,
   lifetimeReservedStressKrw:budget.stressReservedKrw,
   ownerTotalBudgetKrw:budget.ownerBudgetKrw,
   blocker,completeSixCalls:finished,actualBilledKrw:null,
  }));
 }
 if(blocker)throw Error('C07 six-call paid pilot HOLD: '+blocker);
 if(results.length!==6)throw Error('C07 six-call pilot incomplete');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();
