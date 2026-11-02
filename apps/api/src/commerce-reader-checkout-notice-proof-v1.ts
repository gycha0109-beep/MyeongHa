import type {
  DigitalReadingCheckoutNoticeV1,
} from './commerce-digital-reading-withdrawal-review-v1.js';

/**
 * S7 / Commerce-Owner private pre-checkout proof boundary.
 *
 * A purchase Grant is minted AFTER checkout and cannot be a pre-checkout
 * snapshot key. The Checkout Owner stores an immutable Purchase Intent +
 * pinned Capability Item record first; the independent Commerce authority
 * later joins that item through the ORIGINAL Receipt to the exact Grant.
 *
 * No user-supplied checkbox, screen flag, Payment Attempt replay, receipt
 * timestamp or sibling Grant may be used to manufacture this record.
 * The source adapter / immutable store and its retention require separate
 * Commerce + Privacy + Legal approval; this module does not write a record.
 */
export interface CommerceReaderOriginalCheckoutNoticeRecordV1 {
  readonly authority: 'commerce_owner_immutable_checkout_notice_v1';
  readonly purchaseIntentId: string;
  /** Post-checkout lineage; NOT a checkout-time identifier. */
  readonly originatingGrantId: string;
  readonly productSpecVersion: string;
  /** Original pinned item key, assigned before any Receipt/Grant exists. */
  readonly pinnedCapabilityItemKey: string;
  readonly originalGrantItemBinding:
    'original_receipt_purchase_intent_capability_item';
  readonly noticeRevision: string;
  readonly previewOrInformationRevision: string;
  /** Immutable original Purchase Intent creation timestamp from Commerce ledger. */
  readonly originalPurchaseIntentCreatedAt: string;
  readonly snapshotRecordedAt: string;
  readonly noticePresentedAt: string;
  readonly acknowledgedAt: string;
  /** Server-recorded start of the payment attempt for THIS Purchase Intent. */
  readonly originalPaymentAttemptCreatedAt: string;
}

export type CommerceReaderCheckoutNoticeEvidenceStateV1 =
  | 'attested_original_checkout_notice'
  | 'missing_or_unverifiable';

export type CommerceReaderCheckoutNoticeProofV1 = Readonly<{
  readonly evidenceState: CommerceReaderCheckoutNoticeEvidenceStateV1;
  readonly notice: DigitalReadingCheckoutNoticeV1 | null;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 256 && value.trim() === value;
}
function time(value: unknown): number | null {
  if (typeof value !== 'string' || !ISO.test(value)) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) &&
    new Date(millis).toISOString().slice(0, 19) === value.slice(0, 19)
    ? millis : null;
}
const unavailable = (): CommerceReaderCheckoutNoticeProofV1 =>
  Object.freeze({ evidenceState: 'missing_or_unverifiable', notice: null });

/**
 * The Checkout Owner port MUST authenticate the original immutable snapshot
 * and original Receipt/Grant/item join BEFORE returning a record. The checks
 * below are further defence in depth; a string authority marker alone is not
 * proof that a browser object is genuine.
 *
 * This never establishes delivery, legal compliance, or refund eligibility.
 */
export function linkOriginalCheckoutNoticeToReaderGrantV1(input: Readonly<{
  record: unknown;
  unit: Readonly<{
    purchaseIntentId: string;
    unitId: string;
    productSpecVersion: string;
  }>;
  s5CommittedAt: string;
}>): CommerceReaderCheckoutNoticeProofV1 {
  const value = input.record;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return unavailable();
  }
  const record = value as Record<string, unknown>;
  if (record.authority !== 'commerce_owner_immutable_checkout_notice_v1' ||
      record.originalGrantItemBinding !==
        'original_receipt_purchase_intent_capability_item' ||
      !UUID.test(input.unit.purchaseIntentId) || !UUID.test(input.unit.unitId) ||
      record.purchaseIntentId !== input.unit.purchaseIntentId ||
      record.originatingGrantId !== input.unit.unitId ||
      record.productSpecVersion !== input.unit.productSpecVersion ||
      !nonempty(record.pinnedCapabilityItemKey) ||
      !nonempty(record.noticeRevision) ||
      !nonempty(record.previewOrInformationRevision)) {
    return unavailable();
  }

  const purchaseIntentAt = time(record.originalPurchaseIntentCreatedAt);
  const snapshotAt = time(record.snapshotRecordedAt);
  const presentedAt = time(record.noticePresentedAt);
  const acknowledgedAt = time(record.acknowledgedAt);
  const paymentAttemptAt = time(record.originalPaymentAttemptCreatedAt);
  const committedAt = time(input.s5CommittedAt);
  if (purchaseIntentAt === null || snapshotAt === null || presentedAt === null ||
      acknowledgedAt === null || paymentAttemptAt === null ||
      committedAt === null ||
      !(purchaseIntentAt <= snapshotAt &&
        snapshotAt <= presentedAt &&
        presentedAt <= acknowledgedAt &&
        acknowledgedAt < paymentAttemptAt &&
        paymentAttemptAt <= committedAt)) {
    return unavailable();
  }

  const notice: DigitalReadingCheckoutNoticeV1 = Object.freeze({
    authority: 'server_checkout_snapshot',
    purchaseIntentId: input.unit.purchaseIntentId,
    unitId: input.unit.unitId,
    productSpecVersion: input.unit.productSpecVersion,
    noticeRevision: record.noticeRevision as string,
    previewOrInformationRevision: record.previewOrInformationRevision as string,
    acknowledged: true,
  });
  return Object.freeze({
    evidenceState: 'attested_original_checkout_notice',
    notice,
  });
}
