import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { digestSajuHeldStagingTargetManifestV1 } from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import { buildSajuHeldStagingStrictTlsTargetsV1 } from '../apps/api/src/saju-held-staging-db-tls-target-v1.js';

const CERT = `-----BEGIN CERTIFICATE-----
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
const FINGERPRINT = new X509Certificate(CERT).fingerprint256.replaceAll(':', '').toLowerCase();
const PROJECT = 'abcdefghijklmnopqrst';

function manifest() {
  return {
    version: 'myeongha-saju-staging-target-v1', environmentId: 'myeongha-staging-preview1',
    myeonghaCommitSha: 'a'.repeat(40), sajuCommitSha: 'b'.repeat(40),
    authProjectRef: PROJECT, authOrigin: 'https://' + PROJECT + '.supabase.co',
    subjectDbTargetId: 'stage-subject-db', nonceDbTargetId: 'stage-nonce-db',
    proofServiceOrigin: 'https://proof.staging.example.com',
    proofIssuer: 'saju-preview-service', proofAudience: 'myeongha-staging-api',
    proofKeyId: 'proof-key-v1', proofTtlMs: 60_000,
  };
}

function fixture() {
  const m = manifest();
  const plan = {
    version: 'myeongha-saju-staging-connection-plan-v1',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(m),
    environmentId: m.environmentId, myeonghaCommitSha: m.myeonghaCommitSha,
    sajuCommitSha: m.sajuCommitSha, authProjectRef: m.authProjectRef,
    authOrigin: m.authOrigin, proofServiceOrigin: m.proofServiceOrigin,
    proofIssuer: m.proofIssuer, proofAudience: m.proofAudience, proofKeyId: m.proofKeyId,
    subjectDb: { targetId: m.subjectDbTargetId, loginRole: 'mh_staging_subject_login',
      runtimeRole: 'myeongha_api_executor', tlsHostname: 'subject.staging.example.com',
      caFingerprint256: FINGERPRINT, tlsMode: 'verify-full' },
    nonceDb: { targetId: m.nonceDbTargetId, loginRole: 'mh_staging_nonce_login',
      runtimeRole: 'myeongha_saju_proof_nonce_runtime', tlsHostname: 'nonce.staging.example.com',
      caFingerprint256: FINGERPRINT, tlsMode: 'verify-full' },
    admissionDb: { targetId: 'stage-admission-db', loginRole: 'mh_staging_admission_login',
      runtimeRole: 'myeongha_saju_staging_admission_runtime', tlsHostname: 'admission.staging.example.com',
      caFingerprint256: FINGERPRINT, tlsMode: 'verify-full' },
  };
  const connection = (db: typeof plan.subjectDb) => ({
    databaseUrl: 'postgresql://' + db.loginRole + ':SECRET_PASSWORD@' +
      db.tlsHostname + ':5432/staging_db?sslmode=verify-full',
    rootCertificatePem: CERT,
  });
  return {
    planInput: { manifest: m, plan, approvedNonSecretPlan: structuredClone(plan) },
    subjectDb: connection(plan.subjectDb),
    nonceDb: connection(plan.nonceDb),
    admissionDb: connection(plan.admissionDb),
  };
}

describe('8C-2B-2D-2 inert staging TLS connection target factory', () => {
  it('creates no pools; pins independently specified CA and strips sslmode override', () => {
    const result = buildSajuHeldStagingStrictTlsTargetsV1(fixture());
    expect(result.version).toBe('myeongha-saju-staging-db-tls-target-v1');
    for (const item of [result.subjectDb, result.nonceDb, result.admissionDb]) {
      expect(item.ssl).toEqual({ ca: CERT.trim(), rejectUnauthorized: true });
      expect(item.ssl).not.toHaveProperty('checkServerIdentity');
      expect(new URL(item.connectionString).searchParams.has('sslmode')).toBe(false);
      expect(Object.isFrozen(item)).toBe(true);
    }
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ['incorrect TLS host', (f: ReturnType<typeof fixture>) => ({
      ...f, nonceDb: { ...f.nonceDb,
        databaseUrl: f.nonceDb.databaseUrl.replace('nonce.staging', 'production.staging') },
    })],
    ['production login', (f: ReturnType<typeof fixture>) => ({
      ...f, subjectDb: { ...f.subjectDb,
        databaseUrl: f.subjectDb.databaseUrl.replace('mh_staging_subject_login', 'postgres') },
    })],
    ['non-verify-full mode', (f: ReturnType<typeof fixture>) => ({
      ...f, admissionDb: { ...f.admissionDb,
        databaseUrl: f.admissionDb.databaseUrl.replace('sslmode=verify-full', 'sslmode=require') },
    })],
    ['SSL override injection', (f: ReturnType<typeof fixture>) => ({
      ...f, subjectDb: { ...f.subjectDb, databaseUrl: f.subjectDb.databaseUrl + '&sslrootcert=%2Ftmp%2Ffake.crt' },
    })],
    ['duplicate sslmode', (f: ReturnType<typeof fixture>) => ({
      ...f, subjectDb: { ...f.subjectDb, databaseUrl: f.subjectDb.databaseUrl + '&sslmode=disable' },
    })],
    ['userinfo leak through fragment', (f: ReturnType<typeof fixture>) => ({
      ...f, subjectDb: { ...f.subjectDb, databaseUrl: f.subjectDb.databaseUrl + '#SECRET_FRAGMENT' },
    })],
    ['CA fingerprint drift', (f: ReturnType<typeof fixture>) => ({
      ...f, planInput: { ...f.planInput, approvedNonSecretPlan: {
        ...f.planInput.approvedNonSecretPlan,
        admissionDb: { ...f.planInput.approvedNonSecretPlan.admissionDb, caFingerprint256: 'f'.repeat(64) },
      } },
    })],
    ['missing root cert', (f: ReturnType<typeof fixture>) => ({
      ...f, nonceDb: { ...f.nonceDb, rootCertificatePem: '' },
    })],
    ['PEM with private key', (f: ReturnType<typeof fixture>) => ({
      ...f, admissionDb: { ...f.admissionDb,
        rootCertificatePem: f.admissionDb.rootCertificatePem + '\n-----BEGIN PRIVATE KEY-----\nSECRET_PRIVATE_KEY' },
    })],
    ['secret-bearing unexpected field', (f: ReturnType<typeof fixture>) => ({
      ...f, subjectDb: { ...f.subjectDb, serviceBearer: 'SECRET_BEARER' },
    })],
  ])('fails closed on %s and never leaks connection material', (_name, modify) => {
    try {
      buildSajuHeldStagingStrictTlsTargetsV1(modify(fixture()));
      throw Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toBe('Invalid isolated staging PostgreSQL TLS target.');
      expect((error as Error).message).not.toContain('SECRET_');
    }
  });
});
