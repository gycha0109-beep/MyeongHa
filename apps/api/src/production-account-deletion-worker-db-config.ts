export const MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL =
  'myeongha_worker_runtime' as const;
export const MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE =
  'myeongha_system_executor' as const;

export const PRODUCTION_ACCOUNT_DELETION_WORKER_DB_ENV_V1 = Object.freeze({
  databaseUrl: 'MYEONGHA_WORKER_DATABASE_URL',
  databasePrincipal: 'MYEONGHA_WORKER_DATABASE_PRINCIPAL',
} as const);

export type ProductionAccountDeletionWorkerDbEnvV1 = Readonly<
  Record<string, string | undefined>
>;

export interface ProductionAccountDeletionWorkerDbConfigV1 {
  readonly databaseUrl: string;
  readonly databasePrincipal: typeof MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
  readonly databaseExecutionRole: typeof MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE;
}

export interface ProductionAccountDeletionWorkerDbConfigSummaryV1 {
  readonly databaseConfigured: true;
  readonly databasePrincipal: typeof MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
  readonly databaseExecutionRole: typeof MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE;
}

export class ProductionAccountDeletionWorkerDbConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionAccountDeletionWorkerDbConfigErrorV1';
  }
}

function fail(message: string): never {
  throw new ProductionAccountDeletionWorkerDbConfigErrorV1(message);
}

function requiredEnv(
  env: ProductionAccountDeletionWorkerDbEnvV1,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`Required account-deletion worker DB setting is missing: ${name}.`);
  }
  return value.trim();
}

function parsePrincipal(
  value: string,
): typeof MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL {
  if (value !== MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL) {
    return fail(
      `MYEONGHA_WORKER_DATABASE_PRINCIPAL must be ${MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL}.`,
    );
  }
  return MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
}

function parseDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('MYEONGHA_WORKER_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return fail(
      'MYEONGHA_WORKER_DATABASE_URL must use postgres:// or postgresql://.',
    );
  }
  if (url.hostname.length === 0 || url.username.length === 0 || url.password.length === 0) {
    return fail(
      'MYEONGHA_WORKER_DATABASE_URL must include a host and dedicated login credentials.',
    );
  }
  if (url.searchParams.get('sslmode')?.toLowerCase() === 'disable') {
    return fail('MYEONGHA_WORKER_DATABASE_URL must not disable TLS.');
  }

  const decodedUser = decodeURIComponent(url.username);
  const directWorkerUser = MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
  const supavisorWorkerUserPattern = new RegExp(
    `^${directWorkerUser}\\.[a-z0-9]{20}export const MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL =
  'myeongha_worker_runtime' as const;
export const MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE =
  'myeongha_system_executor' as const;

export const PRODUCTION_ACCOUNT_DELETION_WORKER_DB_ENV_V1 = Object.freeze({
  databaseUrl: 'MYEONGHA_WORKER_DATABASE_URL',
  databasePrincipal: 'MYEONGHA_WORKER_DATABASE_PRINCIPAL',
} as const);

export type ProductionAccountDeletionWorkerDbEnvV1 = Readonly<
  Record<string, string | undefined>
>;

export interface ProductionAccountDeletionWorkerDbConfigV1 {
  readonly databaseUrl: string;
  readonly databasePrincipal: typeof MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
  readonly databaseExecutionRole: typeof MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE;
}

export interface ProductionAccountDeletionWorkerDbConfigSummaryV1 {
  readonly databaseConfigured: true;
  readonly databasePrincipal: typeof MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
  readonly databaseExecutionRole: typeof MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE;
}

export class ProductionAccountDeletionWorkerDbConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionAccountDeletionWorkerDbConfigErrorV1';
  }
}

function fail(message: string): never {
  throw new ProductionAccountDeletionWorkerDbConfigErrorV1(message);
}

function requiredEnv(
  env: ProductionAccountDeletionWorkerDbEnvV1,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`Required account-deletion worker DB setting is missing: ${name}.`);
  }
  return value.trim();
}

function parsePrincipal(
  value: string,
): typeof MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL {
  if (value !== MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL) {
    return fail(
      `MYEONGHA_WORKER_DATABASE_PRINCIPAL must be ${MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL}.`,
    );
  }
  return MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
}

function parseDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('MYEONGHA_WORKER_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return fail(
      'MYEONGHA_WORKER_DATABASE_URL must use postgres:// or postgresql://.',
    );
  }
  if (url.hostname.length === 0 || url.username.length === 0 || url.password.length === 0) {
    return fail(
      'MYEONGHA_WORKER_DATABASE_URL must include a host and dedicated login credentials.',
    );
  }
  if (url.searchParams.get('sslmode')?.toLowerCase() === 'disable') {
    return fail('MYEONGHA_WORKER_DATABASE_URL must not disable TLS.');
  }

,
    'u',
  );
  if (
    decodedUser !== directWorkerUser &&
    !supavisorWorkerUserPattern.test(decodedUser)
  ) {
    return fail(
      'MYEONGHA_WORKER_DATABASE_URL must authenticate as the dedicated worker login principal, directly or through a Supavisor-qualified project username.',
    );
  }

  return value;
}

export function parseProductionAccountDeletionWorkerDbConfigV1(
  env: ProductionAccountDeletionWorkerDbEnvV1,
): ProductionAccountDeletionWorkerDbConfigV1 {
  const databasePrincipal = parsePrincipal(
    requiredEnv(env, PRODUCTION_ACCOUNT_DELETION_WORKER_DB_ENV_V1.databasePrincipal),
  );
  const databaseUrl = parseDatabaseUrl(
    requiredEnv(env, PRODUCTION_ACCOUNT_DELETION_WORKER_DB_ENV_V1.databaseUrl),
  );

  return Object.freeze({
    databaseUrl,
    databasePrincipal,
    databaseExecutionRole: MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
  });
}

export function summarizeProductionAccountDeletionWorkerDbConfigV1(
  config: ProductionAccountDeletionWorkerDbConfigV1,
): ProductionAccountDeletionWorkerDbConfigSummaryV1 {
  if (
    config.databasePrincipal !== MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL ||
    config.databaseExecutionRole !== MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE
  ) {
    return fail('Account-deletion worker DB config summary received an invalid role binding.');
  }

  return Object.freeze({
    databaseConfigured: true,
    databasePrincipal: MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
    databaseExecutionRole: MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
  });
}
