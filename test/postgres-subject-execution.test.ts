import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  executePostgresSubjectTransactionV1,
  POSTGRES_SUBJECT_EXECUTION_BINDINGS_V1,
  type PostgresQueryResultV1,
  type PostgresSubjectConnectionV1,
  type PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const MEMBER_AUTH_USER_ID = '91000000-0000-0000-0000-000000000001';
const MEMBER_SUBJECT_ID = '92000000-0000-0000-0000-000000000001';
const GUEST_SUBJECT_ID = '93000000-0000-0000-0000-000000000001';
const GUEST_TOKEN_HASH = 'guest-token-fingerprint-v1';

type QueryCall = Readonly<{
  text: string;
  values: readonly unknown[];
}>;

function postgresError(constraint: string): Error & {
  code: string;
  constraint: string;
} {
  return Object.assign(new Error(constraint), {
    code: '28000',
    constraint,
  });
}

class FakePostgresSubjectConnectionV1 implements PostgresSubjectConnectionV1 {
  readonly calls: QueryCall[] = [];
  readonly releases: unknown[] = [];

  memberRows: readonly Record<string, unknown>[] = [
    { subjectId: MEMBER_SUBJECT_ID, subjectKind: 'member' },
  ];
  guestRows: readonly Record<string, unknown>[] = [
    { subjectId: GUEST_SUBJECT_ID, subjectKind: 'guest' },
  ];
  memberError: unknown;
  guestError: unknown;
  rollbackError: unknown;

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push(Object.freeze({ text, values: Object.freeze([...values]) }));

    if (text.includes('begin_member_subject_context_v1')) {
      if (this.memberError !== undefined) throw this.memberError;
      return { rows: this.memberRows as readonly Row[] };
    }

    if (text.includes('begin_guest_subject_context_v1')) {
      if (this.guestError !== undefined) throw this.guestError;
      return { rows: this.guestRows as readonly Row[] };
    }

    if (text === 'ROLLBACK' && this.rollbackError !== undefined) {
      throw this.rollbackError;
    }

    return { rows: [] };
  }

  release(error?: unknown): void {
    this.releases.push(error);
  }
}

class FakePostgresSubjectPoolV1 implements PostgresSubjectPoolV1 {
  constructor(readonly connection: FakePostgresSubjectConnectionV1) {}

  connect(): FakePostgresSubjectConnectionV1 {
    return this.connection;
  }
}

function callTexts(connection: FakePostgresSubjectConnectionV1): string[] {
  return connection.calls.map((call) => call.text);
}

describe('PostgreSQL subject execution adapter', () => {
  it('pins the adapter to the decided P0-AUTH-01 PostgreSQL authorities', () => {
    expect(POSTGRES_SUBJECT_EXECUTION_BINDINGS_V1).toEqual({
      executionRole: 'myeongha_api_executor',
      resolveMemberSubject: 'public.begin_member_subject_context_v1',
      resolveGuestSubject: 'public.begin_guest_subject_context_v1',
      assertSubjectContext: 'public.assert_myeongha_subject_context_v1',
    });
  });

  it('resolves and binds a member before running the authority work in the same transaction', async () => {
    const connection = new FakePostgresSubjectConnectionV1();
    const pool = new FakePostgresSubjectPoolV1(connection);

    const result = await executePostgresSubjectTransactionV1({
      pool,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: MEMBER_AUTH_USER_ID,
      },
      execute: async ({ resolvedSubject, client }) => {
        expect(resolvedSubject).toEqual({
          subjectId: MEMBER_SUBJECT_ID,
          subjectKind: 'member',
        });
        await client.query('select authority_work($1::uuid)', [resolvedSubject.subjectId]);
        return 'done';
      },
    });

    expect(result).toBe('done');
    expect(callTexts(connection)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.begin_member_subject_context_v1($1::uuid)'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      'select authority_work($1::uuid)',
      'COMMIT',
    ]);
    expect(connection.calls[2]?.values).toEqual([MEMBER_AUTH_USER_ID]);
    expect(connection.calls[3]?.values).toEqual([MEMBER_SUBJECT_ID]);
    expect(connection.calls[4]?.values).toEqual([MEMBER_SUBJECT_ID]);
    expect(connection.releases).toEqual([undefined]);
  });

  it('uses only the verified Guest fingerprint to resolve and bind a guest', async () => {
    const connection = new FakePostgresSubjectConnectionV1();
    const pool = new FakePostgresSubjectPoolV1(connection);

    await executePostgresSubjectTransactionV1({
      pool,
      verifiedEvidence: {
        kind: 'guest',
        verifiedGuestTokenHash: GUEST_TOKEN_HASH,
      },
      execute: ({ resolvedSubject }) => {
        expect(resolvedSubject).toEqual({
          subjectId: GUEST_SUBJECT_ID,
          subjectKind: 'guest',
        });
      },
    });

    expect(callTexts(connection)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.begin_guest_subject_context_v1($1::text)'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      'COMMIT',
    ]);
    expect(connection.calls[2]?.values).toEqual([GUEST_TOKEN_HASH]);
    expect(connection.calls[3]?.values).toEqual([GUEST_SUBJECT_ID]);
  });

  it('maps an unresolved PostgreSQL identity to AUTH_REQUIRED and rolls the transaction back', async () => {
    const connection = new FakePostgresSubjectConnectionV1();
    connection.memberError = postgresError('member_subject_context_unresolved');
    const pool = new FakePostgresSubjectPoolV1(connection);
    let executed = false;

    await expect(
      executePostgresSubjectTransactionV1({
        pool,
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: MEMBER_AUTH_USER_ID,
        },
        execute: () => {
          executed = true;
        },
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    } satisfies Partial<ApiCommandError>);

    expect(executed).toBe(false);
    expect(callTexts(connection).at(-1)).toBe('ROLLBACK');
    expect(callTexts(connection)).not.toContain('COMMIT');
    expect(connection.releases).toEqual([undefined]);
  });

  it('rolls back and releases the connection when authority work fails', async () => {
    const connection = new FakePostgresSubjectConnectionV1();
    const pool = new FakePostgresSubjectPoolV1(connection);
    const authorityFailure = new Error('authority failed');

    await expect(
      executePostgresSubjectTransactionV1({
        pool,
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: MEMBER_AUTH_USER_ID,
        },
        execute: () => {
          throw authorityFailure;
        },
      }),
    ).rejects.toBe(authorityFailure);

    expect(callTexts(connection).at(-1)).toBe('ROLLBACK');
    expect(callTexts(connection)).not.toContain('COMMIT');
    expect(connection.releases).toEqual([undefined]);
  });

  it('fails closed on resolver kind drift and never exposes the execution scope', async () => {
    const connection = new FakePostgresSubjectConnectionV1();
    connection.memberRows = [
      { subjectId: MEMBER_SUBJECT_ID, subjectKind: 'guest' },
    ];
    const pool = new FakePostgresSubjectPoolV1(connection);
    let executed = false;

    await expect(
      executePostgresSubjectTransactionV1({
        pool,
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: MEMBER_AUTH_USER_ID,
        },
        execute: () => {
          executed = true;
        },
      }),
    ).rejects.toThrow('different subject kind');

    expect(executed).toBe(false);
    expect(callTexts(connection).at(-1)).toBe('ROLLBACK');
  });

  it('marks the connection for discard if rollback itself fails', async () => {
    const connection = new FakePostgresSubjectConnectionV1();
    const rollbackFailure = new Error('rollback failed');
    connection.rollbackError = rollbackFailure;
    const pool = new FakePostgresSubjectPoolV1(connection);

    await expect(
      executePostgresSubjectTransactionV1({
        pool,
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: MEMBER_AUTH_USER_ID,
        },
        execute: () => {
          throw new Error('authority failed');
        },
      }),
    ).rejects.toBeInstanceOf(AggregateError);

    expect(connection.releases).toEqual([rollbackFailure]);
  });
});
