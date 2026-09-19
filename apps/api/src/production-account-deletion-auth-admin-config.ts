import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
} from './production-user-data-runtime-config.js';

export const PRODUCTION_ACCOUNT_DELETION_AUTH_ADMIN_ENV_V1 = Object.freeze({
  supabaseUrl: 'MYEONGHA_SUPABASE_URL',
  adminSecret: 'MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET',
  publicApiKey: 'MYEONGHA_SUPABASE_API_KEY',
} as const);

export type ProductionAccountDeletionAuthAdminEnvV1 = Readonly<
  Record<string, string | undefined>
>;

export interface ProductionAccountDeletionAuthAdminConfigV1 {
  readonly supabaseOrigin: typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
  readonly adminSecret: string;
}

export interface ProductionAccountDeletionAuthAdminConfigSummaryV1 {
  readonly supabaseProjectRef: typeof MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF;
  readonly supabaseOrigin: typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
  readonly adminSecretConfigured: true;
}

export class ProductionAccountDeletionAuthAdminConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionAccountDeletionAuthAdminConfigErrorV1';
  }
}

function fail(message: string): never {
  throw new ProductionAccountDeletionAuthAdminConfigErrorV1(message);
}

function requiredEnv(
  env: ProductionAccountDeletionAuthAdminEnvV1,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`Required account-deletion Auth Admin setting is missing: ${name}.`);
  }
  return value;
}

function parseSupabaseOrigin(
  value: string,
): typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN {
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
      `MYEONGHA_SUPABASE_URL must target governed production project ${MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF}.`,
    );
  }

  return MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
}

function parseAdminSecret(
  value: string,
  publicApiKey: string | undefined,
): string {
  if (
    value.trim() !== value ||
    value.length < 32 ||
    value.length > 4_096 ||
    /\s/u.test(value)
  ) {
    return fail('MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET is invalid.');
  }

  if (
    typeof publicApiKey === 'string' &&
    publicApiKey.length > 0 &&
    value === publicApiKey
  ) {
    return fail(
      'MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET must be distinct from the ordinary Supabase API key.',
    );
  }

  return value;
}

export function parseProductionAccountDeletionAuthAdminConfigV1(
  env: ProductionAccountDeletionAuthAdminEnvV1,
): ProductionAccountDeletionAuthAdminConfigV1 {
  const supabaseOrigin = parseSupabaseOrigin(
    requiredEnv(env, PRODUCTION_ACCOUNT_DELETION_AUTH_ADMIN_ENV_V1.supabaseUrl),
  );
  const adminSecret = parseAdminSecret(
    requiredEnv(env, PRODUCTION_ACCOUNT_DELETION_AUTH_ADMIN_ENV_V1.adminSecret),
    env[PRODUCTION_ACCOUNT_DELETION_AUTH_ADMIN_ENV_V1.publicApiKey],
  );

  return Object.freeze({
    supabaseOrigin,
    adminSecret,
  });
}

export function summarizeProductionAccountDeletionAuthAdminConfigV1(
  config: ProductionAccountDeletionAuthAdminConfigV1,
): ProductionAccountDeletionAuthAdminConfigSummaryV1 {
  if (config.supabaseOrigin !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN) {
    return fail('Account-deletion Auth Admin config summary received an invalid origin.');
  }
  if (typeof config.adminSecret !== 'string' || config.adminSecret.length < 32) {
    return fail('Account-deletion Auth Admin config summary received an invalid secret.');
  }

  return Object.freeze({
    supabaseProjectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    adminSecretConfigured: true,
  });
}
