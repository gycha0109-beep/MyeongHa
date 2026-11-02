// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
  payment:vi.fn(),
  subject:vi.fn(),
  commerce:vi.fn(),
  mint:vi.fn(),
}));
vi.mock('./commerce-subject-payment-completion-orchestration.js',()=>({
  executeSubjectOwnedCommercePaymentCompletionV1:state.payment,
}));
vi.mock('./postgres-subject-execution.js',()=>({
  executePostgresSubjectTransactionV1:state.subject,
}));
vi.mock('./postgres-commerce-internal-execution.js',()=>({
  executePostgresCommerceInternalTransactionV1:state.commerce,
}));
vi.mock('./commerce-credit-verified-topup-fulfillment-candidate-v1.js',()=>({
  fulfillVerifiedCreditTopUpCandidateV1:state.mint,
}));
import {completeVerifiedCreditCheckoutCandidateV1}
  from './commerce-credit-checkout-fulfillment-candidate-v1.js';
const subjectId='11111111-1111-4111-8111-111111111111';
const receiptId='22222222-2222-4222-8222-222222222222';
const offerId='33333333-3333-4333-8333-333333333333';
const lotId='44444444-4444-4444-8444-444444444444';
const paymentAttemptId='55555555-5555-4555-8555-555555555555';
const args={
  pool:{} as never,
  verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:subjectId},
  paymentAttemptId,
  verificationAdapter:{} as never,
  approvedCreditProductOfferId:offerId,
  approvedPaidCreditValidity:{kind:'never' as const},
};
beforeEach(()=>{
  vi.resetAllMocks();
  state.payment.mockResolvedValue({paymentAttemptId,receiptId,replayed:false});
  state.subject.mockResolvedValue(subjectId);
  state.mint.mockResolvedValue({kind:'issued',receiptId,lotId,creditQuantity:300,
    availableCredits:300,totalCredits:300});
  state.commerce.mockImplementation(async({execute}:{execute:(scope:{client:object})=>Promise<unknown>})=>execute({client:{}}));
});
describe('PortOne credit checkout pre-verification activation policy',()=>{
 it('does not touch provider or database while paid checkout is unmounted',async()=>{
   expect(await completeVerifiedCreditCheckoutCandidateV1({
     ...args,approvedCreditProductOfferId:null,
   })).toEqual({kind:'not_activated'});
   expect(await completeVerifiedCreditCheckoutCandidateV1({
     ...args,approvedPaidCreditValidity:null,
   })).toEqual({kind:'not_activated'});
   expect(state.payment).not.toHaveBeenCalled();
   expect(state.subject).not.toHaveBeenCalled();
   expect(state.commerce).not.toHaveBeenCalled();
 });
 it('rejects malformed Offer and any expiring or unknown policy before payment can persist',async()=>{
   for(const activation of [
     {approvedCreditProductOfferId:'malformed',approvedPaidCreditValidity:{kind:'never'}},
     {approvedCreditProductOfferId:offerId,approvedPaidCreditValidity:{kind:'days',days:365}},
     {approvedCreditProductOfferId:offerId,approvedPaidCreditValidity:{kind:'never',days:1}},
     {approvedCreditProductOfferId:offerId,approvedPaidCreditValidity:{kind:'always'}},
   ]){
     await expect(completeVerifiedCreditCheckoutCandidateV1({
       ...args,...activation,
     } as unknown as Parameters<typeof completeVerifiedCreditCheckoutCandidateV1>[0])).rejects.toThrow('server activation policy');
   }
   expect(state.payment).not.toHaveBeenCalled();
   expect(state.subject).not.toHaveBeenCalled();
   expect(state.commerce).not.toHaveBeenCalled();
   expect(state.mint).not.toHaveBeenCalled();
 });
 it('uses approved never-expiring policy and verified receipt before isolated credit mint',async()=>{
   const r=await completeVerifiedCreditCheckoutCandidateV1(args);
   expect(r).toMatchObject({kind:'completed',paymentAttemptId,receiptId,paymentReplayed:false,
     fulfillment:{kind:'issued',creditQuantity:300}});
   expect(state.payment).toHaveBeenCalledTimes(1);
   expect(state.subject).toHaveBeenCalledTimes(1);
   expect(state.commerce).toHaveBeenCalledTimes(1);
   expect(state.mint).toHaveBeenCalledWith(expect.objectContaining({
     canonicalSubjectId:subjectId,
     verifiedReceiptId:receiptId,
     approvedCreditProductOfferId:offerId,
     approvedPaidCreditValidity:{kind:'never'},
   }));
 });
 it('never claims fulfilled payment if the isolated credit payout is denied',async()=>{
   state.mint.mockResolvedValueOnce({kind:'denied'});
   await expect(completeVerifiedCreditCheckoutCandidateV1(args)).rejects.toThrow(
     'not eligible for credit issuance',
   );
 });
});
