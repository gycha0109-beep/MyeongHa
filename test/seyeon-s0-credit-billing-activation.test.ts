// Watchtower-Track: security
import {describe,it,expect} from 'vitest';
import {SEYEON_SECURITY_S0_PRODUCTION_V1} from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';
import {COMMERCE_CHAT_CREDIT_POLICY_V1} from '../apps/api/src/commerce-chat-credit-gate-v1.js';

describe('production Se-yeon paid turn eligibility',()=>{
  it('keeps model traffic sealed without the actual ledger reservation and receipt settlement',()=>{
    expect(SEYEON_SECURITY_S0_PRODUCTION_V1.receiptAndWithdrawalEnabled).toBe(true);
    expect(SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling).toEqual({
      creditsPerDeliveredReply:COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
      reservationRequiredBeforeModel:true,
      settleOnlyAfterDeliveryReceipt:true,
      productionMounted:false,
    });
    expect(COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply).toBe(10);
    expect('globalMicroUsd' in SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling).toBe(false);
    expect('subjectMicroUsd' in SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling).toBe(false);
  });
});
