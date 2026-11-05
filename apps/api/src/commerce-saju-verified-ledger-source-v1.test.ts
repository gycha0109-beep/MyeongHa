import { describe, expect, it, vi } from 'vitest';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1,
  COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1,
  quoteSajuFromPostgresVerifiedLedgerV1,
} from './commerce-saju-verified-ledger-source-v1.js';
import type { SajuProductKeyV1 } from './commerce-saju-upgrade-pricing-v1.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const subjectId = id(901);
const sajuRecordId = id(902);
const natalVersion = id(903);
type RawRow = Record<string, unknown>;
function dbRow(n: number, productKey: SajuProductKeyV1, price: string,
  parents: readonly number[] = [], extra: Partial<RawRow> = {}): RawRow {
  return {
    purchaseIntentId: id(1000+n), subjectId, sajuRecordId, natalVersion,
    purchaseKind: parents.length ? 'upgrade' : 'original',
    intentStatus: 'verified',
    receiptId: id(n), receiptSubjectId: subjectId, receiptIntentId: id(1000+n),
    receiptOfferId: id(2000+n), intentOfferId: id(2000+n),
    receiptStatus: 'verified', receiptEnvironment: 'production',
    verifiedPaidMinor: price, currency: 'KRW', productKey,
    refundedMinor: '0', upgradeFromReceiptIds: parents.map(id),
    unsettledCancellationCount: '0',
    ...extra,
  };
}
const owned = {
  authority: 'record_scoped_current_effective_entitlements' as const,
  subjectId, sajuRecordId, natalVersion,
  fields: ['career', 'wealth', 'business'] as const,
};
function client(rows: RawRow[], record: RawRow[] = [{
  recordId: sajuRecordId, subjectId, birthRevisionId: natalVersion,
}]) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    expect(values).toBeDefined();
    if (sql === COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1) return {rows:record};
    if (sql === COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1) return {rows};
    throw new Error('UNEXPECTED_QUERY');
  });
  return {query, client: {query} as PostgresTransactionQueryV1};
}
async function quote(
  rows: RawRow[],
  targetProductKey: SajuProductKeyV1 = 'bundle.full_saju',
  proof = owned,
  record?: RawRow[],
) {
  const c = client(rows, record);
  const result = await quoteSajuFromPostgresVerifiedLedgerV1({
    client:c.client, subjectId, sajuRecordId, natalVersion,
    targetProductKey, verifiedOwnedFields: proof,
  });
  return {result, query:c.query};
}

describe('Saju private verified Receipt ledger source (staged, no checkout)', () => {
  it('reads original receipts plus the actual upgrade charge once, never package list prices', async () => {
    const {result,query} = await quote([
      dbRow(1,'standard.career','9900'),
      dbRow(2,'bundle.career_economy','15000',[1]),
    ]);
    expect(result.recognizedNetPaymentMinor).toBe(24900);
    expect(result.additionalPaymentMinor).toBe(10000);
    expect(result.creditedReceiptIds).toEqual([id(1),id(2)]);
    expect(result.checkoutAuthorized).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => sql.startsWith('select'))).toBe(true);
  });
  it('holds future duplicate charge attempts while an overlapping purchase is pending', async () => {
    const {result} = await quote([
      dbRow(1,'standard.career','0',[], {
        intentStatus:'pending', receiptId:null, receiptSubjectId:null,
        receiptIntentId:null, receiptOfferId:null, receiptStatus:null,
        receiptEnvironment:null, verifiedPaidMinor:null, currency:null,
      }),
    ]);
    expect(result.status).toBe('held');
    expect(result.reason).toBe('pending_overlapping_purchase');
  });
  it('subtracts only settled verified refunds and keeps other receipt credits', async () => {
    const {result} = await quote([
      dbRow(1,'standard.career','9900',[],{refundedMinor:'3000'}),
      dbRow(2,'bundle.career_economy','15000',[1]),
    ]);
    expect(result.recognizedNetPaymentMinor).toBe(21900);
    expect(result.additionalPaymentMinor).toBe(13000);
  });
  it('holds provider cancellation without matching refund settlement', async () => {
    await expect(quote([dbRow(1,'standard.career','9900',[],{
      unsettledCancellationCount:'1',
    })])).rejects.toThrow('SAJU_LEDGER_SOURCE_HOLD_UNSETTLED_CANCELLATION');
  });
  it('holds forged cross-Subject, mismatched purchase, duplicate receipt or wrong version', async () => {
    const a=dbRow(1,'standard.career','9900');
    for (const corrupted of [
      {...a,receiptSubjectId:id(777)},
      {...a,receiptIntentId:id(777)},
      {...a,receiptOfferId:id(777)},
      {...a,natalVersion:id(777)},
      {...a,receiptEnvironment:'sandbox'},
      {...a,verifiedPaidMinor:'NaN'},
      {...a,refundedMinor:'10000'},
    ]) {
      await expect(quote([corrupted])).rejects.toThrow();
    }
    await expect(quote([a,a])).rejects.toThrow('DUPLICATE_INTENT_OR_RECEIPT');
    await expect(quote([a], 'bundle.full_saju', owned, [{
      recordId:sajuRecordId, subjectId, birthRevisionId:id(777),
    }])).rejects.toThrow('SAJU_LEDGER_SOURCE_HOLD_RECORD_REVISION_MISMATCH');
  });
  it('holds a revoked receipt with less than complete verified refunds', async () => {
    await expect(quote([dbRow(1,'standard.career','9900',[],{
      receiptStatus:'revoked',refundedMinor:'3000',
    })])).rejects.toThrow('SAJU_LEDGER_SOURCE_HOLD_REFUND_NOT_FULLY_RECONCILED');
  });
  it('does not treat failed, incomplete, or foreign product receipts as trustworthy credits', async () => {
    const failed=dbRow(1,'standard.career','0',[],{
      intentStatus:'failed',receiptId:null,receiptSubjectId:null,
      receiptIntentId:null,receiptOfferId:null,receiptStatus:null,
      receiptEnvironment:null,verifiedPaidMinor:null,currency:null,
    });
    const {result}=await quote([failed]);
    expect(result.recognizedNetPaymentMinor).toBe(0);
    expect(result.additionalPaymentMinor).toBe(34900);
    await expect(quote([dbRow(2,'standard.career','9900',[],{
      productKey:'saju.general_natal.deep.v1',
    })])).rejects.toThrow();
  });
  it('separates current entitlement evidence from paid transaction evidence', async () => {
    await expect(quote([], 'bundle.full_saju', {
      ...owned, sajuRecordId:id(777),
    })).rejects.toThrow();
    const {result} = await quote([
      dbRow(1,'bundle.career_economy','24900'),
      dbRow(2,'bundle.love_relationship','21900'),
    ], 'bundle.full_saju', {
      ...owned, fields:[
        'career','wealth','business','relationship','family','spouse',
      ] as never,
    });
    expect(result.status).toBe('already_owned');
    expect(result.additionalPaymentMinor).toBe(0);
  });
});
