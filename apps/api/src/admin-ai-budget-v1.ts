import { ADMIN_AI_MONTHLY_BUDGET_KRW_V1,ADMIN_AI_BUDGET_THRESHOLDS_V1,ADMIN_AI_BUDGET_TIMEZONE_V1 } from './admin-operating-policy-v1.js';
import type {AdminAiFxEvidenceV1} from './admin-ai-cost-finance-v1.js';

export interface AdminAiBudgetWindowV1 {readonly month:string;readonly from:string;readonly toExclusive:string;readonly observedThrough:string;}
export interface AdminAiBudgetBucketV1 {
 readonly workload:'character_chat'|'reading';readonly feature:string;readonly provider:string;readonly model:string;
 readonly calls:number;readonly unknownCostCalls:number;readonly estimateMicroUsd:string;
}
export interface AdminAiBudgetBillingV1 {
 readonly source:'provider_billing_export';readonly evidenceSha256:string;readonly from:string;readonly toExclusive:string;
 readonly coverage:'complete'|'partial';readonly amountMicroUsd:string;
}
export function adminAiBudgetWindowV1(month:string|undefined,now:Date):AdminAiBudgetWindowV1 {
 if(!Number.isFinite(now.getTime()))throw Error('Invalid budget clock');
 const key=month??new Date(now.getTime()+9*3600_000).toISOString().slice(0,7);
 if(!/^[2-9]\d{3}-(?:0[1-9]|1[0-2])$/u.test(key))throw Error('Invalid budget month');
 const year=Number(key.slice(0,4)),m=Number(key.slice(5));
 const start=Date.UTC(year,m-1,1)-9*3600_000,end=Date.UTC(year,m,1)-9*3600_000;
 return Object.freeze({month:key,from:new Date(start).toISOString(),toExclusive:new Date(end).toISOString(),observedThrough:new Date(Math.max(start,Math.min(now.getTime(),end))).toISOString()});
}
const amount=(s:string)=>{if(!/^(?:0|[1-9]\d{0,29})$/u.test(s))throw Error('Invalid budget source amount');return BigInt(s);};
function convert(value:bigint,window:AdminAiBudgetWindowV1,fx:AdminAiFxEvidenceV1|undefined):string|null {
 if(!fx||fx.currency!=='USD/KRW'||!/^[a-f0-9]{64}$/u.test(fx.sourceSha256)||!Number.isSafeInteger(fx.rateNumerator)||fx.rateNumerator<=0||!Number.isSafeInteger(fx.rateDenominator)||fx.rateDenominator<=0||
   !Number.isFinite(Date.parse(fx.effectiveFrom))||!Number.isFinite(Date.parse(fx.effectiveTo))||Date.parse(fx.effectiveFrom)>Date.parse(window.from)||Date.parse(fx.effectiveTo)<Date.parse(window.observedThrough))return null;
 // Keep micro-KRW precision. Round down so a fractional won cannot trigger a warning early.
 return (value*BigInt(fx.rateNumerator)/BigInt(fx.rateDenominator)).toString();
}
export function evaluateAdminAiBudgetV1(input:{readonly window:AdminAiBudgetWindowV1;readonly buckets:readonly AdminAiBudgetBucketV1[];readonly workloadCoverage:readonly ('reading'|'character_chat')[];readonly truncated?:boolean;readonly billing?:AdminAiBudgetBillingV1;readonly fx?:AdminAiFxEvidenceV1;}) {
 let estimate=0n,unknownCalls=0,calls=0;
 for(const row of input.buckets){if(!['reading','character_chat'].includes(row.workload)||!Number.isSafeInteger(row.calls)||row.calls<0||!Number.isSafeInteger(row.unknownCostCalls)||row.unknownCostCalls<0||row.unknownCostCalls>row.calls)throw Error('Invalid budget usage coverage');estimate+=amount(row.estimateMicroUsd);unknownCalls+=row.unknownCostCalls;calls+=row.calls;}
 const missingWorkloads=(['reading','character_chat']as const).filter(w=>!input.workloadCoverage.includes(w));
 const estimateComplete=unknownCalls===0&&missingWorkloads.length===0&&!input.truncated;
 let confirmed:bigint|null=null;
 if(input.billing){const b=input.billing;if(b.source!=='provider_billing_export'||!/^[a-f0-9]{64}$/u.test(b.evidenceSha256)||b.from!==input.window.from||b.toExclusive!==input.window.toExclusive||!['complete','partial'].includes(b.coverage))throw Error('Unbound monthly billing evidence');confirmed=amount(b.amountMicroUsd);}
 const estimatedMicroKrw=convert(estimate,input.window,input.fx);
 // A partial provider export proves only a lower bound, never the monthly total.
 const knownConfirmedMicroKrw=confirmed===null?null:convert(confirmed,input.window,input.fx);
 // A running Seoul calendar month cannot have a final full-month invoice.
 // Even a verified export labelled complete is only a known partial amount
 // until the window has actually closed.
 const monthClosed=input.window.observedThrough>=input.window.toExclusive;
 const billingCoverage=input.billing?.coverage==='complete'&&monthClosed?'complete':
  input.billing?'partial':'unconnected';
 const confirmedMicroKrw=billingCoverage==='complete'?knownConfirmedMicroKrw:null;
 const states=[{basis:'provider_confirmed' as const,value:knownConfirmedMicroKrw,coverage:billingCoverage},
  {basis:'usage_price_estimate' as const,value:estimatedMicroKrw,coverage:estimateComplete?'complete':'partial'}];
 const warnings=states.flatMap(s=>s.value===null?[]:ADMIN_AI_BUDGET_THRESHOLDS_V1.filter(percent=>BigInt(s.value!)>=BigInt(ADMIN_AI_MONTHLY_BUDGET_KRW_V1)*1_000_000n*BigInt(percent)/100n).map(percent=>Object.freeze({
   id:`ai-budget:${input.window.month}:${s.basis}:${percent}`,thresholdPercent:percent,thresholdKrw:ADMIN_AI_MONTHLY_BUDGET_KRW_V1*percent/100,basis:s.basis,coverage:s.coverage,notificationOnly:true,automaticShutdown:false,
  })));
 // One stable card per month/basis/threshold; reads replace the cards rather
 // than enqueueing repeated notifications. No external channel is invoked.
 return Object.freeze({version:'admin-ai-monthly-budget-v1' as const,window:input.window,timezone:ADMIN_AI_BUDGET_TIMEZONE_V1,budgetKrw:ADMIN_AI_MONTHLY_BUDGET_KRW_V1,
  thresholdsKrw:[80_000,100_000],automaticShutdown:false,observedCalls:calls,unknownCostCalls:unknownCalls,missingWorkloads,
  estimateCoverage:estimateComplete?'complete':'partial',knownEstimateMicroUsd:estimate.toString(),estimatedMicroUsd:estimateComplete?estimate.toString():null,
  knownEstimateMicroKrw:estimatedMicroKrw,knownConfirmedMicroUsd:confirmed?.toString()??null,
  knownConfirmedMicroKrw,confirmedMicroUsd:billingCoverage==='complete'?confirmed?.toString()??null:null,confirmedMicroKrw,
  billingStatus:billingCoverage,fxStatus:estimatedMicroKrw===null?'unmeasured_or_out_of_scope':'verified_evidence_supplied',
  budgetStatus:confirmedMicroKrw===null?'confirmed_budget_unmeasured':'confirmed_observed',warnings,buckets:input.buckets,
 });
}
