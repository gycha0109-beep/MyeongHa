import {beforeEach,describe,expect,it,vi} from 'vitest';
import {executeReviewedOwnerReaderRefundV1 as run,
  REVIEWED_READER_REFUND_EXECUTION_V1 as policy,
} from '../apps/api/src/commerce-reader-reviewed-refund-execution-v1.js';
import {readPrivilegedReaderWithdrawalCaseV1 as review}
  from '../apps/api/src/commerce-reader-withdrawal-operations-review-v1.js';
import {executeOwnerApprovedReaderRefundCommandV1 as refund}
  from '../apps/api/src/commerce-reader-refund-operations-command-v1.js';
import type {PostgresSubjectPoolV1}
  from '../apps/api/src/postgres-subject-execution.js';

vi.mock('../apps/api/src/commerce-reader-withdrawal-operations-review-v1.js',()=>({
  readPrivilegedReaderWithdrawalCaseV1:vi.fn(),
}));
vi.mock('../apps/api/src/commerce-reader-refund-operations-command-v1.js',()=>({
  executeOwnerApprovedReaderRefundCommandV1:vi.fn(),
}));

const claimId='11111111-1111-4111-8111-111111111111';
const receiptId='22222222-2222-4222-8222-222222222222';
const secondReceiptId='33333333-3333-4333-8333-333333333333';
const purchaseId='44444444-4444-4444-8444-444444444444';
const legalOwnerPool={connect:vi.fn()} as unknown as PostgresSubjectPoolV1;
const commerceExecutorPool={connect:vi.fn()} as unknown as PostgresSubjectPoolV1;
const input={
  legalOwnerPool,commerceExecutorPool,
  sourceClaimId:claimId,
  receiptId,
  authorizationId:'55555555-5555-4555-8555-555555555555',
  decisionRef:'sha256:v1:'+'a'.repeat(64),
  operatorRef:'operator:66666666-6666-4666-8666-666666666666',
  approvedAt:'2026-11-02T09:00:00.000Z',
  reasonCode:'non_delivery' as const,
  apiSecret:'private-key',
  verifier:{verifyFullCancellation:vi.fn()},
};

const caseFile={
  claimId,subjectId:'77777777-7777-4777-8777-777777777777',
  reasonCode:'not_provided',receivedAt:'2026-11-02T08:00:00.000Z',
  hasExactPurchasedUnit:true,requiresExplicitReceiptSelection:true as const,
  receipts:[{
    receiptId,purchaseIntentId:purchaseId,
    currency:'KRW',amountMinor:8900,verificationStatus:'verified' as const,
  }],
  candidateLimitExceeded:false,refundApproved:false as const,
  providerRefundCompleted:false as const,
};

describe('internal owner Reader claim-to-refund dispatch bridge',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    vi.mocked(review).mockResolvedValue(caseFile);
    vi.mocked(refund).mockResolvedValue({
      kind:'refund_result',decisionKind:'recorded',
      result:{kind:'confirmed_revoked',providerRefundConfirmed:true,readerGrantRevoked:true},
    });
  });
  it('never turns a customer claim into automatic refund or public route',()=>{
    expect(policy).toMatchObject({
      publicRouteMounted:false,triggeredByCustomerClaim:false,
      legalDecisionAutomatic:false,providerSubmissionAutomatic:false,
      requiresExplicitReceipt:true,requiresSeparateLegalOwnerPool:true,
    });
  });
  it('reads owner case first, then submits only explicitly selected original Receipt',async()=>{
    const order:string[]=[];
    vi.mocked(review).mockImplementation(async()=>{order.push('read');return caseFile;});
    vi.mocked(refund).mockImplementation(async()=>{order.push('write_and_provider');return {
      kind:'refund_result',decisionKind:'recorded',
      result:{kind:'confirmed_revoked',providerRefundConfirmed:true,readerGrantRevoked:true},
    };});
    const result=await run(input);
    expect(result.kind).toBe('executed');
    expect(order).toEqual(['read','write_and_provider']);
    expect(review).toHaveBeenCalledWith({pool:legalOwnerPool,claimId});
    expect(refund).toHaveBeenCalledWith(input);
  });
  it('holds a deleted or nonexistent claim without provider write',async()=>{
    vi.mocked(review).mockResolvedValue(null);
    await expect(run(input)).resolves.toEqual({kind:'hold',reason:'claim_not_found'});
    expect(refund).not.toHaveBeenCalled();
  });
  it('holds unmatched receipt even when other verified receipts exist',async()=>{
    await expect(run({...input,receiptId:secondReceiptId}))
      .resolves.toEqual({kind:'hold',reason:'selected_receipt_missing'});
    expect(refund).not.toHaveBeenCalled();
  });
  it('holds a revoked Receipt; old grants are not re-refunded',async()=>{
    vi.mocked(review).mockResolvedValue({
      ...caseFile,receipts:[{...caseFile.receipts[0]!,verificationStatus:'revoked'}],
    });
    await expect(run(input)).resolves.toEqual({
      kind:'hold',reason:'receipt_not_verified',
    });
    expect(refund).not.toHaveBeenCalled();
  });
  it('holds too many candidate receipts without picking one heuristically',async()=>{
    vi.mocked(review).mockResolvedValue({...caseFile,candidateLimitExceeded:true});
    await expect(run(input)).resolves.toEqual({
      kind:'hold',reason:'candidate_limit_exceeded',
    });
    expect(refund).not.toHaveBeenCalled();
  });
  it('holds ambiguous duplicate DB receipt candidates',async()=>{
    vi.mocked(review).mockResolvedValue({
      ...caseFile,receipts:[caseFile.receipts[0]!,caseFile.receipts[0]!],
    });
    await expect(run(input)).resolves.toEqual({
      kind:'hold',reason:'ambiguous_receipt',
    });
    expect(refund).not.toHaveBeenCalled();
  });
  it('rejects fake review decision or mismatched claim provenance',async()=>{
    vi.mocked(review).mockResolvedValue({...caseFile,
      claimId:secondReceiptId,
    });
    await expect(run(input)).rejects.toThrow(
      'REVIEWED_READER_REFUND_REVIEW_UNTRUSTED');
    expect(refund).not.toHaveBeenCalled();
  });
  it('rejects a shared privileged owner and payment executor connection',async()=>{
    await expect(run({...input,commerceExecutorPool:legalOwnerPool})).rejects.toThrow(
      'REVIEWED_READER_REFUND_INVALID_INPUT');
    expect(review).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });
  it('rejects invalid IDs without reading any private customer data',async()=>{
    await expect(run({...input,sourceClaimId:'invalid'})).rejects.toThrow(
      'REVIEWED_READER_REFUND_INVALID_INPUT');
    expect(review).not.toHaveBeenCalled();
  });
  it('does not call provider if owner review query fails or legal decision is uncertain',async()=>{
    vi.mocked(review).mockRejectedValueOnce(Error('NO_PRIVILEGE'));
    await expect(run(input)).rejects.toThrow('NO_PRIVILEGE');
    expect(refund).not.toHaveBeenCalled();
    vi.mocked(refund).mockResolvedValue({
      kind:'decision_commit_unknown',refundSubmitted:false,
    });
    const result=await run(input);
    expect(result).toMatchObject({
      kind:'executed',outcome:{kind:'decision_commit_unknown',refundSubmitted:false},
    });
  });
});
