import { describe, expect, it } from 'vitest';
import {
  createPostgresSajuOfficialAttemptPreparePortV1,
} from '../apps/api/src/postgres-saju-official-attempt-prepare-v1.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const readingId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const attemptId = '44444444-4444-4444-8444-444444444444';
const revisionId = '55555555-5555-4555-8555-555555555555';
const evidence = {
  kind: 'member' as const,
  verifiedAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
const request = {
  subjectId, readingId, readingSessionId: sessionId,
  executionAttemptId: attemptId, sourceBirthRevisionId: revisionId,
};

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: { sql: string; values: readonly unknown[] }[] = [];
  released = false;
  subject = subjectId;
  admitted: unknown = true;
  replayed: unknown = false;
  attemptNo: unknown = 1;
  wrongReceipt = false;
  denyPreparePermission = false;

  async query<Row = Record<string, unknown>>(
    sql: string, values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, values });
    let rows: readonly Record<string, unknown>[] = [];
    if (sql.includes('begin_member_subject_context_v1')) {
      rows = [{ subjectId: this.subject, subjectKind: 'member' }];
    } else if (sql.includes('cmd_prepare_reading_transport_attempt_v1')) {
      if (this.denyPreparePermission) throw new Error('permission denied for transport prepare');
      rows = [{
        executionAttemptId: this.wrongReceipt ? readingId : values[2],
        executionAttemptNo: this.attemptNo,
        attemptState: 'running',
        replayed: this.replayed,
      }];
    } else if (sql.includes('qry_saju_official_issuance_preflight_v1')) {
      rows = [{ admitted: this.admitted }];
    }
    return { rows: rows as readonly Row[] };
  }
  release(): void { this.released = true; }
}

function setup(connection: FakeConnection, overrides: Partial<{
  transportKey: string;
  sajuEngineKey: string;
  requestedEngineVersion: string | null;
}> = {}) {
  const pool = { connect: () => connection } satisfies PostgresSubjectPoolV1;
  return createPostgresSajuOfficialAttemptPreparePortV1({
    pool, verifiedEvidence: evidence,
    transportKey: 'saju-internal',
    sajuEngineKey: 'saju',
    requestedEngineVersion: 'v1',
    ...overrides,
  });
}

describe('official Saju transport attempt preparation (internal, Production HOLD)', () => {
  it('allocates one attempt and checks the exact purchased SELF Reading within one DB transaction', async () => {
    const connection = new FakeConnection();
    expect(await setup(connection).prepareBeforeSourceCall(request)).toBe(true);
    expect(connection.calls[0]?.sql).toBe('BEGIN');
    expect(connection.calls[1]?.sql).toBe('SET LOCAL ROLE myeongha_api_executor');
    const prepare = connection.calls.find(c => c.sql.includes('cmd_prepare_reading_transport_attempt_v1'));
    expect(prepare?.values).toEqual([
      subjectId, readingId, attemptId, 'saju-internal', 'saju', 'v1',
    ]);
    const current = connection.calls.find(c => c.sql.includes('qry_saju_official_issuance_preflight_v1'));
    expect(current?.values).toEqual([
      subjectId, readingId, sessionId, attemptId, revisionId,
    ]);
    expect(connection.calls.findIndex(c => c.sql.includes('cmd_prepare_reading_transport_attempt_v1')))
      .toBeLessThan(connection.calls.findIndex(c => c.sql.includes('qry_saju_official_issuance_preflight_v1')));
    expect(connection.calls.at(-1)?.sql).toBe('COMMIT');
    expect(connection.released).toBe(true);
  });

  it('rolls back a newly allocated attempt when the purchase is refunded or the Birth revision changes', async () => {
    for (const value of [false, null, 'true']) {
      const connection = new FakeConnection();
      connection.admitted = value;
      expect(await setup(connection).prepareBeforeSourceCall(request)).toBe(false);
      expect(connection.calls.some(c => c.sql.includes('cmd_prepare_reading_transport_attempt_v1'))).toBe(true);
      expect(connection.calls.at(-1)?.sql).toBe('ROLLBACK');
      expect(connection.calls.some(c => c.sql === 'COMMIT')).toBe(false);
      expect(connection.released).toBe(true);
    }
  });

  it('never reuses a running or terminal execution attempt for another Saju network call', async () => {
    const connection = new FakeConnection();
    connection.replayed = true;
    expect(await setup(connection).prepareBeforeSourceCall(request)).toBe(false);
    expect(connection.calls.some(c => c.sql.includes('qry_saju_official_issuance_preflight_v1'))).toBe(false);
    expect(connection.calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('allows a fresh ID for an already eligible retry without reusing the old attempt', async () => {
    const old = new FakeConnection();
    old.replayed = true;
    expect(await setup(old).prepareBeforeSourceCall(request)).toBe(false);
    const current = new FakeConnection();
    current.attemptNo = 2;
    const retryId = '66666666-6666-4666-8666-666666666666';
    expect(await setup(current).prepareBeforeSourceCall({
      ...request, executionAttemptId: retryId,
    })).toBe(true);
    expect(current.calls.find(c => c.sql.includes('cmd_prepare_reading_transport_attempt_v1'))?.values[2])
      .toBe(retryId);
  });

  it('never allocates for an unverified subject, invalid identity or invalid server transport configuration', async () => {
    const other = new FakeConnection();
    other.subject = '77777777-7777-4777-8777-777777777777';
    expect(await setup(other).prepareBeforeSourceCall(request)).toBe(false);
    expect(other.calls.some(c => c.sql.includes('cmd_prepare_reading_transport_attempt_v1'))).toBe(false);

    const invalid = new FakeConnection();
    expect(await setup(invalid).prepareBeforeSourceCall({
      ...request, executionAttemptId: 'invalid',
    })).toBe(false);
    expect(invalid.calls).toHaveLength(0);

    const invalidKey = new FakeConnection();
    expect(await setup(invalidKey, { transportKey: ' ' }).prepareBeforeSourceCall(request))
      .toBe(false);
    expect(invalidKey.calls).toHaveLength(0);
  });

  it('rolls back on a forged receipt or an unapproved SQL execute privilege', async () => {
    const forged = new FakeConnection();
    forged.wrongReceipt = true;
    await expect(setup(forged).prepareBeforeSourceCall(request))
      .rejects.toThrow(/receipt does not match/);
    expect(forged.calls.at(-1)?.sql).toBe('ROLLBACK');

    const denied = new FakeConnection();
    denied.denyPreparePermission = true;
    await expect(setup(denied).prepareBeforeSourceCall(request))
      .rejects.toThrow(/permission denied/);
    expect(denied.calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(denied.released).toBe(true);
  });
});
