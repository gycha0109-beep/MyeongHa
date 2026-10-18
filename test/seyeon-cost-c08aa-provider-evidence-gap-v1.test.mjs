import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assessSeyeonC08AAProviderEvidencePacketV1 as assess}
 from '../scripts/seyeon-cost-c08aa-provider-evidence-gap-v1.mjs';
const complete=()=>({
 PRIOR_11_PROVIDER_INVOICE:{providerBillingRecord:'artifact/billing-audit-20261018',
  historical11CallReconciliation:'artifact/eleven-call-mapping',
  actualBilledKrw:3},
 EVALUATION_PROJECT_KEY_LINK:{providerProjectId:'proj_synthetic_123456',
  keyIdentityAudit:'audit/key-project-match-202610',
  projectIsolationReview:'audit/isolation-review-202610'},
 MONTH_TO_DATE_PROJECT_SPEND:{billingMonthUtc:'2026-10',
  providerUsageExport:'artifact/usage-export-202610',
  existingSpendUsd:0.25},
 USD1_PROVIDER_HARD_CAP:{providerProjectLimitsReadback:'audit/limit-readback-202610',
  enforceHardLimitReadback:'audit/hard-limit-setting-202610',
  monthlyCapUsd:1},
 CROSS_RUN_IMMUTABLE_RESERVATION:{sharedStoreOwnerAudit:'audit/owner-roles-review',
  crossRunRaceResult:'audit/pg17-cross-run-202610',
  mutationDeleteFence:'audit/delete-mutation-fence'},
});
describe('C08-AA provider evidence reference packet remains paid HOLD',()=>{
 it('reports every absent evidence category with no implied verification',()=>{
  const r=assess({});
  expect(r.rows).toHaveLength(5);
  expect(r.rows.every(x=>x.status==='MISSING_OR_INVALID_HOLD')).toBe(true);
  expect(r).toMatchObject({paidDispatchEnabled:false,actualBilledKrw:null,
   evidenceIndependentlyVerified:false,status:'PAID_DISPATCH_HOLD',
   remainingRealModelGoldSlots:66,priorActualModelCalls:11});
 });
 it('a fully filled self-attested packet never opens paid dispatch',()=>{
  const r=assess(complete());
  expect(r.packetComplete).toBe(true);
  expect(r.rows.every(x=>x.independentlyVerified===false)).toBe(true);
  expect(r).toMatchObject({invoiceReconciled:false,
   providerHardLimitVerified:false,globalCrossRunReservationVerified:false,
   paidDispatchEnabled:false,status:'PAID_DISPATCH_HOLD'});
  expect(JSON.stringify(r)).not.toContain('proj_synthetic');
  expect(JSON.stringify(r)).not.toContain('0.25');
 });
 it('partial and malformed packets fail closed, with only schema field names in report',()=>{
  for(const bad of [null,[],true])expect(()=>assess(bad)).toThrow(/HOLD/);
  const p=complete();
  p.PRIOR_11_PROVIDER_INVOICE.actualBilledKrw=-1;
  p.USD1_PROVIDER_HARD_CAP.monthlyCapUsd=2;
  p.EVALUATION_PROJECT_KEY_LINK.keyIdentityAudit='sk-DO_NOT_LOG';
  p.MONTH_TO_DATE_PROJECT_SPEND.billingMonthUtc='2026-13';
  const r=assess(p);
  expect(r.packetComplete).toBe(false);
  expect(r.rows.filter(x=>x.invalid.length)).toHaveLength(4);
  expect(JSON.stringify(r)).not.toContain('DO_NOT_LOG');
 });
 it('unknown schema fields prohibit packet completion and never leak their values',()=>{
  const p=complete();
  p.UNEXPECTED={rawSecret:'sk-hush'};
  p.PRIOR_11_PROVIDER_INVOICE.apiKey='sk-hush';
  const result=assess(p);
  expect(result.packetComplete).toBe(false);
  expect(result.unexpectedCategoryCount).toBe(1);
  expect(JSON.stringify(result)).not.toContain('sk-hush');
 });
 it('does not contact provider or GitHub or write identity and billing records',()=>{
  const s=readFileSync(new URL(
   '../scripts/seyeon-cost-c08aa-provider-evidence-gap-v1.mjs',
   import.meta.url),'utf8');
  expect(s).not.toMatch(/fetch\(|https:\/\/|api\.openai\.com|api\.github\.com|process\.env|OPENAI_EVAL_API_KEY/);
 });
});
