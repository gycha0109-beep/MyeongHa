import { randomBytes, randomUUID } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const ORIGIN = `https://${PROJECT_REF}.supabase.co`;
const CONFIRMATION = 'RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY';
const PROVIDER = 'myeongha-privacy-canary-v1';
const API_EXECUTION_ROLE = 'myeongha_api_executor';
const API_CANARY_ROLE_MARKER = 'myeongha:privacy-canary-api-login:v1';
const WORKER_DATABASE_PRINCIPAL = 'myeongha_worker_runtime';
const WORKER_EXECUTION_ROLE = 'myeongha_system_executor';
const WORKER_ROLE_MARKER = 'myeongha:production-worker-login-principal:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

class CanaryFailure extends Error {
  constructor(code) {
    super(code);
    this.name = 'CanaryFailure';
    this.code = code;
  }
}

function fail(code) {
  throw new CanaryFailure(code);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) fail(`MISSING_${name}`);
  return value;
}

function privilegedAdminDatabaseUrl() {
  const url = new URL('postgresql://localhost/postgres');
  url.hostname = requiredEnv('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
  url.port = '5432';
  url.username = `postgres.${PROJECT_REF}`;
  url.password = requiredEnv('SUPABASE_DB_PASSWORD');
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

function requireRunId(value) {
  if (!/^[1-9][0-9]{0,19}$/u.test(value ?? '')) fail('INVALID_RUN_ID');
  return value;
}

function apiCanaryRoleName() {
  const roleName = `myeongha_privacy_canary_${requireRunId(process.env.GITHUB_RUN_ID)}`;
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(roleName)) fail('API_CANARY_ROLE_INVALID');
  return roleName;
}

function expectedApiDatabasePrincipal() {
  const roleName = apiCanaryRoleName();
  if (requiredEnv('MYEONGHA_DATABASE_PRINCIPAL') !== roleName) {
    fail('API_DATABASE_PRINCIPAL_INVALID');
  }
  return roleName;
}

function requireUuid(value, code) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code);
  return value.toLowerCase();
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (text.length > 64 * 1024) fail('PROVIDER_BODY_TOO_LARGE');
  try {
    return text.length === 0 ? null : JSON.parse(text);
  } catch {
    fail('INVALID_PROVIDER_JSON');
  }
}

async function fetchWithTimeout(url, init, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    fail('PROVIDER_TRANSPORT_FAILURE');
  } finally {
    clearTimeout(timer);
  }
}

function resolveAdminSecret() {
  const secret = requiredEnv('MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET');
  if (
    secret.trim() !== secret ||
    secret.length < 16 ||
    secret.length > 4_096 ||
    /\s/u.test(secret)
  ) {
    fail('AUTH_ADMIN_SECRET_INVALID');
  }
  return secret;
}

async function runtimeModules() {
  const [
    authConfigModule,
    authDeletionModule,
    workerDbConfigModule,
    workerRuntimeModule,
    workerPoolModule,
    postgresPoolModule,
    privilegedPostgresTlsModule,
    postgresTlsModule,
  ] = await Promise.all([
    import('../dist/apps/api/src/production-account-deletion-auth-admin-config.js'),
    import('../dist/apps/api/src/supabase-auth-admin-user-deletion.js'),
    import('../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
    import('../dist/apps/api/src/production-account-deletion-worker-runtime.js'),
    import('../dist/apps/api/src/node-postgres-account-deletion-worker-pool.js'),
    import('../dist/apps/api/src/node-postgres-subject-pool.js'),
    import('../dist/apps/api/src/production-privileged-postgres-tls-peer-verification.js'),
    import('../dist/apps/api/src/production-postgres-tls-peer-verification.js'),
  ]);
  return {
    ...authConfigModule,
    ...authDeletionModule,
    ...workerDbConfigModule,
    ...workerRuntimeModule,
    ...workerPoolModule,
    ...postgresPoolModule,
    ...privilegedPostgresTlsModule,
    ...postgresTlsModule,
  };
}

async function createAdminPool() {
  const { buildProductionPrivilegedPostgresStrictTlsTargetV1 } =
    await runtimeModules();
  const target = buildProductionPrivilegedPostgresStrictTlsTargetV1({
    databaseUrl: privilegedAdminDatabaseUrl(),
    rootCertificatePem: requiredEnv(
      'MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM',
    ),
  });
  return new Pool({
    connectionString: target.connectionString,
    ssl: target.ssl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    allowExitOnIdle: true,
  });
}

async function provisionApiCanaryLogin() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }

  const roleName = apiCanaryRoleName();
  const password = randomBytes(32).toString('hex');
  const roleIdentifier = `"${roleName}"`;
  const pool = await createAdminPool();
  let created = false;

  try {
    const client = await pool.connect();
    try {
      const existing = await client.query(
        'select 1 from pg_catalog.pg_roles where rolname = $1',
        [roleName],
      );
      if (existing.rows.length !== 0) fail('API_CANARY_ROLE_ALREADY_EXISTS');

      await client.query(
        `create role ${roleIdentifier}
           login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls
           password '${password}'`,
      );
      created = true;
      await client.query(
        `comment on role ${roleIdentifier} is '${API_CANARY_ROLE_MARKER}'`,
      );
      await client.query(`grant ${API_EXECUTION_ROLE} to ${roleIdentifier}`);

      const verified = await client.query(
        `select
           r.rolcanlogin,
           r.rolsuper,
           r.rolcreatedb,
           r.rolcreaterole,
           r.rolinherit,
           r.rolreplication,
           r.rolbypassrls,
           a.rolpassword is not null as "hasPassword",
           pg_catalog.shobj_description(r.oid, 'pg_authid') as marker,
           pg_catalog.pg_has_role($1::name, $2::name, 'MEMBER') as "canEnterExecutionRole"
         from pg_catalog.pg_roles r
         join pg_catalog.pg_authid a on a.oid = r.oid
         where r.rolname = $1`,
        [roleName, API_EXECUTION_ROLE],
      );
      const row = verified.rows[0];
      if (
        verified.rows.length !== 1 ||
        row?.rolcanlogin !== true ||
        row?.rolsuper !== false ||
        row?.rolcreatedb !== false ||
        row?.rolcreaterole !== false ||
        row?.rolinherit !== false ||
        row?.rolreplication !== false ||
        row?.rolbypassrls !== false ||
        row?.hasPassword !== true ||
        row?.marker !== API_CANARY_ROLE_MARKER ||
        row?.canEnterExecutionRole !== true
      ) {
        fail('API_CANARY_ROLE_SHAPE_INVALID');
      }
    } catch (error) {
      if (created) {
        try {
          await client.query(`revoke ${API_EXECUTION_ROLE} from ${roleIdentifier}`);
          await client.query(`drop role ${roleIdentifier}`);
        } catch {
          // Preserve the provisioning failure as authoritative.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const adminUrl = new URL(privilegedAdminDatabaseUrl());
  adminUrl.username = `${roleName}.${PROJECT_REF}`;
  adminUrl.password = password;
  const databaseUrl = adminUrl.toString();

  console.log(`::add-mask::${password}`);
  console.log(`::add-mask::${databaseUrl}`);
  await appendFile(
    requiredEnv('GITHUB_ENV'),
    `MYEONGHA_DATABASE_PRINCIPAL=${roleName}\nMYEONGHA_DATABASE_URL=${databaseUrl}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_API_LOGIN_PROVISIONED');
}

async function cleanupApiCanaryLogin() {
  const roleName = apiCanaryRoleName();
  const roleIdentifier = `"${roleName}"`;
  const pool = await createAdminPool();
  try {
    const client = await pool.connect();
    try {
      const existing = await client.query(
        `select pg_catalog.shobj_description(r.oid, 'pg_authid') as marker
         from pg_catalog.pg_roles r
         where r.rolname = $1`,
        [roleName],
      );
      if (existing.rows.length === 0) {
        console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_API_LOGIN_CLEANUP_SKIP');
        return;
      }
      if (
        existing.rows.length !== 1 ||
        existing.rows[0]?.marker !== API_CANARY_ROLE_MARKER
      ) {
        fail('API_CANARY_ROLE_CLEANUP_GUARD_FAILED');
      }
      await client.query(`revoke ${API_EXECUTION_ROLE} from ${roleIdentifier}`);
      await client.query(`drop role ${roleIdentifier}`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_API_LOGIN_CLEANUP_PASS');
}

async function createApiPool() {
  const {
    buildProductionPostgresStrictTlsTargetV1,
    PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
    PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
    PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
  } = await runtimeModules();
  const databaseUrl = requiredEnv('MYEONGHA_DATABASE_URL');
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    fail('API_DATABASE_AUTHORITY_INVALID');
  }
  const poolerHost = requiredEnv('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
  if (
    !/^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u.test(poolerHost) ||
    url.hostname !== poolerHost ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    decodeURIComponent(url.username) !== `${expectedApiDatabasePrincipal()}.${PROJECT_REF}` ||
    url.searchParams.get('sslmode') !== 'verify-full'
  ) {
    fail('API_DATABASE_AUTHORITY_INVALID');
  }
  const target = buildProductionPostgresStrictTlsTargetV1({
    databaseUrl,
    rootCertificatePem: requiredEnv('MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM'),
    authority: {
      contractVersion: PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
      projectRef: PROJECT_REF,
      requiredTlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
      rootCertificateFingerprint256: PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
    },
  });
  return new Pool({
    connectionString: target.connectionString,
    ssl: target.ssl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    allowExitOnIdle: true,
  });
}

async function assertApiRuntimePrincipal(client) {
  const expectedPrincipal = expectedApiDatabasePrincipal();
  const result = await client.query(
    `select
       current_user::text as "currentUser",
       r.rolcanlogin,
       r.rolsuper,
       r.rolcreatedb,
       r.rolcreaterole,
       r.rolinherit,
       r.rolreplication,
       r.rolbypassrls,
       pg_catalog.shobj_description(r.oid, 'pg_authid') as marker,
       pg_catalog.pg_has_role(current_user, $1::name, 'MEMBER') as "canEnterExecutionRole"
     from pg_catalog.pg_roles r
     where r.rolname = current_user`,
    [API_EXECUTION_ROLE],
  );
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    row?.currentUser !== expectedPrincipal ||
    row?.rolcanlogin !== true ||
    row?.rolsuper !== false ||
    row?.rolcreatedb !== false ||
    row?.rolcreaterole !== false ||
    row?.rolinherit !== false ||
    row?.rolreplication !== false ||
    row?.rolbypassrls !== false ||
    row?.marker !== API_CANARY_ROLE_MARKER ||
    row?.canEnterExecutionRole !== true
  ) {
    fail('API_DATABASE_PRINCIPAL_INVALID');
  }
}

async function authHeaders(secret) {
  const { createSupabaseAuthAdminCredentialHeadersV1 } = await runtimeModules();
  return createSupabaseAuthAdminCredentialHeadersV1(secret);
}

async function createHostedUser(secret, runId) {
  const email = `myeongha-privacy-canary-${runId}-${randomUUID()}@example.com`;
  const response = await fetchWithTimeout(`${ORIGIN}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(await authHeaders(secret)),
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: {
        myeongha_canary: PROVIDER,
        canary_run_id: runId,
      },
    }),
  });
  if (!response.ok) fail(`AUTH_CREATE_REJECTED_${response.status}`);
  const payload = await readBoundedJson(response);
  return requireUuid(payload?.id ?? payload?.user?.id, 'AUTH_CREATE_ID_INVALID');
}

async function deleteHostedUserBestEffort(secret, authUserId) {
  const response = await fetchWithTimeout(
    `${ORIGIN}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        ...(await authHeaders(secret)),
      },
    },
  );
  if (![200, 204, 404].includes(response.status)) {
    fail(`AUTH_CLEANUP_REJECTED_${response.status}`);
  }
  try {
    void response.body?.cancel();
  } catch {
    // Best-effort response cleanup only.
  }
}

async function assertHostedUserAbsent(secret, authUserId) {
  const response = await fetchWithTimeout(
    `${ORIGIN}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(await authHeaders(secret)),
      },
    },
  );
  if (response.status !== 404) {
    try {
      void response.body?.cancel();
    } catch {
      // Best-effort response cleanup only.
    }
    fail(`AUTH_USER_STILL_PRESENT_${response.status}`);
  }
  try {
    void response.body?.cancel();
  } catch {
    // Best-effort response cleanup only.
  }
}

function statePath() {
  return requiredEnv('MYEONGHA_PRIVACY_CANARY_STATE_PATH');
}

async function writeState(state) {
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function readState() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(statePath(), 'utf8'));
  } catch {
    fail('CANARY_STATE_UNREADABLE');
  }
  if (
    parsed?.schema !== 'myeongha-production-privacy-canary-state-v1' ||
    typeof parsed.phase !== 'string'
  ) {
    fail('CANARY_STATE_INVALID');
  }
  for (const key of [
    'authUserId',
    'subjectId',
    'commerceAccountLinkId',
    'deletionJobId',
    'outboxEventId',
  ]) {
    requireUuid(parsed[key], 'CANARY_STATE_INVALID');
  }
  if (
    typeof parsed.requestDedupeKey !== 'string' ||
    parsed.requestDedupeKey.length === 0
  ) {
    fail('CANARY_STATE_INVALID');
  }
  return parsed;
}

function classifyWorkerDatabaseFailure(error) {
  const code =
    error && typeof error === 'object' && typeof error.code === 'string'
      ? error.code
      : null;
  const message =
    error && typeof error === 'object' && typeof error.message === 'string'
      ? error.message
      : '';

  if (code === 'XX000' && /tenant or user not found/iu.test(message)) {
    return 'WORKER_DB_ROUTING_INVALID';
  }
  if (code === '28P01') return 'WORKER_DB_AUTH_INVALID';
  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH'
  ) {
    return 'WORKER_DB_TRANSPORT_INVALID';
  }
  return null;
}

function canonicalWorkerDatabaseUrl() {
  const source = requiredEnv('MYEONGHA_WORKER_DATABASE_URL');
  let url;
  try {
    url = new URL(source);
  } catch {
    fail('WORKER_DATABASE_URL_SOURCE_INVALID');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    fail('WORKER_DATABASE_URL_SOURCE_INVALID');
  }
  if (url.password.length === 0) {
    fail('WORKER_DATABASE_URL_SOURCE_INVALID');
  }

  const decodedUser = decodeURIComponent(url.username);
  const qualifiedPrincipal = `${WORKER_DATABASE_PRINCIPAL}.${PROJECT_REF}`;
  if (
    decodedUser !== WORKER_DATABASE_PRINCIPAL &&
    decodedUser !== qualifiedPrincipal
  ) {
    fail('WORKER_DATABASE_URL_SOURCE_PRINCIPAL_INVALID');
  }

  const poolerHost = requiredEnv('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
  if (
    !/^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u.test(
      poolerHost,
    )
  ) {
    fail('WORKER_DATABASE_POOLER_HOST_INVALID');
  }

  url.hostname = poolerHost;
  url.port = '5432';
  url.username = qualifiedPrincipal;
  url.pathname = '/postgres';
  url.search = '';
  url.searchParams.set('sslmode', 'require');

  const canonical = url.toString();
  console.log(`::add-mask::${canonical}`);
  return canonical;
}

async function parseWorkerDatabaseConfig() {
  const { parseProductionAccountDeletionWorkerDbConfigV1 } =
    await runtimeModules();
  try {
    return parseProductionAccountDeletionWorkerDbConfigV1({
      ...process.env,
      MYEONGHA_WORKER_DATABASE_URL: canonicalWorkerDatabaseUrl(),
      MYEONGHA_WORKER_DATABASE_PRINCIPAL: WORKER_DATABASE_PRINCIPAL,
    });
  } catch (error) {
    if (error instanceof CanaryFailure) throw error;
    fail('WORKER_CONFIG_INVALID');
  }
}

async function readWorkerRoleProvisioning() {
  const pool = await createAdminPool();
  try {
    const result = await pool.query(
      `select
         r.rolcanlogin,
         r.rolsuper,
         r.rolcreatedb,
         r.rolcreaterole,
         r.rolinherit,
         r.rolreplication,
         r.rolbypassrls,
         a.rolpassword is not null as "hasPassword",
         pg_catalog.shobj_description(r.oid, 'pg_authid') as marker,
         pg_catalog.pg_has_role($1::name, $2::name, 'MEMBER') as "canEnterExecutionRole"
       from pg_catalog.pg_roles r
       join pg_catalog.pg_authid a on a.oid = r.oid
       where r.rolname = $1`,
      [WORKER_DATABASE_PRINCIPAL, WORKER_EXECUTION_ROLE],
    );
    const row = result.rows[0];
    if (result.rows.length !== 1) fail('WORKER_ROLE_MISSING');
    if (
      row?.rolcanlogin !== true ||
      row?.rolsuper !== false ||
      row?.rolcreatedb !== false ||
      row?.rolcreaterole !== false ||
      row?.rolinherit !== false ||
      row?.rolreplication !== false ||
      row?.rolbypassrls !== false ||
      row?.marker !== WORKER_ROLE_MARKER
    ) {
      fail('WORKER_ROLE_SHAPE_INVALID');
    }
    if (row?.canEnterExecutionRole !== true) {
      fail('WORKER_EXECUTION_ROLE_UNAVAILABLE');
    }
    return row;
  } finally {
    await pool.end();
  }
}

async function assertWorkerRoleProvisioned() {
  const row = await readWorkerRoleProvisioning();
  if (row?.hasPassword !== true) fail('WORKER_ROLE_PASSWORD_MISSING');
}

function protectedWorkerPassword() {
  const canonical = canonicalWorkerDatabaseUrl();
  const url = new URL(canonical);
  let password;
  try {
    password = decodeURIComponent(url.password);
  } catch {
    fail('WORKER_DATABASE_URL_SOURCE_INVALID');
  }
  if (
    typeof password !== 'string' ||
    password.length < 16 ||
    password.length > 512 ||
    /[\u0000\r\n]/u.test(password)
  ) {
    fail('WORKER_DATABASE_PASSWORD_INVALID');
  }
  console.log(`::add-mask::${password}`);
  return password;
}

async function syncWorkerPassword() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  if (
    requiredEnv('MYEONGHA_WORKER_CREDENTIAL_ACTION') !== 'sync_from_secret' ||
    requiredEnv('MYEONGHA_WORKER_CREDENTIAL_CONFIRMATION') !==
      'SYNC_PRODUCTION_WORKER_PASSWORD'
  ) {
    fail('WORKER_PASSWORD_SYNC_CONFIRMATION_REQUIRED');
  }

  const current = await readWorkerRoleProvisioning();
  if (current?.hasPassword === true) {
    console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_WORKER_PASSWORD_SYNC_SKIP');
    return;
  }

  const password = protectedWorkerPassword();
  const pool = await createAdminPool();
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query(
        `select a.rolpassword is not null as "hasPassword"
         from pg_catalog.pg_authid a
         where a.rolname = $1`,
        [WORKER_DATABASE_PRINCIPAL],
      );
      if (before.rows.length !== 1 || before.rows[0]?.hasPassword !== false) {
        fail('WORKER_PASSWORD_SYNC_STATE_CHANGED');
      }

      const generated = await client.query(
        `select pg_catalog.format(
           'alter role %I password %L',
           $1::text,
           $2::text
         ) as sql`,
        [WORKER_DATABASE_PRINCIPAL, password],
      );
      const sql = generated.rows[0]?.sql;
      if (generated.rows.length !== 1 || typeof sql !== 'string') {
        fail('WORKER_PASSWORD_SYNC_SQL_INVALID');
      }
      await client.query(sql);

      const after = await client.query(
        `select a.rolpassword is not null as "hasPassword"
         from pg_catalog.pg_authid a
         where a.rolname = $1`,
        [WORKER_DATABASE_PRINCIPAL],
      );
      if (after.rows.length !== 1 || after.rows[0]?.hasPassword !== true) {
        fail('WORKER_PASSWORD_SYNC_VERIFY_FAILED');
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Original failure remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_WORKER_PASSWORD_SYNC_PASS');
}

async function preflightWorker() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  requiredEnv('MYEONGHA_WORKER_DATABASE_URL');
  await assertWorkerRoleProvisioned();

  const {
    createNodePostgresAccountDeletionWorkerPoolV1,
  } = await runtimeModules();
  const databaseConfig = await parseWorkerDatabaseConfig();
  const pool = createNodePostgresAccountDeletionWorkerPoolV1(databaseConfig);
  try {
    let connection;
    try {
      connection = await pool.connect();
    } catch (error) {
      const classified = classifyWorkerDatabaseFailure(error);
      if (classified !== null) fail(classified);
      throw error;
    } finally {
      connection?.release();
    }
  } finally {
    await pool.close();
  }

  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_WORKER_DB_PREFLIGHT_PASS');
}

async function recoverResumeState() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  const sourceRunId = requireRunId(
    requiredEnv('MYEONGHA_PRIVACY_CANARY_RESUME_RUN_ID'),
  );
  const pool = await createAdminPool();
  try {
    const result = await pool.query(
      `select
         s.id::text as "subjectId",
         s.auth_user_id::text as "authUserId",
         s.status as "subjectStatus",
         cal.id::text as "commerceAccountLinkId",
         cal.status as "commerceStatus",
         dj.id::text as "deletionJobId",
         dj.request_dedupe_key as "requestDedupeKey",
         dj.status as "deletionJobStatus",
         oe.id::text as "outboxEventId",
         oe.status as "outboxStatus",
         oe.lease_expires_at as "leaseExpiresAt"
       from public.commerce_account_links cal
       join public.subjects s
         on s.id = cal.subject_id
       join public.data_deletion_jobs dj
         on dj.subject_id = s.id
        and dj.scope = 'account'
       join public.outbox_events oe
         on oe.aggregate_type = 'data_deletion_job'
        and oe.aggregate_id = dj.id::text
        and oe.event_type = 'ACCOUNT_DELETION_STARTED'
        and oe.event_schema_version = 'v1'
        and oe.dedupe_key = 'account-delete-start-v1'
       where cal.provider = $1::text
         and cal.external_account_fingerprint like $2::text`,
      [PROVIDER, `synthetic:${sourceRunId}:%`],
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      row?.subjectStatus !== 'deletion_pending' ||
      row?.commerceStatus !== 'active' ||
      row?.deletionJobStatus !== 'running' ||
      !['pending', 'processing'].includes(row?.outboxStatus) ||
      (row?.outboxStatus === 'processing' &&
        row?.leaseExpiresAt instanceof Date &&
        row.leaseExpiresAt.getTime() > Date.now())
    ) {
      fail('RESUME_STATE_NOT_RECOVERABLE');
    }

    const state = {
      schema: 'myeongha-production-privacy-canary-state-v1',
      phase: 'deletion_started',
      sourceCanaryRunId: sourceRunId,
      authUserId: requireUuid(row.authUserId, 'RESUME_STATE_INVALID'),
      subjectId: requireUuid(row.subjectId, 'RESUME_STATE_INVALID'),
      commerceAccountLinkId: requireUuid(
        row.commerceAccountLinkId,
        'RESUME_STATE_INVALID',
      ),
      deletionJobId: requireUuid(row.deletionJobId, 'RESUME_STATE_INVALID'),
      outboxEventId: requireUuid(row.outboxEventId, 'RESUME_STATE_INVALID'),
      requestDedupeKey:
        typeof row.requestDedupeKey === 'string' &&
        row.requestDedupeKey.length > 0
          ? row.requestDedupeKey
          : fail('RESUME_STATE_INVALID'),
    };
    await writeState(state);
  } finally {
    await pool.end();
  }

  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_RESUME_STATE_RECOVERED');
}

async function prepare() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  const runId = requireRunId(process.env.GITHUB_RUN_ID);
  const secret = resolveAdminSecret();
  const authUserId = await createHostedUser(secret, runId);
  const state = {
    schema: 'myeongha-production-privacy-canary-state-v1',
    phase: 'preparing',
    authUserId,
    subjectId: randomUUID(),
    commerceAccountLinkId: randomUUID(),
    deletionJobId: randomUUID(),
    outboxEventId: randomUUID(),
    requestDedupeKey: `privacy-canary-${runId}-${randomUUID()}`,
  };

  const pool = await createAdminPool();
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `insert into public.subjects(
           id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
         ) values ($1::uuid, 'member', $2::uuid, 'active', null, clock_timestamp(), clock_timestamp())`,
        [state.subjectId, state.authUserId],
      );
      await client.query(
        `insert into public.profiles(
           subject_id, display_name, locale, timezone, onboarding_state, created_at, updated_at
         ) values ($1::uuid, 'Synthetic Privacy Canary', 'ko-KR', 'Asia/Seoul', 'canary', clock_timestamp(), clock_timestamp())`,
        [state.subjectId],
      );
      await client.query(
        `insert into public.commerce_account_links(
           id, subject_id, provider, external_account_fingerprint, status,
           verified_at, revoked_at, created_at
         ) values (
           $1::uuid, $2::uuid, $3::text, $4::text, 'active',
           clock_timestamp(), null, clock_timestamp()
         )`,
        [
          state.commerceAccountLinkId,
          state.subjectId,
          PROVIDER,
          `synthetic:${runId}:${randomUUID()}`,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Original failure remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  } catch {
    await deleteHostedUserBestEffort(secret, authUserId);
    fail('PREPARE_DATABASE_FAILED');
  } finally {
    await pool.end();
  }

  state.phase = 'prepared';
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_PREPARED');
}

async function startDeletion(state) {
  const pool = await createApiPool();
  try {
    const client = await pool.connect();
    try {
      await assertApiRuntimePrincipal(client);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE myeongha_api_executor');
      const resolved = await client.query(
        `select subject_id::text as "subjectId", subject_kind as "subjectKind"
         from public.begin_member_subject_context_v1($1::uuid)`,
        [state.authUserId],
      );
      if (
        resolved.rows.length !== 1 ||
        resolved.rows[0]?.subjectId !== state.subjectId ||
        resolved.rows[0]?.subjectKind !== 'member'
      ) {
        fail('API_SUBJECT_CONTEXT_MISMATCH');
      }

      const started = await client.query(
        `select
           deletion_job_id::text as "deletionJobId",
           deletion_job_status as "status",
           replayed
         from public.cmd_start_account_deletion_runtime_v1(
           $1::uuid, $2::uuid, $3::text, $4::uuid
         )`,
        [
          state.subjectId,
          state.deletionJobId,
          state.requestDedupeKey,
          state.outboxEventId,
        ],
      );
      const row = started.rows[0];
      if (
        started.rows.length !== 1 ||
        row?.deletionJobId !== state.deletionJobId ||
        row?.status !== 'running' ||
        row?.replayed !== false
      ) {
        fail('ACCOUNT_DELETION_START_RESULT_INVALID');
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Original failure remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function runWorker(state, secret) {
  const {
    parseProductionAccountDeletionAuthAdminConfigV1,
    createProductionAccountDeletionWorkerRuntimeV1,
  } = await runtimeModules();

  const databaseConfig = await parseWorkerDatabaseConfig();
  let authAdminConfig;
  try {
    authAdminConfig = parseProductionAccountDeletionAuthAdminConfigV1({
      ...process.env,
      MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET: secret,
    });
  } catch {
    fail('WORKER_CONFIG_INVALID');
  }

  const lease = createProductionAccountDeletionWorkerRuntimeV1({
    databaseConfig,
    authAdminConfig,
  });
  try {
    const result = await lease.runtime.run({
      outboxEventId: state.outboxEventId,
      lockOwner: `privacy-canary-${requireRunId(process.env.GITHUB_RUN_ID)}`,
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (
      result.worker.status !== 'completed' ||
      result.worker.alreadyCompleted !== false ||
      result.worker.authDeletionInvoked !== true ||
      !['deleted', 'already_absent'].includes(result.worker.authDeletionOutcome)
    ) {
      fail('WORKER_RESULT_INVALID');
    }
    return result.worker;
  } finally {
    await lease.close();
  }
}

async function verifyFinalState(state, secret, worker) {
  const pool = await createAdminPool();
  try {
    const result = await pool.query(
      `select
         s.status as subject_status,
         s.auth_user_id,
         dj.status as job_status,
         dj.completed_at,
         oe.status as outbox_status,
         oe.processed_at,
         cal.provider,
         cal.status as commerce_status,
         cal.revoked_at,
         (select count(*)::int from public.profiles p where p.subject_id = s.id) as profile_count
       from public.subjects s
       join public.data_deletion_jobs dj
         on dj.id = $2::uuid and dj.subject_id = s.id
       join public.outbox_events oe
         on oe.id = $3::uuid
        and oe.aggregate_type = 'data_deletion_job'
        and oe.aggregate_id = dj.id::text
       join public.commerce_account_links cal
         on cal.id = $4::uuid and cal.subject_id = s.id
       where s.id = $1::uuid`,
      [
        state.subjectId,
        state.deletionJobId,
        state.outboxEventId,
        state.commerceAccountLinkId,
      ],
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      row?.subject_status !== 'deleted' ||
      row?.auth_user_id !== null ||
      row?.job_status !== 'completed' ||
      row?.completed_at === null ||
      row?.outbox_status !== 'processed' ||
      row?.processed_at === null ||
      row?.provider !== PROVIDER ||
      row?.commerce_status !== 'revoked' ||
      row?.revoked_at === null ||
      row?.profile_count !== 0
    ) {
      fail('FINAL_DATABASE_STATE_INVALID');
    }
  } finally {
    await pool.end();
  }

  await assertHostedUserAbsent(secret, state.authUserId);

  const evidencePath = requiredEnv('MYEONGHA_PRIVACY_CANARY_EVIDENCE_PATH');
  const evidence = {
    schema: 'myeongha-production-privacy-recovery-canary-evidence-v1',
    productionProjectRef: PROJECT_REF,
    fixtureClass: 'synthetic-disposable-member',
    canaryOperation: state.sourceCanaryRunId === undefined ? 'fresh' : 'resume',
    resumedFromCanaryRunId:
      state.sourceCanaryRunId === undefined ? null : Number(state.sourceCanaryRunId),
    commerceProvider: PROVIDER,
    accountDeletionStartAuthority: 'ephemeral-canary-login->myeongha_api_executor/cmd_start_account_deletion_runtime_v1',
    workerAuthority: 'myeongha_worker_runtime->myeongha_system_executor',
    workerStatus: worker.status,
    hostedAuthDeletionInvoked: worker.authDeletionInvoked,
    hostedAuthDeletionOutcome: worker.authDeletionOutcome,
    databaseFinalization: 'pass',
    completionAck: 'pass',
    personalizationNonResurrectionGuard: 'pass',
    commerceP5yRetentionGuard: 'retained-revoked-pass',
    outputContainsIdentifiers: false,
    outputContainsRowPayloads: false,
    authoritativePrivacyReconciliation: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function execute() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  requiredEnv('MYEONGHA_DATABASE_URL');
  requiredEnv('MYEONGHA_WORKER_DATABASE_URL');
  const state = await readState();
  if (state.phase !== 'prepared') fail('CANARY_NOT_PREPARED');

  await startDeletion(state);
  state.phase = 'deletion_started';
  await writeState(state);

  const secret = resolveAdminSecret();
  const worker = await runWorker(state, secret);
  await verifyFinalState(state, secret, worker);

  state.phase = 'completed';
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_DELETE_PASS');
}

async function resumeDeletion() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  requiredEnv('MYEONGHA_WORKER_DATABASE_URL');
  const state = await readState();
  if (state.phase !== 'deletion_started') fail('CANARY_NOT_RESUMABLE');

  const sourceRunId = requireRunId(
    requiredEnv('MYEONGHA_PRIVACY_CANARY_RESUME_RUN_ID'),
  );
  if (state.sourceCanaryRunId !== sourceRunId) {
    fail('RESUME_SOURCE_RUN_MISMATCH');
  }

  const secret = resolveAdminSecret();
  const worker = await runWorker(state, secret);
  await verifyFinalState(state, secret, worker);

  state.phase = 'completed';
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_RESUME_PASS');
}

// Restore only the known synthetic fixture stranded by protected run 40322743599.
// Source authority is pinned by its GitHub run, DB link, hosted Auth identity,
// unused signup-credit shape and absence of an account-deletion start.
const ORPHAN_PRESTART_SOURCE_RUN_ID = '40322743599';

async function recoverOrphanPrestartState() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  if (
    requiredEnv('MYEONGHA_PRIVACY_CANARY_ORPHAN_RUN_ID') !==
    ORPHAN_PRESTART_SOURCE_RUN_ID
  ) {
    fail('ORPHAN_SOURCE_RUN_NOT_APPROVED');
  }

  const pool = await createAdminPool();
  let rows;
  try {
    const result = await pool.query(
      `select
         s.id::text as "subjectId",
         s.auth_user_id::text as "authUserId",
         cal.id::text as "commerceAccountLinkId"
       from public.commerce_account_links cal
       join public.subjects s on s.id=cal.subject_id
       join public.profiles p on p.subject_id=s.id
       join auth.users u on u.id=s.auth_user_id
       where cal.provider=$1::text
         and cal.external_account_fingerprint like $2::text
         and cal.status='active'
         and s.kind='member' and s.status='active'
         and p.display_name='Synthetic Privacy Canary'
         and p.locale='ko-KR' and p.timezone='Asia/Seoul'
         and p.onboarding_state='canary'
         and u.email like $3::text
         and u.raw_user_meta_data->>'myeongha_canary'=$1::text
         and u.raw_user_meta_data->>'canary_run_id'=$4::text
         and not exists (
           select 1 from public.data_deletion_jobs dj
           where dj.subject_id=s.id
         )
         and (select count(*) from public.chat_credit_lots_v1 lot
              where lot.subject_id=s.id
                and lot.source_kind='signup' and lot.source_ref=s.id
                and lot.credits_issued=50 and lot.credits_remaining=50)=1
         and not exists (
           select 1
           from public.chat_credit_turn_allocations_v1 allocation
           join public.chat_credit_lots_v1 lot on lot.id=allocation.lot_id
           where lot.subject_id=s.id
         )`,
      [
        PROVIDER,
        `synthetic:${ORPHAN_PRESTART_SOURCE_RUN_ID}:%`,
        `myeongha-privacy-canary-${ORPHAN_PRESTART_SOURCE_RUN_ID}-%@example.com`,
        ORPHAN_PRESTART_SOURCE_RUN_ID,
      ],
    );
    rows = result.rows;
  } finally {
    await pool.end();
  }
  if (rows.length !== 1) fail('ORPHAN_PRESTART_NOT_EXACTLY_ONE');
  const row = rows[0];
  const state = {
    schema: 'myeongha-production-privacy-canary-state-v1',
    phase: 'prepared',
    authUserId: requireUuid(row.authUserId, 'ORPHAN_PRESTART_INVALID'),
    subjectId: requireUuid(row.subjectId, 'ORPHAN_PRESTART_INVALID'),
    commerceAccountLinkId: requireUuid(
      row.commerceAccountLinkId,
      'ORPHAN_PRESTART_INVALID',
    ),
    deletionJobId: randomUUID(),
    outboxEventId: randomUUID(),
    requestDedupeKey:
      `privacy-canary-orphan-recovery-${ORPHAN_PRESTART_SOURCE_RUN_ID}`,
  };
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_ORPHAN_PRESTART_RECOVERED');
}

async function verifyOrphanPrestartCleanup() {
  if (
    requiredEnv('MYEONGHA_PRIVACY_CANARY_ORPHAN_RUN_ID') !==
    ORPHAN_PRESTART_SOURCE_RUN_ID
  ) {
    fail('ORPHAN_SOURCE_RUN_NOT_APPROVED');
  }
  const state = await readState();
  if (state.phase !== 'cleaned') fail('ORPHAN_PRESTART_NOT_CLEANED');

  const pool = await createAdminPool();
  try {
    const result = await pool.query(
      `select
         (select count(*)::int from public.subjects
          where id=$1::uuid) as subjects,
         (select count(*)::int from public.profiles
          where subject_id=$1::uuid) as profiles,
         (select count(*)::int from public.commerce_account_links
          where subject_id=$1::uuid) as commerce_links,
         (select count(*)::int from public.chat_credit_lots_v1
          where subject_id=$1::uuid) as credit_lots,
         (select count(*)::int from public.commerce_account_links
          where provider=$2::text and external_account_fingerprint like $3::text)
           as remaining_source_links`,
      [
        state.subjectId,
        PROVIDER,
        `synthetic:${ORPHAN_PRESTART_SOURCE_RUN_ID}:%`,
      ],
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      row?.subjects !== 0 ||
      row?.profiles !== 0 ||
      row?.commerce_links !== 0 ||
      row?.credit_lots !== 0 ||
      row?.remaining_source_links !== 0
    ) {
      fail('ORPHAN_PRESTART_DATABASE_REMAINS');
    }
  } finally {
    await pool.end();
  }
  await assertHostedUserAbsent(resolveAdminSecret(), state.authUserId);
  console.log('PASS_PRODUCTION_PRIVACY_CANARY_ORPHAN_PRESTART_CLEANUP');
}

async function cleanupPrestart() {
  let state;
  try {
    state = await readState();
  } catch {
    console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_CLEANUP_SKIP state=unavailable');
    return;
  }
  if (state.phase !== 'prepared') {
    console.log(`MYEONGHA_PRODUCTION_PRIVACY_CANARY_CLEANUP_SKIP phase=${state.phase}`);
    return;
  }

  const pool = await createAdminPool();
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const guard = await client.query(
        `select status, auth_user_id::text as "authUserId"
         from public.subjects where id = $1::uuid for update`,
        [state.subjectId],
      );
      if (
        guard.rows.length !== 1 ||
        guard.rows[0]?.status !== 'active' ||
        guard.rows[0]?.authUserId !== state.authUserId
      ) {
        fail('CLEANUP_PRESTART_GUARD_FAILED');
      }
      const credits = await client.query(
        `select id::text as id, source_kind as "sourceKind",
                source_ref::text as "sourceRef",
                credits_issued as "creditsIssued",
                credits_remaining as "creditsRemaining"
         from public.chat_credit_lots_v1
         where subject_id = $1::uuid
         for update`,
        [state.subjectId],
      );
      const lot = credits.rows[0];
      if (
        credits.rows.length !== 1 ||
        lot?.sourceKind !== 'signup' ||
        lot?.sourceRef !== state.subjectId ||
        lot?.creditsIssued !== 50 ||
        lot?.creditsRemaining !== 50
      ) {
        fail('CLEANUP_PRESTART_CREDIT_GUARD_FAILED');
      }
      const allocations = await client.query(
        'select 1 from public.chat_credit_turn_allocations_v1 where lot_id = $1::uuid limit 1',
        [lot.id],
      );
      if (allocations.rows.length !== 0) {
        fail('CLEANUP_PRESTART_CREDIT_ALLOCATION_PRESENT');
      }
      const deletedLot = await client.query(
        `delete from public.chat_credit_lots_v1
         where id = $1::uuid and subject_id = $2::uuid
           and source_kind = 'signup' and source_ref = $2::uuid
           and credits_issued = 50 and credits_remaining = 50
         returning id`,
        [lot.id, state.subjectId],
      );
      if (deletedLot.rows.length !== 1) {
        fail('CLEANUP_PRESTART_CREDIT_DELETE_FAILED');
      }
      await client.query(
        'delete from public.commerce_account_links where id = $1::uuid and subject_id = $2::uuid',
        [state.commerceAccountLinkId, state.subjectId],
      );
      await client.query(
        'delete from public.profiles where subject_id = $1::uuid',
        [state.subjectId],
      );
      await client.query(
        'delete from public.subjects where id = $1::uuid and status = \'active\'',
        [state.subjectId],
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Original failure remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const secret = resolveAdminSecret();
  await deleteHostedUserBestEffort(secret, state.authUserId);
  state.phase = 'cleaned';
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_CLEANUP_PASS');
}

async function attestCompletedCanary() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION
      || requiredEnv('MYEONGHA_PRIVACY_CANARY_OPERATION') !== 'attest_completed') {
    fail('COMPLETED_CANARY_ATTESTATION_CONFIRMATION_REQUIRED');
  }
  const {
    attestCompletedPrivacyCanaryReadOnlyV1,
    assertCompletedCanaryHistoricalExecutionV1,
  } = await import('./attest-completed-production-privacy-canary.mjs');
  const sourceCanaryRunId = requireRunId(
    requiredEnv('MYEONGHA_PRIVACY_CANARY_RESUME_RUN_ID'));
  const governedBackupRunId = requireRunId(
    requiredEnv('MYEONGHA_PRIVACY_CANARY_RESUME_BACKUP_RUN_ID'));
  const canonicalLedgerRunId = requireRunId(
    requiredEnv('MYEONGHA_PRIVACY_CANARY_ATTEST_LEDGER_RUN_ID'));
  const repo = requiredEnv('GITHUB_REPOSITORY');
  const githubToken = requiredEnv('GH_TOKEN');
  if (repo !== 'gycha0109-beep/MyeongHa'
      || requiredEnv('GITHUB_EVENT_NAME') !== 'workflow_dispatch'
      || requiredEnv('GITHUB_REF') !== 'refs/heads/main') {
    fail('COMPLETED_CANARY_GITHUB_EXECUTION_AUTHORITY_INVALID');
  }
  async function readGithub(path) {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${repo}/${path}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${githubToken}`,
          accept: 'application/vnd.github+json',
        },
      },
    );
    if (response.status !== 200) fail('COMPLETED_CANARY_GITHUB_PROVENANCE_UNAVAILABLE');
    return readBoundedJson(response);
  }
  assertCompletedCanaryHistoricalExecutionV1({
    sourceRun: await readGithub(`actions/runs/${sourceCanaryRunId}`),
    backupRun: await readGithub(`actions/runs/${governedBackupRunId}`),
    ledgerRun: await readGithub(`actions/runs/${canonicalLedgerRunId}`),
    sourceJobs: await readGithub(`actions/runs/${sourceCanaryRunId}/jobs?per_page=10`),
  });
  const pool = await createAdminPool();
  const client = await pool.connect();
  let evidence;
  try {
    await client.query('BEGIN READ ONLY');
    evidence = await attestCompletedPrivacyCanaryReadOnlyV1(
      (text, params) => client.query(text, params),
      { sourceCanaryRunId, governedBackupRunId, canonicalLedgerRunId },
    );
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
  const evidencePath = requiredEnv('MYEONGHA_PRIVACY_CANARY_EVIDENCE_PATH');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log('PASS_PRODUCTION_PRIVACY_CANARY_READ_ONLY_COMPLETED_ATTESTATION');
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'sync-worker-password') return syncWorkerPassword();
  if (mode === 'preflight-worker') return preflightWorker();
  if (mode === 'provision-api-login') return provisionApiCanaryLogin();
  if (mode === 'prepare') return prepare();
  if (mode === 'execute') return execute();
  if (mode === 'attest-completed') return attestCompletedCanary();
  if (mode === 'recover-resume-state') return recoverResumeState();
  if (mode === 'resume') return resumeDeletion();
  if (mode === 'cleanup-api-login') return cleanupApiCanaryLogin();
  if (mode === 'cleanup-prestart') return cleanupPrestart();
  if (mode === 'recover-orphan-prestart') return recoverOrphanPrestartState();
  if (mode === 'verify-orphan-prestart-cleanup') return verifyOrphanPrestartCleanup();
  fail('MODE_REQUIRED');
}

main().catch((error) => {
  const code =
    error instanceof CanaryFailure
      ? error.code
      : error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : 'UNEXPECTED';
  console.error(`MYEONGHA_PRODUCTION_PRIVACY_CANARY_FAIL code=${code}`);
  process.exitCode = 1;
});
