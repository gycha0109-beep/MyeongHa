import { describe, expect, it } from 'vitest';
import {
  recoverAlreadyBoundOfficialReaderReceiptV1,
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
const HASH = 'sha256:v1:' + '7'.repeat(64);
const ORIGINAL_EFFECTIVE = '2026-10-16 00:00:01+00';
const ORIGINAL_VALID_FROM = '2026-10-16 00:00:01+00';

const SOURCE = Object.freeze({
  receiptId: RECEIPT,
  subjectId: SUBJECT,
  intentId: INTENT,
  itemKey: 'test-reader-unit',
  grantId: GRANT,
  eventId: EVENT,
  effectiveAt: ORIGINAL_EFFECTIVE,
  validFrom: ORIGINAL_VALID_FROM,
  validUntil: null,
  reasonCode: null,
  readingId: READING,
  sessionId: SESSION,
  requestHash: HASH,
  contractVersion: 'standard-reading-access-bind-v2',
  rowCount: 1,
});

interface Trace {
  readonly sql: string[];
  readonly params: (readonly unknown[] | undefined)[];
  readonly lifecycle: string[];
}

function fixture(input: {
  readonly source?: readonly Record<string, unknown>[];
  readonly deny?: 'issue' | 'bind' | 'current';
  readonly wrongReplay?: 'issue' | 'bind';
  readonly active?: boolean;
} = {}): { readonly transaction: PrivateOfficialReaderRecoveryTransactionPortV1;
  readonly trace: Trace } {
  const trace: Trace = { sql: [], params: [], lifecycle: [] };
  const client: PostgresTransactionQueryV1 = {
    async query<Row = Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ): Promise<{ rows: readonly Row[] }> {
      trace.sql.push(sql);
      trace.params.push(values);
      if (sql.includes('from public.commerce_receipts cr')) {
        return { rows: (input.source ?? [SOURCE]) as readonly Row[] };
      }
      if (sql.includes("set_config('myeongha.subject_id'")) {
        return { rows: [] };
      }
      if (sql.includes('internal_apply_official_reader_unified_receipt_v1')) {
        if (input.deny === 'issue') throw new Error('private issuer permission denied');
        return { rows: [{
          itemKey: SOURCE.itemKey,
          grantId: GRANT,
          replayed: input.wrongReplay === 'issue' ? false : true,
        } as Row] };
      }
      if (sql.includes('internal_cmd_bind_official_reader_unified_v1')) {
        if (input.deny === 'bind') throw new Error('synthetic failed bind');
        return { rows: [{
          readingId: READING,
          grantId: GRANT,
          replayed: input.wrongReplay === 'bind' ? false : true,
        } as Row] };
      }
      if (sql.includes('select exists(')) {
        if (input.deny === 'current') throw new Error('current-right read failure');
        return { rows: [{ active: input.active ?? true } as Row] };
      }
      throw new Error('Unexpected SQL: ' + sql);
    },
  };

  return {
    trace,
    transaction: {
      async execute<T>(
        callback: (scope: PostgresTransactionQueryV1) => Promise<T>,
      ): Promise<T> {
        trace.lifecycle.push('BEGIN');
        try {
          const result = await callback(client);
          trace.lifecycle.push('COMMIT');
          return result;
        } catch (error) {
          trace.lifecycle.push('ROLLBACK');
          throw error;
        }
      },
    },
  };
}

describe('M1-07 private owner replay-only Reader recovery', () => {
  it('replays only original DB event semantics and existing bind in ONE transaction', async () => {
    const { transaction, trace } = fixture();
    const result = await recoverAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: RECEIPT,
    });

    expect(result).toEqual({ status: 'replayed', publicDisclosureAuthorized: false });
    expect(trace.lifecycle).toEqual(['BEGIN', 'COMMIT']);
    expect(trace.sql).toHaveLength(5);
    expect(trace.params[0]).toEqual([RECEIPT]);
    expect(trace.params[1]).toEqual([SUBJECT]);
    expect(trace.params[2]).toEqual([
      RECEIPT, SOURCE.itemKey, ORIGINAL_EFFECTIVE,
      ORIGINAL_VALID_FROM, null, null,
    ]);
    expect(trace.params[3]).toEqual([
      SUBJECT, INTENT, SESSION, READING, HASH,
      'standard-reading-access-bind-v2',
      JSON.stringify({
        schemaVersion: 'standard-reading-access-bind-v2',
        purchaseIntentId: INTENT,
      }),
    ]);
    expect(trace.params[4]).toEqual([GRANT, RECEIPT, SUBJECT, INTENT, READING]);
    expect(trace.sql.every((sql) => !sql.includes('cmd_persist_verified_payment_evidence_v1'))).toBe(true);
    expect(trace.sql.every((sql) => !sql.includes('SET LOCAL ROLE'))).toBe(true);
  });

  it.each([
    { name: 'unissued Receipt', source: [] },
    { name: 'missing original granted event', source: [{ ...SOURCE, eventId: null }] },
    { name: 'unbound Reader', source: [{ ...SOURCE, readingId: null }] },
    { name: 'missing source validity', source: [{ ...SOURCE, effectiveAt: null }] },
    { name: 'wrong binder contract', source: [{ ...SOURCE, contractVersion: 'legacy' }] },
    { name: 'multiple pinned Capability rows', source: [{ ...SOURCE, rowCount: 2 }] },
    { name: 'duplicate original provenance rows', source: [SOURCE, SOURCE] },
    { name: 'ineligible receipt lineage', source: [{ ...SOURCE, receiptId: SUBJECT }] },
  ])('HOLDs $name without calling D2 writers', async ({ source }) => {
    const { transaction, trace } = fixture({ source });
    await expect(recoverAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: RECEIPT,
    })).resolves.toEqual({ status: 'held', publicDisclosureAuthorized: false });
    expect(trace.lifecycle).toEqual(['BEGIN', 'COMMIT']);
    expect(trace.sql).toHaveLength(1);
  });

  it('rejects invalid input before acquiring any private transaction', async () => {
    const { transaction, trace } = fixture();
    await expect(recoverAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: 'not-a-receipt',
    })).rejects.toThrow('valid Receipt UUID');
    expect(trace.lifecycle).toEqual([]);
  });

  it.each([
    { deny: 'issue' },
    { deny: 'bind' },
    { deny: 'current' },
  ] as const)('rolls back when $deny fails without returning success', async ({ deny }) => {
    const { transaction, trace } = fixture({ deny });
    await expect(recoverAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: RECEIPT,
    })).rejects.toThrow();
    expect(trace.lifecycle).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it.each(['issue', 'bind'] as const)(
    'rolls back when D2 %s did not return the original replay',
    async (wrongReplay) => {
      const { transaction, trace } = fixture({ wrongReplay });
      await expect(recoverAlreadyBoundOfficialReaderReceiptV1({
        transaction, receiptId: RECEIPT,
      })).rejects.toThrow('replay authority changed');
      expect(trace.lifecycle).toEqual(['BEGIN', 'ROLLBACK']);
    },
  );

  it('rolls back if a current Grant was revoked before transaction validation', async () => {
    const { transaction, trace } = fixture({ active: false });
    await expect(recoverAlreadyBoundOfficialReaderReceiptV1({
      transaction, receiptId: RECEIPT,
    })).rejects.toThrow('not currently active');
    expect(trace.lifecycle).toEqual(['BEGIN', 'ROLLBACK']);
  });
});
