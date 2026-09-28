import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1,
  PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_MODE_V1,
  ProductionPostgresTlsActivationCanaryErrorV1,
  isProductionPostgresTlsActivationCanaryRuntimeV1,
  runProductionPostgresTlsActivationCanaryV1,
} from '../apps/api/src/production-postgres-tls-activation-canary.js';
import {
  PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1,
  PRODUCTION_USER_DATA_RUNTIME_ENV_V1,
} from '../apps/api/src/production-user-data-runtime-config.js';

const ROOT_PEM =
  '-----BEGIN CERTIFICATE-----\ntest-only-root\n-----END CERTIFICATE-----';

function env(): Record<string, string> {
  return {
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl]:
      'postgresql://myeongha_runtime:password@pooler.example.test:6543/postgres?sslmode=require',
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databasePrincipal]:
      'myeongha_runtime',
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode]: 'verify-full',
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.rootCertificatePem]: ROOT_PEM,
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.token]:
      'activation-canary-token-at-least-thirty-two-bytes',
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.mode]:
      PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_MODE_V1,
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.expectedGitSha]:
      'a'.repeat(40),
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_CANARY_ENV_V1.vercelTargetEnv]:
      'production',
  };
}

describe('Production PostgreSQL TLS B3 activation canary', () => {
  it('requires exact one-shot strict Production authority', () => {
    expect(isProductionPostgresTlsActivationCanaryRuntimeV1(env())).toBe(true);

    const invalid = env();
    invalid[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode] = 'legacy';
    expect(isProductionPostgresTlsActivationCanaryRuntimeV1(invalid)).toBe(
      false,
    );
  });

  it('returns only governed redacted evidence after the ordinary pool succeeds', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            principal: 'myeongha_runtime',
            transaction_read_only: 'on',
            execution_role_member: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);

    const evidence = await runProductionPostgresTlsActivationCanaryV1({
      env: env(),
      createPool: () => ({
        connect: vi.fn().mockResolvedValue({ query, release }),
        close,
      }),
    });

    expect(evidence).toMatchObject({
      schemaVersion:
        'myeongha-production-postgres-tls-activation-canary-v1',
      deploymentTarget: 'production',
      runtimeTlsMode: 'verify-full',
      runtimePeerVerification: 'full',
      rejectUnauthorized: true,
      defaultHostnameVerification: true,
      rootCertificateConfigured: true,
      ordinaryPoolConnectionSucceeded: true,
      transactionReadOnly: true,
      principalExpected: 'myeongha_runtime',
      principalMatch: true,
      executionRole: 'myeongha_api_executor',
      executionRoleMembership: true,
      writeExecuted: false,
      databaseUrlEmitted: false,
      credentialMaterialEmitted: false,
      rootCertificatePemEmitted: false,
    });
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN READ ONLY');
    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT current_user AS principal, current_setting('transaction_read_only') AS transaction_read_only, pg_has_role(current_user, 'myeongha_api_executor', 'MEMBER') AS execution_role_member",
    );
    expect(query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(evidence)).not.toContain('password');
    expect(JSON.stringify(evidence)).not.toContain(ROOT_PEM);
  });

  it.each([
    [
      [],
      'ACTIVATION_CANARY_EVIDENCE_ROW_COUNT_INVALID',
    ],
    [
      [
        {
          principal: 'unexpected',
          transaction_read_only: 'on',
          execution_role_member: true,
        },
      ],
      'ACTIVATION_CANARY_EVIDENCE_PRINCIPAL_MISMATCH',
    ],
    [
      [
        {
          principal: 'myeongha_runtime',
          transaction_read_only: 'off',
          execution_role_member: true,
        },
      ],
      'ACTIVATION_CANARY_EVIDENCE_TRANSACTION_READ_ONLY_INVALID',
    ],
    [
      [
        {
          principal: 'myeongha_runtime',
          transaction_read_only: 'on',
          execution_role_member: false,
        },
      ],
      'ACTIVATION_CANARY_EVIDENCE_ROLE_MEMBERSHIP_INVALID',
    ],
  ])('fails closed with fixed evidence code', async (rows, code) => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      runProductionPostgresTlsActivationCanaryV1({
        env: env(),
        createPool: () => ({
          connect: vi.fn().mockResolvedValue({
            query,
            release: vi.fn(),
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    ).rejects.toMatchObject({ code });
  });

  it('classifies ordinary-pool connection failure without reflecting driver material', async () => {
    await expect(
      runProductionPostgresTlsActivationCanaryV1({
        env: env(),
        createPool: () => ({
          connect: vi
            .fn()
            .mockRejectedValue(new Error('password=must-not-leak')),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    ).rejects.toMatchObject({
      code: 'ACTIVATION_CANARY_CONNECT_FAILED',
    });

    try {
      await runProductionPostgresTlsActivationCanaryV1({
        env: env(),
        createPool: () => ({
          connect: vi
            .fn()
            .mockRejectedValue(new Error('password=must-not-leak')),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      });
      throw new Error('expected activation canary failure');
    } catch (error) {
      expect(error).toBeInstanceOf(
        ProductionPostgresTlsActivationCanaryErrorV1,
      );
      expect(String(error)).not.toContain('must-not-leak');
    }
  });
});
