import { describe, expect, it } from 'vitest';

import {
  buildActivationSkipDomainDeploymentArgs,
  buildProductionEnvPayload,
  validateActivationCanaryEvidence,
} from '../scripts/operations/run-production-postgres-tls-b3-activation.mjs';

const ROOT_PEM =
  '-----BEGIN CERTIFICATE-----\nsecret-test-root\n-----END CERTIFICATE-----';

describe('Production PostgreSQL TLS B3 activation orchestrator contract', () => {
  it('binds the root certificate as sensitive and keeps peer mode encrypted', () => {
    const payload = buildProductionEnvPayload({
      rootCertificatePem: ROOT_PEM,
      peerMode: 'legacy',
    });

    expect(payload).toEqual([
      expect.objectContaining({
        key: 'MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM',
        value: ROOT_PEM,
        type: 'sensitive',
        target: ['production'],
      }),
      expect.objectContaining({
        key: 'MYEONGHA_DATABASE_TLS_PEER_MODE',
        value: 'legacy',
        type: 'encrypted',
        target: ['production'],
      }),
    ]);
  });

  it('stages verify-full without placing root certificate material in CLI arguments', () => {
    const args = buildActivationSkipDomainDeploymentArgs({
      canaryToken: 'test-canary-token-at-least-thirty-two-bytes',
      githubSha: 'a'.repeat(40),
    });
    const serialized = JSON.stringify(args);

    expect(args).toContain(
      'MYEONGHA_DATABASE_TLS_PEER_MODE=verify-full',
    );
    expect(args).toContain(
      'MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_MODE=one-shot-b3',
    );
    expect(args).toContain(
      `MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_SHA=${'a'.repeat(40)}`,
    );
    expect(serialized).not.toContain(
      'MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM=',
    );
    expect(serialized).not.toContain(ROOT_PEM);
  });

  it('accepts only the governed redacted ordinary-pool canary evidence', () => {
    const evidence = {
      schemaVersion:
        'myeongha-production-postgres-tls-activation-canary-v1',
      deploymentTarget: 'production',
      oneShotGitShaConfigured: true,
      runtimeTlsMode: 'verify-full',
      runtimePeerVerification: 'full',
      rejectUnauthorized: true,
      defaultHostnameVerification: true,
      rootCertificateFingerprint256:
        '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
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
    };

    expect(
      validateActivationCanaryEvidence({
        status: 'pass',
        evidence,
      }),
    ).toEqual(evidence);

    expect(() =>
      validateActivationCanaryEvidence({
        status: 'pass',
        evidence: { ...evidence, principalMatch: false },
      }),
    ).toThrow();
  });
});
