// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
 adapter:vi.fn(),execute:vi.fn(),context:vi.fn(),verified:vi.fn(),
}));
vi.mock('./cloudflare-portone-v2-test-bindings-v1.js',()=>({
 createCloudflarePortOneOwnerTestVerifierV1:state.adapter,
}));
vi.mock('./postgres-subject-execution.js',()=>({
 executePostgresSubjectTransactionV1:state.execute,
}));
vi.mock('./commerce-payment-verification-context-read.js',()=>({
 loadCommercePaymentVerificationContextV1:state.context,
}));
vi.mock('./commerce-payment-verification-execution.js',()=>({
 executeCommercePaymentVerificationV1:state.verified,
}));
import {
 inspectCloudflareOwnerKcpSandboxPaymentV1,
 CLOUDFLARE_OWNER_SANDBOX_PSP_READONLY_V1,
} from './cloudflare-owner-portone-sandbox-readonly-verification-v1.js';

const ATTEMPT='11111111-1111-4111-8111-111111111111';
const INTENT='22222222-2222-4222-8222-222222222222';
const INPUT={
 env:{} as never,pool:{} as never,
 verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:'33333333-3333-4333-8333-333333333333'},
 paymentAttemptId:ATTEMPT,
};
const base={
 provider:'portone_v2',platform:'web',environment:'sandbox',
 providerRequestId:'mha_pa_'+'b'.repeat(32),purchaseIntentId:INTENT,
 expectedExternalProductId:'myeongha-chat-credits-300-v1',
 expectedAmountMinor:1900,expectedCurrency:'KRW',
};
beforeEach(()=>{
 vi.resetAllMocks();
 state.adapter.mockResolvedValue({verify:vi.fn()});
 state.execute.mockImplementation(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
  execute({client:{},resolvedSubject:{subjectId:ATTEMPT,subjectKind:'member'}}));
 state.context.mockResolvedValue(base);
 state.verified.mockResolvedValue({
  environment:'sandbox',currentState:'active',
  ownerBinding:{kind:'purchase_intent',purchaseIntentId:INTENT},
 });
});
describe('Owner PSP sandbox receipt inspection keeps Commerce role isolated',()=>{
 it('never pretends to persist a Receipt or issue credit',()=>{
  expect(CLOUDFLARE_OWNER_SANDBOX_PSP_READONLY_V1).toMatchObject({
   serverPaidVerification:true,receiptPersistenceEnabled:false,
   creditMintEnabled:false,productionCheckoutEnabled:false,
  });
 });
 it('checks canonical Owner adapter, persisted DB facts and server PSP verification',async()=>{
  const out=await inspectCloudflareOwnerKcpSandboxPaymentV1(INPUT);
  expect(out).toEqual({paymentAttemptId:ATTEMPT,
   environment:'sandbox',providerVerifiedPaid:true,
   receiptPersisted:false,productionCreditsIssued:false});
  expect(state.adapter).toHaveBeenCalledTimes(1);
  expect(state.context).toHaveBeenCalledWith({
   scope:expect.any(Object),paymentAttemptId:ATTEMPT,
  });
  expect(state.verified).toHaveBeenCalledTimes(1);
  expect(state.verified.mock.calls[0]?.[0].context).toEqual(base);
 });
 it('refuses forged Guest and paymentId input without DB or provider reads',async()=>{
  for(const input of [
    {...INPUT,paymentAttemptId:{id:ATTEMPT,paid:true}},
    {...INPUT,paymentAttemptId:'bad'},
    {...INPUT,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'fixture'}},
  ]){
   await expect(inspectCloudflareOwnerKcpSandboxPaymentV1(input as typeof INPUT))
    .rejects.toThrow('Owner sandbox provider receipt inspection unavailable.');
  }
  expect(state.adapter).not.toHaveBeenCalled();
  expect(state.verified).not.toHaveBeenCalled();
 });
 it('rejects Production, altered product, provider, amount and overlong PSP id',async()=>{
  for(const change of [
   {environment:'production'},{provider:'fake'},{platform:'ios'},
   {expectedAmountMinor:1},{expectedCurrency:'USD'},
   {expectedExternalProductId:'other-product'},
   {providerRequestId:'mha_pa_'+'f'.repeat(64)},
  ]){
   state.context.mockResolvedValueOnce({...base,...change});
   await expect(inspectCloudflareOwnerKcpSandboxPaymentV1(INPUT))
    .rejects.toThrow('Owner sandbox provider receipt inspection unavailable.');
  }
  expect(state.verified).not.toHaveBeenCalled();
 });
 it('never reports confirmed PAID if provider verification throws',async()=>{
  state.verified.mockRejectedValueOnce(Error('PortOne 4xx rejected payment'));
  await expect(inspectCloudflareOwnerKcpSandboxPaymentV1(INPUT))
   .rejects.toThrow('PortOne 4xx rejected payment');
 });
});
