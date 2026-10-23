/**
 * C08-AA non-billable evidence intake: fixed blocker and completeness audit.
 * Evidence references are operator pointers ONLY, never trusted attestation.
 * No network, secrets, payment execution, or automatic unlock.
 */
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P,
 assessSeyeonC08TExecutionPrerequisitesV1 as policyAssess}
 from './seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const CATEGORIES=Object.freeze([
 Object.freeze({id:'PRIOR_11_PROVIDER_INVOICE',requiredFields:[
  'providerBillingRecord','historical11CallReconciliation','actualBilledKrw']}),
 Object.freeze({id:'EVALUATION_PROJECT_KEY_LINK',requiredFields:[
  'providerProjectId','keyIdentityAudit','projectIsolationReview']}),
 Object.freeze({id:'MONTH_TO_DATE_PROJECT_SPEND',requiredFields:[
  'billingMonthUtc','providerUsageExport','existingSpendUsd']}),
 Object.freeze({id:'USD1_PROVIDER_HARD_CAP',requiredFields:[
  'providerProjectLimitsReadback','enforceHardLimitReadback','monthlyCapUsd']}),
 Object.freeze({id:'CROSS_RUN_IMMUTABLE_RESERVATION',requiredFields:[
  'sharedStoreOwnerAudit','crossRunRaceResult','mutationDeleteFence']}),
]);
const unknown=x=>x===null||x===undefined||x==='';
const cleanRef=x=>typeof x==='string'&&x.length>=12&&x.length<=256&&
 /^[A-Za-z0-9/_:.@-]+$/u.test(x)&&!/^https?:\/\//iu.test(x)&&
 !/sk-|Bearer|OPENAI_API_KEY|secret|token=/iu.test(x);
const isNonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
function fieldOK(k,x){
 if(k==='actualBilledKrw'||k==='existingSpendUsd')return isNonnegative(x);
 if(k==='monthlyCapUsd')return x===1;
 if(k==='billingMonthUtc')return typeof x==='string'&&
  /^20[0-9]{2}-(0[1-9]|1[0-2])$/u.test(x);
 return cleanRef(x);
}
function own(record,key){return Object.prototype.hasOwnProperty.call(record,key);}

/**
 * All supplied values are explicitly marked "unverified". Even a full
 * evidence packet is not a provider API attestation or paid run permission.
 * No actual project IDs, invoice amounts or raw evidence are logged.
 */
export function assessSeyeonC08AAProviderEvidencePacketV1(packet){
 if(!packet||typeof packet!=='object'||Array.isArray(packet))
  throw Error('C08AA_INVALID_PACKET_HOLD');
 const rows=[];
 let supplied=0;
 for(const category of CATEGORIES){
  const payload=packet[category.id];
  const record=payload&&typeof payload==='object'&&
   !Array.isArray(payload)?payload:null;
  const missing=[],invalid=[];
  for(const field of category.requiredFields){
   if(!record||!own(record,field)||unknown(record[field]))missing.push(field);
   else if(!fieldOK(field,record[field]))invalid.push(field);
   else supplied++;
  }
  const extra=record?Object.keys(record).filter(k=>
   !category.requiredFields.includes(k)):[];
  const present=missing.length===0&&invalid.length===0&&extra.length===0;
  rows.push(Object.freeze({category:category.id,
   status:present?'SUBMITTED_NOT_INDEPENDENTLY_VERIFIED':'MISSING_OR_INVALID_HOLD',
   missing:Object.freeze(missing),invalid:Object.freeze(invalid),
   unexpectedFieldCount:extra.length,independentlyVerified:false}));
 }
 const unexpectedCategories=Object.keys(packet).filter(k=>
  !CATEGORIES.some(c=>c.id===k));
 const advisory=policyAssess({ownerAdditionalBudgetKrw:P.additionalBudgetKrw});
 return Object.freeze({schemaVersion:'seyeon-c08aa-evidence-gap-v1',
  scope:'OFFLINE_REFERENCE_COMPLETENESS_ONLY',
  categoryCount:CATEGORIES.length,
  submittedFieldCount:supplied,
  unexpectedCategoryCount:unexpectedCategories.length,
  rows:Object.freeze(rows),
  packetComplete:rows.every(r=>
   r.status==='SUBMITTED_NOT_INDEPENDENTLY_VERIFIED')&&
   unexpectedCategories.length===0,
  evidenceIndependentlyVerified:false,
  invoiceReconciled:false,
  providerHardLimitVerified:false,
  projectCredentialVerified:false,
  globalCrossRunReservationVerified:false,
  actualBilledKrw:null,
  remainingRealModelGoldSlots:66,
  priorActualModelCalls:11,
  additionalOwnerBudgetKrw:P.additionalBudgetKrw,
  paidDispatchEnabled:false,
  productionPromotionPermitted:false,
  advisoryBlockers:advisory.blockers,
  status:'PAID_DISPATCH_HOLD'});
}
