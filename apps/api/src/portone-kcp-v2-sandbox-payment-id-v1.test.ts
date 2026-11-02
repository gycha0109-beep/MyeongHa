// Watchtower-Track: commerce-payment
import {describe,expect,it} from 'vitest';
import {
  derivePortOneKcpV2SandboxPaymentIdV1,
  PORTONE_KCP_V2_PAYMENT_ID_V1,
} from './portone-kcp-v2-sandbox-payment-id-v1.js';
import {derivePaymentAttemptProviderRequestIdV1} from './payment-attempt-create-command.js';

const purchaseIntentId='11111111-1111-4111-8111-111111111111';
const idempotencyKey='test-idempotency-001';
describe('NHN KCP V2 new sandbox paymentId bound',()=>{
  it('enforces the PG 40 ASCII-character ceiling without modifying legacy identities',()=>{
    const input={purchaseIntentId,idempotencyKey};
    const kcp=derivePortOneKcpV2SandboxPaymentIdV1(input);
    const historical=derivePaymentAttemptProviderRequestIdV1(input);
    expect(PORTONE_KCP_V2_PAYMENT_ID_V1).toMatchObject({
      pgProvider:'kcp_v2',maxLength:40,sandboxOnly:true,
    });
    expect(kcp).toMatch(/^mha_pa_[a-f0-9]{32}$/);
    expect(kcp.length).toBe(39);
    expect(kcp).toBe(derivePortOneKcpV2SandboxPaymentIdV1(input));
    expect(historical.length).toBe(71);
    expect(historical).not.toBe(kcp);
  });
  it('separates distinct attempts and canonicalizes Purchase Intent UUID case',()=>{
    const a=derivePortOneKcpV2SandboxPaymentIdV1({purchaseIntentId,idempotencyKey});
    const b=derivePortOneKcpV2SandboxPaymentIdV1({
      purchaseIntentId,idempotencyKey:'test-idempotency-002',
    });
    const c=derivePortOneKcpV2SandboxPaymentIdV1({
      purchaseIntentId:'22222222-2222-4222-8222-222222222222',idempotencyKey,
    });
    expect(new Set([a,b,c]).size).toBe(3);
    expect(derivePortOneKcpV2SandboxPaymentIdV1({
      purchaseIntentId:purchaseIntentId.toUpperCase(),idempotencyKey,
    })).toBe(a);
    for(const output of [a,b,c]){
      expect(output).not.toContain(idempotencyKey);
      expect(output).not.toContain(purchaseIntentId);
    }
  });
  it('rejects guest/client-supplied malformed Purchase Intent and replay keys',()=>{
    for(const bad of [
      {purchaseIntentId:'bad',idempotencyKey},
      {purchaseIntentId,idempotencyKey:'short'},
      {purchaseIntentId,idempotencyKey:'has unsafe spaces'},
      {purchaseIntentId,idempotencyKey:'x'.repeat(129)},
    ])expect(()=>derivePortOneKcpV2SandboxPaymentIdV1(bad)).toThrow(
      'Invalid KCP V2 server-owned Payment Attempt derivation input.',
    );
  });
});
