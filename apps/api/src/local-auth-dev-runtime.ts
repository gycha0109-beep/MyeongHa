import { Pool } from 'pg';
import type {
  NodePostgresDriverPoolV1,
  NodePostgresDriverClientV1,
  NodePostgresSubjectPoolOptionsV1,
} from './node-postgres-subject-pool.js';
import { createNodePostgresSubjectPoolFromDriverV1 } from './node-postgres-subject-pool.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeConfigV1,
} from './production-user-data-runtime-config.js';

export const LOCAL_AUTH_MODE_V1 = 'isolated-v1' as const;
const LOCAL_APP_ORIGIN = 'http://127.0.0.1:8787';
const LOCAL_GOTRUE_ORIGIN = 'http://127.0.0.1:15432';
const LOCAL_GOTRUE_BROWSER_ORIGIN = 'http://127.0.0.1:15432';
const LOCAL_APP_DATABASE = 'myeongha_saju_subject_local_verify';
const LOCAL_APP_LOGIN = 'myeongha_runtime';
const LOCAL_IDENTITY_SYNC_LOGIN = 'myeongha_local_auth_sync';

export interface LocalAuthRuntimeConfigV1 {
  readonly userData: ProductionUserDataRuntimeConfigV1;
  readonly appOrigin: typeof LOCAL_APP_ORIGIN;
  readonly goTrueOrigin: typeof LOCAL_GOTRUE_ORIGIN;
  readonly goTrueBrowserOrigin: typeof LOCAL_GOTRUE_BROWSER_ORIGIN;
  readonly goTrueApiKey: string;
  readonly rateLimitSecret: string;
  readonly identitySyncDatabaseUrl: string;
  readonly guestSessionTtlSeconds: number;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Local Auth setting is missing: ${name}.`);
  return value;
}

function localDatabaseUrl(raw: string, expectedLogin: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Local Auth database URL is invalid.'); }
  if (url.protocol !== 'postgres:' || url.hostname !== '127.0.0.1' || url.port !== '15433' ||
      url.pathname !== `/${LOCAL_APP_DATABASE}` || decodeURIComponent(url.username) !== expectedLogin ||
      !url.password || url.searchParams.get('sslmode') !== 'disable' ||
      [...url.searchParams.keys()].some(key => key !== 'sslmode') || url.hash || url.search === '') {
    throw new Error('Local Auth database URL must target the isolated subject-db container.');
  }
  return raw;
}

export function isIsolatedLocalAuthRequestV1(
  request: Request,
  env: Record<string, string | undefined> | undefined,
): boolean {
  let origin: string;
  try {
    origin = new URL(request.url).origin;
  } catch { return false; }
  // Do not probe local-only bindings on production requests. Apart from
  // preserving least-authority reads, this keeps hostile/missing bindings
  // from changing the existing production admission behavior.
  if (origin !== LOCAL_APP_ORIGIN || env === undefined) return false;
  try {
    return env.MYEONGHA_LOCAL_AUTH_MODE === LOCAL_AUTH_MODE_V1 &&
      env.MYEONGHA_LOCAL_AUTH_ORIGIN === LOCAL_APP_ORIGIN;
  } catch { return false; }
}

export function parseLocalAuthRuntimeConfigV1(
  env: Record<string, string | undefined>,
): LocalAuthRuntimeConfigV1 {
  if (env.MYEONGHA_LOCAL_AUTH_MODE !== LOCAL_AUTH_MODE_V1) {
    throw new Error('Isolated local Auth mode was not explicitly selected.');
  }
  if (required(env, 'MYEONGHA_LOCAL_AUTH_ORIGIN') !== LOCAL_APP_ORIGIN ||
      required(env, 'MYEONGHA_LOCAL_SUPABASE_URL') !== LOCAL_GOTRUE_ORIGIN ||
      required(env, 'MYEONGHA_LOCAL_SUPABASE_BROWSER_URL') !== LOCAL_GOTRUE_BROWSER_ORIGIN) {
    throw new Error('Local Auth origins do not match the fixed isolated stack.');
  }
  const databaseUrl = localDatabaseUrl(required(env, 'MYEONGHA_LOCAL_DATABASE_URL'), LOCAL_APP_LOGIN);
  const identitySyncDatabaseUrl = localDatabaseUrl(
    required(env, 'MYEONGHA_LOCAL_IDENTITY_SYNC_DATABASE_URL'), LOCAL_IDENTITY_SYNC_LOGIN,
  );
  const apiKey = required(env, 'MYEONGHA_LOCAL_SUPABASE_API_KEY');
  const fingerprintSecret = required(env, 'MYEONGHA_LOCAL_GUEST_FINGERPRINT_SECRET');
  const rateLimitSecret = required(env, 'MYEONGHA_LOCAL_AUTH_RATE_LIMIT_SECRET');
  if (apiKey.length < 20 || fingerprintSecret.length < 32 || rateLimitSecret.length < 32) {
    throw new Error('Local Auth test credentials do not meet minimum lengths.');
  }
  const ttl = required(env, 'MYEONGHA_LOCAL_GUEST_SESSION_TTL_SECONDS');
  if (!/^[1-9][0-9]*$/u.test(ttl) || !Number.isSafeInteger(Number(ttl))) {
    throw new Error('Local Guest session TTL must be a positive whole number of seconds.');
  }
  return Object.freeze({
    appOrigin: LOCAL_APP_ORIGIN,
    goTrueOrigin: LOCAL_GOTRUE_ORIGIN,
    goTrueBrowserOrigin: LOCAL_GOTRUE_BROWSER_ORIGIN,
    goTrueApiKey: apiKey,
    rateLimitSecret,
    identitySyncDatabaseUrl,
    guestSessionTtlSeconds: Number(ttl),
    userData: Object.freeze({
      databaseUrl,
      databasePrincipal: LOCAL_APP_LOGIN,
      databaseExecutionRole: MYEONGHA_API_EXECUTION_ROLE,
      supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
      supabaseApiKey: apiKey,
      guestFingerprintSecret: fingerprintSecret,
    }),
  });
}

export function createLocalAuthSubjectPoolV1(
  config: LocalAuthRuntimeConfigV1,
  options: NodePostgresSubjectPoolOptionsV1 = {},
): PostgresSubjectPoolV1 & { close(): Promise<void> } {
  const pool = new Pool({
    connectionString: config.userData.databaseUrl,
    ssl: false,
    max: options.maxConnectionsPerRuntime ?? 1,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 1_500,
    idleTimeoutMillis: options.idleTimeoutMs ?? 1_000,
    statement_timeout: options.statementTimeoutMs ?? 1_500,
    allowExitOnIdle: true,
  });
  const driverPool: NodePostgresDriverPoolV1 = {
    async connect(): Promise<NodePostgresDriverClientV1> {
      const client = await pool.connect();
      return {
        async query(text, values) {
          const result = values === undefined ? await client.query(text) : await client.query(text, [...values]);
          return { rows: result.rows as readonly Record<string, unknown>[] };
        },
        release(error) { client.release(error); },
      };
    },
    end: () => pool.end(),
  };
  const subjectPool = createNodePostgresSubjectPoolFromDriverV1({
    driverPool,
    expectedLoginPrincipal: LOCAL_APP_LOGIN,
  });
  return Object.assign(subjectPool, { close: () => pool.end() });
}

export function localGoTrueMemberFetchV1(
  config: LocalAuthRuntimeConfigV1,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const upstream = new URL(String(input));
    if (upstream.origin !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN ||
        upstream.pathname !== '/auth/v1/user' || upstream.search !== '') {
      throw new Error('Local identity verification rejected an unexpected Auth URL.');
    }
    return fetch(`${config.goTrueOrigin}/user`, { ...init, redirect: 'manual' });
  };
}

export async function syncLocalAuthIdentityV1(
  config: LocalAuthRuntimeConfigV1,
  userId: string,
): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(userId)) {
    throw new Error('GoTrue returned an invalid local user id.');
  }
  const pool = new Pool({ connectionString: config.identitySyncDatabaseUrl, ssl: false, max: 1,
    connectionTimeoutMillis: 1_500, statement_timeout: 1_500, allowExitOnIdle: true });
  try {
    const client = await pool.connect();
    try {
      const identity = await client.query('select current_user::text as login, ' +
        "has_column_privilege(current_user, 'auth.users', 'id', 'INSERT') as can_insert");
      if (identity.rows.length !== 1 || identity.rows[0]?.login !== LOCAL_IDENTITY_SYNC_LOGIN ||
          identity.rows[0]?.can_insert !== true) {
        throw new Error('Local identity-sync principal preflight failed.');
      }
      await client.query('insert into auth.users (id) values ($1::uuid) on conflict do nothing', [userId]);
    } finally { client.release(); }
  } finally { await pool.end(); }
}
