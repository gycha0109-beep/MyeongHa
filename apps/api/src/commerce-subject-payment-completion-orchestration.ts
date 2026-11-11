import { fulfillVerifiedReaderReceiptV1 } from './commerce-verified-reader-fulfillment.js';
import {
  fulfillVerifiedApprovedSajuReceiptV1,
  type ApprovedSajuReceiptFulfillmentV1,
} from './commerce-verified-approved-saju-fulfillment.js';
import {
  continuationFromVerifiedReaderBindV1,
  type CommerceReaderReceiptContinuationV1,
} from './commerce-reader-product-continuity-v1.js';
import {
  loadCommercePaymentVerificationContextV1,
} from './commerce-payment-verification-context-read.js';
import {
  executeCommercePaymentVerificationV1,
  type CommercePaymentVerificationAdapterV1,
} from './commerce-payment-verification-execution.js';
import {
  persistVerifiedPaymentEvidenceV1,
} from './commerce-verified-payment-evidence-persistence.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export const COMMERCE_SUBJECT_PAYMENT_COMPLETION_ORCHESTRATION_V1 = Object.freeze({
  active: false,
  publicRoute: null,
  browserResultAuthority: false,
  serverVerificationRequired: true,
  entitlementAuthority: false,
} as const);

export interface SubjectOwnedCommercePaymentCompletionV1 {
  readonly paymentAttemptId: string;
  readonly receiptId: string;
  readonly providerEventId: string;
  readonly replayed: boolean;
  readonly sajuFulfillment?: ApprovedSajuReceiptFulfillmentV1;
  readonly readerFulfillment?: 'issued' | 'already_bound' | 'not_reader';
  /**
   * Safe product navigation ONLY, not live entitlement or an interpretation.
   * Absent for ordinary Commerce purchases / disabled private S2.
   */
  readonly readerContinuation?: CommerceReaderReceiptContinuationV1;
}

/**
 * Completes one owned Payment Attempt only from server-side verification authority.
 *
 * Caller authority is intentionally limited to already-verified Subject identity
 * evidence plus paymentAttemptId. Provider/payment/product/amount/currency authority
 * is loaded from persisted Commerce state, verified through the injected provider
 * adapter, then re-checked by the internal persistence command.
 */
export async function executeSubjectOwnedCommercePaymentCompletionV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly commercePool?: PostgresSubjectPoolV1;
  readonly approvedSajuSandbox?: true;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly paymentAttemptId: unknown;
  readonly verificationAdapter: CommercePaymentVerificationAdapterV1;
  /** Explicit internal S2 only; public subject completion remains inactive. */
  readonly privateReaderReceiptFulfillmentEnabled?: boolean;
  readonly privateApprovedSajuReceiptFulfillmentEnabled?: boolean;
}): Promise<SubjectOwnedCommercePaymentCompletionV1> {
  if (input.approvedSajuSandbox === true && (input.commercePool === undefined || input.commercePool === input.pool)) {
    throw new Error('Approved Saju sandbox verification requires separate receipt persistence authority.');
  }
  const commercePool = input.commercePool ?? input.pool;
  const verificationContext = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async (scope) =>
      loadCommercePaymentVerificationContextV1({
        scope,
        paymentAttemptId: input.paymentAttemptId,
        ...(input.approvedSajuSandbox === true ? { approvedSajuSandbox: true } : {}),
      }),
  });

  if (typeof input.paymentAttemptId !== 'string') {
    throw new Error('Commerce payment completion received an invalid Payment Attempt identity.');
  }
  const paymentAttemptId = input.paymentAttemptId.trim().toLowerCase();

  const evidence = await executeCommercePaymentVerificationV1({
    context: verificationContext,
    adapter: input.verificationAdapter,
  });

  const persisted = await executePostgresCommerceInternalTransactionV1({
    pool: commercePool,
    execute: async (scope) =>
      persistVerifiedPaymentEvidenceV1({
        scope,
        paymentAttemptId,
        evidence,
      }),
  });

  const sajuFulfillment = input.privateApprovedSajuReceiptFulfillmentEnabled === true
    ? await fulfillVerifiedApprovedSajuReceiptV1({ pool: commercePool, receiptId: persisted.receiptId, evidence })
    : undefined;
  const readerFulfillment = input.privateReaderReceiptFulfillmentEnabled === true
    && (sajuFulfillment === undefined || sajuFulfillment === 'not_approved_saju')
    ? await fulfillVerifiedReaderReceiptV1({
        pool: commercePool,
        receiptId: persisted.receiptId,
      })
    : undefined;

  return Object.freeze({
    paymentAttemptId,
    receiptId: persisted.receiptId,
    providerEventId: persisted.providerEventId,
    replayed: persisted.replayed,
    ...(sajuFulfillment === undefined ? {} : { sajuFulfillment }),
    ...(input.privateReaderReceiptFulfillmentEnabled === true
      ? { readerFulfillment: readerFulfillment?.kind ?? 'not_reader' as const }
      : {}),
    ...(readerFulfillment === undefined || readerFulfillment === null
      ? {}
      : { readerContinuation: continuationFromVerifiedReaderBindV1(readerFulfillment) }),
  });
}
