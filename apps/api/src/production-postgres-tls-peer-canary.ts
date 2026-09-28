import type { ClientConfig } from 'pg';

import {
  buildProductionPostgresStrictTlsTargetV1,
  PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
  PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
} from './production-postgres-tls-peer-verification.js';
import {
  inspectProductionDatabaseTlsPostureV1,
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
  parseProductionPostgresRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

export const PRODUCTION_POSTGRES_TLS_CANARY_EXPECTED_PRINCIPAL_V1 =
  'myeongha_runtime' as const;
export const PRODUCTION_POSTGRES_TLS_CANARY_ROOT_FINGERPRINT256_V1 =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA' as const;
export const PRODUCTION_POSTGRES_TLS_CANARY_MODE_V1 =
  'one-shot-b2b' as const;

export const PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1 = Object.freeze({
  rootCertificateBase64: 'MYEONGHA_DATABASE_SSL_ROOT_CERT_B64',
  token: 'MYEONGHA_POSTGRES_TLS_CANARY_TOKEN',
  mode: 'MYEONGHA_POSTGRES_TLS_CANARY_MODE',
  expectedGitSha: 'MYEONGHA_POSTGRES_TLS_CANARY_SHA',
  vercelTargetEnv: 'VERCEL_TARGET_ENV',
} as const);

export interface ProductionPostgresTlsCanaryClientV1 {
  connect(): Promise<void>;
  query(text: string): Promise<{ readonly rows: readonly Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export interface ProductionPostgresTlsCanaryEvidenceV1 {
  readonly schemaVersion: 'myeongha-production-postgres-tls-peer-canary-v1';
  readonly currentBindingTlsMode:
    | 'absent'
    | 'disable'
    | 'no-verify'
    | 'prefer'
    | 'require'
    | 'verify-ca'
    | 'verify-full'
    | 'unknown';
  readonly currentBindingPeerVerification: 'none' | 'ca_only' | 'full' | 'unknown';
  readonly canaryTlsMode: 'verify-full';
  readonly canaryPeerVerification: 'full';
  readonly rejectUnauthorized: true;
  readonly defaultHostnameVerification: true;
  readonly rootCertificateFingerprint256:
    typeof PRODUCTION_POSTGRES_TLS_CANARY_ROOT_FINGERPRINT256_V1;
  readonly rootCertificatePinned: true;
  readonly deploymentTarget: 'production';
  readonly oneShotGitShaConfigured: true;
  readonly connectionSucceeded: true;
  readonly sslSession: true;
  readonly transactionReadOnly: true;
  readonly principalExpected: typeof PRODUCTION_POSTGRES_TLS_CANARY_EXPECTED_PRINCIPAL_V1;
  readonly principalMatch: true;
  readonly executionRole: typeof MYEONGHA_API_EXECUTION_ROLE;
  readonly executionRoleMembership: true;
  readonly writeExecuted: false;
  readonly databaseUrlEmitted: false;
  readonly credentialMaterialEmitted: false;
  readonly rootCertificatePemEmitted: false;
}

export class ProductionPostgresTlsCanaryErrorV1 extends Error {
  constructor(
    readonly code:
      | 'CANARY_ENV_INVALID'
      | 'CANARY_PRINCIPAL_INVALID'
      | 'CANARY_DATABASE_URL_INVALID'
      | 'CANARY_STRICT_TARGET_REJECTED'
      | 'CANARY_CONNECT_FAILED'
      | 'CANARY_QUERY_FAILED'
      | 'CANARY_EVIDENCE_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'ProductionPostgresTlsCanaryErrorV1';
  }
}

function fail(
  code: ProductionPostgresTlsCanaryErrorV1['code'],
  message: string,
): never {
  throw new ProductionPostgresTlsCanaryErrorV1(code, message);
}

function requiredEnv(
  env: ProductionUserDataRuntimeEnvV1,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail('CANARY_ENV_INVALID', 'Required canary runtime setting is missing.');
  }
  return value.trim();
}

export function isProductionPostgresTlsCanaryRuntimeV1(
  env: ProductionUserDataRuntimeEnvV1,
): boolean {
  const expectedSha =
    env[PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1.expectedGitSha];
  const token = env[PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1.token];

  return (
    env[PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1.vercelTargetEnv] ===
      'production' &&
    env[PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1.mode] ===
      PRODUCTION_POSTGRES_TLS_CANARY_MODE_V1 &&
    typeof expectedSha === 'string' &&
    /^[0-9a-f]{40}$/u.test(expectedSha) &&
    typeof token === 'string' &&
    token.length >= 32 &&
    typeof env[
      PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1.rootCertificateBase64
    ] === 'string'
  );
}

function decodeRootCertificatePemV1(
  env: ProductionUserDataRuntimeEnvV1,
): string {
  const encoded = requiredEnv(
    env,
    PRODUCTION_POSTGRES_TLS_CANARY_ENV_V1.rootCertificateBase64,
  );

  let pem: string;
  try {
    pem = Buffer.from(encoded, 'base64').toString('utf8').trim();
  } catch {
    return fail(
      'CANARY_ENV_INVALID',
      'PostgreSQL TLS canary root certificate encoding is invalid.',
    );
  }

  if (
    !pem.startsWith('-----BEGIN CERTIFICATE-----') ||
    !pem.endsWith('-----END CERTIFICATE-----')
  ) {
    return fail(
      'CANARY_ENV_INVALID',
      'PostgreSQL TLS canary root certificate encoding is invalid.',
    );
  }
  return pem;
}

export function buildProductionPostgresTlsCanaryPlanV1(
  env: ProductionUserDataRuntimeEnvV1,
): Readonly<{
  clientConfig: ClientConfig;
  currentBindingTlsMode: ProductionPostgresTlsCanaryEvidenceV1['currentBindingTlsMode'];
  currentBindingPeerVerification:
    ProductionPostgresTlsCanaryEvidenceV1['currentBindingPeerVerification'];
}> {
  if (!isProductionPostgresTlsCanaryRuntimeV1(env)) {
    return fail(
      'CANARY_ENV_INVALID',
      'PostgreSQL TLS canary requires exact one-shot Production deployment authority.',
    );
  }

  const postgres = parseProductionPostgresRuntimeConfigV1(env);
  if (
    postgres.databasePrincipal !==
    PRODUCTION_POSTGRES_TLS_CANARY_EXPECTED_PRINCIPAL_V1
  ) {
    return fail(
      'CANARY_PRINCIPAL_INVALID',
      'PostgreSQL TLS canary requires the governed runtime login principal.',
    );
  }

  const rootCertificatePem = decodeRootCertificatePemV1(env);
  const currentPosture = inspectProductionDatabaseTlsPostureV1(
    postgres.databaseUrl,
  );

  let candidate: URL;
  try {
    candidate = new URL(postgres.databaseUrl);
  } catch {
    return fail(
      'CANARY_DATABASE_URL_INVALID',
      'PostgreSQL TLS canary cannot parse the existing database binding.',
    );
  }

  for (const key of [...candidate.searchParams.keys()]) {
    const normalized = key.trim().toLowerCase();
    if (normalized.startsWith('ssl') || normalized === 'uselibpqcompat') {
      candidate.searchParams.delete(key);
    }
  }
  candidate.searchParams.set('sslmode', PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1);

  let strictTarget;
  try {
    strictTarget = buildProductionPostgresStrictTlsTargetV1({
      databaseUrl: candidate.toString(),
      rootCertificatePem,
      authority: {
        contractVersion:
          PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
        projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
        requiredTlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
        rootCertificateFingerprint256:
          PRODUCTION_POSTGRES_TLS_CANARY_ROOT_FINGERPRINT256_V1,
      },
    });
  } catch {
    return fail(
      'CANARY_STRICT_TARGET_REJECTED',
      'PostgreSQL TLS canary strict target validation failed.',
    );
  }

  return Object.freeze({
    clientConfig: Object.freeze({
      connectionString: strictTarget.connectionString,
      ssl: strictTarget.ssl,
      connectionTimeoutMillis: 8_000,
      query_timeout: 8_000,
      statement_timeout: 8_000,
      application_name: 'myeongha-sec01-b2b-canary',
    }),
    currentBindingTlsMode: currentPosture.mode,
    currentBindingPeerVerification: currentPosture.peerVerification,
  });
}

function exactlyTrue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

export async function runProductionPostgresTlsPeerCanaryV1(input: {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly createClient: (
    config: ClientConfig,
  ) => ProductionPostgresTlsCanaryClientV1;
  readonly buildPlan?: typeof buildProductionPostgresTlsCanaryPlanV1;
}): Promise<ProductionPostgresTlsCanaryEvidenceV1> {
  const plan = (input.buildPlan ?? buildProductionPostgresTlsCanaryPlanV1)(
    input.env,
  );
  const client = input.createClient(plan.clientConfig);
  let connected = false;
  let transactionOpen = false;

  try {
    try {
      await client.connect();
      connected = true;
    } catch {
      return fail(
        'CANARY_CONNECT_FAILED',
        'PostgreSQL TLS canary connection failed.',
      );
    }

    try {
      await client.query('BEGIN READ ONLY');
      transactionOpen = true;
      const result = await client.query(
        "SELECT current_user AS principal, current_setting('transaction_read_only') AS transaction_read_only, pg_has_role(current_user, 'myeongha_api_executor', 'MEMBER') AS execution_role_member, COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_session",
      );

      if (result.rows.length !== 1) {
        return fail(
          'CANARY_EVIDENCE_INVALID',
          'PostgreSQL TLS canary returned an unexpected evidence row count.',
        );
      }

      const row = result.rows[0];
      if (
        row?.principal !== PRODUCTION_POSTGRES_TLS_CANARY_EXPECTED_PRINCIPAL_V1 ||
        row.transaction_read_only !== 'on' ||
        !exactlyTrue(row.execution_role_member) ||
        !exactlyTrue(row.ssl_session)
      ) {
        return fail(
          'CANARY_EVIDENCE_INVALID',
          'PostgreSQL TLS canary evidence did not satisfy the governed contract.',
        );
      }

      await client.query('ROLLBACK');
      transactionOpen = false;

      return Object.freeze({
        schemaVersion: 'myeongha-production-postgres-tls-peer-canary-v1',
        currentBindingTlsMode: plan.currentBindingTlsMode,
        currentBindingPeerVerification: plan.currentBindingPeerVerification,
        canaryTlsMode: 'verify-full',
        canaryPeerVerification: 'full',
        rejectUnauthorized: true,
        defaultHostnameVerification: true,
        rootCertificateFingerprint256:
          PRODUCTION_POSTGRES_TLS_CANARY_ROOT_FINGERPRINT256_V1,
        rootCertificatePinned: true,
        deploymentTarget: 'production',
        oneShotGitShaConfigured: true,
        connectionSucceeded: true,
        sslSession: true,
        transactionReadOnly: true,
        principalExpected:
          PRODUCTION_POSTGRES_TLS_CANARY_EXPECTED_PRINCIPAL_V1,
        principalMatch: true,
        executionRole: MYEONGHA_API_EXECUTION_ROLE,
        executionRoleMembership: true,
        writeExecuted: false,
        databaseUrlEmitted: false,
        credentialMaterialEmitted: false,
        rootCertificatePemEmitted: false,
      });
    } catch (error) {
      if (error instanceof ProductionPostgresTlsCanaryErrorV1) throw error;
      return fail('CANARY_QUERY_FAILED', 'PostgreSQL TLS canary query failed.');
    }
  } finally {
    if (connected && transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Cleanup is best-effort; the original fail-closed result remains authoritative.
      }
    }
    if (connected) {
      try {
        await client.end();
      } catch {
        // No secret-bearing driver error is surfaced.
      }
    }
  }
}
