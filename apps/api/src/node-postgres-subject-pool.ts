import { Pool, type PoolClient } from 'pg';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  type ProductionUserDataRuntimeConfigV1,
} from './production-user-data-runtime-config.js';

export const NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1 = Object.freeze({
  maxConnectionsPerRuntime: 4,
  connectionTimeoutMs: 5_000,
  idleTimeoutMs: 10_000,
} as const);

const VERIFY_LOGIN_PRINCIPAL_SQL = `
select
  current_user::text as "currentUser",
  pg_catalog.pg_has_role(current_user, $1::name, 'MEMBER') as "canEnterExecutionRole"
`.trim();

export interface NodePostgresDriverQueryResultV1 {
  readonly rows: readonly Record<string, unknown>[];
}

export interface NodePostgresDriverClientV1 {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<NodePostgresDriverQueryResultV1>;
  release(error?: Error): void;
}

export interface NodePostgresDriverPoolV1 {
  connect(): Promise<NodePostgresDriverClientV1>;
  end(): Promise<void>;
}

export class NodePostgresSubjectPoolErrorV1 extends Error {
  constructor(
    readonly code:
      | 'PRINCIPAL_MISMATCH'
      | 'EXECUTION_ROLE_UNAVAILABLE'
      | 'INVALID_PREFLIGHT_RESULT',
    message: string,
  ) {
    super(message);
    this.name = 'NodePostgresSubjectPoolErrorV1';
  }
}

class PgDriverClientV1 implements NodePostgresDriverClientV1 {
  constructor(private readonly client: PoolClient) {}

  async query(
    text: string,
    values?: readonly unknown[],
  ): Promise<NodePostgresDriverQueryResultV1> {
    const result =
      values === undefined
        ? await this.client.query(text)
        : await this.client.query(text, [...values]);

    return Object.freeze({
      rows: result.rows as readonly Record<string, unknown>[],
    });
  }

  release(error?: Error): void {
    this.client.release(error);
  }
}

class PgDriverPoolV1 implements NodePostgresDriverPoolV1 {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1.maxConnectionsPerRuntime,
      connectionTimeoutMillis:
        NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1.connectionTimeoutMs,
      idleTimeoutMillis: NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1.idleTimeoutMs,
      allowExitOnIdle: true,
    });

    this.pool.on('error', (error) => {
      const code = (error as Error & { code?: unknown }).code;
      console.error('MyeongHa PostgreSQL idle-pool error.', {
        name: error.name,
        code: typeof code === 'string' ? code : null,
      });
    });
  }

  async connect(): Promise<NodePostgresDriverClientV1> {
    return new PgDriverClientV1(await this.pool.connect());
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

type LoginPrincipalRowV1 = Readonly<{
  currentUser?: unknown;
  canEnterExecutionRole?: unknown;
}>;

function requireLoginPrincipalRow(
  rows: readonly Record<string, unknown>[],
): LoginPrincipalRowV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new NodePostgresSubjectPoolErrorV1(
      'INVALID_PREFLIGHT_RESULT',
      'PostgreSQL runtime principal preflight must return exactly one row.',
    );
  }
  return row;
}

function verifyLoginPrincipal(
  row: LoginPrincipalRowV1,
  expectedPrincipal: string,
): void {
  if (row.currentUser !== expectedPrincipal) {
    throw new NodePostgresSubjectPoolErrorV1(
      'PRINCIPAL_MISMATCH',
      'PostgreSQL runtime connected as a different login principal than configured.',
    );
  }
  if (row.canEnterExecutionRole !== true) {
    throw new NodePostgresSubjectPoolErrorV1(
      'EXECUTION_ROLE_UNAVAILABLE',
      `PostgreSQL runtime principal cannot enter ${MYEONGHA_API_EXECUTION_ROLE}.`,
    );
  }
}

class NodePostgresSubjectConnectionV1 implements PostgresSubjectConnectionV1 {
  constructor(private readonly driverClient: NodePostgresDriverClientV1) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResultV1<Row>> {
    const result = await this.driverClient.query(text, values);
    return Object.freeze({
      rows: result.rows as readonly Row[],
    });
  }

  release(error?: unknown): void {
    if (error === undefined) {
      this.driverClient.release();
      return;
    }

    this.driverClient.release(
      error instanceof Error
        ? error
        : new Error('PostgreSQL subject connection was marked for discard.'),
    );
  }
}

/**
 * Concrete Node/PostgreSQL pool adapter for ordinary MyeongHa subject execution.
 *
 * Every checked-out connection is verified before it is exposed to the existing
 * transaction adapter. This prevents a drifted network credential from silently
 * becoming the user-data execution baseline.
 */
export class NodePostgresSubjectPoolV1 implements PostgresSubjectPoolV1 {
  constructor(
    private readonly driverPool: NodePostgresDriverPoolV1,
    private readonly expectedLoginPrincipal: string,
  ) {}

  async connect(): Promise<PostgresSubjectConnectionV1> {
    const driverClient = await this.driverPool.connect();

    try {
      const result = await driverClient.query(VERIFY_LOGIN_PRINCIPAL_SQL, [
        MYEONGHA_API_EXECUTION_ROLE,
      ]);
      const row = requireLoginPrincipalRow(result.rows);
      verifyLoginPrincipal(row, this.expectedLoginPrincipal);
      return new NodePostgresSubjectConnectionV1(driverClient);
    } catch (error) {
      driverClient.release(
        error instanceof Error
          ? error
          : new Error('PostgreSQL runtime principal preflight failed.'),
      );
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.driverPool.end();
  }
}

export function createNodePostgresSubjectPoolFromDriverV1(input: {
  readonly driverPool: NodePostgresDriverPoolV1;
  readonly expectedLoginPrincipal: string;
}): NodePostgresSubjectPoolV1 {
  return new NodePostgresSubjectPoolV1(
    input.driverPool,
    input.expectedLoginPrincipal,
  );
}

export function createNodePostgresSubjectPoolV1(
  config: ProductionUserDataRuntimeConfigV1,
): NodePostgresSubjectPoolV1 {
  if (config.databaseExecutionRole !== MYEONGHA_API_EXECUTION_ROLE) {
    throw new NodePostgresSubjectPoolErrorV1(
      'EXECUTION_ROLE_UNAVAILABLE',
      'Production runtime configuration does not target the governed API execution role.',
    );
  }

  return new NodePostgresSubjectPoolV1(
    new PgDriverPoolV1(config.databaseUrl),
    config.databasePrincipal,
  );
}
