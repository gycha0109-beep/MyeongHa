// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
  adapter:vi.fn(),
  completion:vi.fn(),
}));
vi.mock('./cloudflare-portone-v2-test-bindings-v1.js',()=>({
  createCloudflarePortOneOwnerTestVerifierV1:state.adapter,
}));
vi.mock('./commerce-subject-payment-completion-orchestration.js',()=>({
  executeSubjectOwnedCommercePaymentCompletionV1:state.completion,
}));
import {
  verifyCloudflareOwnerPortOneSandboxReceiptV1,
  CLOUDFLARE_OWNER_PORTONE_SANDBOX_RECEIPT_VERIFICATION_V1,
} from './cloudflare-owner-portone-sandbox-receipt-verification-v1.js';

const ATTEMPT='11111111-1111-4111-8111-111111111111';
const RECEIPT='22222222-2222-4222-8222-222222222222';
const IDENTITY={kind:'member' as const,verifiedAuthUserId:'33333333-3333-4333-8333-333333333333'};
const INPUT={
  env:{
    Store_ID:'store-d9211773-4c6a-4736-9be7-c828405238bc',
    Channel_Key:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
    V2_API_Secret:'not-a-real-secret',
  },
  pool:{} as never,
  verifiedEvidence:IDENTITY,
  paymentAttemptId:ATTEMPT,
};

beforeEach(()=>{
  vi.resetAllMocks();
  state.adapter.mockResolvedValue({verify:vi.fn()});
  state.completion.mockResolvedValue({
    paymentAttemptId:ATTEMPT,receiptId:RECEIPT,replayed:false,
  });
});
describe('Cloudflare Owner sandbox PortOne provider receipt verification',()=>{
  it('never claims Production credit grant or browser callback authority',()=>{
    expect(CLOUDFLARE_OWNER_PORTONE_SANDBOX_RECEIPT_VERIFICATION_V1).toMatchObject({
      environment:'sandbox',provider:'portone_v2',
      serverVerificationRequired:true,browserPaymentResultAuthority:false,
      publicRouteMounted:false,productionCheckoutEnabled:false,
      creditMintEnabled:false,
    });
  });
  it('verifies actual DB-bound member Owner before invoking private Commerce completion',async()=>{
    const result=await verifyCloudflareOwnerPortOneSandboxReceiptV1(INPUT);
    expect(result).toEqual({
      paymentAttemptId:ATTEMPT,receiptId:RECEIPT,replayed:false,
      environment:'sandbox',productionCreditsIssued:false,
    });
    expect(state.adapter).toHaveBeenCalledWith(INPUT.env,{
      pool:INPUT.pool,verifiedEvidence:IDENTITY,
    });
    expect(state.completion).toHaveBeenCalledWith({
      pool:INPUT.pool,verifiedEvidence:IDENTITY,paymentAttemptId:ATTEMPT,
      verificationAdapter:await state.adapter.mock.results[0]?.value,
    });
    expect(JSON.stringify(result)).not.toContain(INPUT.env.V2_API_Secret);
  });
  it('rejects guest, noncanonical payment id, browser-owned payment result',async()=>{
    for(const invalid of [
      {...INPUT,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'unit-test'}},
      {...INPUT,paymentAttemptId:'bad'},
      {...INPUT,paymentAttemptId:{id:ATTEMPT,verifiedPaid:true}},
    ]){
      await expect(verifyCloudflareOwnerPortOneSandboxReceiptV1(
        invalid as typeof INPUT,
      )).rejects.toThrow('Owner PortOne sandbox receipt verification unavailable.');
    }
    expect(state.adapter).not.toHaveBeenCalled();
    expect(state.completion).not.toHaveBeenCalled();
  });
  it('fails closed before Commerce writes when Owner/HMAC/admission denies the adapter',async()=>{
    state.adapter.mockRejectedValueOnce(new Error('Owner ACL not available'));
    await expect(verifyCloudflareOwnerPortOneSandboxReceiptV1(INPUT))
      .rejects.toThrow('Owner ACL not available');
    expect(state.completion).not.toHaveBeenCalled();
  });
  it('requires exact same original Payment Attempt and a verified Receipt UUID',async()=>{
    for(const delta of [
      {paymentAttemptId:RECEIPT},{receiptId:'not-a-uuid'},
      {replayed:'yes'},{receiptId:null},
    ]){
      state.completion.mockResolvedValueOnce({
        paymentAttemptId:ATTEMPT,receiptId:RECEIPT,replayed:false,...delta,
      });
      await expect(verifyCloudflareOwnerPortOneSandboxReceiptV1(INPUT))
        .rejects.toThrow('Owner PortOne sandbox receipt verification unavailable.');
    }
  });
  it('reports idempotent replay only from persisted provider-confirmed receipt',async()=>{
    state.completion.mockResolvedValueOnce({
      paymentAttemptId:ATTEMPT,receiptId:RECEIPT,replayed:true,
    });
    await expect(verifyCloudflareOwnerPortOneSandboxReceiptV1(INPUT))
      .resolves.toMatchObject({replayed:true,productionCreditsIssued:false});
  });
});
