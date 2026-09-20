import { Pool, type PoolClient } from 'pg';
import { buildNodePostgresPoolConfigV1 } from './node-postgres-subject-pool.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
  type ProductionAccountDeletionWorkerDbConfigV1,
} from './production-account-deletion-worker-db-config.js';

const VERIFY_WORKER_LOGIN_SQL = `
select
  session_user::text as "sessionUser",
  current_user::text as "currentUser",
  pg_catalog.pg_has_role(current_user, $1::name, 'MEMBER') as "canEnterExecutionRole"
`.trim();

type WorkerPrincipalRowV1 = Readonly<{
  sessionUser?: unknown;
  currentUser?: unknown;
  canEnterExecutionRole?: unknown;
}>;

export class NodePostgresAccountDeletionWorkerPoolErrorV1 extends Error {
  constructor(
    readonly code:
      | 'PRINCIPAL_MISMATCH'
      | 'EXECUTION_ROLE_UNAVAILABLE'
      | 'INVALID_PREFLIGHT_RESULT',
    message: string,
  ) {
    super(message);
    this.name = 'NodePostgresAccountDeletionWorkerPoolErrorV1';
  }
}

class WorkerConnectionV1 implements PostgresSubjectConnectionV1 {
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
    if (error === undefined) {
      this.client.release();
      return;
    }
    this.client.release(
      error instanceof Error
        ? error
        : new Error('PostgreSQL worker connection was marked for discard.'),
    );
  }
}

function requirePrincipalRow(rows: readonly Record<string, unknown>[]): WorkerPrincipalRowV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'INVALID_PREFLIGHT_RESULT',
      'Account-deletion worker DB principal preflight must return exactly one row.',
    );
  }
  return row;
}

function verifyPrincipal(
  row: WorkerPrincipalRowV1,
  expectedPrincipal: string,
): void {
  if (
    row.sessionUser !== expectedPrincipal ||
    row.currentUser !== expectedPrincipal
  ) {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'PRINCIPAL_MISMATCH',
      'Account-deletion worker connected as a different DB login principal.',
    );
  }
  if (row.canEnterExecutionRole !== true) {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'EXECUTION_ROLE_UNAVAILABLE',
      `Account-deletion worker cannot enter ${MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE}.`,
    );
  }
}

export class NodePostgresAccountDeletionWorkerPoolV1
  implements PostgresSubjectPoolV1
{
  private readonly pool: Pool;

  constructor(private readonly config: ProductionAccountDeletionWorkerDbConfigV1) {
    this.pool = new Pool(buildNodePostgresPoolConfigV1(config.databaseUrl));
    this.pool.on('error', (error) => {
      const code = (error as Error & { code?: unknown }).code;
      console.error('MyeongHa account-deletion worker PostgreSQL idle-pool error.', {
        name: error.name,
        code: typeof code === 'string' ? code : null,
      });
    });
  }

  async connect(): Promise<PostgresSubjectConnectionV1> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(VERIFY_WORKER_LOGIN_SQL, [
        MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
      ]);
      verifyPrincipal(requirePrincipalRow(result.rows), this.config.databasePrincipal);
      return new WorkerConnectionV1(client);
    } catch (error) {
      client.release(
        error instanceof Error
          ? error
          : new Error('Account-deletion worker DB principal preflight failed.'),
      );
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createNodePostgresAccountDeletionWorkerPoolV1(
  config: ProductionAccountDeletionWorkerDbConfigV1,
): NodePostgresAccountDeletionWorkerPoolV1 {
  return new NodePostgresAccountDeletionWorkerPoolV1(config);
}
