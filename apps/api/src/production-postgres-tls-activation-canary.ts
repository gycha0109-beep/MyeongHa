import type { PostgresSubjectConnectionV1 } from './postgres-subject-execution.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1,
  parseProductionPostgresRuntimeConfigV1,
  type ProductionPostgresRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import {
  PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
} from './production-postgres-tls-peer-verification.js';

export const PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_MODE_V1 =
  'one-shot-b3' as const;

export const PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1 = Object.freeze({
  token: 'MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_TOKEN',
  mode: 'MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_MODE',
  expectedGitSha: 'MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_SHA',
  vercelTargetEnv: 'VERCEL_TARGET_ENV',
} as const);

export const PRODUCTION_POSTGRES_TLS_ACTIVATION_EXPECTED_PRINCIPAL_V1 =
  'myeongha_runtime' as const;

export interface ProductionPostgresTlsActivationCanaryEvidenceV1 {
  readonly schemaVersion:
    'myeongha-production-postgres-tls-activation-canary-v1';
  readonly deploymentTarget: 'production';
  readonly oneShotGitShaConfigured: true;
  readonly runtimeTlsMode: 'verify-full';
  readonly runtimePeerVerification: 'full';
  readonly rejectUnauthorized: true;
  readonly defaultHostnameVerification: true;
  readonly rootCertificateFingerprint256:
    typeof PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1;
  readonly rootCertificateConfigured: true;
  readonly ordinaryPoolConnectionSucceeded: true;
  readonly transactionReadOnly: true;
  readonly principalExpected:
    typeof PRODUCTION_POSTGRES_TLS_ACTIVATION_EXPECTED_PRINCIPAL_V1;
  readonly principalMatch: true;
  readonly executionRole: typeof MYEONGHA_API_EXECUTION_ROLE;
  readonly executionRoleMembership: true;
  readonly writeExecuted: false;
  readonly databaseUrlEmitted: false;
  readonly credentialMaterialEmitted: false;
  readonly rootCertificatePemEmitted: false;
}

export class ProductionPostgresTlsActivationCanaryErrorV1 extends Error {
  constructor(
    readonly code:
      | 'ACTIVATION_CANARY_ENV_INVALID'
      | 'ACTIVATION_CANARY_CONFIG_INVALID'
      | 'ACTIVATION_CANARY_PRINCIPAL_INVALID'
      | 'ACTIVATION_CANARY_CONNECT_FAILED'
      | 'ACTIVATION_CANARY_QUERY_FAILED'
      | 'ACTIVATION_CANARY_EVIDENCE_ROW_COUNT_INVALID'
      | 'ACTIVATION_CANARY_EVIDENCE_PRINCIPAL_MISMATCH'
      | 'ACTIVATION_CANARY_EVIDENCE_TRANSACTION_READ_ONLY_INVALID'
      | 'ACTIVATION_CANARY_EVIDENCE_ROLE_MEMBERSHIP_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'ProductionPostgresTlsActivationCanaryErrorV1';
  }
}

function fail(
  code: ProductionPostgresTlsActivationCanaryErrorV1['code'],
  message: string,
): never {
  throw new ProductionPostgresTlsActivationCanaryErrorV1(code, message);
}

function exactlyTrue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

export function isProductionPostgresTlsActivationCanaryRuntimeV1(
  env: ProductionUserDataRuntimeEnvV1,
): boolean {
  const expectedSha =
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.expectedGitSha];
  const token =
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.token];

  return (
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.vercelTargetEnv] ===
      'production' &&
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.mode] ===
      PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_MODE_V1 &&
    typeof expectedSha === 'string' &&
    /^[0-9a-f]{40}$/u.test(expectedSha) &&
    typeof token === 'string' &&
    token.length >= 32 &&
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode] ===
      'verify-full' &&
    typeof env[
      PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.rootCertificatePem
    ] === 'string' &&
    env[
      PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.rootCertificatePem
    ]!.trim().length > 0
  );
}

type ActivationCanaryPoolV1 = Readonly<{
  connect(): Promise<PostgresSubjectConnectionV1>;
  close(): Promise<void>;
}>;

type ActivationCanaryPoolFactoryV1 = (
  config: ProductionPostgresRuntimeConfigV1,
) => ActivationCanaryPoolV1;

export async function runProductionPostgresTlsActivationCanaryV1(input: {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly createPool?: ActivationCanaryPoolFactoryV1;
}): Promise<ProductionPostgresTlsActivationCanaryEvidenceV1> {
  if (!isProductionPostgresTlsActivationCanaryRuntimeV1(input.env)) {
    return fail(
      'ACTIVATION_CANARY_ENV_INVALID',
      'PostgreSQL TLS activation canary requires exact one-shot Production authority.',
    );
  }

  let config: ProductionPostgresRuntimeConfigV1;
  try {
    config = parseProductionPostgresRuntimeConfigV1(input.env);
  } catch {
    return fail(
      'ACTIVATION_CANARY_CONFIG_INVALID',
      'PostgreSQL TLS activation canary runtime configuration is invalid.',
    );
  }

  if (
    config.databaseTlsPeerMode !== 'verify-full' ||
    typeof config.databaseSslRootCertificatePem !== 'string' ||
    config.databaseSslRootCertificatePem.trim().length === 0
  ) {
    return fail(
      'ACTIVATION_CANARY_CONFIG_INVALID',
      'PostgreSQL TLS activation canary requires the strict ordinary runtime path.',
    );
  }

  if (
    config.databasePrincipal !==
    PRODUCTION_POSTGRES_TLS_ACTIVATION_EXPECTED_PRINCIPAL_V1
  ) {
    return fail(
      'ACTIVATION_CANARY_PRINCIPAL_INVALID',
      'PostgreSQL TLS activation canary requires the governed runtime login principal.',
    );
  }

  const pool = (input.createPool ?? createNodePostgresSubjectPoolV1)(config);
  let connection: PostgresSubjectConnectionV1 | undefined;
  let transactionOpen = false;

  try {
    try {
      connection = await pool.connect();
    } catch {
      return fail(
        'ACTIVATION_CANARY_CONNECT_FAILED',
        'PostgreSQL TLS activation canary ordinary pool connection failed.',
      );
    }

    try {
      await connection.query('BEGIN READ ONLY');
      transactionOpen = true;
      const result = await connection.query(
        "SELECT current_user AS principal, current_setting('transaction_read_only') AS transaction_read_only, pg_has_role(current_user, 'myeongha_api_executor', 'MEMBER') AS execution_role_member",
      );

      if (result.rows.length !== 1) {
        return fail(
          'ACTIVATION_CANARY_EVIDENCE_ROW_COUNT_INVALID',
          'PostgreSQL TLS activation canary returned an unexpected evidence row count.',
        );
      }

      const row = result.rows[0];
      if (
        row?.principal !==
        PRODUCTION_POSTGRES_TLS_ACTIVATION_EXPECTED_PRINCIPAL_V1
      ) {
        return fail(
          'ACTIVATION_CANARY_EVIDENCE_PRINCIPAL_MISMATCH',
          'PostgreSQL TLS activation canary principal evidence did not match.',
        );
      }
      if (row.transaction_read_only !== 'on') {
        return fail(
          'ACTIVATION_CANARY_EVIDENCE_TRANSACTION_READ_ONLY_INVALID',
          'PostgreSQL TLS activation canary read-only evidence was invalid.',
        );
      }
      if (!exactlyTrue(row.execution_role_member)) {
        return fail(
          'ACTIVATION_CANARY_EVIDENCE_ROLE_MEMBERSHIP_INVALID',
          'PostgreSQL TLS activation canary execution-role evidence was invalid.',
        );
      }

      await connection.query('ROLLBACK');
      transactionOpen = false;
      connection.release();
      connection = undefined;

      return Object.freeze({
        schemaVersion:
          'myeongha-production-postgres-tls-activation-canary-v1',
        deploymentTarget: 'production',
        oneShotGitShaConfigured: true,
        runtimeTlsMode: 'verify-full',
        runtimePeerVerification: 'full',
        rejectUnauthorized: true,
        defaultHostnameVerification: true,
        rootCertificateFingerprint256:
          PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
        rootCertificateConfigured: true,
        ordinaryPoolConnectionSucceeded: true,
        transactionReadOnly: true,
        principalExpected:
          PRODUCTION_POSTGRES_TLS_ACTIVATION_EXPECTED_PRINCIPAL_V1,
        principalMatch: true,
        executionRole: MYEONGHA_API_EXECUTION_ROLE,
        executionRoleMembership: true,
        writeExecuted: false,
        databaseUrlEmitted: false,
        credentialMaterialEmitted: false,
        rootCertificatePemEmitted: false,
      });
    } catch (error) {
      if (error instanceof ProductionPostgresTlsActivationCanaryErrorV1) {
        throw error;
      }
      return fail(
        'ACTIVATION_CANARY_QUERY_FAILED',
        'PostgreSQL TLS activation canary query failed.',
      );
    }
  } finally {
    if (connection !== undefined) {
      if (transactionOpen) {
        try {
          await connection.query('ROLLBACK');
        } catch {
          // Cleanup remains best-effort and secret-safe.
        }
      }
      try {
        connection.release();
      } catch {
        // No driver error payload is surfaced.
      }
    }
    try {
      await pool.close();
    } catch {
      // No secret-bearing pool error is surfaced.
    }
  }
}
