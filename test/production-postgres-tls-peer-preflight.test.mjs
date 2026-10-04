import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ProductionPostgresTlsPeerPreflightError,
  buildProductionPostgresTlsPeerPreflightEvidence,
  inspectProductionSessionPoolerHost,
  inspectServerRootCertificatePem,
  inspectVercelDatabaseEnvMetadata,
} from '../scripts/operations/run-production-postgres-tls-peer-preflight.mjs';

const TEST_ROOT_CERTIFICATE_PEM = `-----BEGIN CERTIFICATE-----
MIIDGzCCAgOgAwIBAgIUQ5fMT1BSY4ZD1pPIiDFPT0fYqdkwDQYJKoZIhvcNAQEL
BQAwPTEjMCEGA1UEAwwabXllb25naGEtdGVzdC1yb290LmludmFsaWQxFjAUBgNV
BAoMDU15ZW9uZ0hhIFRlc3QwHhcNMjYwOTI2MjAzMDU4WhcNMzYwOTI0MjAzMDU4
WjA9MSMwIQYDVQQDDBpteWVvbmdoYS10ZXN0LXJvb3QuaW52YWxpZDEWMBQGA1UE
CgwNTXllb25nSGEgVGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AJ4gFSAjDClymvorhGvI9afzuU2kulMyZN88Q81sjRnnLzDzquSgp6I5L9vAbC9G
N7JWOplo/9q3gg8Frm5CxPYNxyP10v58KhDE5dKoYAPd82hdnLVyViCosbZQMLBY
TnhuhF3g+Tt1ws7EolPi18TDpYrCZ11+WuN2l2d0QvUUGE/m7jXeUrAKljuFldL+
SvptVz838jmOwg/zOBHPM2ZnE3nU+nbAvL5xdGHV1DGBL3rtOf3zU2uvIEEQUzdm
+BWJRTWxMA9Kz6w+X9rraQJ1gPxLF0tuzsLgnwUzEFJhac5Zkan13iuzVcB7llil
x/v96GGQibGRJGJTtaXZT6MCAwEAAaMTMBEwDwYDVR0TAQH/BAUwAwEB/zANBgkq
hkiG9w0BAQsFAAOCAQEAYFphoYgr7gGl77J8Nzxvol+/Iu2Uz9RW/pk993lToHnP
1xeXeb8w5yO+m4CLnG3Rqe6oJG50ZlUFFbitLzWAaX0t3M6gfliDzGoX+8s2EidI
Afm3eVYOpObjkVRjgmHHHLjyWUj2OwagO1XrGv6bwZ6URNccWaunOGr9HAybhHmq
MGCcrbmjF6oDdWOPHV1dyO1MEV2x081o446LiKt+felkVm8H6FgGshCbck13ippH
Ke86t9CoR2yY50HHByZVx6v7PoYLURoPe2pCBoXYwstRdCdyksoajTlRIzFy6/8H
NH/Ftgkyl6n4MnWooh1lZOXFNu/ao+PSnEim1mtqwA==
-----END CERTIFICATE-----`;

function expectCode(action, code) {
  try {
    action();
    throw new Error('expected preflight rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ProductionPostgresTlsPeerPreflightError);
    expect(error).toMatchObject({ code });
  }
}

describe('Production PostgreSQL TLS peer authority preflight', () => {
  it('accepts one currently valid CA certificate and exposes only its fingerprint', () => {
    const evidence = inspectServerRootCertificatePem(
      TEST_ROOT_CERTIFICATE_PEM,
      new Date('2026-09-28T00:00:00Z'),
    );

    expect(evidence).toMatchObject({
      certificateSource: 'official-supabase-dashboard',
      certificateParse: 'pass',
      certificateValidNow: true,
      certificatePrivateKeyPresent: false,
      certificatePemEmitted: false,
    });
    expect(evidence.certificateFingerprint256).toMatch(
      /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u,
    );
    expect(JSON.stringify(evidence)).not.toContain('BEGIN CERTIFICATE');
  });

  it('rejects missing, malformed, multiple, and private-key-bearing certificate inputs', () => {
    expectCode(
      () => inspectServerRootCertificatePem('', new Date('2026-09-28T00:00:00Z')),
      'ROOT_CERTIFICATE_MISSING',
    );
    expectCode(
      () =>
        inspectServerRootCertificatePem(
          '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----',
          new Date('2026-09-28T00:00:00Z'),
        ),
      'ROOT_CERTIFICATE_INVALID',
    );
    expectCode(
      () =>
        inspectServerRootCertificatePem(
          TEST_ROOT_CERTIFICATE_PEM + TEST_ROOT_CERTIFICATE_PEM,
          new Date('2026-09-28T00:00:00Z'),
        ),
      'ROOT_CERTIFICATE_INVALID',
    );
    expectCode(
      () =>
        inspectServerRootCertificatePem(
          TEST_ROOT_CERTIFICATE_PEM +
            '\n-----BEGIN PRIVATE KEY-----\nredacted\n-----END PRIVATE KEY-----',
          new Date('2026-09-28T00:00:00Z'),
        ),
      'ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN',
    );
  });

  it('fails closed outside the certificate validity interval', () => {
    expectCode(
      () =>
        inspectServerRootCertificatePem(
          TEST_ROOT_CERTIFICATE_PEM,
          new Date('2025-09-28T00:00:00Z'),
        ),
      'ROOT_CERTIFICATE_NOT_YET_VALID',
    );
    expectCode(
      () =>
        inspectServerRootCertificatePem(
          TEST_ROOT_CERTIFICATE_PEM,
          new Date('2037-01-01T00:00:00Z'),
        ),
      'ROOT_CERTIFICATE_EXPIRED',
    );
  });

  it('accepts only a governed bare Supabase Session Pooler hostname without returning it', () => {
    const evidence = inspectProductionSessionPoolerHost(
      'aws-0-ap-northeast-2.pooler.supabase.com',
    );
    expect(evidence).toEqual({
      sessionPoolerHostPresent: true,
      sessionPoolerHostShapeValid: true,
      sessionPoolerHostnameEmitted: false,
    });

    expectCode(
      () => inspectProductionSessionPoolerHost('db.example.com'),
      'SESSION_POOLER_HOST_INVALID',
    );
  });

  it('uses metadata only for one protected Production database env binding', () => {
    const metadata = inspectVercelDatabaseEnvMetadata({
      envs: [
        {
          key: 'MYEONGHA_DATABASE_URL',
          target: ['production'],
          type: 'sensitive',
          value: 'must-not-escape',
        },
        {
          key: 'MYEONGHA_DATABASE_URL',
          target: ['preview'],
          type: 'encrypted',
          value: 'preview-must-not-escape',
        },
      ],
    });

    expect(metadata).toEqual({
      vercelDatabaseEnvExists: true,
      vercelDatabaseEnvTarget: 'production',
      vercelDatabaseEnvType: 'sensitive',
      vercelDatabaseEnvValueRead: false,
      vercelDatabaseEnvValueEmitted: false,
      preferredB2bExecution: 'vercel-runtime-required',
    });
    expect(JSON.stringify(metadata)).not.toContain('must-not-escape');
  });

  it('rejects missing, ambiguous, or unprotected Production database env bindings', () => {
    expectCode(
      () => inspectVercelDatabaseEnvMetadata({ envs: [] }),
      'VERCEL_DATABASE_ENV_MISSING',
    );
    expectCode(
      () =>
        inspectVercelDatabaseEnvMetadata({
          envs: [
            {
              key: 'MYEONGHA_DATABASE_URL',
              target: ['production'],
              type: 'encrypted',
            },
            {
              key: 'MYEONGHA_DATABASE_URL',
              target: ['production'],
              type: 'sensitive',
            },
          ],
        }),
      'VERCEL_DATABASE_ENV_AMBIGUOUS',
    );
    expectCode(
      () =>
        inspectVercelDatabaseEnvMetadata({
          envs: [
            {
              key: 'MYEONGHA_DATABASE_URL',
              target: ['production'],
              type: 'plain',
            },
          ],
        }),
      'VERCEL_DATABASE_ENV_TYPE_UNSUPPORTED',
    );
  });

  it('builds redacted B2A evidence and never claims a database connection or Production mutation', () => {
    const evidence = buildProductionPostgresTlsPeerPreflightEvidence({
      rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
      sessionPoolerHost: 'aws-0-ap-northeast-2.pooler.supabase.com',
      vercelEnvMetadata: {
        envs: [
          {
            key: 'MYEONGHA_DATABASE_URL',
            target: ['production'],
            type: 'encrypted',
            value: 'do-not-emit',
          },
        ],
      },
      now: new Date('2026-09-28T00:00:00Z'),
    });

    expect(evidence).toMatchObject({
      projectRef: 'cnsfpcdiyofqvhpcegfc',
      productionDatabaseConnectionAttempted: false,
      productionDatabaseUrlMutated: false,
      productionVercelBindingMutated: false,
      databaseUrlEmitted: false,
      credentialMaterialEmitted: false,
      preferredB2bExecution: 'vercel-runtime-preferred',
    });

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('BEGIN CERTIFICATE');
    expect(serialized).not.toContain('pooler.supabase.com');
    expect(serialized).not.toContain('do-not-emit');
  });

  it('pins the workflow to manual main-only ops authority and forbids risky surfaces', () => {
    const workflow = readFileSync(
      '.github/workflows/production-postgres-tls-peer-preflight.yml',
      'utf8',
    );

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*push:/mu);
    expect(workflow).not.toMatch(/^\s*schedule:/mu);
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('VERIFY_POSTGRES_TLS_PEER_B2A');
    expect(workflow).toContain('MYEONGHA_WATCHTOWER_TRACK');
    expect(workflow).toContain('SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM');
    expect(workflow).toContain('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
    expect(workflow).toContain('VERCEL_TOKEN');
    expect(workflow).not.toContain('SUPABASE_DB_PASSWORD');
    expect(workflow).not.toContain('decrypt=true');
    expect(workflow).not.toContain('upload-artifact');
  });
});
