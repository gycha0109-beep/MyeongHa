import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { buildNodePostgresPoolConfigV1 } from './node-postgres-subject-pool.js';
import {
  buildProductionAccountDeletionWorkerStrictTlsTargetV1,
} from './production-account-deletion-worker-tls-peer-verification.js';
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

type StrictWorkerTargetBuilderV1 =
  typeof buildProductionAccountDeletionWorkerStrictTlsTargetV1;

export class NodePostgresAccountDeletionWorkerPoolErrorV1 extends Error {
  constructor(
    readonly code:
      | 'PRINCIPAL_MISMATCH'
      | 'EXECUTION_ROLE_UNAVAILABLE'
      | 'INVALID_PREFLIGHT_RESULT'
      | 'TLS_MODE_UNSUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'NodePostgresAccountDeletionWorkerPoolErrorV1';
  }
}

function buildStrictWorkerDatabaseUrlV1(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'TLS_MODE_UNSUPPORTED',
      'Strict account-deletion worker PostgreSQL URL could not be parsed.',
    );
  }

  const sourceMode = url.searchParams.get('sslmode')?.trim().toLowerCase();
  if (sourceMode !== 'require' && sourceMode !== 'verify-full') {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'TLS_MODE_UNSUPPORTED',
      'Strict account-deletion worker PostgreSQL TLS requires the governed require migration source or verify-full source.',
    );
  }

  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.trim().toLowerCase();
    if (normalized.startsWith('ssl') || normalized === 'uselibpqcompat') {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export function buildNodePostgresAccountDeletionWorkerPoolConfigV1(
  config: ProductionAccountDeletionWorkerDbConfigV1,
  dependencies: Readonly<{
    buildStrictTarget?: StrictWorkerTargetBuilderV1;
  }> = {},
): PoolConfig {
  if (config.databaseTlsPeerMode !== 'verify-full') {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'TLS_MODE_UNSUPPORTED',
      'Account-deletion worker PostgreSQL TLS must use verify-full.',
    );
  }

  if (
    typeof config.databaseSslRootCertificatePem !== 'string' ||
    config.databaseSslRootCertificatePem.trim().length === 0
  ) {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'TLS_MODE_UNSUPPORTED',
      'Strict account-deletion worker PostgreSQL TLS requires governed root certificate material.',
    );
  }

  let target;
  try {
    target = (
      dependencies.buildStrictTarget ??
      buildProductionAccountDeletionWorkerStrictTlsTargetV1
    )({
      databaseUrl: buildStrictWorkerDatabaseUrlV1(config.databaseUrl),
      rootCertificatePem: config.databaseSslRootCertificatePem,
    });
  } catch {
    throw new NodePostgresAccountDeletionWorkerPoolErrorV1(
      'TLS_MODE_UNSUPPORTED',
      'Strict account-deletion worker PostgreSQL TLS target was rejected.',
    );
  }

  return Object.freeze({
    ...buildNodePostgresPoolConfigV1(target.connectionString),
    ssl: target.ssl,
  });
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

function requirePrincipalRow(
  rows: readonly Record<string, unknown>[],
): WorkerPrincipalRowV1 {
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

  constructor(
    private readonly config: ProductionAccountDeletionWorkerDbConfigV1,
  ) {
    this.pool = new Pool(
      buildNodePostgresAccountDeletionWorkerPoolConfigV1(config),
    );
    this.pool.on('error', (error) => {
      const code = (error as Error & { code?: unknown }).code;
      console.error(
        'MyeongHa account-deletion worker PostgreSQL idle-pool error.',
        {
          name: error.name,
          code: typeof code === 'string' ? code : null,
        },
      );
    });
  }

  async connect(): Promise<PostgresSubjectConnectionV1> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(VERIFY_WORKER_LOGIN_SQL, [
        MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
      ]);
      verifyPrincipal(
        requirePrincipalRow(result.rows),
        this.config.databasePrincipal,
      );
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
