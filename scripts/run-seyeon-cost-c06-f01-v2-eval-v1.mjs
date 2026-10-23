/**
 * Single-use F01 V2 evaluation; original and compact (two calls max).
 * No production writes, no retries, no fallback from OPENAI_API_KEY2.
 */
import {appendFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {createOpenAiSeyeonStructuredProviderV1} from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import {createSeyeonUnifiedPreflightShadowV1} from '../dist/apps/api/src/seyeon-unified-preflight-shadow-v1.js';
import {SEYEON_C06_EIGHT_CALL_GOLD_V1 as GOLD} from './seyeon-cost-c06-eight-call-cases-v1.mjs';
import {SEYEON_C04_UNIFIED_PREFLIGHT_COMPACT_CANDIDATE_V1 as COMPACT} from './seyeon-cost-c04-preflight-compact-offline-v1.mjs';
import {scoreSeyeonC06ScreenCaseV1 as score} from './seyeon-cost-c06-screen-score-v1.mjs';
import {F01_V2_POLICY as P,createF01V2Quota} from './seyeon-cost-c06-f01-v2-budget-v1.mjs';

const apiKey=process.env.OPENAI_API_KEY2?.trim();
const evidence=process.env.SEYEON_C06_V2_EVIDENCE_PATH||'./.evidence/seyeon-c06-f01-v2-eval.jsonl';
const report=process.env.SEYEON_C06_V2_REPORT_PATH||'./.evidence/seyeon-c06-f01-v2-report.json';
async function journal(value){
 await appendFile(evidence,JSON.stringify({timestamp:new Date().toISOString(),...value})+'\n',{mode:0o600});
}
async function main(){
 if(!process.env.GITHUB_RUN_ID||
    process.env.SEYEON_C06_F01_V2_ONCE_ADMITTED_RUN_ID!==process.env.GITHUB_RUN_ID||
    !apiKey||apiKey.length<20)
  throw Error('C06 F01 V2 one-time admission or dedicated KEY2 absent');
 const gold=GOLD.find(x=>x.id==='F01');
 if(!gold||gold.topic!=='family_emotional_history'||
    gold.text!=='세연아, 부모님과의 관계는 지금 어때?')
  throw Error('C06 F01 pinned synthetic case changed');
 await mkdir(dirname(evidence),{recursive:true});
 await mkdir(dirname(report),{recursive:true});
 await writeFile(evidence,'',{mode:0o600,flag:'wx'});
 const quota=createF01V2Quota(),results=[];
 let blocker=null;
 try{
  for(const variant of P.variants){
   let receipt=null;
   const provider=createOpenAiSeyeonStructuredProviderV1({
    apiKey,model:P.model,maxOutputTokens:P.maxOutputTokens,timeoutMs:30000,
    async meteredBeforeDispatch(call,serializedBody){
     if(typeof serializedBody!=='string'||
        Buffer.byteLength(serializedBody,'utf8')!==call.requestBodyBytes)
      throw Error('C06 F01 V2 serializer mismatch');
     const reservation=quota.reserve({
      caseId:'F01',variant,callId:call.callId,purpose:call.purpose,
      modelKey:call.modelKey,requestBodyBytes:call.requestBodyBytes,
     });
     await journal({kind:'reservation',...reservation});
    },
    async meteredAfterOutcome(event){
     receipt=quota.observe(event);
     await journal({kind:'outcome',variant,...receipt,providerInvoiceKnown:false});
    },
   });
   const wrapped=variant==='original'?provider:Object.freeze({
    providerKey:provider.providerKey,modelKey:provider.modelKey,
    generate(req){
     if(req.purpose!=='unified_preflight_shadow')throw Error('C06 F01 V2 wrong purpose');
     return provider.generate({...req,instructions:COMPACT});
    },
   });
   const classifier=createSeyeonUnifiedPreflightShadowV1(wrapped);
   const started=performance.now();
   try{
    const res=await classifier.classify({characterId:'seyeon',userText:gold.text});
    if(!receipt||receipt.observation!=='USAGE_BOUNDED_ESTIMATE')
     throw Error('C06 F01 V2 missing or out-of-policy usage');
    const verdict=score(gold,{
     topicKey:res.disclosure.topicKey,
     claimKinds:res.integrity.claims.map(c=>c.kind),
    });
    const row=Object.freeze({variant,...verdict,
     elapsedMs:Math.round(performance.now()-started),
     estimatedCostMicroUsd:receipt.estimatedCostMicroUsd});
    results.push(row);
    await journal({kind:'classification_result',...row});
    if(row.candidateGoldCheck!=='MATCHED_GOLD_SCREEN'){
     blocker='CLASSIFIER_SCREEN_HOLD';break;
    }
   }catch{
    blocker='PROVIDER_OR_METERING_HOLD';
    await journal({kind:'screen_halt',variant,reason:blocker});
    break;
   }
  }
 }finally{
  const budget=quota.snapshot();
  const record=Object.freeze({
   schemaVersion:'seyeon-c06-f01-v2-two-call-report-v1',
   scope:'SYNTHETIC_F01_CLASSIFICATION_ONLY',
   results,budget,stopReason:blocker,
   completeF01Pair:!blocker&&results.length===2,
   providerInvoiceReconciled:false,actualBilledKrw:null,
   productionPromotionPermitted:false,
  });
  await writeFile(report,JSON.stringify(record,null,2),{mode:0o600});
  console.info('SEYEON_C06_F01_V2_SCREEN_SUMMARY '+JSON.stringify({
   previousPaidCalls:budget.priorPaidCalls,newCalls:budget.newAttemptedCalls,
   reviewed:results.length,totalEstimatedMicroUsd:budget.totalProvisionalEstimateMicroUsd,
   stressReservedTotalKrw:budget.conservativeStressTotalKrw,
   userLimitKrw:budget.ownerBudgetKrw,blocker,actualBilledKrw:null,
  }));
 }
 if(blocker)throw Error('C06 F01 V2 paid screen STOP: '+blocker);
 if(results.length!==2)throw Error('C06 F01 V2 incomplete');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();
