import { describe, expect, it, vi } from 'vitest';
import { applyVerifiedPortOneV2ReaderFullCancellationV1 } from '../apps/api/src/commerce-portone-verified-reader-full-cancellation.js';
import type { VerifiedPortOneV2FullCancellationV1 } from '../apps/api/src/portone-v2-payment-verification-adapter.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const RECEIPT = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';
const evidence: VerifiedPortOneV2FullCancellationV1 = Object.freeze({
  paymentId: 'verified-payment',
  transactionId: 'verified-transaction',
  cancellationId: 'verified-full-cancel',
  environment: 'production',
  cancelledAt: '2026-10-21T00:00:00.000Z',
  verifiedAmountMinor: 1000,
  verifiedCurrency: 'KRW',
  evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
  verifierRevision: 'verified-owner-test',
});

function result(revoke: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    contractVersion: 'portone-reader-full-cancellation-v1',
    receiptId: RECEIPT,
    providerEventId: EVENT,
    revoke,
  };
}

function mockCommercePool(dbResult: unknown) {
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        || sql === 'SET LOCAL ROLE myeongha_commerce_internal_executor') {
      return { rows: [] };
    }
    if (sql.includes('cmd_apply_verified_portone_reader_full_cancellation_v1(')) {
      return { rows: [{ result: dbResult }] };
    }
    throw new Error('Unexpected Commerce DB operation');
  });
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) }
    as unknown as PostgresSubjectPoolV1;
  const statements = () => query.mock.calls.map(([sql]) => sql);
  return { pool, query, release, statements };
}

describe('verified PortOne Reader full cancellation DB result normalization', () => {
  it('COMMITS the actual 1900 no-Grant cancellation with one Receipt and Provider Event', async () => {
    const db = mockCommercePool(result({
      contractVersion: 'official-reader-s2-no-grant-cancellation-v1',
      disposition: 'cancelled_before_grant',
      scopeCount: 0,
      grantCount: 0,
    }));
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).resolves.toEqual({
      kind: 'cancelled_before_grant',
      receiptId: RECEIPT,
      providerEventId: EVENT,
      grantCount: 0,
    });
    expect(db.statements()).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      expect.stringContaining('cmd_apply_verified_portone_reader_full_cancellation_v1('),
      'COMMIT',
    ]);
    expect(db.release).toHaveBeenCalledWith(undefined);
  });

  it.each([
    'official-reader-s2-unbound-grant-cancellation-v1',
    'official-reader-s2-revoke-dispatch-v1',
  ])('preserves actual Grant revoke outcome for %s', async (contractVersion) => {
    const db = mockCommercePool(result({ contractVersion, grantCount: 1 }));
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).resolves.toEqual({
      kind: 'revoked',
      receiptId: RECEIPT,
      providerEventId: EVENT,
      grantCount: 1,
    });
    expect(db.statements().at(-1)).toBe('COMMIT');
  });

  it.each([
    { contractVersion: 'official-reader-s2-unbound-grant-cancellation-v1', grantCount: 0 },
    { contractVersion: 'official-reader-s2-revoke-dispatch-v1', grantCount: 0 },
    { contractVersion: 'official-reader-s2-no-grant-cancellation-v1', grantCount: 0, scopeCount: 1, disposition: 'cancelled_before_grant' },
    { contractVersion: 'official-reader-s2-no-grant-cancellation-v1', grantCount: 0, scopeCount: 0, disposition: 'wrong_outcome' },
    { contractVersion: 'official-reader-s2-no-grant-cancellation-v1', grantCount: 1, scopeCount: 0, disposition: 'cancelled_before_grant' },
  ])('ROLLS BACK inconsistent/no-authority cancellation effect %#', async (effect) => {
    const db = mockCommercePool(result(effect));
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).rejects.toThrow('Verified Reader cancellation result was not authoritative.');
    expect(db.statements().at(-1)).toBe('ROLLBACK');
    expect(db.release).toHaveBeenCalledWith(undefined);
  });

  it('does not change unrelated Commerce handling or allow sandbox cancellation', async () => {
    const db = mockCommercePool({
      contractVersion: 'portone-reader-full-cancellation-v1',
      disposition: 'unrelated_commerce',
    });
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).resolves.toEqual({ kind: 'unrelated_commerce' });
    expect(db.statements().at(-1)).toBe('COMMIT');
    const sandbox = Object.freeze({ ...evidence, environment: 'sandbox' as const });
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence: sandbox,
    })).rejects.toThrow('Reader cancellation requires an original production receipt.');
    expect(db.query).toHaveBeenCalledTimes(4);
  });
});
