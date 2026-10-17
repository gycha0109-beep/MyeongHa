import { describe, expect, it } from 'vitest';
import type {
  PostgresSubjectPoolV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import {
  createOfficialReaderUnknownCommitReadTransactionV1,
  reconcileOfficialReaderUnknownCommitWithFreshReadV1,
} from './postgres-official-reader-unknown-commit-read-tx-v1.js';

const RECEIPT = '44444444-4444-4444-8444-444444444444';
const BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY';
const ROLE = 'SET LOCAL ROLE myeongha_api_executor';

function mock(input: {
  fail?: (sql: string) => boolean;
  data?: readonly Record<string, unknown>[];
} = {}) {
  const commands: string[] = [];
  const errors: unknown[] = [];
  let releases = 0;
  let connects = 0;
  const connection = {
    async query<Row = Record<string, unknown>>(
      sql: string,
      _values?: readonly unknown[],
    ) {
      commands.push(sql);
      if (input.fail?.(sql)) throw new Error('database fault on ' + sql);
      return { rows: (input.data ?? []) as readonly Row[] };
    },
    release(error?: unknown) {
      releases++;
      errors.push(error);
    },
  };
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      connects++;
      return connection;
    },
  };
  return {
    pool, commands, errors,
    get releases() { return releases; },
    get connects() { return connects; },
  };
}

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
});

describe('M1-15 fresh read-only PostgreSQL unknown-COMMIT boundary', () => {
  it('resets pooled state, starts a fresh read-only API role transaction, reads exactly once, commits and releases', async () => {
    const ctx = mock({ data: [NO_EFFECT] });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result).toEqual({
      status: 'held', reason: 'NO_COMMITTED_EFFECT_VISIBLE',
      automaticRetryAuthorized: false, publicDisclosureAuthorized: false,
    });
    expect(ctx.commands[0]).toBe('ROLLBACK');
    expect(ctx.commands[1]).toBe(BEGIN);
    expect(ctx.commands[2]).toBe(ROLE);
    expect(ctx.commands[3]).toContain('from public.commerce_receipts');
    expect(ctx.commands[3]).toContain('current_setting');
    expect(ctx.commands[4]).toBe('COMMIT');
    expect(ctx.releases).toBe(1);
    expect(ctx.errors).toEqual([undefined]);
  });

  it('never starts a pool transaction for malformed Receipt IDs', async () => {
    const ctx = mock();
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: 'not-a-uuid',
    });
    expect(result.status).toBe('held');
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(ctx.connects).toBe(0);
    expect(ctx.commands).toEqual([]);
  });

  it('owns the transaction lifetime for each repeated read, never carrying an old snapshot across calls', async () => {
    const ctx = mock({ data: [NO_EFFECT] });
    for (let i = 0; i < 2; i++) {
      const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
        pool: ctx.pool, receiptId: RECEIPT,
      });
      expect(result.reason).toBe('NO_COMMITTED_EFFECT_VISIBLE');
    }
    expect(ctx.connects).toBe(2);
    expect(ctx.releases).toBe(2);
    expect(ctx.commands.filter(x => x === BEGIN)).toHaveLength(2);
    expect(ctx.commands.filter(x => x === 'COMMIT')).toHaveLength(2);
    expect(ctx.commands.filter(x => x === 'ROLLBACK')).toHaveLength(2);
  });

  it('rolls back and releases on exact Receipt query failure (fail-closed)', async () => {
    const ctx = mock({ fail: sql => sql.startsWith('select\n cr.id') });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(ctx.commands.slice(-1)).toEqual(['ROLLBACK']);
    expect(ctx.releases).toBe(1);
    expect(ctx.errors).toEqual([undefined]);
  });

  it('rolls back on inability to set the API role and never executes the SELECT', async () => {
    const ctx = mock({ fail: sql => sql === ROLE });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(ctx.commands).toEqual(['ROLLBACK', BEGIN, ROLE, 'ROLLBACK']);
    expect(ctx.releases).toBe(1);
  });

  it('discards a connection if initial pooled-session RESET fails', async () => {
    const ctx = mock({ fail: sql => sql === 'ROLLBACK' });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(ctx.commands).toEqual(['ROLLBACK']);
    expect(ctx.releases).toBe(1);
    expect(ctx.errors[0]).toBeInstanceOf(Error);
  });

  it('discards a connection if BEGIN fails; never leaks it to next caller', async () => {
    const ctx = mock({ fail: sql => sql === BEGIN });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(ctx.commands).toEqual(['ROLLBACK', BEGIN]);
    expect(ctx.releases).toBe(1);
    expect(ctx.errors[0]).toBeInstanceOf(Error);
  });

  it('discards a connection after an unknown COMMIT acknowledgment, even if ROLLBACK succeeds', async () => {
    const ctx = mock({
      data: [NO_EFFECT], fail: sql => sql === 'COMMIT',
    });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result).toMatchObject({
      status: 'held', reason: 'SOURCE_UNAVAILABLE',
      automaticRetryAuthorized: false, publicDisclosureAuthorized: false,
    });
    expect(ctx.commands.slice(-2)).toEqual(['COMMIT', 'ROLLBACK']);
    expect(ctx.releases).toBe(1);
    expect(ctx.errors[0]).toBeInstanceOf(Error);
  });

  it('never reuses a connection if both its canonical read and ROLLBACK fail', async () => {
    const ctx = mock({
      fail: sql => sql.startsWith('select\n cr.id') ||
        (sql === 'ROLLBACK' && ctx.commands.includes(BEGIN)),
    });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(ctx.releases).toBe(1);
    expect(ctx.errors[0]).toBeInstanceOf(Error);
    expect(ctx.commands.slice(-1)).toEqual(['ROLLBACK']);
  });

  it('rejects all noncanonical SQL and a second query without forwarding them to DB', async () => {
    const ctx = mock();
    const tx = createOfficialReaderUnknownCommitReadTransactionV1(ctx.pool);
    const bad = [
      "insert into public.entitlement_grants values (...)",
      'select 1',
      'select * from public.commerce_receipts',
    ];
    for (const sql of bad) {
      await expect(tx.execute(c => c.query(sql))).rejects.toThrow(
        'only one canonical read-only Receipt query',
      );
    }
    expect(ctx.commands.filter(sql => sql.includes('entitlement_grants'))).toHaveLength(0);
    expect(ctx.commands.filter(sql => sql === 'select 1')).toHaveLength(0);
    expect(ctx.commands.filter(sql => sql === 'COMMIT')).toHaveLength(0);
    expect(ctx.commands.filter(sql => sql === 'ROLLBACK')).toHaveLength(6);
  });

  it('requires exactly one query in its callback (no readless scope)', async () => {
    const ctx = mock();
    const tx = createOfficialReaderUnknownCommitReadTransactionV1(ctx.pool);
    await expect(tx.execute(async () => 'nothing')).rejects.toThrow('requires exactly one');
    expect(ctx.commands).toEqual(['ROLLBACK', BEGIN, ROLE, 'ROLLBACK']);
    expect(ctx.releases).toBe(1);
  });

  it('holds on stale snapshot metadata despite the owned READ COMMITTED transaction request', async () => {
    const ctx = mock({ data: [{ ...NO_EFFECT, snapshotIsolation: 'repeatable read' }] });
    const result = await reconcileOfficialReaderUnknownCommitWithFreshReadV1({
      pool: ctx.pool, receiptId: RECEIPT,
    });
    expect(result.reason).toBe('STALE_SNAPSHOT_UNSUPPORTED');
    expect(result.automaticRetryAuthorized).toBe(false);
  });
});
