/**
 * COST-07 completed-run evidence readback (offline, no provider or DB).
 * This checks a sanitized artifact snapshot against pinned source observations.
 * It cannot independently reconcile the provider invoice or certify 72 slots.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SEYEON_C07_BOUNDARY_MATRIX_V1 as CASES,
 assessSeyeonC07BoundaryV1 as assess,
 scoreSeyeonC07BoundaryV1 as score}
 from './seyeon-cost-c07-cross-topic-boundary-v1.mjs';
import {SEYEON_C06_EIGHT_CALL_POLICY_V1 as RATE}
 from './seyeon-cost-c06-eight-call-budget-v1.mjs';

const evidencePath=new URL(
 '../test/fixtures/seyeon-c07-real-six-call-run-38859692050-sanitized-v1.json',
 import.meta.url);
const PINNED_ROWS_SHA256=
 'ab102f94768ed6f80b53d890fefb384c9ddb7e6b75f405587a9a0305831a1a29';
const ids=['F02','R01','H02'];
const variants=['original','compact'];
const fail=reason=>{throw Error('C07 evidence HOLD: '+reason);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const uint=x=>Number.isSafeInteger(x)&&x>=0;
const known=new Map(CASES.map(c=>[c.id,c]));
const price=(i,o)=>Number((BigInt(i)*BigInt(RATE.maxInputRateMicroUsdPerMillion)+
 BigInt(o)*BigInt(RATE.outputRateMicroUsdPerMillion)+999999n)/1000000n);

export function verifySeyeonC07CompletedEvidenceV1(evidence){
 if(!evidence||evidence.schemaVersion!=='seyeon-c07-real-six-call-sanitized-v1')
  fail('schema');
 const s=evidence.source;
 if(!s||s.repository!=='gycha0109-beep/MyeongHa'||
  s.runId!==38859692050||s.runAttempt!==1||s.runBranch!=='main'||
  s.headSha!=='f399339c5d2c52c23a19a3702c7be04fdc7ffdc3'||
  s.artifactId!==12028787181||
  s.artifactZipSha256!=='1e9d2916859dfecc47af1576eee75b32302052743b31e8dc7b1d0c1b45a967ae'||
  s.model!=='gpt-5.6-luna'||s.status!=='completed'||
  s.conclusion!=='success')fail('source provenance');
 const h=evidence.historical,b=evidence.budget;
 if(!h||!same(h.runIds,[38845185681,38854937049])||
  h.attemptedCalls!==5||h.estimatedCostMicroUsd!==1622||
  h.reservedMicroUsd!==16385)fail('prior paid ledger');
 if(!b||b.newAttemptedCalls!==6||b.newObservedCalls!==6||
  b.newReservedMicroUsd!==19662||b.cumulativeReservedMicroUsd!==36047||
  b.cumulativeEstimatedCostMicroUsd!==3770||
  b.ownerLifetimeBudgetKrw!==100||b.stressFxKrwPerUsd!==2500||
  b.stressReservedKrw!==90.1175||b.actualBilledKrw!==null||
  b.invoiceReconciled!==false||b.providerHardLimitVerified!==false||
  evidence.stopReason!==null||evidence.modelQualityVerified!==false||
  evidence.productionPromotionPermitted!==false)fail('budget/production HOLD');
 const rows=evidence.results;
 if(!Array.isArray(rows)||rows.length!==6)fail('incomplete six-slot report');
 const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 if(digest!==PINNED_ROWS_SHA256)fail('observed row checksum mismatch');
 const seen=new Set(),observed=[];
 let originalMicroUsd=0,compactMicroUsd=0;
 for(let i=0;i<rows.length;i++){
  const r=rows[i],id=ids[Math.floor(i/2)],variant=variants[i%2];
  if(!r||r.caseId!==id||r.variant!==variant||
   seen.has(r.caseId+':'+r.variant))fail('unknown/duplicate/out-of-order slot');
  seen.add(r.caseId+':'+r.variant);
  if(!uint(r.inputTokens)||!uint(r.outputTokens)||
   r.inputTokens>RATE.conservativeInputTokenUpper||
   r.outputTokens>RATE.providerOutputTokenCap||
   !uint(r.elapsedMs)||!uint(r.estimatedCostMicroUsd)||
   r.estimatedCostMicroUsd!==price(r.inputTokens,r.outputTokens))
    fail('invalid metering');
  const g=known.get(id);
  const scored=score(g,{topicKey:r.topicKey,claimKinds:r.claimKinds});
  if(scored.verdict!=='MATCHED_GOLD_SCREEN')fail('classifier Gold mismatch');
  observed.push({id,variant,topicKey:r.topicKey,claimKinds:r.claimKinds});
  if(variant==='original')originalMicroUsd+=r.estimatedCostMicroUsd;
  else compactMicroUsd+=r.estimatedCostMicroUsd;
 }
 const total=originalMicroUsd+compactMicroUsd;
 if(originalMicroUsd!==1175||compactMicroUsd!==973||total!==2148||
  h.estimatedCostMicroUsd+total!==b.cumulativeEstimatedCostMicroUsd||
  h.reservedMicroUsd+b.newReservedMicroUsd!==b.cumulativeReservedMicroUsd||
  b.cumulativeReservedMicroUsd*b.stressFxKrwPerUsd/1000000!==b.stressReservedKrw)
   fail('summation mismatch');
 const full=assess(observed);
 if(full.verdict!=='HOLD'||full.reason!=='INCOMPLETE_REAL_MODEL_EVIDENCE'||
  full.observedPairs!==6||full.expectedVariantPairs!==72||
  full.modelQualityVerified!==false||
  full.productionPromotionPermitted!==false)fail('72-slot HOLD bypass');
 return Object.freeze({
  scope:'C07_SIX_REAL_MODEL_CASE_VARIANTS_ONLY',
  sourceRunId:s.runId,sourceArtifactId:s.artifactId,
  screenedPairs:6,screenedCases:3,totalMatrixPairs:72,unmeasuredPairs:66,
  matchedPilotPairs:6,originalEstimatedMicroUsd:originalMicroUsd,
  compactEstimatedMicroUsd:compactMicroUsd,
  pilotEstimatedMicroUsd:total,cumulativeAttemptedCalls:11,
  cumulativeEstimatedMicroUsd:b.cumulativeEstimatedCostMicroUsd,
  cumulativeReservedMicroUsd:b.cumulativeReservedMicroUsd,
  stressReservedKrw:b.stressReservedKrw,
  compactPilotSavingsPercent:(originalMicroUsd-compactMicroUsd)/
   originalMicroUsd*100,
  furtherPaidCallsPermitted:false,
  providerInvoiceReconciled:false,actualBilledKrw:null,
  providerHardLimitVerified:false,
  widerRealModelEvidence:'INCOMPLETE_REAL_MODEL_EVIDENCE',
  endToEndFiveToThreeVerified:false,
  productionPromotionPermitted:false,
 });
}

export function loadSeyeonC07CompletedEvidenceV1(){
 return JSON.parse(readFileSync(evidencePath,'utf8'));
}
export const SEYEON_C07_COMPLETED_EVIDENCE_V1=
 verifySeyeonC07CompletedEvidenceV1(loadSeyeonC07CompletedEvidenceV1());
