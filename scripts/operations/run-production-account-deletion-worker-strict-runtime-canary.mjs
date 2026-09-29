import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const WORKER_PRINCIPAL = 'myeongha_worker_runtime';
const WORKER_ROLE = 'myeongha_system_executor';
const QUALIFIED_PRINCIPAL = WORKER_PRINCIPAL + '.' + PROJECT_REF;
const MARKER_PATH =
  'config/operations/run-once/production-account-deletion-worker-tls-runtime-canary-b3.marker';
const MARKER_VALUE = 'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B3_RUNTIME_RUN1';
const MANUAL_CONFIRM = 'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B3_RUNTIME';

export class ProductionAccountDeletionWorkerStrictRuntimeCanaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionAccountDeletionWorkerStrictRuntimeCanaryError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionAccountDeletionWorkerStrictRuntimeCanaryError(code, message);
}

function required(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, 'Required worker strict-runtime canary authority is missing.');
  }
  return value.trim();
}

export function requireStrictRuntimeCanaryAuthority(env) {
  if (
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.MYEONGHA_WATCHTOWER_TRACK !== 'security'
  ) {
    return fail(
      'CANARY_AUTHORITY_INVALID',
      'Worker strict-runtime canary requires exact main/security authority.',
    );
  }

  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (env.MYEONGHA_WORKER_TLS_RUNTIME_CANARY_CONFIRM !== MANUAL_CONFIRM) {
      return fail('CANARY_AUTHORITY_INVALID', 'Worker strict-runtime confirmation is invalid.');
    }
    return;
  }

  if (env.GITHUB_EVENT_NAME === 'push') {
    if (env.MYEONGHA_WORKER_TLS_RUNTIME_CANARY_MARKER_PATH !== MARKER_PATH) {
      return fail('CANARY_MARKER_AUTHORITY_INVALID', 'Worker strict-runtime marker authority is invalid.');
    }
    let marker;
    try {
      marker = readFileSync(MARKER_PATH, 'utf8');
    } catch {
      return fail('CANARY_MARKER_MISSING', 'Worker strict-runtime marker is missing.');
    }
    if (marker !== MARKER_VALUE) {
      return fail('CANARY_MARKER_INVALID', 'Worker strict-runtime marker is invalid.');
    }
    return;
  }

  return fail('CANARY_AUTHORITY_INVALID', 'Worker strict-runtime canary event is not authorized.');
}

export function canonicalWorkerMigrationSourceUrl(input) {
  let url;
  try {
    url = new URL(required(input.sourceDatabaseUrl, 'WORKER_DATABASE_URL_MISSING'));
  } catch (error) {
    if (error instanceof ProductionAccountDeletionWorkerStrictRuntimeCanaryError) throw error;
    return fail('WORKER_DATABASE_URL_SOURCE_INVALID', 'Worker database URL is invalid.');
  }

  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    url.password.length === 0
  ) {
    return fail('WORKER_DATABASE_URL_SOURCE_INVALID', 'Worker database credential shape is invalid.');
  }

  let decodedUser;
  try {
    decodedUser = decodeURIComponent(url.username);
  } catch {
    return fail('WORKER_DATABASE_URL_SOURCE_INVALID', 'Worker database principal cannot be decoded.');
  }
  if (decodedUser !== WORKER_PRINCIPAL && decodedUser !== QUALIFIED_PRINCIPAL) {
    return fail(
      'WORKER_DATABASE_URL_SOURCE_PRINCIPAL_INVALID',
      'Worker database URL does not use the governed worker principal.',
    );
  }

  const poolerHost = required(input.sessionPoolerHost, 'SESSION_POOLER_HOST_MISSING');
  if (!/^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u.test(poolerHost)) {
    return fail('SESSION_POOLER_HOST_INVALID', 'Worker strict-runtime canary requires a governed Supabase pooler hostname.');
  }

  url.hostname = poolerHost;
  url.port = '5432';
  url.username = QUALIFIED_PRINCIPAL;
  url.pathname = '/postgres';
  url.search = '';
  url.hash = '';
  url.searchParams.set('sslmode', 'require');
  return url.toString();
}

export function validateStrictRuntimeEvidenceRow(row, rowCount) {
  if (rowCount !== 1 || row === undefined) {
    return fail('CANARY_EVIDENCE_ROW_COUNT_INVALID', 'Worker strict-runtime canary returned an unexpected row count.');
  }
  if (row.currentUser !== WORKER_PRINCIPAL) {
    return fail('CANARY_EVIDENCE_PRINCIPAL_MISMATCH', 'Worker strict-runtime principal evidence did not match.');
  }
  if (row.transactionReadOnly !== 'on') {
    return fail('CANARY_EVIDENCE_TRANSACTION_READ_ONLY_INVALID', 'Worker strict-runtime transaction was not read only.');
  }
  if (row.executionRoleMember !== true && row.executionRoleMember !== 't' && row.executionRoleMember !== 'true') {
    return fail('CANARY_EVIDENCE_ROLE_MEMBERSHIP_INVALID', 'Worker strict-runtime execution-role evidence did not match.');
  }
}

async function runtimeModules() {
  return Promise.all([
    import('../../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
    import('../../dist/apps/api/src/node-postgres-account-deletion-worker-pool.js'),
  ]);
}

export async function runProductionAccountDeletionWorkerStrictRuntimeCanary(env = process.env) {
  requireStrictRuntimeCanaryAuthority(env);

  const sourceDatabaseUrl = canonicalWorkerMigrationSourceUrl({
    sourceDatabaseUrl: required(env.MYEONGHA_WORKER_DATABASE_URL, 'WORKER_DATABASE_URL_MISSING'),
    sessionPoolerHost: required(
      env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST,
      'SESSION_POOLER_HOST_MISSING',
    ),
  });
  const rootCertificatePem = required(
    env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
    'ROOT_CERTIFICATE_MISSING',
  );

  const [configModule, poolModule] = await runtimeModules();

  let config;
  try {
    config = configModule.parseProductionAccountDeletionWorkerDbConfigV1({
      MYEONGHA_WORKER_DATABASE_URL: sourceDatabaseUrl,
      MYEONGHA_WORKER_DATABASE_PRINCIPAL: WORKER_PRINCIPAL,
      MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
      MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM: rootCertificatePem,
    });
  } catch {
    return fail('CANARY_STRICT_CONFIG_REJECTED', 'Worker strict-runtime config was rejected.');
  }

  let pool;
  try {
    pool = poolModule.createNodePostgresAccountDeletionWorkerPoolV1(config);
  } catch {
    return fail('CANARY_STRICT_POOL_REJECTED', 'Worker strict-runtime pool was rejected.');
  }

  let connection;
  let transactionOpen = false;
  try {
    try {
      connection = await pool.connect();
    } catch {
      return fail('CANARY_CONNECT_FAILED', 'Worker strict-runtime connection failed.');
    }

    try {
      await connection.query('BEGIN READ ONLY');
      transactionOpen = true;
      const result = await connection.query(
        'select current_user::text as "currentUser", current_setting(\'transaction_read_only\') as "transactionReadOnly", pg_catalog.pg_has_role(current_user, \'myeongha_system_executor\', \'MEMBER\') as "executionRoleMember"',
      );
      validateStrictRuntimeEvidenceRow(result.rows[0], result.rows.length);
      await connection.query('ROLLBACK');
      transactionOpen = false;
    } catch (error) {
      if (error instanceof ProductionAccountDeletionWorkerStrictRuntimeCanaryError) throw error;
      return fail('CANARY_QUERY_FAILED', 'Worker strict-runtime fixed evidence query failed.');
    }

    return Object.freeze({
      schemaVersion: 'myeongha-production-account-deletion-worker-strict-runtime-canary-v1',
      projectRef: PROJECT_REF,
      databasePrincipal: WORKER_PRINCIPAL,
      executionRole: WORKER_ROLE,
      strictRuntimePath: true,
      sourceTlsMode: 'require',
      effectiveTlsMode: 'verify-full',
      peerVerification: 'full',
      rejectUnauthorized: true,
      defaultHostnameVerification: true,
      rootCertificatePinned: true,
      connectionSucceeded: true,
      transactionReadOnly: true,
      principalMatch: true,
      executionRoleMembership: true,
      writeExecuted: false,
      databaseUrlEmitted: false,
      credentialMaterialEmitted: false,
      rootCertificatePemEmitted: false,
    });
  } finally {
    if (connection !== undefined) {
      if (transactionOpen) {
        try {
          await connection.query('ROLLBACK');
        } catch {
          // Preserve the original bounded failure.
        }
      }
      connection.release();
    }
    if (pool !== undefined) {
      try {
        await pool.close();
      } catch {
        // No driver payload is surfaced.
      }
    }
  }
}

function printEvidence(evidence) {
  for (const [key, value] of Object.entries({
    account_deletion_worker_strict_runtime_canary: 'pass',
    project_ref: evidence.projectRef,
    database_principal: evidence.databasePrincipal,
    execution_role: evidence.executionRole,
    strict_runtime_path: evidence.strictRuntimePath,
    source_tls_mode: evidence.sourceTlsMode,
    effective_tls_mode: evidence.effectiveTlsMode,
    peer_verification: evidence.peerVerification,
    reject_unauthorized: evidence.rejectUnauthorized,
    default_hostname_verification: evidence.defaultHostnameVerification,
    root_certificate_pinned: evidence.rootCertificatePinned,
    connection_succeeded: evidence.connectionSucceeded,
    transaction_read_only: evidence.transactionReadOnly,
    principal_match: evidence.principalMatch,
    execution_role_membership: evidence.executionRoleMembership,
    write_executed: evidence.writeExecuted,
    database_url_emitted: evidence.databaseUrlEmitted,
    credential_material_emitted: evidence.credentialMaterialEmitted,
    root_certificate_pem_emitted: evidence.rootCertificatePemEmitted,
  })) {
    console.log(key + '=' + String(value));
  }
}

const directExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directExecution) {
  try {
    printEvidence(await runProductionAccountDeletionWorkerStrictRuntimeCanary(process.env));
  } catch (error) {
    const code =
      error instanceof ProductionAccountDeletionWorkerStrictRuntimeCanaryError
        ? error.code
        : 'CANARY_UNEXPECTED_FAILURE';
    console.error('account_deletion_worker_strict_runtime_canary=fail code=' + code);
    process.exitCode = 1;
  }
}
