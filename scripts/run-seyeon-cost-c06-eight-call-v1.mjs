/**
 * Manual-only 8-request C06 *classification screening*, NOT a full 5→3 route
 * comparison. Imports compiled runtime. No retry, cache-price credit, private
 * data, database, production send, or OPENAI_API_KEY fallback.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { createOpenAiSeyeonStructuredProviderV1 } from
  '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import { createSeyeonUnifiedPreflightShadowV1 } from
  '../dist/apps/api/src/seyeon-unified-preflight-shadow-v1.js';
import { SEYEON_C06_EIGHT_CALL_GOLD_V1 } from './seyeon-cost-c06-eight-call-cases-v1.mjs';
import { SEYEON_C04_UNIFIED_PREFLIGHT_COMPACT_CANDIDATE_V1 as COMPACT }
  from './seyeon-cost-c04-preflight-compact-offline-v1.mjs';
import { SEYEON_C06_EIGHT_CALL_POLICY_V1 as P,
  createSeyeonC06EightCallQuotaV1 as quotaFactory }
  from './seyeon-cost-c06-eight-call-budget-v1.mjs';

import {scoreSeyeonC06ScreenCaseV1} from
  './seyeon-cost-c06-screen-score-v1.mjs';

const evidence=process.env.SEYEON_C06_EVIDENCE_PATH||
  './.evidence/seyeon-c06-eight-call-eval-v1.jsonl';
const reportPath=process.env.SEYEON_C06_REPORT_PATH||
  './.evidence/seyeon-c06-eight-call-eval-v1.json';
// The original 8-call script was used for 3 paid requests in run #38845185681.
// This runner has no durable cross-run usage/cost ledger. A manual re-run would
// reissue those three requests. V1 is deliberately retired/fail-closed.
// Review and implement a new, pinned cumulative resume protocol separately.
const C06_V1_REPLAY_LOCKED_AFTER_3_PAID_REQUESTS=true;
const key=process.env.OPENAI_API_KEY2?.trim();
const outputConfig=Object.freeze({
  model:P.model,maxOutputTokens:P.providerOutputTokenCap,
  timeoutMs:30000,
});
async function journal(record){
  await appendFile(evidence,JSON.stringify({
    observedAt:new Date().toISOString(),...record,
  })+'\n',{mode:0o600});
}
function decide(spec,result){
  return scoreSeyeonC06ScreenCaseV1(spec,{
    topicKey:result.disclosure.topicKey,
    claimKinds:result.integrity.claims.map(claim=>claim.kind),
  });
}
async function main(){
  if(C06_V1_REPLAY_LOCKED_AFTER_3_PAID_REQUESTS)
    throw new Error('C06_V1_REPLAY_LOCKED_AFTER_3_PAID_REQUESTS');
  if(!key||key.length<20)throw Error('Dedicated OPENAI_API_KEY2 missing; no fallback');
  await mkdir(dirname(evidence),{recursive:true});
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(evidence,'',{mode:0o600,flag:'wx'});
  const quota=quotaFactory(),results=[];
  let blocker=null;
  try{
    for(const caseId of P.caseIds){
      const spec=SEYEON_C06_EIGHT_CALL_GOLD_V1.find(g=>g.id===caseId);
      if(!spec)throw Error('C06 pinned synthetic case absent: '+caseId);
      for(const variant of P.variants){
        let lastReceipt=null;
        const provider=createOpenAiSeyeonStructuredProviderV1({
          apiKey:key,...outputConfig,
          async meteredBeforeDispatch(call,serializedBody){
            if(typeof serializedBody!=='string'||
                Buffer.byteLength(serializedBody,'utf8')!==call.requestBodyBytes)
              throw Error('C06 serializer mismatch');
            const reservation=quota.reserve({
              caseId,variant,callId:call.callId,
              modelKey:call.modelKey,purpose:call.purpose,
              requestBodyBytes:call.requestBodyBytes,
            });
            await journal({kind:'reservation',...reservation});
          },
          async meteredAfterOutcome(event){
            const receipt=quota.observe(event);
            await journal({kind:'outcome',caseId,variant,
              ...receipt,estimatedNotInvoiced:true});
            lastReceipt=receipt;
          },
        });
        const wrapped=variant==='original'?provider:Object.freeze({
          providerKey:provider.providerKey,modelKey:provider.modelKey,
          generate(request){
            if(request.purpose!=='unified_preflight_shadow')
              throw Error('C06 wrong model purpose');
            return provider.generate({...request,instructions:COMPACT});
          },
        });
        const classifier=createSeyeonUnifiedPreflightShadowV1(wrapped);
        const started=performance.now();
        try{
          const response=await classifier.classify({
            characterId:'seyeon',userText:spec.text,
          });
          if(!lastReceipt||lastReceipt.observation!=='USAGE_BOUNDED_ESTIMATE')
            throw Error('C06 missing or unsafe provider cost outcome');
          const result=decide(spec,response);
          const row=Object.freeze({...result,variant,
            elapsedMs:Math.round(performance.now()-started),
            providerEstimateMicroUsd:lastReceipt.estimatedCostMicroUsd});
          results.push(row);
          await journal({kind:'classification_result',...row});
          if(result.candidateGoldCheck!=='MATCHED_GOLD_SCREEN'){
            blocker='CLASSIFIER_SCREEN_HOLD';
            break;
          }
        }catch{
          blocker='PROVIDER_OR_METERING_HOLD';
          await journal({kind:'screen_halt',caseId,variant,
            reason:blocker});
          break;
        }
      }
      if(blocker)break;
    }
  }finally{
    const quotaSnapshot=quota.snapshot();
    const output=Object.freeze({
      schemaVersion:'seyeon-c06-eight-call-paid-screen-v1',
      scope:'PAID_SYNTHETIC_CLASSIFIER_SCREEN_ONLY',
      screenedPairs:results.length,
      quota:quotaSnapshot,classificationResults:results,
      stoppedReason:blocker,
      completeEightCalls:quotaSnapshot.attemptedCalls===8&&
        quotaSnapshot.observedOutcomes===8&&results.length===8,
      candidatePromotionPermitted:false,
      actualProviderBilledUsd:null,
      invoiceReconciled:false,
    });
    await writeFile(reportPath,JSON.stringify(output,null,2),{mode:0o600});
    console.info('SEYEON_C06_PAID_SCREEN_SUMMARY '+JSON.stringify({
      attempted:quotaSnapshot.attemptedCalls,
      observed:quotaSnapshot.observedOutcomes,
      checked:results.length,
      knownEstimateMicroUsd:quotaSnapshot.knownCostEstimateMicroUsd,
      totalEstimateMicroUsd:quotaSnapshot.totalCostEstimateMicroUsd,
      reservedMicroUsd:quotaSnapshot.reservedMicroUsd,
      blocked:blocker,actualBilledUsd:null,
    }));
  }
  if(blocker)throw Error('C06 paid classifier screen HOLD: '+blocker);
  if(results.length!==8)throw Error('C06 paid classifier screen incomplete');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await main();
}
