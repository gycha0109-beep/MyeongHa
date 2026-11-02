import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import {
  readPrivilegedReaderWithdrawalCaseV1,
} from './commerce-reader-withdrawal-operations-review-v1.js';
import {
  executeOwnerApprovedReaderRefundCommandV1,
} from './commerce-reader-refund-operations-command-v1.js';

/**
 * Owner-only P4 bridge from one customer claim to one explicitly chosen
 * verified Reader receipt and separately authorized legal refund decision.
 *
 * This is an INTERNAL command, not an HTTP route or automatic claim worker.
 * The read-only candidate check is advisory. The existing serializable legal
 * decision writer repeats exact Claim x Receipt authority under DB locks;
 * the PSP call runs only AFTER a durable decision commits.
 */
export const REVIEWED_READER_REFUND_EXECUTION_V1 = Object.freeze({
  publicRouteMounted:false,
  triggeredByCustomerClaim:false,
  legalDecisionAutomatic:false,
  providerSubmissionAutomatic:false,
  requiresExplicitReceipt:true,
  requiresSeparateLegalOwnerPool:true,
} as const);

type OwnerCommandInput = Parameters<
  typeof executeOwnerApprovedReaderRefundCommandV1
>[0];

export type ReviewedReaderRefundInputV1 = OwnerCommandInput & Readonly<{
  /** Operator-selected original customer claim; never inferred from Receipt. */
  sourceClaimId:string;
}>;

export type ReviewedReaderRefundResultV1 = Readonly<
  | {kind:'hold'; reason:
      'claim_not_found'
      | 'candidate_limit_exceeded'
      | 'receipt_not_verified'
      | 'selected_receipt_missing'
      | 'ambiguous_receipt'}
  | {kind:'executed'; outcome:Awaited<ReturnType<
      typeof executeOwnerApprovedReaderRefundCommandV1
    >>}
>;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * A READ ONLY owner review must precede the already separately approved
 * write+dispatch command. The new P4 bridge adds no receipt-selection
 * heuristics and never treats a client claim as legal refund approval.
 */
export async function executeReviewedOwnerReaderRefundV1(
  input:ReviewedReaderRefundInputV1,
):Promise<ReviewedReaderRefundResultV1>{
  if (!input || !input.legalOwnerPool
      || typeof input.legalOwnerPool.connect!=='function'
      || !input.commerceExecutorPool
      || typeof input.commerceExecutorPool.connect!=='function'
      || input.legalOwnerPool===input.commerceExecutorPool
      || !UUID.test(input.sourceClaimId)
      || !UUID.test(input.receiptId)
      || !UUID.test(input.authorizationId)) {
    throw Error('REVIEWED_READER_REFUND_INVALID_INPUT');
  }
  const claimId=input.sourceClaimId.toLowerCase();
  const receiptId=input.receiptId.toLowerCase();
  const caseFile=await readPrivilegedReaderWithdrawalCaseV1({
    pool:input.legalOwnerPool as PostgresSubjectPoolV1,
    claimId,
  });
  if(caseFile===null)return Object.freeze({
    kind:'hold',reason:'claim_not_found',
  });
  if(caseFile.claimId!==claimId || caseFile.requiresExplicitReceiptSelection!==true
    || caseFile.refundApproved!==false
    || caseFile.providerRefundCompleted!==false) {
    throw Error('REVIEWED_READER_REFUND_REVIEW_UNTRUSTED');
  }
  if(caseFile.candidateLimitExceeded)return Object.freeze({
    kind:'hold',reason:'candidate_limit_exceeded',
  });
  // Never automatically select even when there is exactly one candidate.
  const matches=caseFile.receipts.filter(r=>r.receiptId===receiptId);
  if(matches.length===0)return Object.freeze({
    kind:'hold',reason:'selected_receipt_missing',
  });
  if(matches.length!==1)return Object.freeze({
    kind:'hold',reason:'ambiguous_receipt',
  });
  const receipt=matches[0]!;
  if(receipt.verificationStatus!=='verified')return Object.freeze({
    kind:'hold',reason:'receipt_not_verified',
  });
  if(!UUID.test(receipt.purchaseIntentId)
    || typeof receipt.amountMinor!=='number'
    || !Number.isSafeInteger(receipt.amountMinor)
    || receipt.amountMinor<=0) {
    throw Error('REVIEWED_READER_REFUND_REVIEW_UNTRUSTED');
  }
  // Existing DB decision rechecks Subject, Receipt, exact Unit and immutable
  // customer-claim fingerprint atomically; the subsequent owner command sends
  // to the provider only after the legal decision is durably committed.
  const outcome=await executeOwnerApprovedReaderRefundCommandV1({
    ...input,
    receiptId,
    sourceClaimId:claimId,
  });
  return Object.freeze({kind:'executed',outcome});
}
