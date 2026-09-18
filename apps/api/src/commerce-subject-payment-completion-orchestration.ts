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
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly paymentAttemptId: unknown;
  readonly verificationAdapter: CommercePaymentVerificationAdapterV1;
}): Promise<SubjectOwnedCommercePaymentCompletionV1> {
  const verificationContext = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async (scope) =>
      loadCommercePaymentVerificationContextV1({
        scope,
        paymentAttemptId: input.paymentAttemptId,
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
    pool: input.pool,
    execute: async (scope) =>
      persistVerifiedPaymentEvidenceV1({
        scope,
        paymentAttemptId,
        evidence,
      }),
  });

  return Object.freeze({
    paymentAttemptId,
    receiptId: persisted.receiptId,
    providerEventId: persisted.providerEventId,
    replayed: persisted.replayed,
  });
}
