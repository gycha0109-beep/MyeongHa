import { describe, expect, it } from 'vitest';
import { assessOfficialReaderCancelPreflightV1 } from '../apps/api/src/official-reader-provider-cancel-preflight-v1.js';

const base = Object.freeze({
  webhook: {
    authority: 'server_authenticated_provider_webhook',
    normalizedOperation: 'payment.cancelled',
    webhookId: 'msg-001',
    provider: 'portone_v2',
    paymentId: 'payment-001',
    transactionId: 'transaction-001',
  },
  receipt: {
    authority: 'db_verified_production_receipt',
    provider: 'portone_v2',
    environment: 'production',
    receiptId: '11111111-1111-4111-8111-111111111111',
    purchaseIntentId: '22222222-2222-4222-8222-222222222222',
    subjectId: '33333333-3333-4333-8333-333333333333',
    paymentId: 'payment-001',
    transactionId: 'transaction-001',
    originalPaidAmountMinor: 10000,
    currency: 'KRW',
  },
  providerState: {
    authority: 'independent_provider_api_lookup',
    provider: 'portone_v2',
    paymentId: 'payment-001',
    transactionId: 'transaction-001',
    paymentState: 'CANCELLED',
    originalPaidAmountMinor: 10000,
    totalCancelledAmountMinor: 10000,
    remainingAmountMinor: 0,
    currency: 'KRW',
    providerCancelledAt: '2026-10-13T03:00:00.000Z',
  },
  eventHistory: {
    authority: 'server_persisted_event_history',
    webhookId: 'msg-001',
    transactionId: 'transaction-001',
    ordering: 'confirmed_newer',
    isDuplicate: false,
  },
  ownerReview: {
    authority: 'commerce_legal_review_record',
    receiptId: '11111111-1111-4111-8111-111111111111',
    transactionId: 'transaction-001',
    reviewId: 'commerce-reviewed-full-01',
    fullCancellationApproved: true,
    legalPolicyApproved: true,
    approvedAt: '2026-10-13T03:00:00.000Z',
  },
});

const update = (field: keyof typeof base, overrides: Record<string, unknown>) => ({
  ...base,
  [field]: { ...base[field], ...overrides },
});

describe('D3d PortOne cancellation preflight — HOLD / NO effects', () => {
  it('produces only a manual-worker candidate even for all matching evidence', () => {
    const r = assessOfficialReaderCancelPreflightV1(base);
    expect(r).toEqual({
      status: 'candidate',
      reason: 'CANDIDATE_REQUIRES_TRUSTED_WORKER',
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
      runtimeExecutionAuthorized: false,
    });
    expect(Object.isFrozen(r)).toBe(true);
  });

  it.each([
    ['missing signed webhook', { ...base, webhook: null }, 'SOURCE_PROOF_MISSING'],
    ['signed webhook not independently normalized', update('webhook', { normalizedOperation: 'Transaction.Paid' }), 'SOURCE_PROOF_MISSING'],
    ['sandbox receipt', update('receipt', { environment: 'sandbox' }), 'SOURCE_PROOF_MISSING'],
    ['unknown receipt', update('receipt', { receiptId: 'untrusted' }), 'SOURCE_PROOF_MISSING'],
    ['missing independent payment API', { ...base, providerState: {} }, 'SOURCE_PROOF_MISSING'],
    ['invalid API timestamp', update('providerState', { providerCancelledAt: 'yesterday' }), 'SOURCE_PROOF_MISSING'],
    ['NaN provider amount', update('providerState', { totalCancelledAmountMinor: Number.NaN }), 'SOURCE_PROOF_MISSING'],
    ['fractional provider amount', update('providerState', { totalCancelledAmountMinor: 10000.5 }), 'SOURCE_PROOF_MISSING'],
    ['negative provider amount', update('providerState', { totalCancelledAmountMinor: -1 }), 'SOURCE_PROOF_MISSING'],
    ['currency mismatch', update('providerState', { currency: 'USD' }), 'LINEAGE_MISMATCH'],
    ['different transaction', update('providerState', { transactionId: 'other-tx' }), 'LINEAGE_MISMATCH'],
    ['mismatched payment ID', update('webhook', { paymentId: 'other-payment' }), 'LINEAGE_MISMATCH'],
    ['unmatched review receipt', update('ownerReview', { receiptId: '44444444-4444-4444-8444-444444444444' }), 'LINEAGE_MISMATCH'],
    ['amount mismatch', update('providerState', { originalPaidAmountMinor: 11000 }), 'LINEAGE_MISMATCH'],
    ['partial refund amount', update('providerState', { totalCancelledAmountMinor: 4000, remainingAmountMinor: 6000 }), 'NOT_FULL_CANCELLATION'],
    ['cancelled amount full but provider still partial', update('providerState', { paymentState: 'PARTIAL_CANCELLED' }), 'NOT_FULL_CANCELLATION'],
    ['full cancelled amount but nonzero remainder', update('providerState', { remainingAmountMinor: 1 }), 'NOT_FULL_CANCELLATION'],
    ['duplicate provider webhook', update('eventHistory', { isDuplicate: true }), 'REPLAY_OR_ORDERING_UNPROVEN'],
    ['stale provider event', update('eventHistory', { ordering: 'stale' }), 'REPLAY_OR_ORDERING_UNPROVEN'],
    ['opaque ordering unresolved', update('eventHistory', { ordering: 'unknown' }), 'REPLAY_OR_ORDERING_UNPROVEN'],
    ['missing legal approval', update('ownerReview', { legalPolicyApproved: false }), 'COMMERCE_POLICY_UNAPPROVED'],
    ['missing commerce approval', update('ownerReview', { fullCancellationApproved: false }), 'COMMERCE_POLICY_UNAPPROVED'],
    ['invalid review time', update('ownerReview', { approvedAt: '2026-02-31T03:00:00.000Z' }), 'COMMERCE_POLICY_UNAPPROVED'],
  ] as const)('%s remains non-authorizing', (_label, input, expected) => {
    const result = assessOfficialReaderCancelPreflightV1(input);
    expect(result.status).toBe('hold');
    expect(result.reason).toBe(expected);
    expect(result.providerRefundAuthorized).toBe(false);
    expect(result.entitlementMutationAuthorized).toBe(false);
    expect(result.runtimeExecutionAuthorized).toBe(false);
  });

  it('does not trust prototype-bearing object assertions', () => {
    const untrusted = Object.assign(Object.create({ superuser: true }), base.providerState);
    expect(assessOfficialReaderCancelPreflightV1({ ...base, providerState: untrusted })).toMatchObject({
      status: 'hold',
      reason: 'SOURCE_PROOF_MISSING',
      entitlementMutationAuthorized: false,
    });
  });
});
