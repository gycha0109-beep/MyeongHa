import { Pool, type PoolClient } from 'pg';
import { GOVERNED_LOGIN_PREFLIGHT_SQL_V1 } from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  buildProductionNodePostgresPoolConfigV1,
  type NodePostgresDriverPoolV1,
  type NodePostgresDriverClientV1,
  type NodePostgresSubjectPoolOptionsV1,
} from './node-postgres-subject-pool.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  type ProductionPostgresRuntimeConfigV1,
} from './production-user-data-runtime-config.js';

/**
 * B2 isolated cost-only pool. Not connected to any Production Provider.
 * Only a separate dedicated LOGIN may be provisioned during a later
 * reviewed deployment; never reuse the ordinary user-data pool login.
 */
export const SEYEON_GOVERNED_DB_LOGIN_V1 =
  'myeongha_seyeon_governed_login' as const;
export const SEYEON_GOVERNED_DB_ROLE_V1 =
  'myeongha_seyeon_governed_executor' as const;
export const SEYEON_GOVERNED_DB_ENV_V1 = Object.freeze({
  url: 'MYEONGHA_SEYEON_GOVERNED_DATABASE_URL',
  principal: 'MYEONGHA_SEYEON_GOVERNED_DATABASE_PRINCIPAL',
} as const);

export interface SeyeonGovernedDbConfigV1 {
  readonly databaseUrl: string;
  readonly databasePrincipal: typeof SEYEON_GOVERNED_DB_LOGIN_V1;
  readonly ordinaryDatabasePrincipal: string;
  readonly databaseTlsPeerMode: 'verify-full';
  readonly databaseSslRootCertificatePem: string;
}

export class SeyeonGovernedDbBoundaryErrorV1 extends Error {
  constructor(readonly code:
    | 'INVALID_CONFIG' | 'LOGIN_PRINCIPAL_MISMATCH'
    | 'LOGIN_ROLE_UNSAFE' | 'LEGACY_ROLE_EXPOSED'
    | 'GOVERNED_ROLE_UNAVAILABLE' | 'DIRECT_SQL_EXPOSED'
    | 'INVALID_PREFLIGHT', message: string) {
    super(message);
    this.name = 'SeyeonGovernedDbBoundaryErrorV1';
  }
}
function fail(
  code: SeyeonGovernedDbBoundaryErrorV1['code'],
  message: string,
): never {
  throw new SeyeonGovernedDbBoundaryErrorV1(code, message);
}

function parsedUrl(url: string): URL {
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return fail('INVALID_CONFIG', 'Governed PostgreSQL URL is invalid.'); }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname || !parsed.username || !parsed.password ||
    !['require', 'verify-full'].includes(
      parsed.searchParams.get('sslmode')?.toLowerCase() ?? '',
    )
  ) {
    return fail('INVALID_CONFIG', 'Governed PostgreSQL requires dedicated credentials and strict TLS source.');
  }
  return parsed;
}

export function parseSeyeonGovernedDbConfigV1(input: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly ordinaryDatabaseUrl: string;
  readonly ordinaryDatabasePrincipal: string;
  readonly rootCertificatePem: string;
}): SeyeonGovernedDbConfigV1 {
  const url = input.env[SEYEON_GOVERNED_DB_ENV_V1.url];
  const principal = input.env[SEYEON_GOVERNED_DB_ENV_V1.principal];
  if (!url || principal !== SEYEON_GOVERNED_DB_LOGIN_V1 ||
      !input.rootCertificatePem.trim() ||
      !input.ordinaryDatabasePrincipal || !input.ordinaryDatabaseUrl ||
      principal === input.ordinaryDatabasePrincipal) {
    return fail('INVALID_CONFIG', 'Governed database credential binding must be independent and explicitly approved.');
  }
  const governed = parsedUrl(url);
  const ordinary = parsedUrl(input.ordinaryDatabaseUrl);
  if (governed.username !== encodeURIComponent(SEYEON_GOVERNED_DB_LOGIN_V1) &&
      decodeURIComponent(governed.username) !== SEYEON_GOVERNED_DB_LOGIN_V1) {
    return fail('INVALID_CONFIG', 'Governed database URL principal does not match the dedicated login.');
  }
  if (governed.href === ordinary.href ||
      governed.password === ordinary.password ||
      governed.hostname.toLowerCase() !== ordinary.hostname.toLowerCase() ||
      governed.port !== ordinary.port ||
      governed.pathname !== ordinary.pathname) {
    return fail('INVALID_CONFIG', 'Governed database credential must be separate on the same approved PostgreSQL target.');
  }
  return Object.freeze({
    databaseUrl: url,
    databasePrincipal: SEYEON_GOVERNED_DB_LOGIN_V1,
    ordinaryDatabasePrincipal: input.ordinaryDatabasePrincipal,
    databaseTlsPeerMode: 'verify-full',
    databaseSslRootCertificatePem: input.rootCertificatePem,
  });
}

/**
 * Public Postgres catalogs are read under the actual SESSION LOGIN before
 * ANY transaction context or Subject resolver runs.
 * The new role has SET permission only from a separately provisioned login.
 */
const LEGACY_OR_DIRECT_FLAGS = [
  'isLegacyMember','canSetLegacyRole','isCostOwnerMember',
  'canLegacyStart','canLegacySettle','canLegacyRecord',
  'canDirectLedger','canDirectBudget','canDirectRateCard',
] as const;

export function verifySeyeonGovernedLoginPreflightV1(
  rows: readonly Record<string, unknown>[],
  expectedPrincipal: string,
): void {
  const row = rows[0];
  if (rows.length !== 1 || !row) {
    return fail('INVALID_PREFLIGHT', 'Governed login preflight must return one PostgreSQL catalog row.');
  }
  if (row.sessionUser !== SEYEON_GOVERNED_DB_LOGIN_V1 ||
      row.currentUser !== SEYEON_GOVERNED_DB_LOGIN_V1 ||
      expectedPrincipal !== SEYEON_GOVERNED_DB_LOGIN_V1) {
    return fail('LOGIN_PRINCIPAL_MISMATCH', 'Governed pool has a mismatched session/login principal.');
  }
  if (row.canLogin !== true || row.canInherit !== false ||
      row.isSuper !== false || row.canBypassRls !== false ||
      row.canCreateDb !== false || row.canCreateRole !== false ||
      row.otherMemberships !== 0) {
    return fail('LOGIN_ROLE_UNSAFE', 'Governed login has elevated flags or unrelated role memberships.');
  }
  if (row.canSetGovernedRole !== true) {
    return fail('GOVERNED_ROLE_UNAVAILABLE', 'Governed login cannot enter its dedicated execution role.');
  }
  for (const key of LEGACY_OR_DIRECT_FLAGS) {
    if (row[key] !== false) {
      return fail(
        key.startsWith('canDirect') ? 'DIRECT_SQL_EXPOSED' : 'LEGACY_ROLE_EXPOSED',
        'Governed login can reach forbidden legacy or raw SQL authority.',
      );
    }
  }
}

export interface SeyeonGovernedPostgresSubjectPoolV1
  extends PostgresSubjectPoolV1 {
  readonly authority: 'seyeon-governed-only-v1';
}

class GovernedSubjectConnectionV1 implements PostgresSubjectConnectionV1 {
  constructor(private readonly client: NodePostgresDriverClientV1) {}
  async query<T = Record<string, unknown>>(
    text: string, values?: readonly unknown[],
  ): Promise<PostgresQueryResultV1<T>> {
    const result = await this.client.query(text, values);
    return { rows: result.rows as readonly T[] };
  }
  release(error?: unknown): void {
    this.client.release(error === undefined ? undefined :
      error instanceof Error ? error : new Error('Governed SQL connection discarded.'));
  }
}

/** Checkout preflight on every connection, not just at application startup. */
export class SeyeonGovernedNodePostgresPoolV1
  implements SeyeonGovernedPostgresSubjectPoolV1 {
  readonly authority = 'seyeon-governed-only-v1' as const;
  constructor(
    private readonly driverPool: NodePostgresDriverPoolV1,
    private readonly expectedPrincipal: typeof SEYEON_GOVERNED_DB_LOGIN_V1,
  ) {}
  async connect(): Promise<PostgresSubjectConnectionV1> {
    const client = await this.driverPool.connect();
    try {
      const result = await client.query(GOVERNED_LOGIN_PREFLIGHT_SQL_V1,
        [SEYEON_GOVERNED_DB_ROLE_V1, MYEONGHA_API_EXECUTION_ROLE]);
      verifySeyeonGovernedLoginPreflightV1(result.rows,this.expectedPrincipal);
      return new GovernedSubjectConnectionV1(client);
    } catch (error) {
      client.release(error instanceof Error ? error :
        new Error('Governed login authority preflight rejected.'));
      throw error;
    }
  }
  async close(): Promise<void> { await this.driverPool.end(); }
}

class NativeGovernedDriverPoolV1 implements NodePostgresDriverPoolV1 {
  private pool: Pool | undefined;
  constructor(
    private readonly config: SeyeonGovernedDbConfigV1,
    private readonly options: NodePostgresSubjectPoolOptionsV1,
  ) {}
  async connect(): Promise<NodePostgresDriverClientV1> {
    if (!this.pool) {
      // Reuse the existing pinned, verify-full CA authority, never a generic
      // sslmode=require or TLS verify-disable construction.
      const tlsConfig: ProductionPostgresRuntimeConfigV1 = {
        databaseUrl: this.config.databaseUrl,
        databasePrincipal: this.config.databasePrincipal,
        databaseExecutionRole: MYEONGHA_API_EXECUTION_ROLE,
        databaseTlsPeerMode: this.config.databaseTlsPeerMode,
        databaseSslRootCertificatePem: this.config.databaseSslRootCertificatePem,
      };
      this.pool = new Pool(buildProductionNodePostgresPoolConfigV1(
        tlsConfig,this.options,
      ));
      this.pool.on('error', e => {
        console.error('Governed PostgreSQL idle-pool error', {
          code: (e as Error & {code?:unknown}).code ?? null,
        });
      });
    }
    const client: PoolClient = await this.pool.connect();
    return {
      async query(sql,values) {
        const result = values === undefined
          ? await client.query(sql) : await client.query(sql,[...values]);
        return {rows:result.rows as readonly Record<string,unknown>[]};
      },
      release(error) { client.release(error); },
    };
  }
  async end(): Promise<void> {
    const pool=this.pool;
    this.pool=undefined;
    if(pool) await pool.end();
  }
}

export function createSeyeonGovernedPostgresPoolFromDriverV1(input: {
  readonly driverPool: NodePostgresDriverPoolV1;
  readonly expectedPrincipal: typeof SEYEON_GOVERNED_DB_LOGIN_V1;
}): SeyeonGovernedNodePostgresPoolV1 {
  return new SeyeonGovernedNodePostgresPoolV1(
    input.driverPool,input.expectedPrincipal,
  );
}

export function createSeyeonGovernedPostgresPoolV1(
  config: SeyeonGovernedDbConfigV1,
  options: NodePostgresSubjectPoolOptionsV1 = {},
): SeyeonGovernedNodePostgresPoolV1 {
  if (config.databasePrincipal !== SEYEON_GOVERNED_DB_LOGIN_V1 ||
      !config.ordinaryDatabasePrincipal ||
      config.ordinaryDatabasePrincipal === config.databasePrincipal) {
    return fail('INVALID_CONFIG', 'Governed pool principal binding is not isolated.');
  }
  return new SeyeonGovernedNodePostgresPoolV1(
    new NativeGovernedDriverPoolV1(config, options),
    SEYEON_GOVERNED_DB_LOGIN_V1,
  );
}
