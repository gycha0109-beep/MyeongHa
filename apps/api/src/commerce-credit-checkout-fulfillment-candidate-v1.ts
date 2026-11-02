import {
  executeSubjectOwnedCommercePaymentCompletionV1,
} from './commerce-subject-payment-completion-orchestration.js';
import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import {
  fulfillVerifiedCreditTopUpCandidateV1,
  type ApprovedPaidCreditValidityV1,
  type VerifiedCreditTopUpFulfillmentResultV1,
} from './commerce-credit-verified-topup-fulfillment-candidate-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const CREDIT_CHECKOUT_FULFILLMENT_CANDIDATE_V1 = Object.freeze({
  productionMounted: false,
  liveCheckoutEnabled: false,
} as const);

export type CreditCheckoutCandidateResultV1 =
  | Readonly<{kind: 'not_activated'}>
  | Readonly<{
    kind: 'completed';
    paymentAttemptId: string;
    receiptId: string;
    paymentReplayed: boolean;
    fulfillment: Exclude<VerifiedCreditTopUpFulfillmentResultV1, {kind:'not_activated'}>;
  }>;

/**
 * Wire existing Purchase Intent/Payment Attempt/PortOne server verification and
 * receipt persistence to the idempotent private Credit Lot. Only governance-
 * approved SERVER arguments may enable this candidate. No public route exists.
 * If credit issuance fails after verified payment persistence, a retry converges
 * on the same immutable Receipt; never report the payment as fulfilled early.
 */
export async function completeVerifiedCreditCheckoutCandidateV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  paymentAttemptId: string;
  verificationAdapter: CommercePaymentVerificationAdapterV1;
  approvedCreditProductOfferId: string | null;
  approvedPaidCreditValidity: ApprovedPaidCreditValidityV1 | null;
}>): Promise<CreditCheckoutCandidateResultV1> {
  if (input.approvedCreditProductOfferId === null ||
      input.approvedPaidCreditValidity === null) {
    return Object.freeze({kind:'not_activated'});
  }
  // The Payment Attempt may persist a verified Receipt before minting.
  // Reject a corrupt operator/merchant Offer or invalid paid-credit validity
  // BEFORE provider verification or ANY persistent payment side effect.
  const policy=input.approvedPaidCreditValidity;
  if (!UUID.test(input.approvedCreditProductOfferId) ||
      typeof policy!=='object' || Array.isArray(policy) ||
      policy.kind!=='never' || Object.keys(policy).length!==1) {
    throw new Error('Credit checkout server activation policy is invalid');
  }

  const completion = await executeSubjectOwnedCommercePaymentCompletionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    paymentAttemptId: input.paymentAttemptId,
    verificationAdapter: input.verificationAdapter,
  });

  const owner = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: scope => scope.resolvedSubject.subjectId,
  });

  const fulfillment = await executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: scope => fulfillVerifiedCreditTopUpCandidateV1({
      client: scope.client,
      canonicalSubjectId: owner,
      verifiedReceiptId: completion.receiptId,
      approvedCreditProductOfferId: input.approvedCreditProductOfferId,
      approvedPaidCreditValidity: input.approvedPaidCreditValidity,
    }),
  });
  if (fulfillment.kind === 'not_activated') {
    throw new Error('Credit fulfillment lost approved server activation');
  }
  if (fulfillment.kind === 'denied') {
    throw new Error('Verified payment is not eligible for credit issuance');
  }
  return Object.freeze({
    kind:'completed',
    paymentAttemptId: completion.paymentAttemptId,
    receiptId: completion.receiptId,
    paymentReplayed: completion.replayed,
    fulfillment,
  });
}
