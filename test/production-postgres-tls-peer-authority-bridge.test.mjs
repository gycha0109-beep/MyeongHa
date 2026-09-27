import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_BRIDGE_MARKER_PATH,
  AUTHORITY_BRIDGE_MARKER_VALUE,
  buildProductionPostgresTlsAuthorityBridgeEvidence,
  validateProductionPostgresTlsAuthorityBridge,
} from '../scripts/operations/run-production-postgres-tls-peer-authority-bridge.mjs';
import { ProductionPostgresTlsPeerPreflightError } from '../scripts/operations/run-production-postgres-tls-peer-preflight.mjs';

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
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ProductionPostgresTlsPeerPreflightError);
    expect(error).toMatchObject({ code });
  }
}

describe('Production PostgreSQL TLS authority one-shot bridge', () => {
  it('accepts only the exact main push marker and security track', () => {
    expect(
      validateProductionPostgresTlsAuthorityBridge({
        eventName: 'push',
        ref: 'refs/heads/main',
        track: 'security',
        markerPath: AUTHORITY_BRIDGE_MARKER_PATH,
        markerContent: AUTHORITY_BRIDGE_MARKER_VALUE,
      }),
    ).toMatchObject({
      event: 'push',
      ref: 'refs/heads/main',
      track: 'security',
      markerExact: true,
    });

    expectCode(
      () =>
        validateProductionPostgresTlsAuthorityBridge({
          eventName: 'pull_request',
          ref: 'refs/heads/main',
          track: 'security',
          markerPath: AUTHORITY_BRIDGE_MARKER_PATH,
          markerContent: AUTHORITY_BRIDGE_MARKER_VALUE,
        }),
      'AUTHORITY_BRIDGE_EVENT_INVALID',
    );
    expectCode(
      () =>
        validateProductionPostgresTlsAuthorityBridge({
          eventName: 'push',
          ref: 'refs/heads/feature',
          track: 'security',
          markerPath: AUTHORITY_BRIDGE_MARKER_PATH,
          markerContent: AUTHORITY_BRIDGE_MARKER_VALUE,
        }),
      'AUTHORITY_BRIDGE_REF_INVALID',
    );
    expectCode(
      () =>
        validateProductionPostgresTlsAuthorityBridge({
          eventName: 'push',
          ref: 'refs/heads/main',
          track: 'ops',
          markerPath: AUTHORITY_BRIDGE_MARKER_PATH,
          markerContent: AUTHORITY_BRIDGE_MARKER_VALUE,
        }),
      'AUTHORITY_BRIDGE_TRACK_INVALID',
    );
    expectCode(
      () =>
        validateProductionPostgresTlsAuthorityBridge({
          eventName: 'push',
          ref: 'refs/heads/main',
          track: 'security',
          markerPath: AUTHORITY_BRIDGE_MARKER_PATH,
          markerContent: 'VERIFY_SOMETHING_ELSE\n',
        }),
      'AUTHORITY_BRIDGE_MARKER_INVALID',
    );
  });

  it('emits only redacted authority evidence and never claims Production data access', () => {
    const evidence = buildProductionPostgresTlsAuthorityBridgeEvidence({
      rootCertificatePem: TEST_ROOT_CERTIFICATE_PEM,
      sessionPoolerHost: 'aws-0-ap-northeast-2.pooler.supabase.com',
      now: new Date('2026-09-28T00:00:00Z'),
    });

    expect(evidence.certificateFingerprint256).toMatch(
      /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u,
    );
    expect(evidence).toMatchObject({
      certificateParse: 'pass',
      certificateValidNow: true,
      certificatePrivateKeyPresent: false,
      certificatePemEmitted: false,
      sessionPoolerHostnameEmitted: false,
      productionDatabaseConnectionAttempted: false,
      productionDatabaseUrlRead: false,
      productionDatabaseUrlMutated: false,
      productionVercelBindingMutated: false,
      credentialMaterialEmitted: false,
    });

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('BEGIN CERTIFICATE');
    expect(serialized).not.toContain('pooler.supabase.com');
  });
});
