import { describe, expect, it, vi } from 'vitest';
import {
  CommerceReaderPrivateWithdrawalEvidenceErrorV1,
  reviewOfficialReaderPrivateWithdrawalEvidenceV1,
} from './commerce-reader-private-withdrawal-evidence-v1.js';
import type {
  PostgresSubjectExecutionScopeV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const INTENT = '22222222-2222-4222-8222-222222222222';
const GRANT = '33333333-3333-4333-8333-333333333333';
const BODY = '44444444-4444-4444-8444-444444444444';
const S5_AT = '2026-10-20T09:00:00.000Z';
const PREPARED_AT = '2026-10-20T09:00:02.000Z';
const ACK_AT = '2026-10-20T09:00:04.000Z';

function fixture(overrides: Record<string, unknown> = {}) {
  const row = {
    purchaseIntentId: INTENT,
    unitId: GRANT,
    productSpecVersion: 'reading-v1',
    originalReceiptStatus: 'verified',
    s5CommittedAt: S5_AT,
    responsePreparedAt: PREPARED_AT,
    clientAcknowledgedAt: ACK_AT,
    deliveryAttemptCount: '1',
    acknowledgedAttemptCount: '1',
    ...overrides,
  };
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    expect(sql).toContain('internal_qry_official_reader_withdrawal_delivery_state_v2');
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\b/iu);
    expect(params).toEqual([SUBJECT, INTENT, GRANT, BODY]);
    return { rows: [row] };
  });
  const scope = {
    resolvedSubject: { subjectId: SUBJECT, subjectKind: 'member' },
    client: { query } as unknown as PostgresTransactionQueryV1,
  } as PostgresSubjectExecutionScopeV1;
  const notice = vi.fn(async () => ({
    authority: 'server_checkout_snapshot' as const,
    purchaseIntentId: INTENT,
    unitId: GRANT,
    productSpecVersion: 'reading-v1',
    noticeRevision: 'rev-1',
    previewOrInformationRevision: 'preview-1',
    acknowledged: true as const,
  }));
  const claim = { purchaseIntentId: INTENT, unitId: GRANT, reason: 'change_of_mind' };
  const makeInput = () => ({
    scope, purchaseIntentId: INTENT, originatingGrantId: GRANT,
    bodyId: BODY, claim,
    checkoutNoticeAuthority: { readExactServerCheckoutNotice: notice },
  });
  return { query, notice, makeInput };
}

describe('Private Commerce original Receipt -> S5 commit -> S7 -> withdrawal evidence', () => {
  it('keeps commit, prepared and client ACK independently recorded without proving delivery', async () => {
    const { query, notice, makeInput } = fixture();
    const result = await reviewOfficialReaderPrivateWithdrawalEvidenceV1(makeInput());
    expect(result.purchasedUnit).toEqual({
      purchaseIntentId: INTENT, unitId: GRANT, productSpecVersion: 'reading-v1',
    });
    expect(result.timeline).toEqual({
      originalReceiptStatus: 'verified',
      s5CommittedAt: S5_AT,
      serverResponsePreparedAt: PREPARED_AT,
      authenticatedClientAcknowledgedAt: ACK_AT,
      retainedDeliveryAttempts: 1,
      retainedAcknowledgedAttempts: 1,
      consumerDeliveryProven: false,
      legallyProvenDeliveredAt: null,
    });
    expect(result.review).toMatchObject({
      classification: 'not_proven_delivered',
      reason: 'CONTENT_NOT_PROVEN_DELIVERED',
      automaticDenialAuthorized: false,
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
    expect(result.refundAuthorized).toBe(false);
    expect(result.entitlementMutationAuthorized).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledWith(result.purchasedUnit);
  });

  it('keeps historically retained cancellation evidence without treating a revoked original receipt as verified', async () => {
    const { makeInput } = fixture({ originalReceiptStatus: 'revoked' });
    const result = await reviewOfficialReaderPrivateWithdrawalEvidenceV1(makeInput());
    expect(result.timeline.originalReceiptStatus).toBe('revoked');
    expect(result.timeline.retainedAcknowledgedAttempts).toBe(1);
    expect(result.review).toMatchObject({
      classification: 'evidence_review_required',
      reason: 'INVALID_OR_MISSING_SERVER_EVIDENCE',
      automaticDenialAuthorized: false,
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
    expect(result.timeline.consumerDeliveryProven).toBe(false);
    expect(result.timeline.legallyProvenDeliveredAt).toBeNull();
  });

  it('keeps prepared-only and S5-only records strictly below delivered proof', async () => {
    for (const partial of [
      { clientAcknowledgedAt: null, acknowledgedAttemptCount: '0' },
      {
        responsePreparedAt: null, clientAcknowledgedAt: null,
        deliveryAttemptCount: '0', acknowledgedAttemptCount: '0',
      },
    ]) {
      const { makeInput } = fixture(partial);
      const result = await reviewOfficialReaderPrivateWithdrawalEvidenceV1(makeInput());
      expect(result.review.classification).toBe('not_proven_delivered');
      expect(result.timeline.legallyProvenDeliveredAt).toBeNull();
    }
  });

  it('preserves statutory-complaint and separable-part priority over any ACK', async () => {
    const { makeInput } = fixture();
    const base = makeInput();
    const defect = await reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      ...base, claim: { ...base.claim, reason: 'defect' },
    });
    expect(defect.review.classification).toBe('statutory_exception_review');
    const part = await reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      ...base, claim: { ...base.claim, reason: 'unprovided_separable_part' },
    });
    expect(part.review.classification).toBe('separable_part_review');
    expect(defect.refundAuthorized).toBe(false);
    expect(part.refundAuthorized).toBe(false);
  });

  it('never borrows another independently purchased unit or an invented checkout notice', async () => {
    const { makeInput } = fixture();
    const mismatch = await reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      ...makeInput(),
      checkoutNoticeAuthority: { readExactServerCheckoutNotice: async () => ({
        authority: 'server_checkout_snapshot',
        purchaseIntentId: INTENT,
        unitId: BODY,
        productSpecVersion: 'reading-v1',
        noticeRevision: 'rev-1',
        previewOrInformationRevision: 'preview-1',
        acknowledged: true,
      }) },
    });
    expect(mismatch.review.classification).toBe('not_proven_delivered');

    const withoutNotice = await reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      ...makeInput(),
      checkoutNoticeAuthority: { readExactServerCheckoutNotice: async () => null },
    });
    expect(withoutNotice.review.automaticDenialAuthorized).toBe(false);
    expect(withoutNotice.timeline.consumerDeliveryProven).toBe(false);
  });

  it.each([
    { originalReceiptStatus: 'pending' },
    { originalReceiptStatus: 'cancel_requested' },
    { originalReceiptStatus: null },
    { unitId: BODY },
    { purchaseIntentId: BODY },
    { productSpecVersion: '' },
    { responsePreparedAt: null, acknowledgedAttemptCount: '1' },
    { deliveryAttemptCount: '0' },
    { deliveryAttemptCount: '1', acknowledgedAttemptCount: '2' },
    { clientAcknowledgedAt: S5_AT },
    { s5CommittedAt: 'not-a-date' },
    { deliveryAttemptCount: '-1' },
    { deliveryAttemptCount: '9007199254740992' },
  ])('fails closed for corrupted or cross-scope evidence %#', async row => {
    const { makeInput, notice } = fixture(row);
    await expect(reviewOfficialReaderPrivateWithdrawalEvidenceV1(makeInput()))
      .rejects.toBeInstanceOf(CommerceReaderPrivateWithdrawalEvidenceErrorV1);
    expect(notice).not.toHaveBeenCalled();
  });

  it('fails closed for missing evidence, wrong Subject type and unverifiable item selector', async () => {
    const { makeInput, query } = fixture();
    query.mockImplementationOnce(async () => ({ rows: [] }));
    await expect(reviewOfficialReaderPrivateWithdrawalEvidenceV1(makeInput()))
      .rejects.toBeInstanceOf(CommerceReaderPrivateWithdrawalEvidenceErrorV1);
    const input = makeInput();
    await expect(reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      ...input,
      scope: {
        ...input.scope,
        resolvedSubject: { subjectId: SUBJECT, subjectKind: 'guest' },
      },
    })).rejects.toBeInstanceOf(CommerceReaderPrivateWithdrawalEvidenceErrorV1);
    await expect(reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      ...input,
      originatingGrantId: 'browser-unit',
    })).rejects.toBeInstanceOf(CommerceReaderPrivateWithdrawalEvidenceErrorV1);
  });
});
