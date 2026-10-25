// Watchtower-Track: security
import {describe,it,expect} from 'vitest';
import {SEYEON_SECURITY_S0_PRODUCTION_V1} from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';
import {COMMERCE_CHAT_CREDIT_POLICY_V1} from '../apps/api/src/commerce-chat-credit-gate-v1.js';
import {
  SEYEON_S0_COST_POLICY_DRAFT_V1,
  parseSeyeonS0CostBudgetV1,
} from '../scripts/operations/seyeon-security-s0/model-cost-plan.mjs';

describe('S0 credit-based customer admission, independent provider-cost safety',()=>{
  it('uses the existing delivered-reply credit price, not a daily USD customer entitlement',()=>{
    expect(SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling).toEqual({
      creditsPerDeliveredReply:COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
      reservationRequiredBeforeModel:true,
      settleOnlyAfterDeliveryReceipt:true,
      productionMounted:false,
    });
    expect(SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling.creditsPerDeliveredReply).toBe(10);
    expect(SEYEON_SECURITY_S0_PRODUCTION_V1.modelUseEnabled).toBe(false);
  });
  it('does not silently pick a per-member or global dollar cap',()=>{
    expect('globalMicroUsd' in SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling).toBe(false);
    expect('subjectMicroUsd' in SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling).toBe(false);
    expect(()=>parseSeyeonS0CostBudgetV1({
      utcDate:'2026-10-26',globalMicroUsd:null,subjectMicroUsd:null,
    })).toThrow();
    expect(parseSeyeonS0CostBudgetV1({
      utcDate:'2026-10-26',globalMicroUsd:'10000000',
    })).toMatchObject({globalMicroUsd:'10000000',subjectMicroUsd:'10000000'});
    expect(()=>parseSeyeonS0CostBudgetV1({
      utcDate:'2026-10-26',globalMicroUsd:'10000000',subjectMicroUsd:'250000',
    })).toThrow('customer daily USD cap');
    expect(SEYEON_S0_COST_POLICY_DRAFT_V1.isActive).toBe(false);
  });
});
