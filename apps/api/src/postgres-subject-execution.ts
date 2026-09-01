import {
  resolveSubjectIdentity,
  type ResolvedSubjectContextV1,
  type ResolvedSubjectKindV1,
  type SubjectIdentityResolutionPortV1,
  type VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

type Awaitable<T> = T | Promise<T>;

export const POSTGRES_SUBJECT_EXECUTION_BINDINGS_V1 = Object.freeze({
  executionRole: 'myeongha_api_executor',
  resolveMemberSubject: 'public.begin_member_subject_context_v1',
  resolveGuestSubject: 'public.begin_guest_subject_context_v1',
  assertSubjectContext: 'public.assert_myeongha_subject_context_v1',
} as const);

export interface PostgresQueryResultV1<Row = Record<string, unknown>> {
  readonly rows: readonly Row[];
}

export interface PostgresTransactionQueryV1 {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Awaitable<PostgresQueryResultV1<Row>>;
}

export interface PostgresSubjectConnectionV1 extends PostgresTransactionQueryV1 {
  release(error?: unknown): void;
}

export interface PostgresSubjectPoolV1 {
  connect(): Awaitable<PostgresSubjectConnectionV1>;
}

export interface PostgresSubjectExecutionScopeV1 {
  readonly resolvedSubject: ResolvedSubjectContextV1;
  readonly client: PostgresTransactionQueryV1;
}

export interface ExecutePostgresSubjectTransactionInputV1<T> {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly execute: (
    scope: PostgresSubjectExecutionScopeV1,
  ) => Awaitable<T>;
}

type ResolverRowV1 = Readonly<{
  subjectId: unknown;
  subjectKind: unknown;
}>;

const BEGIN_SQL = 'BEGIN';
const ENTER_EXECUTION_ROLE_SQL = 'SET LOCAL ROLE myeongha_api_executor';
const COMMIT_SQL = 'COMMIT';
const ROLLBACK_SQL = 'ROLLBACK';

const RESOLVE_MEMBER_SQL = `
select
  subject_id::text as "subjectId",
  subject_kind as "subjectKind"
from public.begin_member_subject_context_v1($1::uuid)
`.trim();

const RESOLVE_GUEST_SQL = `
select
  subject_id::text as "subjectId",
  subject_kind as "subjectKind"
from public.begin_guest_subject_context_v1($1::text)
`.trim();

const ASSERT_SUBJECT_CONTEXT_SQL = `
select public.assert_myeongha_subject_context_v1($1::uuid)
`.trim();

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
}

function requireResolverRow(
  rows: readonly ResolverRowV1[],
  expectedKind: ResolvedSubjectKindV1,
): ResolvedSubjectContextV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('PostgreSQL subject resolver did not return exactly one canonical subject.');
  }

  if (typeof row.subjectId !== 'string' || row.subjectId.trim().length === 0) {
    throw new Error('PostgreSQL subject resolver returned an invalid canonical subject id.');
  }
  if (row.subjectKind !== expectedKind) {
    throw new Error('PostgreSQL subject resolver returned a different subject kind.');
  }

  return Object.freeze({
    subjectId: row.subjectId,
    subjectKind: expectedKind,
  });
}

class TransactionSubjectIdentityResolutionPortV1
  implements SubjectIdentityResolutionPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async resolveMemberSubject(input: {
    readonly verifiedAuthUserId: string;
  }): Promise<ResolvedSubjectContextV1 | null> {
    try {
      const result = await this.client.query<ResolverRowV1>(RESOLVE_MEMBER_SQL, [
        input.verifiedAuthUserId,
      ]);
      return requireResolverRow(result.rows, 'member');
    } catch (error) {
      if (isPostgresConstraint(error, 'member_subject_context_unresolved')) {
        return null;
      }
      throw error;
    }
  }

  async resolveGuestSubject(input: {
    readonly verifiedGuestTokenHash: string;
  }): Promise<ResolvedSubjectContextV1 | null> {
    try {
      const result = await this.client.query<ResolverRowV1>(RESOLVE_GUEST_SQL, [
        input.verifiedGuestTokenHash,
      ]);
      return requireResolverRow(result.rows, 'guest');
    } catch (error) {
      if (isPostgresConstraint(error, 'guest_subject_context_unresolved')) {
        return null;
      }
      throw error;
    }
  }
}

/**
 * Executes one ordinary-user PostgreSQL slice under the decided P0-AUTH-01 model.
 *
 * The canonical subject is resolved and transaction-locally bound before the
 * caller receives a query-capable scope. `SET LOCAL ROLE` and the resolver's
 * `set_config(..., true)` state both disappear at COMMIT/ROLLBACK, preventing
 * pooled connections from carrying one request's subject into another request.
 */
export async function executePostgresSubjectTransactionV1<T>(
  input: ExecutePostgresSubjectTransactionInputV1<T>,
): Promise<T> {
  const connection = await input.pool.connect();
  let transactionStarted = false;
  let discardConnectionError: unknown;

  try {
    await connection.query(BEGIN_SQL);
    transactionStarted = true;

    await connection.query(ENTER_EXECUTION_ROLE_SQL);

    const resolvedSubject = await resolveSubjectIdentity({
      verifiedEvidence: input.verifiedEvidence,
      resolutionPort: new TransactionSubjectIdentityResolutionPortV1(connection),
    });

    await connection.query(ASSERT_SUBJECT_CONTEXT_SQL, [resolvedSubject.subjectId]);

    const result = await input.execute(
      Object.freeze({
        resolvedSubject,
        client: connection,
      }),
    );

    await connection.query(COMMIT_SQL);
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.query(ROLLBACK_SQL);
      } catch (rollbackError) {
        discardConnectionError = rollbackError;
        throw new AggregateError(
          [error, rollbackError],
          'PostgreSQL subject transaction failed and rollback also failed.',
        );
      }
    }
    throw error;
  } finally {
    connection.release(discardConnectionError);
  }
}
