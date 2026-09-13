import type {
  PostgresSubjectPoolV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

type Awaitable<T> = T | Promise<T>;

export const POSTGRES_COMMERCE_INTERNAL_EXECUTION_BINDINGS_V1 = Object.freeze({
  executionRole: 'myeongha_commerce_internal_executor',
} as const);

export interface PostgresCommerceInternalExecutionScopeV1 {
  readonly client: PostgresTransactionQueryV1;
}

export interface ExecutePostgresCommerceInternalTransactionInputV1<T> {
  readonly pool: PostgresSubjectPoolV1;
  readonly execute: (
    scope: PostgresCommerceInternalExecutionScopeV1,
  ) => Awaitable<T>;
}

const BEGIN_SQL = 'BEGIN';
const ENTER_EXECUTION_ROLE_SQL = 'SET LOCAL ROLE myeongha_commerce_internal_executor';
const COMMIT_SQL = 'COMMIT';
const ROLLBACK_SQL = 'ROLLBACK';

export async function executePostgresCommerceInternalTransactionV1<T>(
  input: ExecutePostgresCommerceInternalTransactionInputV1<T>,
): Promise<T> {
  const connection = await input.pool.connect();
  let transactionStarted = false;
  let discardConnectionError: unknown;

  try {
    await connection.query(BEGIN_SQL);
    transactionStarted = true;

    await connection.query(ENTER_EXECUTION_ROLE_SQL);

    const result = await input.execute(
      Object.freeze({
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
          'PostgreSQL internal Commerce transaction failed and rollback also failed.',
        );
      }
    }
    throw error;
  } finally {
    connection.release(discardConnectionError);
  }
}
