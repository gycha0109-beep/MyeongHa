import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const WORKER_PRINCIPAL = 'myeongha_worker_runtime';
const WORKER_ROLE = 'myeongha_system_executor';
const QUALIFIED_PRINCIPAL = WORKER_PRINCIPAL + '.' + PROJECT_REF;
const MARKER_PATH =
  'config/operations/run-once/production-account-deletion-worker-tls-canary-b2.marker';
const MARKER_VALUE = 'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B2_RUN1';
const MANUAL_CONFIRM = 'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B2';

export class ProductionAccountDeletionWorkerTlsCanaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionAccountDeletionWorkerTlsCanaryError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionAccountDeletionWorkerTlsCanaryError(code, message);
}

function required(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, 'Required worker TLS canary authority is missing.');
  }
  return value.trim();
}

export function requireWorkerTlsCanaryAuthority(env) {
  if (
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.MYEONGHA_WATCHTOWER_TRACK !== 'security'
  ) {
    return fail(
      'CANARY_AUTHORITY_INVALID',
      'Worker TLS canary requires exact main/security authority.',
    );
  }

  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (env.MYEONGHA_WORKER_TLS_CANARY_CONFIRM !== MANUAL_CONFIRM) {
      return fail(
        'CANARY_AUTHORITY_INVALID',
        'Worker TLS canary confirmation is invalid.',
      );
    }
    return;
  }

  if (env.GITHUB_EVENT_NAME === 'push') {
    if (env.MYEONGHA_WORKER_TLS_CANARY_MARKER_PATH !== MARKER_PATH) {
      return fail(
        'CANARY_MARKER_AUTHORITY_INVALID',
        'Worker TLS canary marker authority is invalid.',
      );
    }
    let marker;
    try {
      marker = readFileSync(MARKER_PATH, 'utf8');
    } catch {
      return fail('CANARY_MARKER_MISSING', 'Worker TLS canary marker is missing.');
    }
    if (marker !== MARKER_VALUE) {
      return fail('CANARY_MARKER_INVALID', 'Worker TLS canary marker is invalid.');
    }
    return;
  }

  return fail(
    'CANARY_AUTHORITY_INVALID',
    'Worker TLS canary event is not authorized.',
  );
}

export function canonicalStrictWorkerDatabaseUrl(input) {
  let url;
  try {
    url = new URL(
      required(input.sourceDatabaseUrl, 'WORKER_DATABASE_URL_MISSING'),
    );
  } catch (error) {
    if (error instanceof ProductionAccountDeletionWorkerTlsCanaryError) {
      throw error;
    }
    return fail(
      'WORKER_DATABASE_URL_SOURCE_INVALID',
      'Worker database URL is invalid.',
    );
  }

  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    url.password.length === 0
  ) {
    return fail(
      'WORKER_DATABASE_URL_SOURCE_INVALID',
      'Worker database URL has an invalid protected credential shape.',
    );
  }

  let decodedUser;
  try {
    decodedUser = decodeURIComponent(url.username);
  } catch {
    return fail(
      'WORKER_DATABASE_URL_SOURCE_INVALID',
      'Worker database principal cannot be decoded.',
    );
  }
  if (
    decodedUser !== WORKER_PRINCIPAL &&
    decodedUser !== QUALIFIED_PRINCIPAL
  ) {
    return fail(
      'WORKER_DATABASE_URL_SOURCE_PRINCIPAL_INVALID',
      'Worker database URL does not use the governed worker principal.',
    );
  }

  const poolerHost = required(
    input.sessionPoolerHost,
    'SESSION_POOLER_HOST_MISSING',
  );
  if (
    !/^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u.test(
      poolerHost,
    )
  ) {
    return fail(
      'SESSION_POOLER_HOST_INVALID',
      'Worker TLS canary requires a governed Supabase pooler hostname.',
    );
  }

  url.hostname = poolerHost;
  url.port = '5432';
  url.username = QUALIFIED_PRINCIPAL;
  url.pathname = '/postgres';
  url.search = '';
  url.hash = '';
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

function exactlyTrue(value) {
  return value === true || value === 't' || value === 'true';
}

export function validateWorkerTlsCanaryEvidenceRow(row, rowCount) {
  if (rowCount !== 1 || row === undefined) {
    return fail(
      'CANARY_EVIDENCE_ROW_COUNT_INVALID',
      'Worker TLS canary returned an unexpected row count.',
    );
  }
  if (
    row.sessionUser !== WORKER_PRINCIPAL ||
    row.currentUser !== WORKER_PRINCIPAL
  ) {
    return fail(
      'CANARY_EVIDENCE_PRINCIPAL_MISMATCH',
      'Worker TLS canary principal evidence did not match.',
    );
  }
  if (row.transactionReadOnly !== 'on') {
    return fail(
      'CANARY_EVIDENCE_TRANSACTION_READ_ONLY_INVALID',
      'Worker TLS canary transaction was not read only.',
    );
  }
  if (!exactlyTrue(row.executionRoleMember)) {
    return fail(
      'CANARY_EVIDENCE_ROLE_MEMBERSHIP_INVALID',
      'Worker TLS canary execution-role evidence did not match.',
    );
  }
}

async function loadStrictBuilder() {
  return import(
    '../../dist/apps/api/src/production-account-deletion-worker-tls-peer-verification.js'
  );
}

export async function runProductionAccountDeletionWorkerTlsCanary(
  env = process.env,
) {
  requireWorkerTlsCanaryAuthority(env);

  const databaseUrl = canonicalStrictWorkerDatabaseUrl({
    sourceDatabaseUrl: required(
      env.MYEONGHA_WORKER_DATABASE_URL,
      'WORKER_DATABASE_URL_MISSING',
    ),
    sessionPoolerHost: required(
      env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST,
      'SESSION_POOLER_HOST_MISSING',
    ),
  });
  const rootCertificatePem = required(
    env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
    'ROOT_CERTIFICATE_MISSING',
  );

  const { buildProductionAccountDeletionWorkerStrictTlsTargetV1 } =
    await loadStrictBuilder();

  let target;
  try {
    target = buildProductionAccountDeletionWorkerStrictTlsTargetV1({
      databaseUrl,
      rootCertificatePem,
    });
  } catch {
    return fail(
      'CANARY_STRICT_TARGET_REJECTED',
      'Worker TLS canary strict target was rejected.',
    );
  }

  const client = new Client({
    connectionString: target.connectionString,
    ssl: target.ssl,
    connectionTimeoutMillis: 8000,
    statement_timeout: 8000,
  });

  let connected = false;
  let transactionOpen = false;
  try {
    try {
      await client.connect();
      connected = true;
    } catch {
      return fail(
        'CANARY_CONNECT_FAILED',
        'Worker TLS canary strict connection failed.',
      );
    }

    try {
      await client.query('BEGIN READ ONLY');
      transactionOpen = true;
      const result = await client.query(
        'select session_user::text as "sessionUser", current_user::text as "currentUser", current_setting(\'transaction_read_only\') as "transactionReadOnly", pg_catalog.pg_has_role(current_user, \'myeongha_system_executor\', \'MEMBER\') as "executionRoleMember"',
      );

      validateWorkerTlsCanaryEvidenceRow(
        result.rows[0],
        result.rows.length,
      );

      await client.query('ROLLBACK');
      transactionOpen = false;

      return Object.freeze({
        schemaVersion:
          'myeongha-production-account-deletion-worker-tls-canary-v1',
        projectRef: PROJECT_REF,
        databasePrincipal: WORKER_PRINCIPAL,
        executionRole: WORKER_ROLE,
        endpointKind: target.evidence.endpointKind,
        endpointAuthorityPinned: true,
        tlsMode: target.evidence.tlsMode,
        peerVerification: target.evidence.peerVerification,
        rejectUnauthorized: target.evidence.rejectUnauthorized,
        defaultHostnameVerification:
          target.evidence.defaultHostnameVerification,
        rootCertificateFingerprint256:
          target.evidence.rootCertificateFingerprint256,
        rootCertificatePinned: target.evidence.rootCertificatePinned,
        connectionSucceeded: true,
        strictTlsHandshakeSucceeded: true,
        transactionReadOnly: true,
        principalMatch: true,
        executionRoleMembership: true,
        writeExecuted: false,
        databaseUrlEmitted: false,
        credentialMaterialEmitted: false,
        rootCertificatePemEmitted: false,
      });
    } catch (error) {
      if (error instanceof ProductionAccountDeletionWorkerTlsCanaryError) {
        throw error;
      }
      return fail(
        'CANARY_QUERY_FAILED',
        'Worker TLS canary fixed evidence query failed.',
      );
    }
  } finally {
    if (connected && transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original bounded failure.
      }
    }
    try {
      await client.end();
    } catch {
      // No driver payload is surfaced.
    }
  }
}

function printEvidence(evidence) {
  const lines = {
    account_deletion_worker_tls_canary: 'pass',
    project_ref: evidence.projectRef,
    database_principal: evidence.databasePrincipal,
    execution_role: evidence.executionRole,
    endpoint_kind: evidence.endpointKind,
    endpoint_authority_pinned: evidence.endpointAuthorityPinned,
    tls_mode: evidence.tlsMode,
    peer_verification: evidence.peerVerification,
    reject_unauthorized: evidence.rejectUnauthorized,
    default_hostname_verification: evidence.defaultHostnameVerification,
    root_certificate_fingerprint256:
      evidence.rootCertificateFingerprint256,
    root_certificate_pinned: evidence.rootCertificatePinned,
    connection_succeeded: evidence.connectionSucceeded,
    strict_tls_handshake_succeeded:
      evidence.strictTlsHandshakeSucceeded,
    transaction_read_only: evidence.transactionReadOnly,
    principal_match: evidence.principalMatch,
    execution_role_membership: evidence.executionRoleMembership,
    write_executed: evidence.writeExecuted,
    database_url_emitted: evidence.databaseUrlEmitted,
    credential_material_emitted: evidence.credentialMaterialEmitted,
    root_certificate_pem_emitted: evidence.rootCertificatePemEmitted,
  };
  for (const [key, value] of Object.entries(lines)) {
    console.log(key + '=' + String(value));
  }
}

const directExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directExecution) {
  try {
    printEvidence(
      await runProductionAccountDeletionWorkerTlsCanary(process.env),
    );
  } catch (error) {
    const code =
      error instanceof ProductionAccountDeletionWorkerTlsCanaryError
        ? error.code
        : 'CANARY_UNEXPECTED_FAILURE';
    console.error('account_deletion_worker_tls_canary=fail code=' + code);
    process.exitCode = 1;
  }
}
