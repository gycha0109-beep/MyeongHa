import { ApiCommandError } from './api-error.js';
import {
  assessDigitalReadingWithdrawalReviewV1,
  type DigitalReadingWithdrawalReasonV1,
  type DigitalReadingWithdrawalReviewV1,
} from './commerce-digital-reading-withdrawal-review-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectExecutionScopeV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

/**
 * Internal server-only read orchestration; NOT a public refund endpoint.
 * An independent Commerce/S7 DB authority must implement the snapshot port.
 * No amount, notice, deliveredAt, entitlement or provider state is accepted
 * from the caller. This is a review classification, not a withdrawal decision.
 */
export const OWNED_DIGITAL_READING_WITHDRAWAL_REVIEW_V1 = Object.freeze({
  active: false,
  publicRoute: null,
  allowBrowserEvidence: false,
  providerRefundAuthorized: false,
  entitlementMutationAuthorized: false,
} as const);

export interface OwnedDigitalReadingReviewSnapshotV1 {
  readonly purchase: unknown;
  readonly notice: unknown;
  readonly delivery: unknown;
}

export interface OwnedDigitalReadingReviewSnapshotPortV1 {
  /** Must load ONE consistent server-owned snapshot under the current Subject. */
  loadSnapshot(input: Readonly<{
    scope: PostgresSubjectExecutionScopeV1;
    purchaseIntentId: string;
    unitId: string;
  }>): Promise<OwnedDigitalReadingReviewSnapshotV1 | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const REASONS: ReadonlySet<string> = new Set([
  'change_of_mind', 'not_provided', 'delivery_failed', 'not_as_described',
  'defect', 'duplicate_charge', 'unprovided_separable_part', 'other',
]);

/**
 * A verified Member/Guest identity must resolve inside a single transaction.
 * The snapshot port must use the transaction-local Subject context to deny
 * cross-tenant reads. We never fabricate a delivery event from T2 or payment.
 */
export async function reviewOwnedDigitalReadingWithdrawalV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  purchaseIntentId: unknown;
  unitId: unknown;
  reason: unknown;
  evidencePort: OwnedDigitalReadingReviewSnapshotPortV1;
}>): Promise<DigitalReadingWithdrawalReviewV1> {
  if (typeof input.purchaseIntentId !== 'string' ||
      !UUID.test(input.purchaseIntentId) ||
      typeof input.unitId !== 'string' || !UNIT.test(input.unitId) ||
      typeof input.reason !== 'string' || !REASONS.has(input.reason)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Digital Reading withdrawal review selection is invalid.');
  }
  const purchaseIntentId = input.purchaseIntentId.toLowerCase();
  const unitId = input.unitId;
  const reason = input.reason as DigitalReadingWithdrawalReasonV1;

  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async (scope) => {
      const snapshot = await input.evidencePort.loadSnapshot({
        scope, purchaseIntentId, unitId,
      });
      // A missing purchase must not reveal another customer's order status.
      // The classifier returns the same neutral manual evidence review.
      return assessDigitalReadingWithdrawalReviewV1({
        purchase: snapshot?.purchase ?? null,
        notice: snapshot?.notice ?? null,
        delivery: snapshot?.delivery ?? null,
        claim: { purchaseIntentId, unitId, reason },
      });
    },
  });
}
