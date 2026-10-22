import { describe, expect, it, vi } from 'vitest';
import {
  CommerceReaderVerifiedPurchaseStatusErrorV1,
  createPostgresCommerceReaderVerifiedPurchaseStatusPortV1,
} from './commerce-reader-verified-purchase-status-v1.js';
import type {
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const READING = '22222222-2222-4222-8222-222222222222';
const READER = 'seyeon';

function authority(row: unknown) {
  const query = vi.fn(async (sql: string, args?: readonly unknown[]) => {
    expect(sql).toContain(
      'internal_qry_official_reader_verified_cancellation_status_v1',
    );
    expect(sql).not.toContain('UPDATE ');
    expect(sql).not.toContain('DELETE ');
    expect(args).toEqual([SUBJECT, READING, READER]);
    return { rows: [row], rowCount: 1 };
  });
  const client = { query } as unknown as PostgresTransactionQueryV1;
  return {
    port: createPostgresCommerceReaderVerifiedPurchaseStatusPortV1(client),
    query,
  };
}

describe('Exact Reader refund/Grant current status private DB adapter', () => {
  it('recognizes a sibling surviving verified Receipt without inferring Reader access expiry', async () => {
    const { port, query } = authority({
      state: 'current_verified_purchase',
      grantCount: '2',
    });
    expect(await port.readExactCurrentPurchase({
      subjectId: SUBJECT, readingId: READING, readerCharacterId: READER,
    })).toEqual({
      state: 'current_verified_purchase',
      currentVerifiedPurchaseGrantCount: 2,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('recognizes verified PortOne cancellation after all exact-scope active Grants are gone', async () => {
    const { port } = authority({
      state: 'verified_full_cancellation',
      grantCount: '0',
    });
    expect(await port.readExactCurrentPurchase({
      subjectId: SUBJECT, readingId: READING, readerCharacterId: READER,
    })).toEqual({
      state: 'verified_full_cancellation',
      currentVerifiedPurchaseGrantCount: 0,
    });
  });

  it('does not claim refund when current rights are unconfirmed', async () => {
    const { port } = authority({ state: 'not_confirmed', grantCount: '0' });
    expect(await port.readExactCurrentPurchase({
      subjectId: SUBJECT, readingId: READING, readerCharacterId: READER,
    })).toEqual({
      state: 'not_confirmed',
      currentVerifiedPurchaseGrantCount: 0,
    });
  });

  it.each([
    { state: 'verified_full_cancellation', grantCount: '1' },
    { state: 'current_verified_purchase', grantCount: '0' },
    { state: 'not_confirmed', grantCount: '1' },
    { state: 'pending_provider_refund', grantCount: '0' },
    { state: 'verified_full_cancellation', grantCount: '-1' },
    { state: 'verified_full_cancellation', grantCount: 0 },
    { state: 'verified_full_cancellation', grantCount: '9223372036854775808' },
    { state: 'verified_full_cancellation' },
  ])('fails closed on contradictory/incomplete Commerce status %#', async row => {
    const { port } = authority(row);
    await expect(port.readExactCurrentPurchase({
      subjectId: SUBJECT, readingId: READING, readerCharacterId: READER,
    })).rejects.toBeInstanceOf(CommerceReaderVerifiedPurchaseStatusErrorV1);
  });

  it('never accepts caller-crafted grant identifiers, payment statuses or malformed Reading selectors', async () => {
    const { port, query } = authority({
      state: 'current_verified_purchase',
      grantCount: '1',
    });
    await expect(port.readExactCurrentPurchase({
      subjectId: SUBJECT,
      readingId: 'not-a-uuid',
      readerCharacterId: READER,
    })).rejects.toBeInstanceOf(CommerceReaderVerifiedPurchaseStatusErrorV1);
    expect(query).not.toHaveBeenCalled();
  });
});
