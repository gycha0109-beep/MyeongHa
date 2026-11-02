/**
 * Private, read-only preflight for an eventual digital Reading withdrawal intake.
 * A caller cannot claim a refund request was accepted/persisted from this result.
 *
 * Production checkout, public intake, legal disposition, provider cancellation,
 * and entitlement revocation remain independently HOLD.
 */
import {
  assessDigitalReadingWithdrawalReviewV1,
  type DigitalReadingCheckoutNoticeV1,
  type DigitalReadingDeliveryEvidenceV1,
  type DigitalReadingWithdrawalReasonV1,
  type DigitalReadingWithdrawalReviewV1,
  type VerifiedDigitalReadingPurchaseV1,
} from './commerce-digital-reading-withdrawal-review-v1.js';

export const DIGITAL_READING_WITHDRAWAL_PREFLIGHT_V1 = Object.freeze({
  publicRouteMounted: false,
  requestPersistenceEnabled: false,
  paymentRefundEnabled: false,
  grantMutationEnabled: false,
} as const);

export type OwnedDigitalReadingPurchaseV1 =
  VerifiedDigitalReadingPurchaseV1 & Readonly<{ subjectId: string }>;

export interface DigitalReadingWithdrawalEvidencePortV1 {
  /** Server-owned current owner/verified purchase resolver, not an ID existence probe. */
  readOwnedVerifiedPurchase(input: Readonly<{
    subjectId: string;
    purchaseIntentId: string;
    unitId: string;
  }>): Promise<OwnedDigitalReadingPurchaseV1 | null>;
  /** Historical checkout presentation/acknowledgment evidence for this exact unit. */
  readCheckoutNotice(purchase: OwnedDigitalReadingPurchaseV1):
    Promise<DigitalReadingCheckoutNoticeV1 | null>;
  /** Durable delivery record for the same exact purchased unit. */
  readDeliveryEvidence(purchase: OwnedDigitalReadingPurchaseV1):
    Promise<DigitalReadingDeliveryEvidenceV1 | null>;
}

export type DigitalReadingWithdrawalPreflightV1 =
  | Readonly<{
    kind: 'not_admitted';
    requestRecorded: false;
    providerRefundAuthorized: false;
    entitlementMutationAuthorized: false;
  }>
  | Readonly<{
    kind: 'manual_review_candidate';
    review: DigitalReadingWithdrawalReviewV1;
    requestRecorded: false;
    providerRefundAuthorized: false;
    entitlementMutationAuthorized: false;
  }>;

const REASONS: ReadonlySet<string> = new Set([
  'change_of_mind', 'not_provided', 'delivery_failed', 'not_as_described',
  'defect', 'duplicate_charge', 'unprovided_separable_part', 'other',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DENIED: DigitalReadingWithdrawalPreflightV1 = Object.freeze({
  kind: 'not_admitted',
  requestRecorded: false,
  providerRefundAuthorized: false,
  entitlementMutationAuthorized: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRequest(value: unknown): Readonly<{
  purchaseIntentId: string;
  unitId: string;
  reason: DigitalReadingWithdrawalReasonV1;
}> | null {
  if (!isRecord(value) ||
      Object.keys(value).some((key) =>
        key !== 'purchaseIntentId' && key !== 'unitId' && key !== 'reason') ||
      typeof value.purchaseIntentId !== 'string' ||
      !UUID.test(value.purchaseIntentId) ||
      typeof value.unitId !== 'string' ||
      value.unitId.length === 0 || value.unitId.length > 256 ||
      value.unitId.trim() !== value.unitId ||
      typeof value.reason !== 'string' ||
      !REASONS.has(value.reason)) {
    return null;
  }
  return Object.freeze({
    purchaseIntentId: value.purchaseIntentId,
    unitId: value.unitId,
    reason: value.reason as DigitalReadingWithdrawalReasonV1,
  });
}

function ownsExactPurchase(
  value: unknown,
  subjectId: string,
  request: NonNullable<ReturnType<typeof parseRequest>>,
): value is OwnedDigitalReadingPurchaseV1 {
  return isRecord(value) && value.status === 'verified' &&
    value.subjectId === subjectId &&
    value.purchaseIntentId === request.purchaseIntentId &&
    value.unitId === request.unitId &&
    typeof value.productSpecVersion === 'string' &&
    value.productSpecVersion.length > 0 &&
    value.productSpecVersion.length <= 256 &&
    value.productSpecVersion.trim() === value.productSpecVersion;
}

/**
 * No mutation, no customer receipt, and no legal/refund decision.
 * Missing/unavailable purchase authority fails closed without disclosing whether
 * a third-party purchase ID exists. Other missing evidence stays review-only.
 */
export async function prepareDigitalReadingWithdrawalReviewV1(input: Readonly<{
  resolvedSubjectId: string | undefined;
  request: unknown;
  evidencePort: DigitalReadingWithdrawalEvidencePortV1;
}>): Promise<DigitalReadingWithdrawalPreflightV1> {
  const request = parseRequest(input.request);
  if (!request ||
      typeof input.resolvedSubjectId !== 'string' ||
      !UUID.test(input.resolvedSubjectId)) {
    return DENIED;
  }
  try {
    const purchase = await input.evidencePort.readOwnedVerifiedPurchase({
      subjectId: input.resolvedSubjectId,
      purchaseIntentId: request.purchaseIntentId,
      unitId: request.unitId,
    });
    if (!ownsExactPurchase(purchase, input.resolvedSubjectId, request)) {
      return DENIED;
    }
    const [notice, delivery] = await Promise.all([
      input.evidencePort.readCheckoutNotice(purchase),
      input.evidencePort.readDeliveryEvidence(purchase),
    ]);
    const review = assessDigitalReadingWithdrawalReviewV1({
      purchase,
      claim: {
        purchaseIntentId: purchase.purchaseIntentId,
        unitId: purchase.unitId,
        reason: request.reason,
      },
      notice,
      delivery,
    });
    return Object.freeze({
      kind: 'manual_review_candidate',
      review,
      requestRecorded: false,
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
  } catch {
    // Broken DB/authority evidence never produces a positive review result.
    // Raw errors/identifiers and third-party purchase existence are not revealed.
    return DENIED;
  }
}
