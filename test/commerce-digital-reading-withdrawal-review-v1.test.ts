import { describe, expect, it } from 'vitest';
import {
  assessDigitalReadingWithdrawalReviewV1,
  type DigitalReadingDeliveryStateV1,
  type DigitalReadingWithdrawalReasonV1,
} from '../apps/api/src/commerce-digital-reading-withdrawal-review-v1.js';

const UNIT = Object.freeze({
  purchaseIntentId: 'synthetic-verified-purchase-intent',
  unitId: 'synthetic-reading-a-seyeon-one-off',
  productSpecVersion: 'synthetic-standard-v1',
});
const PURCHASE = Object.freeze({ ...UNIT, status: 'verified' });
const CLAIM = Object.freeze({ ...UNIT, reason: 'change_of_mind' });
const NOTICE = Object.freeze({
  ...UNIT,
  authority: 'server_checkout_snapshot',
  noticeRevision: 'synthetic-notice-revision-v1',
  previewOrInformationRevision: 'synthetic-sample-revision-v1',
  acknowledged: true,
});
const DELIVERY = Object.freeze({
  ...UNIT,
  authority: 'server_delivery_record',
  state: 'DELIVERED_PROVABLE' as const,
  deliveredAt: '2026-10-12T02:00:00.000Z',
});

function decide(overrides: {
  purchase?: unknown;
  claim?: unknown;
  notice?: unknown;
  delivery?: unknown;
} = {}) {
  return assessDigitalReadingWithdrawalReviewV1({
    purchase: 'purchase' in overrides ? overrides.purchase : PURCHASE,
    claim: 'claim' in overrides ? overrides.claim : CLAIM,
    notice: 'notice' in overrides ? overrides.notice : NOTICE,
    delivery: 'delivery' in overrides ? overrides.delivery : DELIVERY,
  });
}

describe('internal digital-Reading withdrawal triage (never refund/deny authority)', () => {
  it('makes only a review candidate from exact verified unit, delivery, notice and sample information', () => {
    const result = decide();
    expect(result).toEqual({
      classification: 'restriction_review_candidate',
      reason: 'DELIVERED_NOTICE_RECORDED',
      automaticDenialAuthorized: false,
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty('deliveredAt');
    expect(result).not.toHaveProperty('unitId');
    expect(result).not.toHaveProperty('purchaseIntentId');
  });

  it.each([
    'PURCHASED_NOT_PROVIDED',
    'RENDERING_PRIVATE',
    'T2_COMMITTED_UNDELIVERED',
    'DELIVERY_FAILED',
    'PARTIALLY_PROVIDED',
    'REFUNDED_OR_REVOKED',
  ] as DigitalReadingDeliveryStateV1[])(
    'never equates %s with consumer delivery even when a notice was acknowledged',
    (state) => {
      expect(decide({ delivery: { ...DELIVERY, state, deliveredAt: null } })).toEqual({
        classification: 'not_proven_delivered',
        reason: 'CONTENT_NOT_PROVEN_DELIVERED',
        automaticDenialAuthorized: false,
        providerRefundAuthorized: false,
        entitlementMutationAuthorized: false,
      });
    },
  );

  it.each([
    'not_provided', 'delivery_failed', 'not_as_described', 'defect',
    'duplicate_charge', 'other',
  ] as DigitalReadingWithdrawalReasonV1[])(
    'prioritizes the %s consumer claim even if delivery and notices are verified',
    (reason) => {
      const result = decide({ claim: { ...CLAIM, reason } });
      expect(result.classification).toBe('statutory_exception_review');
      expect(result.automaticDenialAuthorized).toBe(false);
    },
  );

  it('preserves the refund review of an unprovided separable item regardless of a delivered sibling', () => {
    const result = decide({
      claim: { ...CLAIM, reason: 'unprovided_separable_part' },
      delivery: { ...DELIVERY, unitId: 'other-unit-that-was-delivered' },
    });
    expect(result).toMatchObject({
      classification: 'separable_part_review',
      reason: 'UNDELIVERED_SEPARABLE_PART',
    });
  });

  it.each([
    null,
    undefined,
    { ...PURCHASE, status: 'pending' },
    { ...PURCHASE, purchaseIntentId: '' },
    { ...PURCHASE, unitId: '   ' },
    { ...PURCHASE, productSpecVersion: null },
  ])('does not trust an unverified or malformed historical purchase %s', (purchase) => {
    expect(decide({ purchase }).classification).toBe('evidence_review_required');
  });

  it.each([
    null,
    undefined,
    { ...CLAIM, purchaseIntentId: 'a-different-order' },
    { ...CLAIM, unitId: 'another-unit' },
    { ...CLAIM, reason: 'nonrefundable' },
    { ...CLAIM, reason: undefined },
  ])('does not classify untrusted or cross-order request %s', (claim) => {
    expect(decide({ claim }).classification).toBe('evidence_review_required');
  });

  it.each([
    null,
    { ...DELIVERY, authority: 'client_read_flag' },
    { ...DELIVERY, unitId: 'reading-b-other-reader' },
    { ...DELIVERY, purchaseIntentId: 'another-purchase' },
    { ...DELIVERY, productSpecVersion: 'another-revision' },
    { ...DELIVERY, state: 'publicly_shown' },
    { ...DELIVERY, deliveredAt: null },
    { ...DELIVERY, deliveredAt: 'not-an-instant' },
    { ...DELIVERY, deliveredAt: '2026-02-30T00:00:00.000Z' },
  ])('fails closed on non-authoritative, malformed or cross-unit delivery proof %s', (delivery) => {
    expect(decide({ delivery }).classification).toBe('evidence_review_required');
  });

  it.each([
    null,
    { ...NOTICE, authority: 'client_checkbox' },
    { ...NOTICE, unitId: 'another-unit' },
    { ...NOTICE, purchaseIntentId: 'another-order' },
    { ...NOTICE, productSpecVersion: 'another-product-version' },
    { ...NOTICE, acknowledged: false },
    { ...NOTICE, noticeRevision: '' },
    { ...NOTICE, previewOrInformationRevision: '' },
  ])('never assumes a purchase-wide notice or browser checkbox is unit-specific evidence %s', (notice) => {
    expect(decide({ notice }).classification).toBe('evidence_review_required');
  });

  it('cannot leak private Reader output and cannot issue an automatic legal or payment decision', () => {
    const result = decide({
      delivery: { ...DELIVERY, secretReadingText: 'SECRET_READER_RESPONSE' },
      claim: { ...CLAIM, sessionPayload: 'PRIVATE_BIRTH_FACTS' },
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET_READER_RESPONSE|PRIVATE_BIRTH_FACTS/);
    expect(result.automaticDenialAuthorized).toBe(false);
    expect(result.providerRefundAuthorized).toBe(false);
    expect(result.entitlementMutationAuthorized).toBe(false);
  });
});
