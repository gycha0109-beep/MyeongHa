import type {
  PostgresSubjectExecutionScopeV1,
} from './postgres-subject-execution.js';
import {
  assessDigitalReadingWithdrawalReviewV1,
  type DigitalReadingWithdrawalReviewV1,
} from './commerce-digital-reading-withdrawal-review-v1.js';
import {
  linkOriginalCheckoutNoticeToReaderGrantV1,
  type CommerceReaderCheckoutNoticeEvidenceStateV1,
  type CommerceReaderOriginalCheckoutNoticeRecordV1,
} from './commerce-reader-checkout-notice-proof-v1.js';

/**
 * PRIVATE S7 -> Commerce withdrawal-review handoff.
 *
 * The DB, not the browser, resolves the exact original Production Receipt,
 * original purchase Grant, persisted S5 body and retained S7 journal under
 * the shared S1 lock. One original Grant is one purchased unit: a surviving
 * sibling purchase cannot be borrowed as this unit's delivery proof.
 *
 * An authenticated CLIENT ACK proves receipt of an acknowledgement request
 * from that client, not human reading or legally sufficient content supply.
 * Even with an ACK, S7 never emits DELIVERED_PROVABLE or deliveredAt.
 *
 * This is read-only, has no public handler, no runtime SQL EXECUTE grant,
 * and cannot mutate receipts, refunds, Grants or paid Reader access.
 */
export const COMMERCE_READER_PRIVATE_WITHDRAWAL_EVIDENCE_VERSION_V1 =
  'commerce-reader-s7-private-withdrawal-evidence-v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READ_SQL = `
select
  purchase_intent_id::text as "purchaseIntentId",
  unit_id::text as "unitId",
  product_spec_version as "productSpecVersion",
  s5_committed_at::text as "s5CommittedAt",
  response_prepared_at::text as "responsePreparedAt",
  client_acknowledged_at::text as "clientAcknowledgedAt",
  delivery_attempt_count::text as "deliveryAttemptCount",
  acknowledged_attempt_count::text as "acknowledgedAttemptCount",
  original_receipt_status::text as "originalReceiptStatus"
from public.internal_qry_official_reader_withdrawal_delivery_state_v2(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
)
`;

type EvidenceRow = Readonly<{
  purchaseIntentId: unknown;
  unitId: unknown;
  productSpecVersion: unknown;
  s5CommittedAt: unknown;
  responsePreparedAt: unknown;
  clientAcknowledgedAt: unknown;
  deliveryAttemptCount: unknown;
  acknowledgedAttemptCount: unknown;
  originalReceiptStatus: unknown;
}>;

type PurchasedUnit = Readonly<{
  purchaseIntentId: string;
  unitId: string;
  productSpecVersion: string;
}>;

/**
 * Checkout notice MUST be sourced from immutable Purchase Intent + pinned
 * Capability Item evidence recorded BEFORE the original payment attempt.
 * The Commerce Owner must independently join that original item through its
 * Receipt to this post-checkout Grant. A Grant ID did not exist at checkout.
 * Caller/browser flags and a fabricated server_checkout_snapshot tag are not
 * authority. Until the owner-backed store/adapter is approved, return null.
 */
export interface CommerceReaderCheckoutNoticeAuthorityPortV1 {
  readExactServerCheckoutNotice(
    unit: PurchasedUnit,
  ): Promise<CommerceReaderOriginalCheckoutNoticeRecordV1 | null>;
}

export interface CommerceReaderPrivateWithdrawalEvidenceV1 {
  readonly contractVersion: typeof COMMERCE_READER_PRIVATE_WITHDRAWAL_EVIDENCE_VERSION_V1;
  readonly purchasedUnit: PurchasedUnit;
  readonly timeline: Readonly<{
    /** Current, independently checked state of THIS original Receipt. */
    readonly originalReceiptStatus: 'verified' | 'revoked';
    readonly s5CommittedAt: string;
    readonly serverResponsePreparedAt: string | null;
    readonly authenticatedClientAcknowledgedAt: string | null;
    readonly retainedDeliveryAttempts: number;
    readonly retainedAcknowledgedAttempts: number;
    /** This S7 record is NEVER sufficient to prove actual content delivery. */
    readonly consumerDeliveryProven: false;
    readonly legallyProvenDeliveredAt: null;
  }>;
  /** Source-backed original checkout notice, NOT proof of legal delivery. */
  readonly checkoutNoticeEvidenceState: CommerceReaderCheckoutNoticeEvidenceStateV1;
  readonly review: DigitalReadingWithdrawalReviewV1;
  readonly refundAuthorized: false;
  readonly entitlementMutationAuthorized: false;
}

export class CommerceReaderPrivateWithdrawalEvidenceErrorV1 extends Error {
  readonly code = 'COMMERCE_READER_WITHDRAWAL_EVIDENCE_UNAVAILABLE' as const;
  constructor() {
    super('Private Reader purchase/delivery evidence is unavailable.');
    this.name = 'CommerceReaderPrivateWithdrawalEvidenceErrorV1';
  }
}

function fail(): never {
  throw new CommerceReaderPrivateWithdrawalEvidenceErrorV1();
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return fail();
  return value.toLowerCase();
}
function productVersion(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value ||
      value.length < 1 || value.length > 256) return fail();
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fail();
  return new Date(value).toISOString();
}
function optionalTimestamp(value: unknown): string | null {
  if (value === null) return null;
  return timestamp(value);
}
function count(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) return fail();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fail();
  return parsed;
}

/**
 * Execute INSIDE a trusted, already owner-scoped private DB transaction.
 * The selected body and Grant are trusted server IDs, never browser-selected
 * proof; SQL independently verifies exact source Receipt and journal lineage.
 * Missing, revoked or mismatched evidence FAILS CLOSED for manual review.
 */
export async function reviewOfficialReaderPrivateWithdrawalEvidenceV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  purchaseIntentId: string;
  originatingGrantId: string;
  bodyId: string;
  claim: unknown;
  checkoutNoticeAuthority: CommerceReaderCheckoutNoticeAuthorityPortV1;
}>): Promise<CommerceReaderPrivateWithdrawalEvidenceV1> {
  try {
    if (!input.scope?.client || input.scope.resolvedSubject.subjectKind !== 'member' ||
        !input.checkoutNoticeAuthority?.readExactServerCheckoutNotice) return fail();

    const subjectId = uuid(input.scope.resolvedSubject.subjectId);
    const purchaseIntentId = uuid(input.purchaseIntentId);
    const originatingGrantId = uuid(input.originatingGrantId);
    const bodyId = uuid(input.bodyId);
    const rows = (await input.scope.client.query<EvidenceRow>(READ_SQL, [
      subjectId, purchaseIntentId, originatingGrantId, bodyId,
    ])).rows;
    if (rows.length !== 1 || !rows[0]) return fail();
    const row = rows[0];
    if (uuid(row.purchaseIntentId) !== purchaseIntentId ||
        uuid(row.unitId) !== originatingGrantId) return fail();

    const purchasedUnit = Object.freeze({
      purchaseIntentId,
      unitId: originatingGrantId,
      productSpecVersion: productVersion(row.productSpecVersion),
    });
    const s5CommittedAt = timestamp(row.s5CommittedAt);
    const serverResponsePreparedAt = optionalTimestamp(row.responsePreparedAt);
    const authenticatedClientAcknowledgedAt =
      optionalTimestamp(row.clientAcknowledgedAt);
    const retainedDeliveryAttempts = count(row.deliveryAttemptCount);
    const retainedAcknowledgedAttempts = count(row.acknowledgedAttemptCount);
    const originalReceiptStatus = row.originalReceiptStatus;
    if (originalReceiptStatus !== 'verified' && originalReceiptStatus !== 'revoked') {
      return fail();
    }

    if (retainedAcknowledgedAttempts > retainedDeliveryAttempts ||
        (retainedDeliveryAttempts === 0) !== (serverResponsePreparedAt === null) ||
        (retainedAcknowledgedAttempts === 0) !==
          (authenticatedClientAcknowledgedAt === null) ||
        (serverResponsePreparedAt !== null &&
          serverResponsePreparedAt < s5CommittedAt) ||
        (authenticatedClientAcknowledgedAt !== null &&
          (serverResponsePreparedAt === null ||
           authenticatedClientAcknowledgedAt < serverResponsePreparedAt))) {
      return fail();
    }

    // An independent Checkout Owner read happens AFTER the DB evidence read.
    // A missing/mismatched notice NEVER becomes a manufactured acknowledgement.
    const originalCheckoutRecord =
      await input.checkoutNoticeAuthority.readExactServerCheckoutNotice(purchasedUnit);
    const checkoutProof = linkOriginalCheckoutNoticeToReaderGrantV1({
      record: originalCheckoutRecord, unit: purchasedUnit, s5CommittedAt,
    });

    const review = assessDigitalReadingWithdrawalReviewV1({
      // A previously verified Receipt can later be revoked by the provider.
      // Never manufacture a currently verified purchase for legal triage.
      purchase: { ...purchasedUnit, status: originalReceiptStatus },
      claim: input.claim,
      notice: checkoutProof.notice,
      delivery: {
        ...purchasedUnit,
        authority: 'server_delivery_record',
        state: 'T2_COMMITTED_UNDELIVERED',
        deliveredAt: null,
      },
    });

    return Object.freeze({
      contractVersion: COMMERCE_READER_PRIVATE_WITHDRAWAL_EVIDENCE_VERSION_V1,
      purchasedUnit,
      timeline: Object.freeze({
        originalReceiptStatus,
        s5CommittedAt,
        serverResponsePreparedAt,
        authenticatedClientAcknowledgedAt,
        retainedDeliveryAttempts,
        retainedAcknowledgedAttempts,
        consumerDeliveryProven: false,
        legallyProvenDeliveredAt: null,
      }),
      checkoutNoticeEvidenceState: checkoutProof.evidenceState,
      review,
      refundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
  } catch {
    // Do not disclose database, Checkout, Reader, Source or payment internals.
    return fail();
  }
}
