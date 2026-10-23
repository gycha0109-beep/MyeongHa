/**
 * COST-07 future paid pilot - reviewed planning ONLY.
 * Cost estimates, not invoice; no provider/network/production authority.
 *
 * Prior 5 requests include original C06 3 plus F01 V2 original/compact 2.
 * A six-request extension could cover three different risk boundaries while
 * respecting the OWNER's estimated cumulative 100 KRW ceiling under stressed
 * assumed FX. This is not hard provider spend enforcement or authorization.
 */
import {readFileSync} from 'node:fs';
import {
 F01_V2_CUMULATIVE_RESERVED_MICRO_USD,
} from './seyeon-cost-c06-f01-v2-budget-v1.mjs';
import {
 SEYEON_C06_EIGHT_CALL_PER_DISPATCH_RESERVE_MICRO_USD_V1 as PER_CALL,
} from './seyeon-cost-c06-eight-call-budget-v1.mjs';
import {
 SEYEON_C07_BOUNDARY_MATRIX_V1 as CASES,
 SEYEON_C07_BOUNDARY_VARIANTS_V1 as VARIANTS,
} from './seyeon-cost-c07-cross-topic-boundary-v1.mjs';

const historical=JSON.parse(readFileSync(new URL(
 '../test/fixtures/seyeon-c06-f01-v2-run-38854937049-sanitized-v1.json',
 import.meta.url),'utf8'));
const expected=[
 ['original',1044,37,306],
 ['compact',773,72,280],
];
if(historical.schemaVersion!=='seyeon-c06-f01-v2-real-usage-evidence-v1'||
 historical.sourceRunId!==38854937049||
 historical.sourceArtifactId!==12026239456||
 historical.sourceCommitSha!=='6062755fb840480c8486741175db06303ba08b55'||
 historical.sourceRunAttempt!==1||
 historical.providerModel!=='gpt-5.6-luna'||
 historical.actualBilledKrw!==null||
 historical.providerInvoiceReconciled!==false||
 historical.completeF01Pair!==true||
 historical.stopReason!==null||
 !Array.isArray(historical.results)||historical.results.length!==2||
 expected.some((x,i)=>{
  const row=historical.results[i];
  return !row||row.caseId!=='F01'||row.variant!==x[0]||
   row.topicKey!=='family_emotional_history'||
   !Array.isArray(row.claimKinds)||row.claimKinds.length!==0||
   row.verdict!=='MATCHED_GOLD_SCREEN'||
   row.inputTokens!==x[1]||row.outputTokens!==x[2]||
   row.estimatedCostMicroUsd!==x[3];
 }))
 throw Error('C07 source 2-call real-model outcome evidence mismatch');
const PRIOR_3_ESTIMATE=1036;
const PRIOR_2_ESTIMATE=historical.results.reduce(
 (total,x)=>total+x.estimatedCostMicroUsd,0);
const PILOT_CASE_IDS=Object.freeze(['F02','R01','H02']);
const CASES_BY_ID=new Map(CASES.map(c=>[c.id,c]));
const selected=PILOT_CASE_IDS.map(id=>CASES_BY_ID.get(id));
if(selected.some(x=>!x)||
 selected.some(x=>!x.text||x.text.length>240))
 throw Error('C07 pilot case source changed');
const NEW_MAX_CALLS=PILOT_CASE_IDS.length*VARIANTS.length;
const PROSPECTIVE_RESERVED_MICRO_USD=NEW_MAX_CALLS*PER_CALL;
const OWNER_BUDGET_KRW=100;
const STRESS_FX_KRW_PER_USD=2500;
const CUMULATIVE_RESERVED_MICRO_USD=
 F01_V2_CUMULATIVE_RESERVED_MICRO_USD+
 PROSPECTIVE_RESERVED_MICRO_USD;
const STRESS_TOTAL_KRW=CUMULATIVE_RESERVED_MICRO_USD*
 STRESS_FX_KRW_PER_USD/1000000;
if(NEW_MAX_CALLS!==6||PRIOR_2_ESTIMATE!==586||
 F01_V2_CUMULATIVE_RESERVED_MICRO_USD!==16385||
 CUMULATIVE_RESERVED_MICRO_USD!==36047||
 STRESS_TOTAL_KRW>OWNER_BUDGET_KRW)
 throw Error('C07 Owner 100 KRW conservative pilot forecast gate HOLD');
export const SEYEON_C07_PILOT_PROPOSAL_V1=Object.freeze({
 schemaVersion:'seyeon-c07-three-case-two-variant-proposal-v1',
 kind:'OFFLINE_FORECAST_NOT_PAID_APPROVAL',
 sourceRuns:Object.freeze([38845185681,38854937049]),
 priorAttemptedCalls:5,
 priorMeasuredEstimateMicroUsd:PRIOR_3_ESTIMATE+PRIOR_2_ESTIMATE,
 priorConservativeReservedMicroUsd:F01_V2_CUMULATIVE_RESERVED_MICRO_USD,
 pilotIds:PILOT_CASE_IDS,
 variants:VARIANTS,
 requestedNewCalls:NEW_MAX_CALLS,
 perCallConservativeReserveMicroUsd:PER_CALL,
 proposedNewReserveMicroUsd:PROSPECTIVE_RESERVED_MICRO_USD,
 cumulativeReserveMicroUsd:CUMULATIVE_RESERVED_MICRO_USD,
 conservativeFxKrwPerUsd:STRESS_FX_KRW_PER_USD,
 cumulativeStressKrw:STRESS_TOTAL_KRW,
 ownerBudgetKrw:OWNER_BUDGET_KRW,
 providerInvoiceReconciled:false,
 actualBilledKrw:null,
 externalProviderHardLimitVerified:false,
 paidDispatchEnabled:false,
 productionPromotionPermitted:false,
});
