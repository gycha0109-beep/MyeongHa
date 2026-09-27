import { describe, expect, it, vi } from 'vitest';

import {
  buildProductionPostgresTlsCanaryPlanV1,
  PRODUCTION_POSTGRES_TLS_CANARY_ROOT_FINGERPRINT256_V1,
  ProductionPostgresTlsCanaryErrorV1,
  runProductionPostgresTlsPeerCanaryV1,
} from '../apps/api/src/production-postgres-tls-peer-canary.js';

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

function env(overrides = {}) {
  return {
    VERCEL_TARGET_ENV: 'sec01-b2b-12345',
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_runtime:secret@example.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
    MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: TEST_ROOT_CERTIFICATE_PEM,
    ...overrides,
  };
}

describe('Production PostgreSQL TLS peer canary', () => {
  it('fails closed outside the exact temporary Vercel target', () => {
    expect(() =>
      buildProductionPostgresTlsCanaryPlanV1(
        env({ VERCEL_TARGET_ENV: 'production' }),
      ),
    ).toThrowError(ProductionPostgresTlsCanaryErrorV1);
  });

  it('fails closed for a non-governed login principal', () => {
    expect(() =>
      buildProductionPostgresTlsCanaryPlanV1(
        env({ MYEONGHA_DATABASE_PRINCIPAL: 'someone_else' }),
      ),
    ).toThrowError(ProductionPostgresTlsCanaryErrorV1);
  });

  it('rejects a certificate that does not match the Production fingerprint pin', () => {
    expect(() => buildProductionPostgresTlsCanaryPlanV1(env())).toThrowError(
      ProductionPostgresTlsCanaryErrorV1,
    );
  });

  it('requires the repository-pinned Production fingerprint', () => {
    expect(PRODUCTION_POSTGRES_TLS_CANARY_ROOT_FINGERPRINT256_V1).toBe(
      '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
    );
  });

  it('returns only governed redacted evidence after a synthetic strict session', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            principal: 'myeongha_runtime',
            transaction_read_only: 'on',
            execution_role_member: true,
            ssl_session: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const evidence = await runProductionPostgresTlsPeerCanaryV1({
      env: env(),
      buildPlan: () => ({
        clientConfig: {},
        currentBindingTlsMode: 'require',
        currentBindingPeerVerification: 'none',
      }),
      createClient: () => ({
        connect: vi.fn().mockResolvedValue(undefined),
        query,
        end: vi.fn().mockResolvedValue(undefined),
      }),
    });

    expect(evidence).toMatchObject({
      schemaVersion: 'myeongha-production-postgres-tls-peer-canary-v1',
      currentBindingTlsMode: 'require',
      currentBindingPeerVerification: 'none',
      canaryTlsMode: 'verify-full',
      canaryPeerVerification: 'full',
      rejectUnauthorized: true,
      defaultHostnameVerification: true,
      connectionSucceeded: true,
      sslSession: true,
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
    expect(query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
  });
});
