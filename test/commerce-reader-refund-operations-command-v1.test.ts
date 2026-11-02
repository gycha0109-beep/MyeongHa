import {beforeEach,describe,expect,it,vi} from 'vitest';
import {executeOwnerApprovedReaderRefundCommandV1,
  COMMERCE_READER_REFUND_OWNER_COMMAND_V1 as policy,
} from '../apps/api/src/commerce-reader-refund-operations-command-v1.js';
import {recordOwnerApprovedReaderFullRefundDecisionV1}
  from '../apps/api/src/commerce-reader-private-refund-decision-v1.js';
import {executePrivatelyAuthorizedReaderFullRefundV1}
  from '../apps/api/src/commerce-portone-reader-refund-request-v1.js';
import type {PostgresSubjectPoolV1}
  from '../apps/api/src/postgres-subject-execution.js';

vi.mock('../apps/api/src/commerce-reader-private-refund-decision-v1.js',()=>({
  recordOwnerApprovedReaderFullRefundDecisionV1:vi.fn(),
}));
vi.mock('../apps/api/src/commerce-portone-reader-refund-request-v1.js',()=>({
  executePrivatelyAuthorizedReaderFullRefundV1:vi.fn(),
}));
const legalOwnerPool={} as PostgresSubjectPoolV1;
const commerceExecutorPool={} as PostgresSubjectPoolV1;
const decision={
  legalOwnerPool,commerceExecutorPool,
  authorizationId:'11111111-1111-4111-8111-111111111111',
  receiptId:'22222222-2222-4222-8222-222222222222',
  sourceClaimId:'33333333-3333-4333-8333-333333333333',
  decisionRef:'sha256:v1:'+'a'.repeat(64),
  operatorRef:'operator:44444444-4444-4444-8444-444444444444',
  approvedAt:'2026-11-01T09:00:00.000Z',
  reasonCode:'customer_withdrawal' as const,
  apiSecret:'private-api-secret-long-enough',
  verifier:{verifyFullCancellation:vi.fn()},
};
describe('privileged manually approved Reader refund command',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    vi.mocked(recordOwnerApprovedReaderFullRefundDecisionV1)
      .mockResolvedValue({kind:'recorded',authorizationId:decision.authorizationId});
    vi.mocked(executePrivatelyAuthorizedReaderFullRefundV1)
      .mockResolvedValue({
        kind:'confirmed_revoked',providerRefundConfirmed:true,readerGrantRevoked:true,
      });
  });
  it('never mounts a public or claim-triggered automatic provider refund',()=>{
    expect(policy).toEqual({
      publicRouteMounted:false,automaticLegalDecision:false,
      triggeredByCustomerClaim:false,providerCallRequiresDurableDecision:true,
    });
  });
  it('records a human decision with exact Claim/Receipt BEFORE provider dispatch',async()=>{
    const calls:string[]=[];
    vi.mocked(recordOwnerApprovedReaderFullRefundDecisionV1)
      .mockImplementation(async()=>{calls.push('legal_decision');return {
        kind:'recorded',authorizationId:decision.authorizationId,
      };});
    vi.mocked(executePrivatelyAuthorizedReaderFullRefundV1)
      .mockImplementation(async()=>{calls.push('provider_dispatch');return {
        kind:'confirmed_revoked',providerRefundConfirmed:true,readerGrantRevoked:true,
      };});
    const output=await executeOwnerApprovedReaderRefundCommandV1(decision);
    expect(calls).toEqual(['legal_decision','provider_dispatch']);
    expect(recordOwnerApprovedReaderFullRefundDecisionV1).toHaveBeenCalledWith({
      pool:legalOwnerPool,authorizationId:decision.authorizationId,
      receiptId:decision.receiptId,sourceClaimId:decision.sourceClaimId,
      decisionRef:decision.decisionRef,operatorRef:decision.operatorRef,
      approvedAt:decision.approvedAt,reasonCode:decision.reasonCode,
    });
    expect(executePrivatelyAuthorizedReaderFullRefundV1).toHaveBeenCalledWith({
      pool:commerceExecutorPool,authorizationId:decision.authorizationId,
      apiSecret:decision.apiSecret,verifier:decision.verifier,
    });
    expect(output).toMatchObject({kind:'refund_result',decisionKind:'recorded',
      result:{kind:'confirmed_revoked'}});
  });
  it('stops before sending money when legal decision COMMIT is uncertain',async()=>{
    vi.mocked(recordOwnerApprovedReaderFullRefundDecisionV1)
      .mockResolvedValue({kind:'unknown_commit'});
    expect(await executeOwnerApprovedReaderRefundCommandV1(decision)).toEqual({
      kind:'decision_commit_unknown',refundSubmitted:false,
    });
    expect(executePrivatelyAuthorizedReaderFullRefundV1).not.toHaveBeenCalled();
  });
  it('stops before provider when customer Claim and Receipt authority conflicts',async()=>{
    vi.mocked(recordOwnerApprovedReaderFullRefundDecisionV1)
      .mockRejectedValue(Error('READER_REFUND_OWNER_DECISION_REPLAY_CONFLICT'));
    await expect(executeOwnerApprovedReaderRefundCommandV1(decision))
      .rejects.toThrow('READER_REFUND_OWNER_DECISION_REPLAY_CONFLICT');
    expect(executePrivatelyAuthorizedReaderFullRefundV1).not.toHaveBeenCalled();
  });
  it('existing identical manual decision reuses existing single dispatch reservation',async()=>{
    vi.mocked(recordOwnerApprovedReaderFullRefundDecisionV1)
      .mockResolvedValue({kind:'existing',authorizationId:decision.authorizationId});
    const outcome=await executeOwnerApprovedReaderRefundCommandV1(decision);
    expect(outcome).toMatchObject({decisionKind:'existing',kind:'refund_result'});
    expect(executePrivatelyAuthorizedReaderFullRefundV1).toHaveBeenCalledTimes(1);
  });
});
