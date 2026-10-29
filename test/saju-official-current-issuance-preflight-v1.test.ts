import { describe, expect, it, vi } from 'vitest';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  createPostgresSajuOfficialCurrentAuthorityPortV1,
  createPostgresSajuOfficialIssuancePreflightPortV1,
} from '../apps/api/src/postgres-saju-official-current-authority-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const readingId = '22222222-2222-4222-8222-222222222222';
const readingSessionId = '33333333-3333-4333-8333-333333333333';
const executionAttemptId = '44444444-4444-4444-8444-444444444444';
const sourceBirthRevisionId = '55555555-5555-4555-8555-555555555555';
const authUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const identity = { subjectId, readingId, readingSessionId, executionAttemptId, sourceBirthRevisionId };

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: { sql: string; params: readonly unknown[] }[] = [];
  admitted: unknown = true;
  resolvedSubjectId = subjectId;
  released = false;
  async query<Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, params: values });
    if (sql.includes('begin_member_subject_context_v1')) {
      return { rows: [{ subjectId: this.resolvedSubjectId, subjectKind: 'member' } as Row] };
    }
    if (sql.includes('qry_saju_official_issuance_preflight_v1')) {
      return { rows: [{ admitted: this.admitted } as Row] };
    }
    return { rows: [] };
  }
  release(): void { this.released = true; }
}

const evidence = { kind: 'member' as const, verifiedAuthUserId: authUserId };
const connectionPool = (connection: FakeConnection): PostgresSubjectPoolV1 =>
  ({ connect: () => connection });

describe('Server-only Saju Production preflight and current authority', () => {
  it('resolves the actual Subject and uses the same exact prepared identities before Saju', async () => {
    const connection = new FakeConnection();
    const preflight = createPostgresSajuOfficialIssuancePreflightPortV1({
      pool: connectionPool(connection), verifiedEvidence: evidence,
    });
    expect(await preflight.admitBeforeSourceCall(identity)).toBe(true);
    expect(connection.calls[0]?.sql).toBe('BEGIN');
    expect(connection.calls[1]?.sql).toBe('SET LOCAL ROLE myeongha_api_executor');
    expect(connection.calls.find(x => x.sql.includes('qry_saju_official_issuance_preflight_v1'))?.params)
      .toEqual([subjectId, readingId, readingSessionId, executionAttemptId, sourceBirthRevisionId]);
    expect(connection.calls.at(-1)?.sql).toBe('COMMIT');
    expect(connection.released).toBe(true);
  });

  it('fails closed for changed Subject, invalid identity or rejected initial purchase', async () => {
    const connection = new FakeConnection();
    connection.resolvedSubjectId = '66666666-6666-4666-8666-666666666666';
    const preflight = createPostgresSajuOfficialIssuancePreflightPortV1({
      pool: connectionPool(connection), verifiedEvidence: evidence,
    });
    expect(await preflight.admitBeforeSourceCall(identity)).toBe(false);
    expect(connection.calls.some(x => x.sql.includes('qry_saju_official_issuance_preflight_v1'))).toBe(false);

    const invalidConnection = new FakeConnection();
    const invalid = createPostgresSajuOfficialIssuancePreflightPortV1({
      pool: connectionPool(invalidConnection), verifiedEvidence: evidence,
    });
    expect(await invalid.admitBeforeSourceCall({ ...identity, readingId: 'not-an-id' })).toBe(false);
    expect(invalidConnection.calls).toHaveLength(0);

    const declined = new FakeConnection();
    declined.admitted = false;
    const preflightDenied = createPostgresSajuOfficialIssuancePreflightPortV1({
      pool: connectionPool(declined), verifiedEvidence: evidence,
    });
    expect(await preflightDenied.admitBeforeSourceCall(identity)).toBe(false);
  });

  it('enforces one verified boolean and never guesses authority', async () => {
    for (const value of [null, 1, 'true', undefined]) {
      const connection = new FakeConnection();
      connection.admitted = value;
      await expect(createPostgresSajuOfficialIssuancePreflightPortV1({
        pool: connectionPool(connection), verifiedEvidence: evidence,
      }).admitBeforeSourceCall(identity)).rejects.toThrow('one verified boolean');
      expect(connection.calls.at(-1)?.sql).toBe('ROLLBACK');
    }
  });

  it('rechecks the exact grant under the finalize transaction and rejects invalid digests', async () => {
    const connection = new FakeConnection();
    const authority = createPostgresSajuOfficialCurrentAuthorityPortV1(connection);
    const issue = {
      subjectId, dbReadingId: readingId, readingSessionId, executionAttemptId,
      sourceBirthRevisionId,
      sourceResponseHash: 'a'.repeat(64),
      storedResponseHash: 'b'.repeat(64),
    };
    expect(await authority.admitCurrentIssue(issue)).toBe(true);
    expect(connection.calls[0]?.params)
      .toEqual([subjectId, readingId, readingSessionId, executionAttemptId, sourceBirthRevisionId]);
    expect(await authority.admitCurrentIssue({ ...issue, storedResponseHash: 'forged' })).toBe(false);
    expect(connection.calls).toHaveLength(1);
    connection.admitted = false;
    expect(await authority.admitCurrentIssue(issue)).toBe(false);
  });
});
