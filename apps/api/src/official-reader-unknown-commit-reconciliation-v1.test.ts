import { describe, expect, it } from 'vitest';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  reconcileOfficialReaderUnknownCommitV1,
} from './official-reader-unknown-commit-reconciliation-v1.js';

const RECEIPT = '44444444-4444-4444-8444-444444444444';
const GRANT = '66666666-6666-4666-8666-666666666666';
const READING = '88888888-8888-4888-8888-888888888888';
const BUNDLE = '99999999-9999-4999-8999-999999999999';

const NO_EFFECT = Object.freeze({
  receiptId: RECEIPT,
  subjectId: '22222222-2222-4222-8222-222222222222',
  intentId: '33333333-3333-4333-8333-333333333333',
  itemKey: 'test-reader-unit',
  rowCount: 1,
  snapshotIsolation: 'read committed',
  grantCount: 0,
  eventCount: 0,
  accessCount: 0,
  outboxCount: 0,
  providerEffectCount: 0,
  grantId: null,
  grantStatus: null,
  grantActiveAtDb: null,
  eventId: null,
  accessGrantId: null,
  readingId: null,
});
const COMMITTED = Object.freeze({
  ...NO_EFFECT,
  grantCount: 1,
  eventCount: 1,
  accessCount: 1,
  outboxCount: 1,
  grantId: GRANT,
  grantStatus: 'active',
  grantActiveAtDb: true,
  grantValidFrom: '2026-01-01 00:00:00+00',
  grantValidUntil: null,
  eventId: '77777777-7777-4777-8777-777777777777',
  eventDedupeKey: 'entitlement-effect-v1-fixture',
  eventEffectiveAt: '2026-01-01 00:00:00+00',
  eventValidFrom: '2026-01-01 00:00:00+00',
  eventValidUntil: null,
  eventTargetStatus: 'active',
  accessGrantId: GRANT,
  readingId: READING,
  readingSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  accessReaderId: 'official-reader-test',
  selectedReaderId: 'official-reader-test',
  accessBundleId: BUNDLE,
  selectedBundleId: BUNDLE,
  requestContractVersion: 'standard-reading-access-bind-v2',
  requestHash: 'sha256:v1:' + '7'.repeat(64),
});

function source(input: {
  rows?: readonly Record<string, unknown>[];
  fail?: boolean;
} = {}) {
  const queries: { sql: string; values: readonly unknown[] | undefined }[] = [];
  const lifecycle: string[] = [];
  const transaction = {
    async execute<T>(fn: (c: PostgresTransactionQueryV1) => Promise<T>): Promise<T> {
      lifecycle.push('BEGIN');
      try {
        const value = await fn({
          async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
            queries.push({ sql, values });
            if (input.fail) throw new Error('database unavailable');
            return { rows: (input.rows ?? [NO_EFFECT]) as readonly Row[] };
          },
        });
        lifecycle.push('COMMIT');
        return value;
      } catch (e) {
        lifecycle.push('ROLLBACK');
        throw e;
      }
    },
  };
  return { transaction, queries, lifecycle };
}

describe('M1-10 lost COMMIT acknowledgement / no automatic new issuer', () => {
  it('does not interpret no visible Grant as a failed COMMIT or permission to retry', async () => {
    const ctx = source();
    const result = await reconcileOfficialReaderUnknownCommitV1({
      receiptId: RECEIPT, transaction: ctx.transaction,
    });
    expect(result).toEqual({
      status: 'held', reason: 'NO_COMMITTED_EFFECT_VISIBLE',
      automaticRetryAuthorized: false, publicDisclosureAuthorized: false,
    });
    expect(ctx.lifecycle).toEqual(['BEGIN', 'COMMIT']);
    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.values).toEqual([RECEIPT]);
    expect(ctx.queries[0]?.sql).toContain('transaction_timestamp()');
    expect(ctx.queries[0]?.sql).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|grant\s+execute)\b/iu);
  });

  it('observes a complete committed Grant but still holds replay and public disclosure', async () => {
    const ctx = source({ rows: [COMMITTED] });
    await expect(reconcileOfficialReaderUnknownCommitV1({
      receiptId: RECEIPT, transaction: ctx.transaction,
    })).resolves.toEqual({
      status: 'held', reason: 'COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY',
      automaticRetryAuthorized: false, publicDisclosureAuthorized: false,
    });
    expect(ctx.queries).toHaveLength(1);
  });

  it.each([
    { name: 'orphan Grant without source Event', row: { ...NO_EFFECT, grantCount: 1 } },
    { name: 'orphan Event without Grant', row: { ...NO_EFFECT, eventCount: 1 } },
    { name: 'bound Reader without complete effects', row: { ...NO_EFFECT, accessCount: 1 } },
    { name: 'provider revocation after original grant', row: { ...COMMITTED, providerEffectCount: 1 } },
    { name: 'revoked active right', row: { ...COMMITTED, grantActiveAtDb: false } },
    { name: 'mismatched Reader selection', row: { ...COMMITTED, selectedReaderId: 'not-selected' } },
    { name: 'mismatched source Event validity', row: { ...COMMITTED, eventValidFrom: '2026-02-01' } },
    { name: 'multiple Entitlement Events', row: { ...COMMITTED, eventCount: 2 } },
    { name: 'multiple pinned Capability rows', row: { ...COMMITTED, rowCount: 2 } },
    { name: 'unexpected double Outbox', row: { ...COMMITTED, outboxCount: 2 } },
    { name: 'incorrect bound Grant', row: { ...COMMITTED, accessGrantId: READING } },
  ])('holds $name without issuing anything', async ({ row }) => {
    const ctx = source({ rows: [row] });
    const result = await reconcileOfficialReaderUnknownCommitV1({
      receiptId: RECEIPT, transaction: ctx.transaction,
    });
    expect(result.reason).toBe('INCOMPLETE_OR_CONFLICTING_AUTHORITY');
    expect(result.automaticRetryAuthorized).toBe(false);
    expect(ctx.queries).toHaveLength(1);
  });

  it.each([
    { isolation: 'repeatable read', row: NO_EFFECT },
    { isolation: 'repeatable read', row: COMMITTED },
    { isolation: 'serializable', row: COMMITTED },
  ])('never classifies $isolation old snapshots as current authority', async ({ isolation, row }) => {
    const ctx = source({ rows: [{ ...row, snapshotIsolation: isolation }] });
    const result = await reconcileOfficialReaderUnknownCommitV1({
      receiptId: RECEIPT, transaction: ctx.transaction,
    });
    expect(result).toEqual({
      status: 'held',
      reason: 'STALE_SNAPSHOT_UNSUPPORTED',
      automaticRetryAuthorized: false,
      publicDisclosureAuthorized: false,
    });
    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.sql).toContain("current_setting('transaction_isolation')");
  });

  it('rejects absent and duplicate receipt-lineage evidence without automatic retry', async () => {
    for (const rows of [[], [COMMITTED, COMMITTED]]) {
      const ctx = source({ rows });
      const result = await reconcileOfficialReaderUnknownCommitV1({
        receiptId: RECEIPT, transaction: ctx.transaction,
      });
      expect(result.status).toBe('held');
      expect(result.automaticRetryAuthorized).toBe(false);
      expect(result.reason).toBe(
        rows.length === 0 ? 'SOURCE_UNAVAILABLE' : 'INCOMPLETE_OR_CONFLICTING_AUTHORITY',
      );
    }
  });

  it('invalid source and database failures always hold, never publish or retry', async () => {
    const invalid = source();
    const result = await reconcileOfficialReaderUnknownCommitV1({
      receiptId: 'malformed', transaction: invalid.transaction,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(invalid.queries).toHaveLength(0);
    const failed = source({ fail: true });
    const failedResult = await reconcileOfficialReaderUnknownCommitV1({
      receiptId: RECEIPT, transaction: failed.transaction,
    });
    expect(failedResult).toEqual({
      status: 'held', reason: 'SOURCE_UNAVAILABLE',
      automaticRetryAuthorized: false, publicDisclosureAuthorized: false,
    });
    expect(failed.lifecycle).toEqual(['BEGIN', 'ROLLBACK']);
  });
});
