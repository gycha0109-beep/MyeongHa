import { describe, expect, it } from 'vitest';
import {
  checkReaderCheckoutPrepaymentSequenceV1,
  type ReaderCheckoutPrepaymentEventV1,
} from '../apps/api/src/commerce-reader-checkout-prepayment-sequence-v1.js';

const base = {
  purchaseIntentId: '22222222-2222-4222-8222-222222222222',
  pinnedCapabilityItemKey: 'reader-original-capability-item',
  productSpecVersion: 'reader-product-v1',
  noticeRevision: 'legal-notice-v1',
  previewOrInformationRevision: 'preview-v1',
} as const;
const sequence = (): ReaderCheckoutPrepaymentEventV1[] => [
  { ...base, kind: 'snapshot_recorded', occurredAt: '2026-10-26T00:01:00Z' },
  { ...base, kind: 'notice_presented', occurredAt: '2026-10-26T00:02:00Z' },
  { ...base, kind: 'customer_confirmed', occurredAt: '2026-10-26T00:03:00Z' },
  { ...base, kind: 'payment_attempt_started', occurredAt: '2026-10-26T00:04:00Z', attemptNo: 1 },
];
describe('Private S7 prepayment sequence (not authority issuance)', () => {
  it('admits only the same pinned original checkout sequence for an approved writer', () => {
    expect(checkReaderCheckoutPrepaymentSequenceV1(sequence()))
      .toEqual({ eligibleForApprovedWriter: true, reason: 'ordered' });
  });
  it.each([
    ['missing confirmation', (a: ReaderCheckoutPrepaymentEventV1[]) => a.splice(2, 1)],
    ['confirmation after payment', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[2] = { ...a[2]!, occurredAt: '2026-10-26T00:05:00Z' };
    }],
    ['confirmation replaced by ACK', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[2] = { ...a[2]!, kind: 'payment_attempt_started' };
    }],
    ['changed purchase', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[2] = { ...a[2]!, purchaseIntentId: '44444444-4444-4444-8444-444444444444' };
    }],
    ['changed item', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[2] = { ...a[2]!, pinnedCapabilityItemKey: 'sibling-item' };
    }],
    ['changed notice revision', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[2] = { ...a[2]!, noticeRevision: 'other-notice' };
    }],
    ['changed product revision', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[2] = { ...a[2]!, productSpecVersion: 'other-spec' };
    }],
    ['retry in place of original attempt', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[3] = { ...a[3]!, attemptNo: 2 };
    }],
    ['payment at consent instant', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[3] = { ...a[3]!, occurredAt: a[2]!.occurredAt };
    }],
    ['invalid instant', (a: ReaderCheckoutPrepaymentEventV1[]) => {
      a[1] = { ...a[1]!, occurredAt: '2026-02-30T00:02:00Z' };
    }],
  ])('denies %s', (_label, mutate) => {
    const events = sequence();
    mutate(events);
    expect(checkReaderCheckoutPrepaymentSequenceV1(events).eligibleForApprovedWriter)
      .toBe(false);
  });
  it('does not treat a duplicated first payment attempt as a fresh affirmative record', () => {
    const events = sequence();
    events.push({ ...events[3]! });
    expect(checkReaderCheckoutPrepaymentSequenceV1(events).eligibleForApprovedWriter)
      .toBe(false);
  });
});
