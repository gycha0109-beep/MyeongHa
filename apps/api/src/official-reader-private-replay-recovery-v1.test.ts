import { describe, expect, it } from 'vitest';
import {
  preflightAlreadyBoundOfficialReaderReceiptV1,
  type PrivateOfficialReaderRecoveryTransactionPortV1,
} from './official-reader-private-replay-recovery-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const RECEIPT = '44444444-4444-4444-8444-444444444444';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const INTENT = '33333333-3333-4333-8333-333333333333';
const GRANT = '66666666-6666-4666-8666-666666666666';
const EVENT = '77777777-7777-4777-8777-777777777777';
const READING = '88888888-8888-4888-8888-888888888888';
const SESSION = '99999999-9999-4999-8999-999999999999';

const SOURCE = Object.freeze({
  receiptId: RECEIPT,
  subjectId: SUBJECT,
  intentId: INTENT,
  itemKey: 'test-reader-unit',
  grantId: GRANT,
  eventId: EVENT,
  effectiveAt: '2026-10-16 00:00:01+00',
  validFrom: '2026-10-16 00:00:01+00',
  validUntil: null,
  reasonCode: null,
  readingId: READING,
  sessionId: SESSION,
  requestHash: 'sha256:v1:' + '7'.repeat(64),
  contractVersion: 'standard-reading-access-bind-v2',
  rowCount: 1,
});

function fixture(input: {
  readonly rows?: readonly Record<string, unknown>[];
  readonly readError?: boolean;
} = {}): {
  readonly transaction: PrivateOfficialReaderRecoveryTransactionPortV1;
  readonly lifecycle: string[];
  readonly queries: { sql: string; args: readonly unknown[] | undefined }[];
} {
  const lifecycle: string[] = [];
  const queries: { sql: string; args: readonly unknown[] | undefined }[] = [];
  const client: PostgresTransactionQueryV1 = {
    async query<Row = Record<string, unknown>>(
      sql: string,
      args?: readonly unknown[],
    ): Promise<{ rows: readonly Row[] }> {
      queries.push({ sql, args });
      if (input.readError) throw new Error('synthetic private reader DB read failed');
      if (!sql.includes('from public.commerce_receipts cr')) {
        throw new Error('Private recovery preflight attempted SQL beyond read-only query.');
      }
      return { rows: (input.rows ?? [SOURCE]) as readonly Row[] };
    },
  };
  const transaction: PrivateOfficialReaderRecoveryTransactionPortV1 = {
    async execute<T>(callback: (scope: PostgresTransactionQueryV1) => Promise<T>): Promise<T> {
      lifecycle.push('BEGIN');
      try {
        const result = await callback(client);
        lifecycle.push('COMMIT');
        return result;
      } catch (error) {
        lifecycle.push('ROLLBACK');
        throw error;
      }
    },
  };
  return { transaction, lifecycle, queries };
}

describe('M1-07 private Reader Receipt recovery preflight is runtime read-only', () => {
  it('recognizes complete original authority but HOLDS private replay and disclosure', async () => {
    const { transaction, lifecycle, queries } = fixture();
    await expect(preflightAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: RECEIPT,
    })).resolves.toEqual({
      status: 'held',
      reason: 'PRIVATE_WRITER_NOT_AUTHORIZED',
      publicDisclosureAuthorized: false,
    });
    expect(lifecycle).toEqual(['BEGIN', 'COMMIT']);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.args).toEqual([RECEIPT]);
    expect(queries[0]?.sql).toContain("eg.status='active'");
    expect(queries[0]?.sql).toContain("ee.event_type='granted'");
    expect(queries[0]?.sql).toContain("a.entitlement_grant_id=eg.id");
    expect(queries[0]?.sql).not.toMatch(/\b(insert|update|delete|grant|revoke)\s+(into|on|from|public)/iu);
  });

  it.each([
    { name: 'unissued Receipt', rows: [] },
    { name: 'missing original granted event', rows: [{ ...SOURCE, eventId: null }] },
    { name: 'unbound Reader', rows: [{ ...SOURCE, readingId: null }] },
    { name: 'missing original timestamp', rows: [{ ...SOURCE, effectiveAt: null }] },
    { name: 'wrong stored bind request', rows: [{ ...SOURCE, contractVersion: 'legacy' }] },
    { name: 'multiple pinned Capability rows', rows: [{ ...SOURCE, rowCount: 2 }] },
    { name: 'duplicate matching original events', rows: [SOURCE, SOURCE] },
    { name: 'different Receipt identity', rows: [{ ...SOURCE, receiptId: SUBJECT }] },
  ])('HOLDs $name without mutation', async ({ rows }) => {
    const { transaction, queries, lifecycle } = fixture({ rows });
    await expect(preflightAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: RECEIPT,
    })).resolves.toEqual({
      status: 'held',
      reason: 'UNFULFILLED_OR_UNAUTHORIZED',
      publicDisclosureAuthorized: false,
    });
    expect(queries).toHaveLength(1);
    expect(lifecycle).toEqual(['BEGIN', 'COMMIT']);
  });

  it('rejects invalid Receipt before starting a transaction', async () => {
    const { transaction, lifecycle, queries } = fixture();
    await expect(preflightAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: 'not-a-uuid',
    })).rejects.toThrow('valid Receipt UUID');
    expect(lifecycle).toEqual([]);
    expect(queries).toEqual([]);
  });

  it('propagates a source read failure and requires transaction rollback', async () => {
    const { transaction, lifecycle, queries } = fixture({ readError: true });
    await expect(preflightAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: RECEIPT,
    })).rejects.toThrow('DB read failed');
    expect(lifecycle).toEqual(['BEGIN', 'ROLLBACK']);
    expect(queries).toHaveLength(1);
  });
});
