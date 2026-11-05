/**
 * Non-saleable Saju product policy and internal upgrade quote evaluator.
 * Only trusted, verified Receipt/refund projections and a current record-scoped
 * entitlement snapshot may be supplied. This is NOT checkout admission.
 * It neither writes to Commerce nor opens a public payment route.
 */
export const COMMERCE_SAJU_UPGRADE_POLICY_V1 = 'saju-2026-11-05-corrected-net-ledger-v1' as const;

export const COMMERCE_SAJU_PRODUCTS_V1 = Object.freeze({
  'standard.career': { priceMinor: 9900, fields: ['career'] },
  'standard.wealth': { priceMinor: 9900, fields: ['wealth'] },
  'standard.love_relationship': { priceMinor: 9900, fields: ['relationship'] },
  'standard.business': { priceMinor: 9900, fields: ['business'] },
  'standard.family': { priceMinor: 6900, fields: ['family'] },
  'standard.spouse': { priceMinor: 9900, fields: ['spouse'] },
  'standard.year': { priceMinor: 7900, fields: ['year'] },
  'standard.month': { priceMinor: 4900, fields: ['month'] },
  'standard.compatibility': { priceMinor: 12900, fields: ['compatibility'] },
  'standard.current_concern': { priceMinor: 9900, fields: ['current_concern'] },
  'bundle.career_economy': { priceMinor: 24900, fields: ['career', 'wealth', 'business'] },
  'bundle.love_relationship': { priceMinor: 21900, fields: ['relationship', 'family', 'spouse'] },
  'bundle.full_saju': { priceMinor: 34900, fields: ['career', 'wealth', 'business', 'relationship', 'family', 'spouse'] },
} as const);

export type SajuProductKeyV1 = keyof typeof COMMERCE_SAJU_PRODUCTS_V1;
export type SajuFieldV1 = typeof COMMERCE_SAJU_PRODUCTS_V1[SajuProductKeyV1]['fields'][number];

export interface SajuPurchaseLedgerRowV1 {
  /** One provider-verified charge, never a package total or a UI price. */
  readonly source: 'verified_receipt';
  readonly receiptId: string;
  readonly purchaseIntentId: string;
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly natalVersion: string;
  readonly productKey: SajuProductKeyV1;
  readonly purchaseKind: 'original' | 'upgrade';
  /** The actual original Receipt IDs credited when this upgrade was purchased. */
  readonly upgradeFromReceiptIds: readonly string[];
  readonly currency: 'KRW';
  readonly verifiedPaidMinor: number;
  /** Successful, source-verified refunds against THIS original Receipt only. */
  readonly refundedMinor: number;
  readonly refundState: 'none' | 'partial' | 'full';
}

export interface SajuPendingPurchaseV1 {
  readonly sajuRecordId: string;
  readonly natalVersion: string;
  readonly productKey: SajuProductKeyV1;
}

export interface SajuUpgradeQuoteInputV1 {
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly natalVersion: string;
  readonly targetProductKey: SajuProductKeyV1;
  /** Actual active, record-scoped effective entitlements, NOT purchased products. */
  readonly ownedFields: readonly SajuFieldV1[];
  /** Trusted provider/DB ledger projection, one line per original charge. */
  readonly transactions: readonly SajuPurchaseLedgerRowV1[];
  /** Existing unresolved payment attempts in the same record/version. */
  readonly pendingPurchases: readonly SajuPendingPurchaseV1[];
}

export type SajuUpgradeQuoteV1 = Readonly<{
  policyVersion: typeof COMMERCE_SAJU_UPGRADE_POLICY_V1;
  targetProductKey: SajuProductKeyV1;
  status: 'quoted' | 'already_owned' | 'held';
  reason: 'price_difference' | 'all_fields_owned' | 'pending_overlapping_purchase'
    | 'unallocatable_cross_package_overlap' | 'credit_without_matching_access';
  additionalPaymentMinor: number | null;
  targetListPriceMinor: number;
  recognizedNetPaymentMinor: number;
  creditedReceiptIds: readonly string[];
  ownedFields: readonly SajuFieldV1[];
  checkoutAuthorized: false;
  requiresAtomicCheckoutAdmission: true;
  refundAllocationApplied: false;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const keys = new Set(Object.keys(COMMERCE_SAJU_PRODUCTS_V1));
const fields = new Set<string>(
  Object.values(COMMERCE_SAJU_PRODUCTS_V1).flatMap(p => [...p.fields]),
);
function invalid(): never {
  throw new Error('SAJU_UPGRADE_LEDGER_AUTHORITY_OR_PROVENANCE_INVALID');
}
function product(value: unknown): SajuProductKeyV1 {
  if (typeof value !== 'string' || !keys.has(value)) return invalid();
  return value as SajuProductKeyV1;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return invalid();
  return value.toLowerCase();
}
function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function plus(a: number, b: number): number {
  const n = a + b;
  if (!Number.isSafeInteger(n)) return invalid();
  return n;
}
function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return [...a].some(f => b.has(f));
}

/**
 * Pure internal quote: NEVER a gateway to charge, grant, refund or legal denial.
 * Actual checkout must re-read locked Purchase Intent/Receipt/refund/Entitlement
 * state, pin its exact price and enforce a unique pending purchase for the record.
 */
export function quoteSajuUpgradeFromVerifiedLedgerV1(
  input: SajuUpgradeQuoteInputV1,
): SajuUpgradeQuoteV1 {
  const subjectId = uuid(input.subjectId);
  const recordId = uuid(input.sajuRecordId);
  if (typeof input.natalVersion !== 'string' || input.natalVersion.trim() === ''
      || input.natalVersion.length > 160) return invalid();
  const targetProductKey = product(input.targetProductKey);
  if (!Array.isArray(input.ownedFields) || !Array.isArray(input.transactions)
      || !Array.isArray(input.pendingPurchases)) return invalid();
  const target = COMMERCE_SAJU_PRODUCTS_V1[targetProductKey];
  const targetFields = new Set<string>(target.fields);
  const owned = new Set<string>();
  for (const field of input.ownedFields) {
    if (typeof field !== 'string' || !fields.has(field)) return invalid();
    owned.add(field);
  }

  const byReceipt = new Map<string, SajuPurchaseLedgerRowV1>();
  const byIntent = new Map<string, string>();
  for (const raw of input.transactions) {
    if (raw.source !== 'verified_receipt'
        || uuid(raw.subjectId) !== subjectId
        || uuid(raw.sajuRecordId) !== recordId
        || raw.natalVersion !== input.natalVersion
        || raw.currency !== 'KRW') return invalid();
    const receiptId = uuid(raw.receiptId);
    const intentId = uuid(raw.purchaseIntentId);
    product(raw.productKey);
    const paid = money(raw.verifiedPaidMinor);
    const refunded = money(raw.refundedMinor);
    if (paid <= 0 || refunded > paid) return invalid();
    if ((raw.refundState === 'none' && refunded !== 0)
        || (raw.refundState === 'partial' && !(refunded > 0 && refunded < paid))
        || (raw.refundState === 'full' && refunded !== paid)) return invalid();
    if (!Array.isArray(raw.upgradeFromReceiptIds)
        || (raw.purchaseKind === 'original' && raw.upgradeFromReceiptIds.length !== 0)
        || (raw.purchaseKind === 'upgrade' && raw.upgradeFromReceiptIds.length === 0)
        || (raw.purchaseKind !== 'original' && raw.purchaseKind !== 'upgrade')) return invalid();
    const previous = byReceipt.get(receiptId);
    if (previous) {
      // Repeated JOIN rows are evidence of ONE charge, not additional credit.
      if (JSON.stringify(previous) !== JSON.stringify(raw)) return invalid();
      continue;
    }
    if (byIntent.has(intentId) || byReceipt.has(receiptId)) return invalid();
    byReceipt.set(receiptId, raw);
    byIntent.set(intentId, receiptId);
  }

  // Validate the complete provenance graph even for currently refunded lines.
  // Upgrade links must reference real earlier same-record charges; no cycles,
  // missing originals, or upgrades to a narrower set of fields are accepted.
  const visiting = new Set<string>();
  const checked = new Set<string>();
  function validateChain(id: string): void {
    if (checked.has(id)) return;
    if (visiting.has(id)) return invalid();
    const row = byReceipt.get(id);
    if (!row) return invalid();
    visiting.add(id);
    const rowFields = new Set<string>(COMMERCE_SAJU_PRODUCTS_V1[row.productKey].fields);
    const uniqueParents = new Set<string>();
    for (const parentIdRaw of row.upgradeFromReceiptIds) {
      const parentId = uuid(parentIdRaw);
      if (uniqueParents.has(parentId) || parentId === id) return invalid();
      uniqueParents.add(parentId);
      const parent = byReceipt.get(parentId);
      if (!parent) return invalid();
      const parentFields = COMMERCE_SAJU_PRODUCTS_V1[parent.productKey].fields;
      if (!parentFields.every(f => rowFields.has(f))) return invalid();
      validateChain(parentId);
    }
    visiting.delete(id);
    checked.add(id);
  }
  for (const id of byReceipt.keys()) validateChain(id);

  const allOwned = [...targetFields].every(f => owned.has(f));
  let credit = 0;
  const credited: string[] = [];
  let ambiguousOverlap = false;
  for (const [receiptId, row] of byReceipt) {
    const net = row.verifiedPaidMinor - row.refundedMinor;
    if (net === 0) continue;
    const purchaseFields = new Set<string>(COMMERCE_SAJU_PRODUCTS_V1[row.productKey].fields);
    if ([...purchaseFields].every(f => targetFields.has(f))) {
      credit = plus(credit, net);
      credited.push(receiptId);
    } else if (overlaps(purchaseFields, targetFields)) {
      // There is NO approved allocation rule for crediting only part of a
      // cross-target purchase. Do not borrow partial-refund allocation.
      ambiguousOverlap = true;
    }
  }

  let pendingOverlap = false;
  for (const pending of input.pendingPurchases) {
    if (uuid(pending.sajuRecordId) !== recordId
        || pending.natalVersion !== input.natalVersion) return invalid();
    const pendingFields = new Set<string>(COMMERCE_SAJU_PRODUCTS_V1[product(pending.productKey)].fields);
    if (overlaps(pendingFields, targetFields)) pendingOverlap = true;
  }
  let status: SajuUpgradeQuoteV1['status'];
  let reason: SajuUpgradeQuoteV1['reason'];
  let additional: number | null;
  if (allOwned) {
    status = 'already_owned';
    reason = 'all_fields_owned';
    additional = 0;
  } else if (pendingOverlap) {
    status = 'held';
    reason = 'pending_overlapping_purchase';
    additional = null;
  } else if (ambiguousOverlap) {
    status = 'held';
    reason = 'unallocatable_cross_package_overlap';
    additional = null;
  } else if (credit >= target.priceMinor) {
    status = 'held';
    reason = 'credit_without_matching_access';
    additional = null;
  } else {
    status = 'quoted';
    reason = 'price_difference';
    additional = Math.max(0, target.priceMinor - credit);
  }
  return Object.freeze({
    policyVersion: COMMERCE_SAJU_UPGRADE_POLICY_V1,
    targetProductKey,
    status, reason, additionalPaymentMinor: additional,
    targetListPriceMinor: target.priceMinor,
    recognizedNetPaymentMinor: credit,
    creditedReceiptIds: Object.freeze(credited),
    ownedFields: Object.freeze([...owned]),
    checkoutAuthorized: false,
    requiresAtomicCheckoutAdmission: true,
    refundAllocationApplied: false,
  });
}
