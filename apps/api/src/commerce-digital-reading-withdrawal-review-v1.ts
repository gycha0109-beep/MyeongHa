/**
 * Server-only, read-only digital Reading withdrawal triage.
 *
 * This is NOT a legal determination, payment/refund command, entitlement effect,
 * consumer-visible decision, or launch permission. The purchase, notice and
 * delivery facts must be obtained from independent, trusted server authorities.
 * Untrusted browser flags, cached T2 success or generation events are not proof
 * that a digital Reading was supplied to the consumer.
 *
 * Decision authority: docs/COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md
 */

export type DigitalReadingWithdrawalReasonV1 =
  | 'change_of_mind'
  | 'not_provided'
  | 'delivery_failed'
  | 'not_as_described'
  | 'defect'
  | 'duplicate_charge'
  | 'unprovided_separable_part'
  | 'other';

export type DigitalReadingDeliveryStateV1 =
  | 'PURCHASED_NOT_PROVIDED'
  | 'RENDERING_PRIVATE'
  | 'T2_COMMITTED_UNDELIVERED'
  | 'DELIVERED_PROVABLE'
  | 'DELIVERY_FAILED'
  | 'PARTIALLY_PROVIDED'
  | 'REFUNDED_OR_REVOKED';

type ItemScope = Readonly<{
  readonly purchaseIntentId: string;
  readonly unitId: string;
  readonly productSpecVersion: string;
}>;

/** Only a verified server-side purchase authority may supply this fact. */
export type VerifiedDigitalReadingPurchaseV1 = ItemScope & Readonly<{
  readonly status: 'verified';
}>;

/**
 * Evidence of the actual notice presented to THIS unit's buyer before checkout,
 * not a browser checkbox or generic website terms revision.
 */
export type DigitalReadingCheckoutNoticeV1 = ItemScope & Readonly<{
  readonly authority: 'server_checkout_snapshot';
  readonly noticeRevision: string;
  readonly previewOrInformationRevision: string;
  readonly acknowledged: true;
}>;

/**
 * Only a durable server-delivery authority may report DELIVERED_PROVABLE.
 * Delivery of one unit NEVER proves delivery of another purchased unit.
 */
export type DigitalReadingDeliveryEvidenceV1 = ItemScope & Readonly<{
  readonly authority: 'server_delivery_record';
  readonly state: DigitalReadingDeliveryStateV1;
  readonly deliveredAt: string | null;
}>;

export type DigitalReadingWithdrawalReviewV1 = Readonly<{
  readonly classification:
    | 'restriction_review_candidate'
    | 'statutory_exception_review'
    | 'not_proven_delivered'
    | 'separable_part_review'
    | 'evidence_review_required';
  readonly reason:
    | 'DELIVERED_NOTICE_RECORDED'
    | 'LEGAL_EXCEPTION_OR_COMPLAINT'
    | 'CONTENT_NOT_PROVEN_DELIVERED'
    | 'UNDELIVERED_SEPARABLE_PART'
    | 'INVALID_OR_MISSING_SERVER_EVIDENCE';
  readonly automaticDenialAuthorized: false;
  readonly providerRefundAuthorized: false;
  readonly entitlementMutationAuthorized: false;
}>;

function review(
  classification: DigitalReadingWithdrawalReviewV1['classification'],
  reason: DigitalReadingWithdrawalReviewV1['reason'],
): DigitalReadingWithdrawalReviewV1 {
  return Object.freeze({
    classification,
    reason,
    automaticDenialAuthorized: false,
    providerRefundAuthorized: false,
    entitlementMutationAuthorized: false,
  });
}

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 256 &&
    value.trim() === value;
}

function sameItem(
  value: unknown,
  purchase: VerifiedDigitalReadingPurchaseV1,
): value is ItemScope & Record<string, unknown> {
  return obj(value) &&
    value.purchaseIntentId === purchase.purchaseIntentId &&
    value.unitId === purchase.unitId &&
    value.productSpecVersion === purchase.productSpecVersion;
}

const reasons: ReadonlySet<string> = new Set([
  'change_of_mind', 'not_provided', 'delivery_failed', 'not_as_described',
  'defect', 'duplicate_charge', 'unprovided_separable_part', 'other',
]);
const states: ReadonlySet<string> = new Set([
  'PURCHASED_NOT_PROVIDED', 'RENDERING_PRIVATE', 'T2_COMMITTED_UNDELIVERED',
  'DELIVERED_PROVABLE', 'DELIVERY_FAILED', 'PARTIALLY_PROVIDED',
  'REFUNDED_OR_REVOKED',
]);

function isoInstant(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

/**
 * Read-only triage of ONE exact purchased content unit.
 *
 * A candidate is still ONLY for manual Legal/Commerce review: delivery proof
 * cannot by itself establish the legal withdrawal period, valid disclosures,
 * product divisibility or absence of statutory exceptions.
 */
export function assessDigitalReadingWithdrawalReviewV1(input: Readonly<{
  readonly purchase: unknown;
  readonly claim: unknown;
  readonly notice: unknown;
  readonly delivery: unknown;
}>): DigitalReadingWithdrawalReviewV1 {
  const purchase = input.purchase;
  const claim = input.claim;
  if (!obj(purchase) || purchase.status !== 'verified' ||
      !id(purchase.purchaseIntentId) || !id(purchase.unitId) ||
      !id(purchase.productSpecVersion) || !obj(claim) ||
      claim.purchaseIntentId !== purchase.purchaseIntentId ||
      claim.unitId !== purchase.unitId ||
      typeof claim.reason !== 'string' || !reasons.has(claim.reason)) {
    return review('evidence_review_required', 'INVALID_OR_MISSING_SERVER_EVIDENCE');
  }

  const scope = purchase as VerifiedDigitalReadingPurchaseV1;

  // Legal claims take precedence even if a delivery record is present.
  if (claim.reason === 'unprovided_separable_part') {
    return review('separable_part_review', 'UNDELIVERED_SEPARABLE_PART');
  }
  if (claim.reason !== 'change_of_mind') {
    return review('statutory_exception_review', 'LEGAL_EXCEPTION_OR_COMPLAINT');
  }

  const delivery = input.delivery;
  if (!sameItem(delivery, scope) ||
      delivery.authority !== 'server_delivery_record' ||
      typeof delivery.state !== 'string' || !states.has(delivery.state)) {
    return review('evidence_review_required', 'INVALID_OR_MISSING_SERVER_EVIDENCE');
  }

  // T2 COMMIT and private generation never prove consumer delivery.
  if (delivery.state !== 'DELIVERED_PROVABLE') {
    return review('not_proven_delivered', 'CONTENT_NOT_PROVEN_DELIVERED');
  }
  if (!isoInstant(delivery.deliveredAt)) {
    return review('evidence_review_required', 'INVALID_OR_MISSING_SERVER_EVIDENCE');
  }

  const notice = input.notice;
  if (!sameItem(notice, scope) ||
      notice.authority !== 'server_checkout_snapshot' ||
      notice.acknowledged !== true ||
      !id(notice.noticeRevision) ||
      !id(notice.previewOrInformationRevision)) {
    return review('evidence_review_required', 'INVALID_OR_MISSING_SERVER_EVIDENCE');
  }

  return review('restriction_review_candidate', 'DELIVERED_NOTICE_RECORDED');
}
