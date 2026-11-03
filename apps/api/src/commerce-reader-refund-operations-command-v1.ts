import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {PortOneV2FullCancellationVerifierV1,PortOneV2PaymentHttpFetchV1}
  from './portone-v2-payment-verification-adapter.js';
import {
  recordOwnerApprovedReaderFullRefundDecisionV1,
  type OwnerReaderRefundReasonV1,
} from './commerce-reader-private-refund-decision-v1.js';
import {
  executePrivatelyAuthorizedReaderFullRefundV1,
  type ReaderPrivateRefundFetchV1,
  type ReaderPrivateRefundOutcomeV1,
} from './commerce-portone-reader-refund-request-v1.js';

/**
 * Explicit private operator command: a human legal decision is REQUIRED
 * before provider submission. It is never mounted on a consumer/admin HTTP
 * route or scheduled to run from the mere receipt of a withdrawal claim.
 * Owners must supply a distinct privileged approval pool; PSP submission
 * uses the least-privilege Commerce internal executor.
 */
export const COMMERCE_READER_REFUND_OWNER_COMMAND_V1=Object.freeze({
  publicRouteMounted:false,
  automaticLegalDecision:false,
  triggeredByCustomerClaim:false,
  providerCallRequiresDurableDecision:true,
} as const);

export type CommerceOwnerRefundCommandResultV1=Readonly<
  {kind:'decision_commit_unknown';refundSubmitted:false}
  |{kind:'refund_result';decisionKind:'recorded'|'existing';result:ReaderPrivateRefundOutcomeV1}
>;

export async function executeOwnerApprovedReaderRefundCommandV1(input:Readonly<{
  legalOwnerPool:PostgresSubjectPoolV1;
  commerceExecutorPool:PostgresSubjectPoolV1;
  authorizationId:string;
  receiptId:string;
  /** Optional exact claimant link, not the legally decisive authority. */
  sourceClaimId?:string;
  decisionRef:string;
  operatorRef:string;
  approvedAt:string;
  reasonCode:OwnerReaderRefundReasonV1;
  apiSecret:string;
  verifier:PortOneV2FullCancellationVerifierV1;
  postFetchImpl?:ReaderPrivateRefundFetchV1;
  lookupFetchImpl?:PortOneV2PaymentHttpFetchV1;
  timeoutMs?:number;
}>):Promise<CommerceOwnerRefundCommandResultV1>{
  const decision=await recordOwnerApprovedReaderFullRefundDecisionV1({
    pool:input.legalOwnerPool,
    authorizationId:input.authorizationId,
    receiptId:input.receiptId,
    ...(input.sourceClaimId===undefined?{}:{sourceClaimId:input.sourceClaimId}),
    decisionRef:input.decisionRef,
    operatorRef:input.operatorRef,
    approvedAt:input.approvedAt,
    reasonCode:input.reasonCode,
  });
  if(decision.kind==='unknown_commit')return Object.freeze({
    kind:'decision_commit_unknown',refundSubmitted:false,
  });
  const result=await executePrivatelyAuthorizedReaderFullRefundV1({
    pool:input.commerceExecutorPool,
    authorizationId:input.authorizationId,
    apiSecret:input.apiSecret,
    verifier:input.verifier,
    ...(input.postFetchImpl===undefined?{}:{fetchImpl:input.postFetchImpl}),
    ...(input.lookupFetchImpl===undefined?{}:{lookupFetchImpl:input.lookupFetchImpl}),
    ...(input.timeoutMs===undefined?{}:{timeoutMs:input.timeoutMs}),
  });
  return Object.freeze({
    kind:'refund_result',decisionKind:decision.kind,result,
  });
}
