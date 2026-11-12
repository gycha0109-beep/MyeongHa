import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteYeoulPilotEnvelope} from './yeoul-pilot-readiness-v1.mjs';
import {YEOUL_OWNER_DECLARED_PILOT_CAP_KRW,planYeoulKrwBudget} from './yeoul-krw-budget-v1.mjs';

const role=(modelId,attempts)=>({
  modelId,providerId:'synthetic-provider',attemptsIncludingRetries:attempts,
  pricing:{input:1000000,output:2000000,reasoning:3000000,cacheRead:0,cacheWrite:0,fixedMaximumMicroUsd:10},
  tokens:{input:500,output:100,reasoning:20,cacheRead:0,cacheWrite:0},
});
const cost=()=>quoteYeoulPilotEnvelope({
  priceEvidence:{kind:'unverified_planning_snapshot',
    sourceUrl:'https://example.invalid/synthetic-cost-only',
    observedAt:'2026-11-12T10:00:00+09:00'},
  roles:{
    student:role('deepseek/deepseek-v4.1-flash-1017',10),
    reflection:role('synthetic/reflection',2),judge:role('synthetic/judge',0),
    holdout:role('synthetic/holdout',104)
  }
});
const fees=()=>({providerFeeKrw:15,exchangeFeeKrw:40,taxKrw:30,paymentFeeKrw:20,otherFeeKrw:10});
const fx=()=>({kind:'unverified_fx_upper_bound',
  sourceUrl:'https://example.invalid/synthetic-fx-ceiling',
  observedAtEpoch:1800000000,expiresAtEpoch:1800003600,
  upperMilliKrwPerUsd:1400000});
const plan=({costQuote=cost(),fxUpperEvidence=fx(),fees:feeOverride=fees(),nowEpoch=1800000100}={})=>
  planYeoulKrwBudget({costQuote,fxUpperEvidence,fees:feeOverride,nowEpoch});

test('owner cap is exactly 500 KRW for ALL roles and retries, never per role',()=>{
  const q=plan();
  assert.equal(YEOUL_OWNER_DECLARED_PILOT_CAP_KRW,500);
  assert.equal(q.currency,'KRW');
  assert.equal(q.ownerDeclaredTotalLimitKrw,500);
  assert.equal(q.totalAttemptsIncludingRetries,116);
  assert.equal(q.roleBreakdown.student.ceilKrwPerAttempt,'2');
  assert.equal(q.roleBreakdown.holdout.ceilKrwForRole,'208');
  assert.equal(q.worstConvertedRequestsKrw,'232');
  assert.equal(q.fixedFeesCeilingKrw,'115');
  assert.equal(q.worstTotalKrwIncludingDeclaredFees,'347');
  assert.equal(q.remainingKrwIfAssumptionsHold,'153');
  assert.equal(q.quoteUnderDeclaredCap,true);
  assert.equal(q.externalCallsAuthorized,false);
  assert.equal(q.paidExecutionReady,false);
  assert.equal(q.userApprovalAuthorityAuthenticated,false);
  assert.equal(q.prepaidFundingAndMinimumTopUpVerified,false);
  assert.equal(q.existingPrepaidCreditsVerified,false);
  assert.equal(q.newCreditPurchaseAllowed,false);
});

test('500 KRW boundary is inclusive and 501 KRW fails',()=>{
  const f=fees();f.otherFeeKrw=163;
  assert.equal(plan({fees:f}).worstTotalKrwIncludingDeclaredFees,'500');
  assert.equal(plan({fees:f}).quoteUnderDeclaredCap,true);
  f.otherFeeKrw=164;
  const over=plan({fees:f});
  assert.equal(over.worstTotalKrwIncludingDeclaredFees,'501');
  assert.equal(over.quoteUnderDeclaredCap,false);
  assert.equal(over.remainingKrwIfAssumptionsHold,'0');
  assert.equal(over.externalCallsAuthorized,false);
});

test('mismatched quotes and omitted models/roles never silently create headroom',()=>{
  const quote=cost();
  assert.throws(()=>plan({costQuote:{...quote,worstTotalMicroUsd:'1'}}),/forged_total_price/);
  const forged={...quote,roles:{...quote.roles,student:{
    ...quote.roles.student,attemptsIncludingRetries:9
  }}};
  assert.throws(()=>plan({costQuote:forged}),/role_price_or_retries_mismatch/);
  const missing={...quote.roles};delete missing.reflection;
  assert.throws(()=>plan({costQuote:{...quote,roles:missing}}),/untrusted_cost_quote/);
  assert.throws(()=>plan({costQuote:{...quote,externalCallsAuthorized:true}}),/untrusted_cost_quote/);
});

test('all known fee categories are mandatory even if a planning value is zero',()=>{
  const f=fees();delete f.taxKrw;
  assert.throws(()=>plan({fees:f}),/all_fixed_fee_ceiling_fields_required/);
  assert.throws(()=>plan({fees:{...fees(),otherFeeKrw:-1}}),/all_fixed_fee_ceiling_fields_required/);
  assert.throws(()=>plan({fees:{...fees(),paymentFeeKrw:1.1}}),/all_fixed_fee_ceiling_fields_required/);
  const q=plan({fees:{providerFeeKrw:0,exchangeFeeKrw:0,taxKrw:0,paymentFeeKrw:0,otherFeeKrw:0}});
  assert.equal(q.priceAndFxSourcesAuthenticated,false);
  assert.equal(q.fxRateAndFeeCeilingsEnforcedByPaymentProvider,false);
});

test('expired, future, unbounded and malformed exchange-rate evidence is refused',()=>{
  assert.throws(()=>plan({nowEpoch:1800003600}),/fx_quote_missing_or_stale/);
  assert.throws(()=>plan({nowEpoch:1799999999}),/fx_quote_missing_or_stale/);
  assert.throws(()=>plan({fxUpperEvidence:{...fx(),expiresAtEpoch:1800007200}}),/fx_quote_missing_or_stale/);
  assert.throws(()=>plan({fxUpperEvidence:{...fx(),upperMilliKrwPerUsd:0}}),/fx_quote_missing_or_stale/);
  assert.throws(()=>plan({fxUpperEvidence:{...fx(),sourceUrl:'http://not-trusted.example'}}),/fx_quote_missing_or_stale/);
});

test('every attempt rounds UP to integer won, not only aggregate total',()=>{
  const q=plan();
  assert.equal(q.quotedAllRolesMicroUsd,String(116*770));
  assert.equal(q.worstConvertedRequestsKrw,'232');
  assert.equal(q.indicativeUsdBudgetMicroNotExecutable,'275000');
  assert.equal(q.ownerApprovalGrantedToTransport,false);
  assert.equal(q.decision,'HOLD_PLANNING_QUOTE_ONLY');
});

test('zero-attempt role is handled and zero-cost positive attempts are refused',()=>{
  const q=plan();
  assert.equal(q.roleBreakdown.judge.ceilKrwForRole,'0');
  const c=cost();
  const fake={
    ...c,roles:{...c.roles,reflection:{
      ...c.roles.reflection,worstPerAttemptMicroUsd:'0',worstRoleMicroUsd:'0'
    }},worstTotalMicroUsd:String(Number(c.worstTotalMicroUsd)-1540)
  };
  assert.throws(()=>plan({costQuote:fake}),/role_price_or_retries_mismatch/);
});

test('quote report remains non-authorizing even when an upper-bound scenario fits',()=>{
  const q=plan();
  assert.ok(q.pending.includes('trusted_owner_approval_with_krw500_limit_and_scope'));
  assert.ok(q.pending.includes('live_route_enforcement_and_receipt_reconciliation'));
  assert.equal(q.externalCalls,0);
  assert.equal(q.ownerBudgetSource,'chat_statement_only_not_runtime_verified');
});
