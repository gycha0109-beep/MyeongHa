import { describe, expect, it } from 'vitest';
import { createPostgresSajuOfficialAttemptFailurePortV1 } from
  '../apps/api/src/postgres-saju-official-attempt-failure-v1.js';
import type {
  PostgresQueryResultV1, PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const readingId = '22222222-2222-4222-8222-222222222222';
const executionAttemptId = '44444444-4444-4444-8444-444444444444';
const source = {
  subjectId, readingId, executionAttemptId,
  retryable: true, errorCode: 'SOURCE_NETWORK_TIMEOUT',
  externalRequestRef: null,
};

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: { sql: string; values: readonly unknown[] }[] = [];
  resolvedSubject = subjectId;
  replayed = false;
  mismatchReceipt = false;
  denyWrite = false;
  released = false;
  async query<Row = Record<string, unknown>>(
    sql: string, values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, values });
    let rows: readonly Record<string, unknown>[] = [];
    if (sql.includes('begin_member_subject_context_v1')) {
      rows = [{ subjectId: this.resolvedSubject, subjectKind: 'member' }];
    } else if (sql.includes('cmd_finalize_reading_transport_failure_v1')) {
      if (this.denyWrite) throw new Error('permission denied: transport failure writer');
      rows = [{
        executionAttemptId: this.mismatchReceipt ? readingId : values[2],
        executionAttemptNo: 2,
        attemptState: values[3] ? 'failed_retryable' : 'failed_final',
        readingState: values[3] ? 'running' : 'failed',
        replayed: this.replayed,
      }];
    }
    return { rows: rows as readonly Row[] };
  }
  release(): void { this.released = true; }
}

function port(connection: FakeConnection) {
  return createPostgresSajuOfficialAttemptFailurePortV1({
    pool: { connect: () => connection } satisfies PostgresSubjectPoolV1,
    verifiedEvidence: {
      kind: 'member', verifiedAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
  });
}

describe('official Saju transport failure, governed DB state only', () => {
  it('finalizes a trusted transient classification under the correct Subject', async () => {
    const c = new FakeConnection();
    expect(await port(c).finalizeClassifiedFailure(source)).toEqual({
      state: 'recorded', attemptState: 'failed_retryable',
      replayed: false, canRetry: false,
    });
    expect(c.calls[0]?.sql).toBe('BEGIN');
    expect(c.calls[1]?.sql).toBe('SET LOCAL ROLE myeongha_api_executor');
    const write = c.calls.find(x => x.sql.includes('cmd_finalize_reading_transport_failure_v1'));
    expect(write?.values).toEqual([
      subjectId, readingId, executionAttemptId, true,
      'SOURCE_NETWORK_TIMEOUT', null,
    ]);
    expect(c.calls.at(-1)?.sql).toBe('COMMIT');
    expect(c.released).toBe(true);
  });

  it('preserves the approved final-failure disposition without enabling reissue', async () => {
    const c = new FakeConnection();
    expect(await port(c).finalizeClassifiedFailure({
      ...source, retryable: false, errorCode: 'SOURCE_REJECTED',
      externalRequestRef: 'issuer-reference',
    })).toEqual({
      state: 'recorded', attemptState: 'failed_final',
      replayed: false, canRetry: false,
    });
    expect(c.calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('accepts only an exact same terminal DB replay, never a new source request', async () => {
    const c = new FakeConnection();
    c.replayed = true;
    expect(await port(c).finalizeClassifiedFailure(source)).toMatchObject({
      state: 'recorded', replayed: true, canRetry: false,
    });
  });

  it('rejects wrong subject or invalid caller-controlled failure evidence before mutation', async () => {
    const c = new FakeConnection();
    c.resolvedSubject = '33333333-3333-4333-8333-333333333333';
    expect(await port(c).finalizeClassifiedFailure(source)).toEqual({
      state: 'held', canRetry: false,
    });
    expect(c.calls.some(x => x.sql.includes('cmd_finalize_reading_transport_failure_v1')))
      .toBe(false);

    for (const invalid of [
      { ...source, executionAttemptId: 'bad' },
      { ...source, errorCode: 'user raw error text' },
      { ...source, externalRequestRef: ' ' },
      { ...source, retryable: 'yes' as unknown as boolean },
    ]) {
      const local = new FakeConnection();
      expect(await port(local).finalizeClassifiedFailure(invalid)).toEqual({
        state: 'held', canRetry: false,
      });
      expect(local.calls).toHaveLength(0);
    }
  });

  it('rolls back mismatched receipts and missing operational SQL privileges', async () => {
    const mismatch = new FakeConnection();
    mismatch.mismatchReceipt = true;
    await expect(port(mismatch).finalizeClassifiedFailure(source)).rejects.toThrow(/conflicts/);
    expect(mismatch.calls.at(-1)?.sql).toBe('ROLLBACK');

    const denied = new FakeConnection();
    denied.denyWrite = true;
    await expect(port(denied).finalizeClassifiedFailure(source)).rejects.toThrow(/permission denied/);
    expect(denied.calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(denied.released).toBe(true);
  });
});
