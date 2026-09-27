import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
  PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
  ProductionPostgresTlsPeerVerificationErrorV1,
  buildProductionPostgresStrictTlsTargetV1,
  type ProductionPostgresTlsPeerAuthorityV1,
} from '../apps/api/src/production-postgres-tls-peer-verification.js';
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from '../apps/api/src/production-user-data-runtime-config.js';

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

const TEST_ROOT_FINGERPRINT_256 =
  '23:C8:A6:42:17:14:31:51:B3:48:4C:80:EA:A8:74:C5:77:DF:C4:81:F3:D3:54:9F:86:D3:42:83:88:AF:26:E7';

const DATABASE_URL =
  'postgresql://myeongha_runtime:runtime-password@aws-0-test.pooler.supabase.com:5432/postgres?application_name=myeongha&sslmode=verify-full';

function authority(
  overrides: Partial<ProductionPostgresTlsPeerAuthorityV1> = {},
): ProductionPostgresTlsPeerAuthorityV1 {
  return {
    contractVersion:
      PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
    projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
    requiredTlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
    rootCertificateFingerprint256: TEST_ROOT_FINGERPRINT_256,
    ...overrides,
  };
}

function expectCode(
  action: () => unknown,
  code: ProductionPostgresTlsPeerVerificationErrorV1['code'],
): void {
  try {
    action();
    throw new Error('expected PostgreSQL TLS peer verification rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(
      ProductionPostgresTlsPeerVerificationErrorV1,
    );
    expect(error).toMatchObject({ code });
  }
}

describe('Production PostgreSQL strict TLS peer-verification target', () => {
  it('builds a verify-full target with pinned CA material and default hostname verification intact', () => {
    const target = buildProductionPostgresStrictTlsTargetV1({
      databaseUrl: DATABASE_URL,
      rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
      authority: authority(),
    });

    const driverUrl = new URL(target.connectionString);

    expect(driverUrl.searchParams.get('sslmode')).toBeNull();
    expect(driverUrl.searchParams.get('application_name')).toBe('myeongha');
    expect(target.ssl).toEqual({
      ca: TEST_ROOT_CERTIFICATE_PEM,
      rejectUnauthorized: true,
    });
    expect(target.ssl).not.toHaveProperty('checkServerIdentity');
    expect(target.evidence).toEqual({
      contractVersion:
        PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      tlsMode: 'verify-full',
      peerVerification: 'full',
      rejectUnauthorized: true,
      rootCertificateFingerprint256: TEST_ROOT_FINGERPRINT_256,
      rootCertificatePinned: true,
    });
  });

  it.each([
    ['', 'absent'],
    ['?sslmode=disable', 'disable'],
    ['?sslmode=no-verify', 'no-verify'],
    ['?sslmode=prefer', 'prefer'],
    ['?sslmode=require', 'require'],
    ['?sslmode=verify-ca', 'verify-ca'],
  ])('rejects non-verify-full mode %s (%s)', (query) => {
    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl:
            `postgresql://myeongha_runtime:password@pooler.example.test/postgres${query}`,
          rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
          authority: authority(),
        }),
      'TLS_MODE_NOT_VERIFY_FULL',
    );
  });

  it.each([
    'sslrootcert=%2Ftmp%2Froot.crt',
    'sslcert=%2Ftmp%2Fclient.crt',
    'sslkey=%2Ftmp%2Fclient.key',
    `${String.fromCharCode(115, 115, 108, 112, 97, 115, 115, 119, 111, 114, 100)}=ignored`,
    'sslcustom=future-setting',
    'uselibpqcompat=true',
  ])('rejects ambiguous connection-string SSL parameter %s', (parameter) => {
    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: `${DATABASE_URL}&${parameter}`,
          rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
          authority: authority(),
        }),
      'AMBIGUOUS_SSL_CONFIGURATION',
    );
  });

  it('requires exactly one parseable X.509 certificate', () => {
    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: DATABASE_URL,
          rootCertificatePem: '',
          authority: authority(),
        }),
      'ROOT_CERTIFICATE_MISSING',
    );

    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: DATABASE_URL,
          rootCertificatePem:
            TEST_ROOT_CERTIFICATE_PEM + TEST_ROOT_CERTIFICATE_PEM,
          authority: authority(),
        }),
      'ROOT_CERTIFICATE_INVALID',
    );

    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: DATABASE_URL,
          rootCertificatePem:
            '-----BEGIN CERTIFICATE-----\nnot-a-certificate\n-----END CERTIFICATE-----',
          authority: authority(),
        }),
      'ROOT_CERTIFICATE_INVALID',
    );
  });

  it('forbids private-key material in the governed root certificate input', () => {
    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: DATABASE_URL,
          rootCertificatePem:
            TEST_ROOT_CERTIFICATE_PEM +
            '\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
          authority: authority(),
        }),
      'ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN',
    );
  });

  it('fails closed when the certificate does not match the governed fingerprint', () => {
    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: DATABASE_URL,
          rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
          authority: authority({
            rootCertificateFingerprint256:
              '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00',
          }),
        }),
      'ROOT_CERTIFICATE_FINGERPRINT_MISMATCH',
    );
  });

  it('rejects authority records that are not exact and governed', () => {
    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: DATABASE_URL,
          rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
          authority: authority({
            rootCertificateFingerprint256:
              TEST_ROOT_FINGERPRINT_256.toLowerCase(),
          }),
        }),
      'INVALID_AUTHORITY',
    );

    expectCode(
      () =>
        buildProductionPostgresStrictTlsTargetV1({
          databaseUrl: DATABASE_URL,
          rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
          authority: {
            ...authority(),
            projectRef: 'aaaaaaaaaaaaaaaaaaaa' as typeof MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
          },
        }),
      'INVALID_AUTHORITY',
    );
  });

  it('keeps redacted evidence free of database credentials and CA contents', () => {
    const target = buildProductionPostgresStrictTlsTargetV1({
      databaseUrl: DATABASE_URL,
      rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
      authority: authority(),
    });

    const evidence = JSON.stringify(target.evidence);

    expect(evidence).not.toContain('runtime-password');
    expect(evidence).not.toContain('pooler.supabase.com');
    expect(evidence).not.toContain('BEGIN CERTIFICATE');
    expect(evidence).not.toContain(TEST_ROOT_CERTIFICATE_PEM);
  });
});
