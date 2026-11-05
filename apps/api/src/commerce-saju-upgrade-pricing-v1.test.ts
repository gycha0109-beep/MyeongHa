import { describe, expect, it } from 'vitest';
import {
  COMMERCE_SAJU_PRODUCTS_V1,
  COMMERCE_SAJU_UPGRADE_POLICY_V1,
  quoteSajuUpgradeFromVerifiedLedgerV1,
  type SajuFieldV1,
  type SajuProductKeyV1,
  type SajuPurchaseLedgerRowV1,
} from './commerce-saju-upgrade-pricing-v1.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const subjectId = id(900);
const sajuRecordId = id(901);
const natalVersion = 'natal-v1';
type Overrides = Partial<SajuPurchaseLedgerRowV1>;
function charge(
  n: number,
  productKey: SajuProductKeyV1,
  verifiedPaidMinor = COMMERCE_SAJU_PRODUCTS_V1[productKey].priceMinor,
  parents: readonly number[] = [],
  override: Overrides = {},
): SajuPurchaseLedgerRowV1 {
  return {
    source: 'verified_receipt', receiptId: id(n), purchaseIntentId: id(n + 1000),
    subjectId, sajuRecordId, natalVersion, productKey,
    purchaseKind: parents.length ? 'upgrade' : 'original',
    upgradeFromReceiptIds: parents.map(id), currency: 'KRW',
    verifiedPaidMinor, refundedMinor: 0, refundState: 'none',
    ...override,
  };
}
function quote(
  targetProductKey: SajuProductKeyV1,
  transactions: readonly SajuPurchaseLedgerRowV1[] = [],
  ownedFields: readonly SajuFieldV1[] = [],
  pendingPurchases: readonly { sajuRecordId: string; natalVersion: string; productKey: SajuProductKeyV1 }[] = [],
) {
  return quoteSajuUpgradeFromVerifiedLedgerV1({
    subjectId, sajuRecordId, natalVersion, targetProductKey,
    ownedFields, transactions, pendingPurchases,
  });
}
const allSix: SajuFieldV1[] = [
  'career', 'wealth', 'business', 'relationship', 'family', 'spouse',
];
describe('Commerce corrected Saju package upgrade from original net charge ledger', () => {
  it('pins 10 singles and 3 bundles without legacy life-stage or standalone general reading', () => {
    expect(Object.keys(COMMERCE_SAJU_PRODUCTS_V1)).toHaveLength(13);
    expect(COMMERCE_SAJU_PRODUCTS_V1['standard.love_relationship'].priceMinor).toBe(9900);
    expect(COMMERCE_SAJU_PRODUCTS_V1['bundle.full_saju'].fields).toEqual(allSix);
    expect(COMMERCE_SAJU_UPGRADE_POLICY_V1).toContain('corrected-net-ledger');
    expect(() => quote('saju.general_natal.deep.v1' as SajuProductKeyV1)).toThrow();
    expect(() => quote('standard.life_stage' as SajuProductKeyV1)).toThrow();
  });
  it.each([
    ['no prior purchases', [], [], 34900],
    ['career single', [charge(1, 'standard.career')], ['career'], 25000],
    ['career and wealth singles',
      [charge(1, 'standard.career'), charge(2, 'standard.wealth')],
      ['career', 'wealth'], 15100],
    ['three individual singles',
      [charge(1, 'standard.career'), charge(2, 'standard.wealth'), charge(3, 'standard.business')],
      ['career', 'wealth', 'business'], 5200],
    ['career theme', [charge(1, 'bundle.career_economy')],
      ['career', 'wealth', 'business'], 10000],
    ['love theme', [charge(1, 'bundle.love_relationship')],
      ['relationship', 'family', 'spouse'], 13000],
  ] as const)('full package: %s', (_label, rows, owned, expected) => {
    const result = quote('bundle.full_saju', rows, owned);
    expect(result.status).toBe('quoted');
    expect(result.additionalPaymentMinor).toBe(expected);
    expect(result.checkoutAuthorized).toBe(false);
    expect(result.requiresAtomicCheckoutAdmission).toBe(true);
    expect(result.refundAllocationApplied).toBe(false);
  });
  it('career 9,900 → career theme +15,000 → full +10,000 credits ONLY real original charges', () => {
    const single = charge(1, 'standard.career', 9900);
    expect(quote('bundle.career_economy', [single], ['career']).additionalPaymentMinor).toBe(15000);
    const upgrade = charge(2, 'bundle.career_economy', 15000, [1]);
    const full = quote('bundle.full_saju', [single, upgrade], ['career', 'wealth', 'business']);
    expect(full.recognizedNetPaymentMinor).toBe(24900);
    expect(full.creditedReceiptIds).toEqual([id(1), id(2)]);
    expect(full.additionalPaymentMinor).toBe(10000);
  });
  it('two base themes already open all six topics without buying full package', () => {
    const q = quote('bundle.full_saju',
      [charge(1, 'bundle.career_economy'), charge(2, 'bundle.love_relationship')],
      allSix);
    expect(q.status).toBe('already_owned');
    expect(q.additionalPaymentMinor).toBe(0);
    expect(q.recognizedNetPaymentMinor).toBe(46800);
  });
  it('three singles already open career bundle; overpayment never implies auto-refund', () => {
    const q = quote('bundle.career_economy',
      [charge(1, 'standard.career'), charge(2, 'standard.wealth'), charge(3, 'standard.business')],
      ['career', 'wealth', 'business']);
    expect(q.status).toBe('already_owned');
    expect(q.additionalPaymentMinor).toBe(0);
    expect(q.refundAllocationApplied).toBe(false);
  });
  it('two singles → career theme +5,100 → full +10,000', () => {
    const a = charge(1, 'standard.career');
    const b = charge(2, 'standard.wealth');
    expect(quote('bundle.career_economy', [a, b], ['career', 'wealth']).additionalPaymentMinor).toBe(5100);
    const c = charge(3, 'bundle.career_economy', 5100, [1, 2]);
    expect(quote('bundle.full_saju', [a, b, c], ['career', 'wealth', 'business'])
      .additionalPaymentMinor).toBe(10000);
  });
  it('one theme does not subsidize buying the other nonoverlapping theme', () => {
    const q = quote('bundle.love_relationship',
      [charge(1, 'bundle.career_economy')],
      ['career', 'wealth', 'business']);
    expect(q.additionalPaymentMinor).toBe(21900);
    expect(q.recognizedNetPaymentMinor).toBe(0);
  });
  it('the same receipt repeated by a SQL JOIN is credited only once', () => {
    const a = charge(1, 'standard.career');
    const q = quote('bundle.full_saju', [a, { ...a }], ['career']);
    expect(q.additionalPaymentMinor).toBe(25000);
    expect(q.creditedReceiptIds).toEqual([id(1)]);
  });
  it('honors actual discounted net payment without list-price credit', () => {
    const a = charge(1, 'standard.career', 6900);
    expect(quote('bundle.career_economy', [a], ['career']).additionalPaymentMinor).toBe(18000);
  });
  it('honors verified partial refunds separately from refund allocation policy', () => {
    const a = charge(1, 'standard.career', 9900, [], {
      refundedMinor: 3000, refundState: 'partial',
    });
    const q = quote('bundle.full_saju', [a], ['career']);
    expect(q.recognizedNetPaymentMinor).toBe(6900);
    expect(q.additionalPaymentMinor).toBe(28000);
  });
  it('excludes fully refunded original charges and unrelated annual products', () => {
    const fullRefund = charge(1, 'standard.career', 9900, [], {
      refundedMinor: 9900, refundState: 'full',
    });
    const year = charge(2, 'standard.year');
    const q = quote('bundle.full_saju', [fullRefund, year]);
    expect(q.additionalPaymentMinor).toBe(34900);
    expect(q.creditedReceiptIds).toEqual([]);
  });
  it('halts an overlapping in-flight purchase rather than allowing concurrent double charging', () => {
    const q = quote('bundle.full_saju', [], [], [
      { sajuRecordId, natalVersion, productKey: 'standard.career' },
    ]);
    expect(q.status).toBe('held');
    expect(q.reason).toBe('pending_overlapping_purchase');
    expect(q.additionalPaymentMinor).toBeNull();
  });
  it('holds unallocatable cross-target purchases rather than borrowing refund allocation', () => {
    const q = quote('bundle.career_economy', [charge(1, 'bundle.full_saju')]);
    expect(q.status).toBe('held');
    expect(q.reason).toBe('unallocatable_cross_package_overlap');
  });
  it('holds positive paid credit without matching active entitlements', () => {
    const q = quote('bundle.career_economy', [charge(1, 'bundle.career_economy')]);
    expect(q.status).toBe('held');
    expect(q.reason).toBe('credit_without_matching_access');
  });
  it('refuses forged joins, record mismatch, invalid refunds and ambiguous upgrade links', () => {
    const a = charge(1, 'standard.career');
    expect(() => quote('bundle.full_saju', [a, { ...a, refundedMinor: 9900, refundState: 'full' }])).toThrow();
    expect(() => quote('bundle.full_saju', [{ ...a, sajuRecordId: id(888) }])).toThrow();
    expect(() => quote('bundle.full_saju', [{ ...a, refundedMinor: 10000, refundState: 'full' }])).toThrow();
    expect(() => quote('bundle.full_saju', [charge(2, 'bundle.career_economy', 15000, [1])])).toThrow();
    expect(() => quote('bundle.full_saju', [a, charge(2, 'bundle.love_relationship', 15000, [1])])).toThrow();
    expect(() => quote('bundle.full_saju', [a, { ...charge(2, 'standard.wealth'), purchaseIntentId: a.purchaseIntentId }])).toThrow();
  });
});
