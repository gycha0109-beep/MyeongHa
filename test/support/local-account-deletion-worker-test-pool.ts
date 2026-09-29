import { Pool, type PoolClient } from 'pg';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../../apps/api/src/postgres-subject-execution.js';

const LOCAL_TEST_WORKER_PRINCIPAL = 'myeongha_worker_runtime' as const;
const LOCAL_TEST_EXECUTION_ROLE = 'myeongha_system_executor' as const;

class LocalAccountDeletionWorkerTestConnectionV1
  implements PostgresSubjectConnectionV1
{
  constructor(private readonly client: PoolClient) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResultV1<Row>> {
    const result =
      values === undefined
        ? await this.client.query(text)
        : await this.client.query(text, [...values]);
    return Object.freeze({ rows: result.rows as readonly Row[] });
  }

  release(error?: unknown): void {
    this.client.release(
      error === undefined
        ? undefined
        : error instanceof Error
          ? error
          : new Error('Local worker test connection was marked for discard.'),
    );
  }
}

export interface LocalAccountDeletionWorkerTestPoolV1
  extends PostgresSubjectPoolV1 {
  close(): Promise<void>;
}

function requireLocalWorkerUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  if (
    !['localhost', '127.0.0.1', '::1'].includes(hostname) ||
    decodeURIComponent(url.username) !== LOCAL_TEST_WORKER_PRINCIPAL
  ) {
    throw new Error(
      'Local account-deletion worker test pool accepts only the dedicated worker principal on a loopback PostgreSQL endpoint.',
    );
  }
  return databaseUrl;
}

export function createLocalAccountDeletionWorkerTestPoolV1(
  databaseUrl: string,
): LocalAccountDeletionWorkerTestPoolV1 {
  const pool = new Pool({
    connectionString: requireLocalWorkerUrl(databaseUrl),
    max: 2,
  });

  return Object.freeze({
    async connect(): Promise<PostgresSubjectConnectionV1> {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `select
             session_user::text as "sessionUser",
             current_user::text as "currentUser",
             pg_catalog.pg_has_role(current_user, $1::name, 'MEMBER') as "canEnterExecutionRole"`,
          [LOCAL_TEST_EXECUTION_ROLE],
        );
        const row = result.rows[0];
        if (
          result.rows.length !== 1 ||
          row?.sessionUser !== LOCAL_TEST_WORKER_PRINCIPAL ||
          row?.currentUser !== LOCAL_TEST_WORKER_PRINCIPAL ||
          row?.canEnterExecutionRole !== true
        ) {
          throw new Error(
            'Local account-deletion worker test pool principal preflight failed.',
          );
        }
        return new LocalAccountDeletionWorkerTestConnectionV1(client);
      } catch (error) {
        client.release(
          error instanceof Error
            ? error
            : new Error('Local worker test principal preflight failed.'),
        );
        throw error;
      }
    },
    close() {
      return pool.end();
    },
  });
}
