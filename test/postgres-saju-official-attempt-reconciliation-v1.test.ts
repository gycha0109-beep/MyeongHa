import { describe, expect, it } from 'vitest';
import {
  createPostgresSajuOfficialAttemptReconciliationPortV1,
} from '../apps/api/src/postgres-saju-official-attempt-reconciliation-v1.js';
import type {
  PostgresQueryResultV1, PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const readingId = '22222222-2222-4222-8222-222222222222';
const attemptId = '44444444-4444-4444-8444-444444444444';
const identity = { subjectId, readingId, executionAttemptId: attemptId };

class Connection implements PostgresSubjectConnectionV1 {
  readonly calls: { sql: string; values: readonly unknown[] }[] = [];
  owner = subjectId;
  rows: readonly Record<string, unknown>[] = [{
    executionAttemptNo: 2, attemptState: 'running',
    readingState: 'running', isCommittedSource: false,
  }];
  denied = false;
  released = false;

  async query<Row = Record<string, unknown>>(
    sql: string, values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, values });
    if (sql.includes('begin_member_subject_context_v1')) {
      return { rows: [{ subjectId: this.owner, subjectKind: 'member' }] as Row[] };
    }
    if (sql.includes('qry_saju_official_attempt_reconciliation_status_v1')) {
      if (this.denied) throw new Error('permission denied for protected attempt status');
      return { rows: this.rows as readonly Row[] };
    }
    return { rows: [] };
  }

  release(): void { this.released = true; }
}

function make(connection: Connection) {
  return createPostgresSajuOfficialAttemptReconciliationPortV1({
    pool: { connect: () => connection } satisfies PostgresSubjectPoolV1,
    verifiedEvidence: {
      kind: 'member', verifiedAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
  });
}

describe('internal official Saju attempt reconciliation observation', () => {
  it('reads exact owner/Reading/Attempt state without authorizing retry or disclosure', async () => {
    const connection = new Connection();
    expect(await make(connection).observe(identity)).toEqual({
      state: 'observed', attemptNo: 2, attemptState: 'running',
      readingState: 'running', isCommittedSource: false,
      requiresIssuerReconciliation: true,
      canRetry: false, canDisclose: false,
    });
    expect(connection.calls[0]?.sql).toBe('BEGIN');
    expect(connection.calls[1]?.sql).toBe('SET LOCAL ROLE myeongha_api_executor');
    const scoped = connection.calls.find(x =>
      x.sql.includes('qry_saju_official_attempt_reconciliation_status_v1'));
    expect(scoped?.values).toEqual([subjectId, readingId, attemptId]);
    expect(connection.calls.at(-1)?.sql).toBe('COMMIT');
    expect(connection.released).toBe(true);
  });

  it('holds all failed and ambiguous states until Saju issuer confirmation', async () => {
    for (const [attemptState, readingState] of [
      ['failed_retryable', 'running'], ['failed_final', 'failed'],
      ['failed_retryable', 'succeeded'],
    ] as const) {
      const connection = new Connection();
      connection.rows = [{
        executionAttemptNo: 1, attemptState, readingState,
        isCommittedSource: false,
      }];
      expect(await make(connection).observe(identity)).toMatchObject({
        state: 'observed', attemptState, readingState,
        requiresIssuerReconciliation: true, canRetry: false, canDisclose: false,
      });
    }
  });

  it('identifies a successfully committed attempt without granting its report body', async () => {
    const connection = new Connection();
    connection.rows = [{
      executionAttemptNo: 2, attemptState: 'succeeded',
      readingState: 'succeeded', isCommittedSource: true,
    }];
    expect(await make(connection).observe(identity)).toMatchObject({
      state: 'observed', isCommittedSource: true,
      requiresIssuerReconciliation: false, canRetry: false, canDisclose: false,
    });
  });

  it('hides revoked purchase, wrong owner and invalid IDs', async () => {
    const revoked = new Connection();
    revoked.rows = [];
    expect(await make(revoked).observe(identity)).toEqual({
      state: 'unavailable', canRetry: false, canDisclose: false,
    });
    const crossSubject = new Connection();
    crossSubject.owner = '55555555-5555-4555-8555-555555555555';
    expect(await make(crossSubject).observe(identity)).toEqual({
      state: 'unavailable', canRetry: false, canDisclose: false,
    });
    expect(crossSubject.calls.some(x =>
      x.sql.includes('qry_saju_official_attempt_reconciliation_status_v1'))).toBe(false);

    const bad = new Connection();
    expect(await make(bad).observe({ ...identity, executionAttemptId: 'bad' }))
      .toMatchObject({ state: 'unavailable', canRetry: false });
    expect(bad.calls).toHaveLength(0);
  });

  it('rejects malformed or duplicate PostgreSQL status and rolls back', async () => {
    const cases: readonly (readonly Record<string, unknown>[])[] = [
      [{ executionAttemptNo: 0, attemptState: 'running', readingState: 'running', isCommittedSource: false }],
      [{ executionAttemptNo: 1, attemptState: 'unknown', readingState: 'running', isCommittedSource: false }],
      [{ executionAttemptNo: 1, attemptState: 'succeeded', readingState: 'succeeded', isCommittedSource: false }],
      [{ executionAttemptNo: 1, attemptState: 'running', readingState: 'running', isCommittedSource: true }],
      [
        { executionAttemptNo: 1, attemptState: 'running', readingState: 'running', isCommittedSource: false },
        { executionAttemptNo: 2, attemptState: 'running', readingState: 'running', isCommittedSource: false },
      ],
    ];
    for (const rows of cases) {
      const connection = new Connection();
      connection.rows = rows;
      await expect(make(connection).observe(identity)).rejects.toThrow(/inconsistent/);
      expect(connection.calls.at(-1)?.sql).toBe('ROLLBACK');
    }
  });

  it('does not broaden the normal API executor rights when database permission is absent', async () => {
    const connection = new Connection();
    connection.denied = true;
    await expect(make(connection).observe(identity)).rejects.toThrow(/permission denied/);
    expect(connection.calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(connection.released).toBe(true);
  });
});
