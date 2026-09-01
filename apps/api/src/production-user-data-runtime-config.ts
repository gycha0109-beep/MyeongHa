export const MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF =
  'cnsfpcdiyofqvhpcegfc' as const;
export const MYEONGHA_PRODUCTION_SUPABASE_ORIGIN =
  `https://${MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` as const;
export const MYEONGHA_API_EXECUTION_ROLE = 'myeongha_api_executor' as const;

export const PRODUCTION_USER_DATA_RUNTIME_ENV_V1 = Object.freeze({
  databaseUrl: 'MYEONGHA_DATABASE_URL',
  databasePrincipal: 'MYEONGHA_DATABASE_PRINCIPAL',
  supabaseUrl: 'MYEONGHA_SUPABASE_URL',
  supabaseApiKey: 'MYEONGHA_SUPABASE_API_KEY',
  guestFingerprintSecret: 'MYEONGHA_GUEST_FINGERPRINT_SECRET',
} as const);

export type ProductionUserDataRuntimeEnvV1 = Readonly<
  Record<string, string | undefined>
>;

export interface ProductionUserDataRuntimeConfigV1 {
  readonly databaseUrl: string;
  readonly databasePrincipal: string;
  readonly databaseExecutionRole: typeof MYEONGHA_API_EXECUTION_ROLE;
  readonly supabaseOrigin: typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
  readonly supabaseApiKey: string;
  readonly guestFingerprintSecret: string;
}

export interface ProductionUserDataRuntimeConfigSummaryV1 {
  readonly databaseConfigured: true;
  readonly databasePrincipal: string;
  readonly databaseExecutionRole: typeof MYEONGHA_API_EXECUTION_ROLE;
  readonly supabaseOrigin: typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
  readonly supabaseApiKeyConfigured: true;
  readonly guestFingerprintSecretConfigured: true;
}

export class ProductionUserDataRuntimeConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionUserDataRuntimeConfigErrorV1';
  }
}

function fail(message: string): never {
  throw new ProductionUserDataRuntimeConfigErrorV1(message);
}

function requiredEnv(
  env: ProductionUserDataRuntimeEnvV1,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`Required production user-data runtime setting is missing: ${name}.`);
  }
  return value.trim();
}

function parseDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('MYEONGHA_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return fail('MYEONGHA_DATABASE_URL must use postgres:// or postgresql://.');
  }
  if (url.hostname.length === 0 || url.username.length === 0 || url.password.length === 0) {
    return fail(
      'MYEONGHA_DATABASE_URL must include a host and dedicated login credentials.',
    );
  }
  if (url.searchParams.get('sslmode')?.toLowerCase() === 'disable') {
    return fail('MYEONGHA_DATABASE_URL must not disable TLS.');
  }

  const decodedUser = decodeURIComponent(url.username).toLowerCase();
  if (
    decodedUser === 'postgres' ||
    decodedUser === 'supabase_admin' ||
    decodedUser === 'service_role'
  ) {
    return fail(
      'MYEONGHA_DATABASE_URL must not use a known privileged/default database principal.',
    );
  }

  return value;
}

function parseDatabasePrincipal(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) {
    return fail(
      'MYEONGHA_DATABASE_PRINCIPAL must be an explicit PostgreSQL role identifier.',
    );
  }
  if (value === MYEONGHA_API_EXECUTION_ROLE) {
    return fail(
      'MYEONGHA_DATABASE_PRINCIPAL must be a login principal distinct from the NOLOGIN execution role.',
    );
  }
  if (['postgres', 'supabase_admin', 'service_role'].includes(value)) {
    return fail('MYEONGHA_DATABASE_PRINCIPAL must not name a privileged/default role.');
  }
  return value;
}

function parseSupabaseOrigin(value: string): typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('MYEONGHA_SUPABASE_URL must be a valid HTTPS origin.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.origin !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN
  ) {
    return fail(
      `MYEONGHA_SUPABASE_URL must target the governed production project ${MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF}.`,
    );
  }

  return MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
}

function requireSecret(name: string, value: string, minimumLength: number): string {
  if (value.length < minimumLength) {
    return fail(`${name} is shorter than the production minimum.`);
  }
  return value;
}

export function parseProductionUserDataRuntimeConfigV1(
  env: ProductionUserDataRuntimeEnvV1,
): ProductionUserDataRuntimeConfigV1 {
  const databaseUrl = parseDatabaseUrl(
    requiredEnv(env, PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl),
  );
  const databasePrincipal = parseDatabasePrincipal(
    requiredEnv(env, PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databasePrincipal),
  );
  const supabaseOrigin = parseSupabaseOrigin(
    requiredEnv(env, PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseUrl),
  );
  const supabaseApiKey = requireSecret(
    PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey,
    requiredEnv(env, PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey),
    20,
  );
  const guestFingerprintSecret = requireSecret(
    PRODUCTION_USER_DATA_RUNTIME_ENV_V1.guestFingerprintSecret,
    requiredEnv(env, PRODUCTION_USER_DATA_RUNTIME_ENV_V1.guestFingerprintSecret),
    32,
  );

  return Object.freeze({
    databaseUrl,
    databasePrincipal,
    databaseExecutionRole: MYEONGHA_API_EXECUTION_ROLE,
    supabaseOrigin,
    supabaseApiKey,
    guestFingerprintSecret,
  });
}

export function summarizeProductionUserDataRuntimeConfigV1(
  config: ProductionUserDataRuntimeConfigV1,
): ProductionUserDataRuntimeConfigSummaryV1 {
  return Object.freeze({
    databaseConfigured: true,
    databasePrincipal: config.databasePrincipal,
    databaseExecutionRole: config.databaseExecutionRole,
    supabaseOrigin: config.supabaseOrigin,
    supabaseApiKeyConfigured: true,
    guestFingerprintSecretConfigured: true,
  });
}
