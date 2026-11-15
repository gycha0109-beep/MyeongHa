import {
  getApprovedSajuOfferV1,
  type SajuReadingComponentV1,
} from '../../../packages/contracts/src/approved-saju-catalog.js';
import { ApiCommandError } from './api-error.js';
import type { PurchaseIntentOfferSnapshotV1 } from './purchase-intent-create-command.js';
import type {
  PurchaseIntentCapabilitySnapshotV3,
  PurchaseIntentCreateAuthorityInputV3,
  PurchaseIntentCreateAuthorityRowV3,
  SajuPurchaseOriginInputV1,
} from './purchase-intent-create-command-v3.js';

export const APPROVED_SAJU_PURCHASE_POLICY_V1 = 'approved-saju-2026-11-06' as const;

export interface ApprovedSajuPurchaseAdmissionScopeV1 {
  readonly approvedOfferId: string;
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly birthRevisionId: string;
  readonly offer: PurchaseIntentOfferSnapshotV1;
  readonly capability: PurchaseIntentCapabilitySnapshotV3;
  readonly idempotencyKey: string;
  readonly targetPersonId?: string;
}

export interface ApprovedSajuPurchaseAdmissionV1 {
  readonly policy: typeof APPROVED_SAJU_PURCHASE_POLICY_V1;
  readonly approvedOfferId: string;
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly birthRevisionId: string;
  readonly productOfferId: string;
  readonly capabilitySetId: string;
  readonly currency: 'KRW';
  readonly amountMinor: number;
  /** A release reference must attest Official source, Records and Reader delivery for this scope. */
  readonly components: readonly {
    readonly component: SajuReadingComponentV1;
    readonly authority: 'official_fulfillment';
    readonly releaseRef: string;
  }[];
  /** Frozen before provider handoff and reused from the original intent on replay. */
  readonly periodReferenceDateTime?: string;
  readonly counterpart?: {
    readonly targetPersonId: string;
    readonly targetBirthRevisionId: string;
    readonly order: 'first' | 'additional';
    readonly useApprovalRef: string;
  };
}

type Awaitable<T> = T | Promise<T>;

/** Both methods use the same subject transaction. The writer must recheck live
 * release, charge terms, grants and target use under the purchase lock. It must
 * reserve counterpart order atomically and persist the exact admission on creation.
 * Replays resolve their original admission by the subject and idempotency key. */
export interface ApprovedSajuPurchaseAuthorityPortV1 {
  resolveAdmission(input: ApprovedSajuPurchaseAdmissionScopeV1):
    Awaitable<ApprovedSajuPurchaseAdmissionV1 | null>;
  createPurchaseIntent(input: PurchaseIntentCreateAuthorityInputV3 & {
    readonly sajuOrigin: SajuPurchaseOriginInputV1;
    readonly approvedSajuAdmission: ApprovedSajuPurchaseAdmissionV1;
    readonly approvedSajuAdmissionHash: string;
  }): Awaitable<readonly (PurchaseIntentCreateAuthorityRowV3 & {
    readonly approvedSajuAdmissionHash: string;
  })[]>;
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function reference(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200;
}

function canonicalTime(value: unknown): boolean {
  if (typeof value !== 'string' || !UTC_TIME.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function unavailable(): never {
  throw new ApiCommandError('NOT_FOUND', 'Selected product offer is unavailable.');
}

export async function resolveApprovedSajuPurchaseAdmissionV1(
  scope: ApprovedSajuPurchaseAdmissionScopeV1,
  authority: ApprovedSajuPurchaseAuthorityPortV1,
): Promise<ApprovedSajuPurchaseAdmissionV1> {
  const offer = getApprovedSajuOfferV1(scope.approvedOfferId);
  if (offer === undefined || scope.offer.platform !== 'web' || scope.offer.provider !== 'portone_v2') unavailable();
  const row = await authority.resolveAdmission(scope);
  if (row === null || row.policy !== APPROVED_SAJU_PURCHASE_POLICY_V1
    || row.approvedOfferId !== offer.id || row.subjectId !== scope.subjectId
    || row.sajuRecordId !== scope.sajuRecordId || row.birthRevisionId !== scope.birthRevisionId
    || row.productOfferId !== scope.offer.productOfferId || row.capabilitySetId !== scope.capability.capabilitySetId
    || row.currency !== 'KRW' || row.amountMinor !== offer.priceKrw
    || !Array.isArray(row.components) || row.components.length !== offer.components.length) unavailable();

  const needsPeriod = offer.components.includes('year') || offer.components.includes('month');
  if (needsPeriod ? !canonicalTime(row.periodReferenceDateTime) : row.periodReferenceDateTime !== undefined) unavailable();
  const target = row.counterpart;
  if (offer.counterpartOrder === undefined) {
    if (target !== undefined || scope.targetPersonId !== undefined) unavailable();
  } else if (target === undefined || target === null || target.order !== offer.counterpartOrder
    || target.targetPersonId !== scope.targetPersonId
    || typeof target.targetPersonId !== 'string' || !UUID.test(target.targetPersonId)
    || typeof target.targetBirthRevisionId !== 'string' || !UUID.test(target.targetBirthRevisionId)
    || target.targetBirthRevisionId === scope.birthRevisionId || !reference(target.useApprovalRef)) {
    unavailable();
  }

  const components = offer.components.map(component => {
    const entry = row.components.find(item => item?.component === component);
    if (entry?.authority !== 'official_fulfillment' || !reference(entry.releaseRef)) unavailable();
    return Object.freeze({ component, authority: entry.authority, releaseRef: entry.releaseRef });
  });
  return Object.freeze({
    policy: row.policy,
    approvedOfferId: offer.id,
    subjectId: row.subjectId,
    sajuRecordId: row.sajuRecordId,
    birthRevisionId: row.birthRevisionId,
    productOfferId: row.productOfferId,
    capabilitySetId: row.capabilitySetId,
    currency: row.currency,
    amountMinor: offer.priceKrw,
    components: Object.freeze(components),
    ...(row.periodReferenceDateTime === undefined ? {} : { periodReferenceDateTime: row.periodReferenceDateTime }),
    ...(target === undefined ? {} : { counterpart: Object.freeze({
      targetPersonId: target.targetPersonId,
      targetBirthRevisionId: target.targetBirthRevisionId,
      order: target.order,
      useApprovalRef: target.useApprovalRef,
    }) }),
  });
}
