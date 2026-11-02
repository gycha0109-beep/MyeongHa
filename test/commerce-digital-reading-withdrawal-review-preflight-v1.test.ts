import { describe, expect, it, vi } from 'vitest';
import {
  DIGITAL_READING_WITHDRAWAL_PREFLIGHT_V1,
  prepareDigitalReadingWithdrawalReviewV1,
  type DigitalReadingWithdrawalEvidencePortV1,
} from '../apps/api/src/commerce-digital-reading-withdrawal-review-preflight-v1.js';

const SUBJECT = '00000000-0000-4000-8000-000000000001';
const PURCHASE_ID = '00000000-0000-4000-8000-000000000002';
const UNIT_ID = 'standard.love_relationship-seyeon';
const PURCHASE = Object.freeze({
  subjectId: SUBJECT,
  purchaseIntentId: PURCHASE_ID,
  unitId: UNIT_ID,
  productSpecVersion: 'standard-love-v1',
  status: 'verified' as const,
});
const REQUEST = Object.freeze({
  purchaseIntentId: PURCHASE_ID,
  unitId: UNIT_ID,
  reason: 'change_of_mind',
});
const NOTICE = Object.freeze({
  purchaseIntentId: PURCHASE_ID,
  unitId: UNIT_ID,
  productSpecVersion: PURCHASE.productSpecVersion,
  authority: 'server_checkout_snapshot' as const,
  noticeRevision: 'approved-1',
  previewOrInformationRevision: 'approved-preview-1',
  acknowledged: true as const,
});
const DELIVERY = Object.freeze({
  purchaseIntentId: PURCHASE_ID,
  unitId: UNIT_ID,
  productSpecVersion: PURCHASE.productSpecVersion,
  authority: 'server_delivery_record' as const,
  state: 'DELIVERED_PROVABLE' as const,
  deliveredAt: '2026-10-30T01:02:03.000Z',
});

function fixture(overrides: {
  purchase?: unknown;
  notice?: unknown;
  delivery?: unknown;
} = {}) {
  const calls = {
    owned: vi.fn(async () => 'purchase' in overrides ? overrides.purchase : PURCHASE),
    notice: vi.fn(async () => 'notice' in overrides ? overrides.notice : NOTICE),
    delivery: vi.fn(async () => 'delivery' in overrides ? overrides.delivery : DELIVERY),
  };
  const port = {
    readOwnedVerifiedPurchase: calls.owned,
    readCheckoutNotice: calls.notice,
    readDeliveryEvidence: calls.delivery,
  } as DigitalReadingWithdrawalEvidencePortV1;
  return { port, calls };
}

describe('private, non-persistent digital reading withdrawal preflight', () => {
  it('never enables a public route, refund, request storage or Grant mutation', () => {
    expect(DIGITAL_READING_WITHDRAWAL_PREFLIGHT_V1).toEqual({
      publicRouteMounted: false,
      requestPersistenceEnabled: false,
      paymentRefundEnabled: false,
      grantMutationEnabled: false,
    });
  });

  it('joins the verified owned purchase to exact notice and delivered content', async () => {
    const { port, calls } = fixture();
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT, request: REQUEST, evidencePort: port,
    });
    expect(calls.owned).toHaveBeenCalledExactlyOnceWith({
      subjectId: SUBJECT, purchaseIntentId: PURCHASE_ID, unitId: UNIT_ID,
    });
    expect(calls.notice).toHaveBeenCalledExactlyOnceWith(PURCHASE);
    expect(calls.delivery).toHaveBeenCalledExactlyOnceWith(PURCHASE);
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'restriction_review_candidate' },
      requestRecorded: false,
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
    expect(result).not.toHaveProperty('purchaseIntentId');
    expect(result).not.toHaveProperty('subjectId');
    expect(result).not.toHaveProperty('unitId');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    'not_provided', 'delivery_failed', 'not_as_described', 'defect',
    'duplicate_charge', 'other',
  ])('keeps customer exception %s in separate legal review', async reason => {
    const { port } = fixture();
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT,
      request: { ...REQUEST, reason },
      evidencePort: port,
    });
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'statutory_exception_review' },
      providerRefundAuthorized: false,
    });
  });

  it('preserves review of a not-provided separable unit', async () => {
    const { port } = fixture();
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT,
      request: { ...REQUEST, reason: 'unprovided_separable_part' },
      evidencePort: port,
    });
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'separable_part_review' },
    });
  });

  it.each([
    { ...REQUEST, purchaseIntentId: 'other' },
    { ...REQUEST, unitId: '' },
    { ...REQUEST, unitId: ' other ' },
    { ...REQUEST, reason: 'no_refunds' },
    { ...REQUEST, productSpecVersion: 'client_claim' },
    { ...REQUEST, subjectId: SUBJECT },
    null,
  ])('rejects malformed or authority-injecting requests before DB access: %j', async request => {
    const { port, calls } = fixture();
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT, request, evidencePort: port,
    });
    expect(result.kind).toBe('not_admitted');
    expect(calls.owned).not.toHaveBeenCalled();
    expect(calls.notice).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...PURCHASE, status: 'pending' },
    { ...PURCHASE, subjectId: '00000000-0000-4000-8000-000000000099' },
    { ...PURCHASE, unitId: 'a-different-unit' },
    { ...PURCHASE, purchaseIntentId: '00000000-0000-4000-8000-000000000099' },
  ])('never reveals another owner or unverified purchase: %j', async purchase => {
    const { port, calls } = fixture({ purchase });
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT, request: REQUEST, evidencePort: port,
    });
    expect(result.kind).toBe('not_admitted');
    expect(calls.notice).not.toHaveBeenCalled();
    expect(calls.delivery).not.toHaveBeenCalled();
  });

  it('does not mistake absent delivery/notice for a refund denial', async () => {
    const { port } = fixture({ notice: null, delivery: null });
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT, request: REQUEST, evidencePort: port,
    });
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'evidence_review_required', automaticDenialAuthorized: false },
    });
  });

  it('does not accept a notice or delivery belonging to a different revision', async () => {
    const { port } = fixture({
      notice: { ...NOTICE, productSpecVersion: 'other' },
      delivery: { ...DELIVERY, productSpecVersion: 'other' },
    });
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT, request: REQUEST, evidencePort: port,
    });
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'evidence_review_required' },
    });
  });

  it('fails closed on authority outage without leaking exception details', async () => {
    const port: DigitalReadingWithdrawalEvidencePortV1 = {
      readOwnedVerifiedPurchase: async () => { throw new Error('secret database detail'); },
      readCheckoutNotice: async () => { throw new Error('should not call'); },
      readDeliveryEvidence: async () => { throw new Error('should not call'); },
    };
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT, request: REQUEST, evidencePort: port,
    });
    expect(result).toEqual({
      kind: 'not_admitted', requestRecorded: false,
      providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain('secret database detail');
  });
});
