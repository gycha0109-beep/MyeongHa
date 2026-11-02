import { describe, expect, it, vi } from 'vitest';
import { fulfillVerifiedReaderReceiptV1 } from '../apps/api/src/commerce-verified-reader-fulfillment.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const RECEIPT = '11111111-1111-4111-8111-111111111111';
const PURCHASE = '22222222-2222-4222-8222-222222222222';
const READING = '33333333-3333-4333-8333-333333333333';
const GRANT = '44444444-4444-4444-8444-444444444444';
const VERIFIED_AT = '2026-10-20T12:34:56.000Z';

describe('Verified Reader Receipt fulfillment replay authority', () => {
  it('reuses the original verified Receipt time and binding hash across repeated payment events', async () => {
    const bindArguments: unknown[][] = [];
    let bindCount = 0;
    const query = vi.fn(async (sql: string, args?: readonly unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' ||
          sql === 'SET LOCAL ROLE myeongha_commerce_internal_executor') {
        return { rows: [] };
      }
      if (sql.includes('internal_resolve_verified_reader_receipt_fulfillment_v1')) {
        expect(args).toEqual([RECEIPT]);
        return { rows: [{
          purchaseIntentId: PURCHASE,
          existingOfficialReadingId: READING,
          capabilityItemKey: 'standard-reading-access',
          validityMode: 'unbounded',
          purchaseRole: 'additional_reader_interpretation',
          // This must be the immutable cr.verified_at, not a new clock per webhook.
          preparedAt: VERIFIED_AT,
        }] };
      }
      if (sql.includes('cmd_apply_verified_reader_receipt_bind_internal_v1')) {
        bindCount++;
        bindArguments.push([...(args ?? [])]);
        return { rows: [{
          result: {
            contractVersion: 'official-reader-s2-atomic-receipt-bind-v1',
            readerAccess: {
              purchase_intent_id: PURCHASE,
              entitlement_grant_id: GRANT,
              reader_character_id: 'seyeon',
              reading_id: READING,
              replayed: bindCount > 1,
              official_reading_created: false,
              interpretation_created: bindCount === 1,
            },
            capabilityEffects: [{}],
          },
        }] };
      }
      throw new Error('Unexpected Commerce SQL: ' + sql);
    });
    const pool = {
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as unknown as PostgresSubjectPoolV1;

    const first = await fulfillVerifiedReaderReceiptV1({ pool, receiptId: RECEIPT });
    const replay = await fulfillVerifiedReaderReceiptV1({ pool, receiptId: RECEIPT });

    expect(first?.kind).toBe('issued');
    expect(replay?.kind).toBe('already_bound');
    expect(first?.entitlementGrantId).toBe(GRANT);
    expect(replay?.entitlementGrantId).toBe(GRANT);
    expect(bindArguments).toHaveLength(2);
    // Original source Receipt and current Reading identity must never change.
    expect(bindArguments[0]?.[0]).toBe(RECEIPT);
    expect(bindArguments[1]?.[0]).toBe(RECEIPT);
    expect(bindArguments[0]?.[1]).toBe(READING);
    expect(bindArguments[1]?.[1]).toBe(READING);
    // One verified payment -> one immutable capability effective time.
    for (const args of bindArguments) {
      expect(args?.[3]).toEqual([VERIFIED_AT]);
      expect(args?.[4]).toEqual([VERIFIED_AT]);
      expect(args?.[5]).toEqual([null]);
    }
    expect(bindArguments[0]?.[9]).toBe(bindArguments[1]?.[9]);
    // Two API arrivals still use isolated, scoped internal DB transactions.
    expect(query.mock.calls.filter(call => call[0] === 'BEGIN')).toHaveLength(4);
    expect(query.mock.calls.filter(call => call[0] === 'COMMIT')).toHaveLength(4);
  });

  it('does not issue a Reader entitlement for a non-Reader verified Receipt', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes('internal_resolve_verified_reader_receipt_fulfillment_v1')
        ? { rows: [] } : { rows: [] });
    const pool = {
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as unknown as PostgresSubjectPoolV1;

    await expect(fulfillVerifiedReaderReceiptV1({
      pool, receiptId: RECEIPT,
    })).resolves.toBeNull();
    expect(query.mock.calls.some(call =>
      call[0].includes('cmd_apply_verified_reader_receipt_bind_internal_v1'),
    )).toBe(false);
  });
});
