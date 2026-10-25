import { ApiCommandError } from './api-error.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectExecutionScopeV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  DigitalReadingWithdrawalReasonV1,
  DigitalReadingWithdrawalReviewV1,
} from './commerce-digital-reading-withdrawal-review-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

/**
 * Private bridge to DB Owner Draft #2301's S7 original-Receipt/Grant read.
 *
 * #2301 explicitly REVOKES runtime EXECUTE on its S7 SQL. The Legal API
 * MUST NOT grant itself that privilege, query the table directly, or
 * emulate a successful delivery by converting a client ACK to deliveredAt.
 *
 * A DB Owner-approved private integration supplies the port after checking
 * the original Receipt, S1 scope lock, originating Grant and S5 body using
 * its own authority. This bridge has NO public HTTP handler or release switch.
 */
export const LEGAL_READER_S7_OWNER_BRIDGE_V1 = Object.freeze({
  ownerContractVersion: 'commerce-reader-s7-private-withdrawal-evidence-v1',
  ownerDraftPr: 2301,
  publicRoute: null,
  ownerRuntimeSqlGranted: false,
  actualConsumerDeliveryProven: false,
  mayAutomaticallyDeny: false,
  mayRefundProvider: false,
  mayMutateEntitlement: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REASONS: ReadonlySet<string> = new Set([
  'change_of_mind', 'not_provided', 'delivery_failed',
  'not_as_described', 'defect', 'duplicate_charge',
  'unprovided_separable_part', 'other',
]);
const S7_STATES: ReadonlySet<string> = new Set([
  'no_retained_delivery_receipts',
  'response_prepared_no_retained_ack',
  'client_ack_recorded_delivery_unproven',
]);

type S7Stage =
  | 'no_retained_delivery_receipts'
  | 'response_prepared_no_retained_ack'
  | 'client_ack_recorded_delivery_unproven';

export type LegalReaderS7ReviewV1 = Readonly<{
  review: DigitalReadingWithdrawalReviewV1;
  originalReceiptStatus: 'verified' | 'revoked';
  retainedDeliveryEvidenceState: S7Stage;
  retainedDeliveryAttempts: number;
  retainedAcknowledgedAttempts: number;
  retainedUnacknowledgedAttempts: number;
  serverResponsePreparedAt: string | null;
  authenticatedClientAcknowledgedAt: string | null;
  /** Never infer actual supply from response preparation or client ACK. */
  actualConsumerDeliveryProven: false;
  legallyProvenDeliveredAt: null;
  checkoutNoticeEvidenceState: 'attested_original_checkout_notice' | 'missing_or_unverifiable';
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
}>;

export interface OfficialReaderS7OwnerEvidencePortV1 {
  /**
   * Owner-controlled private reader. Must use S1 scope-lock, original
   * provider Receipt/Grant identity and immutable S5 body in one transaction.
   * The input identifiers are internal DB Owner provenance, NOT browser IDs.
   */
  readOriginalReceiptS7Evidence(input: Readonly<{
    scope: PostgresSubjectExecutionScopeV1;
    purchaseIntentId: string;
    originatingGrantId: string;
    bodyId: string;
    claim: Readonly<{
      purchaseIntentId: string;
      unitId: string;
      reason: DigitalReadingWithdrawalReasonV1;
    }>;
  }>): Promise<unknown>;
}

export class LegalReaderS7OwnerEvidenceUnavailableV1 extends Error {
  readonly code = 'LEGAL_READER_S7_OWNER_EVIDENCE_UNAVAILABLE' as const;
  constructor() {
    super('Private Reader S7 evidence is unavailable for legal review.');
    this.name = 'LegalReaderS7OwnerEvidenceUnavailableV1';
  }
}

const fail = (): never => { throw new LegalReaderS7OwnerEvidenceUnavailableV1(); };
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const timestamp = (v: unknown): v is string => {
  if (typeof v !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(v)) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString().slice(0, 19) === v.slice(0, 19);
};

function parseOwnerEvidence(
  value: unknown,
  expected: Readonly<{purchaseIntentId:string;originatingGrantId:string}>,
): LegalReaderS7ReviewV1 {
  if (!object(value) ||
      value.contractVersion !== LEGAL_READER_S7_OWNER_BRIDGE_V1.ownerContractVersion ||
      !object(value.purchasedUnit) || !object(value.timeline) ||
      !object(value.review) ||
      value.purchasedUnit.purchaseIntentId !== expected.purchaseIntentId ||
      value.purchasedUnit.unitId !== expected.originatingGrantId ||
      value.refundAuthorized !== false ||
      value.entitlementMutationAuthorized !== false) return fail();

  const timeline = value.timeline;
  const review = value.review;
  const originalReceiptStatus = timeline.originalReceiptStatus;
  if (originalReceiptStatus !== 'verified' && originalReceiptStatus !== 'revoked') return fail();
  if (timeline.consumerDeliveryProven !== false ||
      timeline.legallyProvenDeliveredAt !== null ||
      !integer(timeline.retainedDeliveryAttempts) ||
      !integer(timeline.retainedAcknowledgedAttempts) ||
      !integer(timeline.retainedUnacknowledgedAttempts) ||
      !S7_STATES.has(String(timeline.retainedDeliveryEvidenceState)) ||
      !timestamp(timeline.s5CommittedAt) ||
      (timeline.serverResponsePreparedAt !== null &&
        !timestamp(timeline.serverResponsePreparedAt)) ||
      (timeline.authenticatedClientAcknowledgedAt !== null &&
        !timestamp(timeline.authenticatedClientAcknowledgedAt)) ||
      timeline.retainedAcknowledgedAttempts > timeline.retainedDeliveryAttempts ||
      timeline.retainedUnacknowledgedAttempts !==
        timeline.retainedDeliveryAttempts - timeline.retainedAcknowledgedAttempts) return fail();

  const stage = timeline.retainedDeliveryEvidenceState as S7Stage;
  if ((stage === 'no_retained_delivery_receipts' &&
        (timeline.retainedDeliveryAttempts !== 0 ||
         timeline.serverResponsePreparedAt !== null ||
         timeline.authenticatedClientAcknowledgedAt !== null)) ||
      (stage === 'response_prepared_no_retained_ack' &&
        (timeline.retainedDeliveryAttempts < 1 ||
         timeline.retainedAcknowledgedAttempts !== 0 ||
         timeline.serverResponsePreparedAt === null ||
         timeline.authenticatedClientAcknowledgedAt !== null)) ||
      (stage === 'client_ack_recorded_delivery_unproven' &&
        (timeline.retainedAcknowledgedAttempts < 1 ||
         timeline.serverResponsePreparedAt === null ||
         timeline.authenticatedClientAcknowledgedAt === null)) ||
      (timeline.serverResponsePreparedAt !== null &&
        Date.parse(timeline.serverResponsePreparedAt as string) <
          Date.parse(timeline.s5CommittedAt as string)) ||
      (timeline.authenticatedClientAcknowledgedAt !== null &&
        timeline.serverResponsePreparedAt !== null &&
        Date.parse(timeline.authenticatedClientAcknowledgedAt as string) <
          Date.parse(timeline.serverResponsePreparedAt as string))) return fail();

  // DB Owner's legal triage is allowed to be conservative, never affirmative
  // about delivered content when S7 only attests response/ACK metadata.
  if (review.classification === 'restriction_review_candidate' ||
      review.reason === 'DELIVERED_NOTICE_RECORDED' ||
      ![
        'statutory_exception_review', 'not_proven_delivered',
        'separable_part_review', 'evidence_review_required',
      ].includes(String(review.classification)) ||
      review.automaticDenialAuthorized !== false ||
      review.providerRefundAuthorized !== false ||
      review.entitlementMutationAuthorized !== false ||
      (originalReceiptStatus === 'revoked' &&
        review.classification !== 'evidence_review_required') ||
      (value.checkoutNoticeEvidenceState !== 'attested_original_checkout_notice' &&
       value.checkoutNoticeEvidenceState !== 'missing_or_unverifiable')) return fail();

  return Object.freeze({
    review: Object.freeze({
      classification: review.classification as DigitalReadingWithdrawalReviewV1['classification'],
      reason: review.reason as DigitalReadingWithdrawalReviewV1['reason'],
      automaticDenialAuthorized: false as const,
      providerRefundAuthorized: false as const,
      entitlementMutationAuthorized: false as const,
    }),
    originalReceiptStatus,
    retainedDeliveryEvidenceState: stage,
    retainedDeliveryAttempts: timeline.retainedDeliveryAttempts as number,
    retainedAcknowledgedAttempts: timeline.retainedAcknowledgedAttempts as number,
    retainedUnacknowledgedAttempts: timeline.retainedUnacknowledgedAttempts as number,
    serverResponsePreparedAt: timeline.serverResponsePreparedAt as string | null,
    authenticatedClientAcknowledgedAt:
      timeline.authenticatedClientAcknowledgedAt as string | null,
    actualConsumerDeliveryProven: false as const,
    legallyProvenDeliveredAt: null,
    checkoutNoticeEvidenceState: value.checkoutNoticeEvidenceState as
      LegalReaderS7ReviewV1['checkoutNoticeEvidenceState'],
    providerRefundAuthorized: false as const,
    entitlementMutationAuthorized: false as const,
  });
}

/**
 * Actual transaction-level integration endpoint for an OWNER-INJECTED,
 * authenticated original Receipt + Grant + S7 Journal proof.
 * No DB direct EXECUTE is added; fail closed until Owner #2301 is merged
 * and supplies a narrowly authorized port. Only verified Members qualify.
 */
export async function reviewLegalReaderS7OriginalPurchaseV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  /** Server-selected original provenance. Never copy request body fields. */
  provenance: Readonly<{
    purchaseIntentId: string;
    originatingGrantId: string;
    bodyId: string;
  }>;
  reason: DigitalReadingWithdrawalReasonV1;
  ownerPort: OfficialReaderS7OwnerEvidencePortV1;
}>): Promise<LegalReaderS7ReviewV1> {
  if (!UUID.test(input.provenance.purchaseIntentId) ||
      !UUID.test(input.provenance.originatingGrantId) ||
      !UUID.test(input.provenance.bodyId) ||
      !REASONS.has(input.reason) ||
      !input.ownerPort?.readOriginalReceiptS7Evidence) {
    throw new ApiCommandError('INVALID_REQUEST', 'Original Reader purchase review input is invalid.');
  }
  const purchaseIntentId = input.provenance.purchaseIntentId.toLowerCase();
  const originatingGrantId = input.provenance.originatingGrantId.toLowerCase();
  const bodyId = input.provenance.bodyId.toLowerCase();
  try {
    return await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async(scope) => {
        if (scope.resolvedSubject.subjectKind !== 'member') return fail();
        const owner = await input.ownerPort.readOriginalReceiptS7Evidence({
          scope,purchaseIntentId,originatingGrantId,bodyId,
          claim: Object.freeze({
            purchaseIntentId,unitId:originatingGrantId,reason:input.reason,
          }),
        });
        return parseOwnerEvidence(owner,{purchaseIntentId,originatingGrantId});
      },
    });
  } catch {
    // An absent 2250 private owner function, disputed refund, unknown body,
    // owner mismatch or database error can never manufacture affirmative S7
    // delivery or the existence of a currently verified paid Purchase.
    return fail();
  }
}
