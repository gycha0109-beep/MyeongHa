import { describe, expect, it } from 'vitest';
import {
  assessSajuHeldStagingConnectionPlanV1,
  digestSajuHeldStagingConnectionPlanV1,
  parseSajuHeldStagingConnectionPlanV1,
  SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1,
} from '../apps/api/src/saju-held-staging-connection-plan-v1.js';
import { assessSajuHeldStagingConnectionClaimsV1 } from '../apps/api/src/saju-held-staging-connection-claims-v1.js';
import { digestSajuHeldStagingTargetManifestV1 } from '../apps/api/src/saju-held-staging-target-manifest-v1.js';

const ref = 'abcdefghijklmnopqrst';
function manifest() {
  return {
    version: 'myeongha-saju-staging-target-v1',
    environmentId: 'myeongha-staging-preview1',
    myeonghaCommitSha: 'a'.repeat(40),
    sajuCommitSha: 'b'.repeat(40),
    authProjectRef: ref,
    authOrigin: 'https://' + ref + '.supabase.co',
    subjectDbTargetId: 'staging-db:subject-login',
    nonceDbTargetId: 'staging-db:nonce-login',
    proofServiceOrigin: 'https://proof.staging.example.com',
    proofIssuer: 'saju-preview-service',
    proofAudience: 'myeongha-staging-api',
    proofKeyId: 'proof-key-v1',
    proofTtlMs: 60_000,
  };
}
function plan() {
  const m = manifest();
  return {
    version: SAJU_HELD_STAGING_CONNECTION_PLAN_VERSION_V1,
    manifestDigest: digestSajuHeldStagingTargetManifestV1(m),
    environmentId: m.environmentId,
    myeonghaCommitSha: m.myeonghaCommitSha,
    sajuCommitSha: m.sajuCommitSha,
    authProjectRef: m.authProjectRef,
    authOrigin: m.authOrigin,
    proofServiceOrigin: m.proofServiceOrigin,
    proofIssuer: m.proofIssuer,
    proofAudience: m.proofAudience,
    proofKeyId: m.proofKeyId,
    subjectDb: {
      targetId: m.subjectDbTargetId,
      loginRole: 'mh_staging_subject_login',
      runtimeRole: 'myeongha_api_executor',
      tlsHostname: 'subject.db.staging.example.com',
      caFingerprint256: '1'.repeat(64),
      tlsMode: 'verify-full',
    },
    nonceDb: {
      targetId: m.nonceDbTargetId,
      loginRole: 'mh_staging_nonce_login',
      runtimeRole: 'myeongha_saju_proof_nonce_runtime',
      tlsHostname: 'nonce.db.staging.example.com',
      caFingerprint256: '2'.repeat(64),
      tlsMode: 'verify-full',
    },
    admissionDb: {
      targetId: 'staging-db:admission-login',
      loginRole: 'mh_staging_admission_login',
      runtimeRole: 'myeongha_saju_staging_admission_runtime',
      tlsHostname: 'admission.db.staging.example.com',
      caFingerprint256: '3'.repeat(64),
      tlsMode: 'verify-full',
    },
  };
}
function fixture() {
  const p = plan();
  return {
    plan: p,
    manifest: manifest(),
    approvedNonSecretPlan: structuredClone(p),
  };
}
function claims() {
  const p = plan();
  const db = (binding: typeof p.subjectDb) => ({
    ...binding, tlsPeerVerifiedReported: true, runtimeMembershipVerifiedReported: true,
  });
  return {
    auth: { projectRef: p.authProjectRef, origin: p.authOrigin, memberOnlyReported: true },
    subjectDb: db(p.subjectDb),
    nonceDb: db(p.nonceDb),
    admissionDb: db(p.admissionDb),
    proof: {
      origin: p.proofServiceOrigin, issuer: p.proofIssuer,
      audience: p.proofAudience, keyId: p.proofKeyId,
      restrictedHttpsReported: true, bearerHmacSeparatedReported: true,
    },
  };
}

describe('8C-2B-2D-2 isolated connection declaration', () => {
  it('creates a deterministic non-secret connection digest; never changes Manifest V1', () => {
    const f = fixture();
    const parsed = parseSajuHeldStagingConnectionPlanV1(f.plan);
    expect(parsed).toEqual(f.plan);
    expect(parsed).not.toBe(f.plan);
    expect(Object.isFrozen(parsed.subjectDb)).toBe(true);
    const digest = digestSajuHeldStagingConnectionPlanV1(f.plan);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(digestSajuHeldStagingConnectionPlanV1(
      Object.fromEntries(Object.entries(f.plan).reverse()),
    ));
    expect(assessSajuHeldStagingConnectionPlanV1(f)).toMatchObject({
      configuration: 'MATCHED_UNVERIFIED', operationalEvidence: 'NOT_VERIFIED',
      stagingAdmission: 'HOLD', stagingConnection: 'NOT_VERIFIED',
      canRunOnce: false, canExecute: false, canPublish: false, canSell: false,
    });
  });

  it.each([
    ['different approved admission target', (f: ReturnType<typeof fixture>) =>
      ({ ...f, approvedNonSecretPlan: { ...f.approvedNonSecretPlan,
        admissionDb: { ...f.approvedNonSecretPlan.admissionDb, targetId: 'staging-db:rogue-login' } } })],
    ['manifest revision drift', (f: ReturnType<typeof fixture>) =>
      ({ ...f, manifest: { ...f.manifest, sajuCommitSha: 'c'.repeat(40) } })],
    ['manifest target drift', (f: ReturnType<typeof fixture>) =>
      ({ ...f, manifest: { ...f.manifest, nonceDbTargetId: 'staging-db:nonce-drift' } })],
    ['manifest auth project drift', (f: ReturnType<typeof fixture>) =>
      ({ ...f, manifest: { ...f.manifest, authProjectRef: 'cnsfpcdiyofqvhpcegfc' } })],
    ['proof origin drift', (f: ReturnType<typeof fixture>) =>
      ({ ...f, plan: { ...f.plan, proofServiceOrigin: 'https://calculation.example.com' } })],
    ['approved CA fingerprint drift', (f: ReturnType<typeof fixture>) =>
      ({ ...f, approvedNonSecretPlan: { ...f.approvedNonSecretPlan,
        nonceDb: { ...f.approvedNonSecretPlan.nonceDb, caFingerprint256: 'f'.repeat(64) } } })],
  ])('rejects %s without granting any operational authority', (_name, modify) => {
    const report = assessSajuHeldStagingConnectionPlanV1(modify(fixture()));
    expect(report.configuration).toBe('BLOCKED');
    expect(report.canRunOnce).toBe(false);
    expect(JSON.stringify(report)).not.toContain('staging-db:');
  });

  it.each([
    ['login role shared', (p: ReturnType<typeof plan>) => ({
      ...p, nonceDb: { ...p.nonceDb, loginRole: p.subjectDb.loginRole },
    })],
    ['runtime role shared', (p: ReturnType<typeof plan>) => ({
      ...p, subjectDb: { ...p.subjectDb, runtimeRole: p.nonceDb.runtimeRole },
    })],
    ['admission impersonates nonce target', (p: ReturnType<typeof plan>) => ({
      ...p, admissionDb: { ...p.admissionDb, targetId: p.nonceDb.targetId },
    })],
    ['runtime role used as login', (p: ReturnType<typeof plan>) => ({
      ...p, admissionDb: { ...p.admissionDb, loginRole: p.nonceDb.runtimeRole },
    })],
    ['nonce runtime role changed', (p: ReturnType<typeof plan>) => ({
      ...p, nonceDb: { ...p.nonceDb, runtimeRole: 'myeongha_api_executor' },
    })],
    ['admission runtime role changed', (p: ReturnType<typeof plan>) => ({
      ...p, admissionDb: { ...p.admissionDb, runtimeRole: 'myeongha_api_executor' },
    })],
    ['TLS downgraded', (p: ReturnType<typeof plan>) => ({
      ...p, subjectDb: { ...p.subjectDb, tlsMode: 'require' },
    })],
    ['loopback DB host', (p: ReturnType<typeof plan>) => ({
      ...p, subjectDb: { ...p.subjectDb, tlsHostname: 'localhost' },
    })],
    ['IP literal host', (p: ReturnType<typeof plan>) => ({
      ...p, nonceDb: { ...p.nonceDb, tlsHostname: '127.0.0.1' },
    })],
    ['malformed CA pin', (p: ReturnType<typeof plan>) => ({
      ...p, admissionDb: { ...p.admissionDb, caFingerprint256: 'bad' },
    })],
    ['secret inserted at top level', (p: ReturnType<typeof plan>) => ({
      ...p, serviceBearer: 'SECRET_BEARER',
    })],
    ['DB URL inserted into binding', (p: ReturnType<typeof plan>) => ({
      ...p, nonceDb: { ...p.nonceDb, databaseUrl: 'postgres://SECRET_PASSWORD' },
    })],
  ])('strict plan parser rejects %s', (_name, modify) => {
    expect(() => parseSajuHeldStagingConnectionPlanV1(modify(plan()))).toThrow(TypeError);
  });

  it('rejects accessors, prototype objects and symbols without reading secrets', () => {
    const p = plan();
    const accessor: Record<string, unknown> = { ...p };
    Object.defineProperty(accessor, 'admissionDb', {
      enumerable: true, get() { throw new Error('SECRET_ACCESSOR'); },
    });
    expect(() => parseSajuHeldStagingConnectionPlanV1(accessor)).toThrow(TypeError);
    expect(() => parseSajuHeldStagingConnectionPlanV1(Object.create(p))).toThrow(TypeError);
    expect(() => parseSajuHeldStagingConnectionPlanV1({ ...p, [Symbol('secret')]: 'oops' }))
      .toThrow(TypeError);
  });
});

describe('8C-2B-2D-2 claim coverage cannot prove real TLS or issue execution permission', () => {
  it('reports absent observations as unverified and never starts a probe', () => {
    const result = assessSajuHeldStagingConnectionClaimsV1({ planInput: fixture(), claims: undefined });
    expect(result.evidenceCoverage).toBe('INCOMPLETE');
    expect(Object.values(result.checks)).toEqual(Array(5).fill('MISSING'));
    expect(result.operationalEvidence).toBe('NOT_VERIFIED');
  });

  it('marks even all self-reported TLS/Member/HTTPS PASS as untrusted', () => {
    const result = assessSajuHeldStagingConnectionClaimsV1({ planInput: fixture(), claims: claims() });
    expect(result.evidenceCoverage).toBe('COMPLETE_UNTRUSTED');
    expect(Object.values(result.checks)).toEqual(Array(5).fill('REPORTED_ONLY'));
    expect(result.stagingConnection).toBe('NOT_VERIFIED');
    expect(result.stagingAdmission).toBe('HOLD');
    expect(result.canRunOnce).toBe(false);
    expect(result.canExecute).toBe(false);
    expect(result.canPublish).toBe(false);
    expect(result.canSell).toBe(false);
    expect(Object.isFrozen(result.checks)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    const printable = JSON.stringify(result);
    expect(printable).not.toContain(ref);
    expect(printable).not.toContain('staging-db:');
    expect(printable).not.toContain('caFingerprint256');
  });

  it.each([
    ['TLS peer not verified', (c: ReturnType<typeof claims>) =>
      ({ ...c, subjectDb: { ...c.subjectDb, tlsPeerVerifiedReported: false } })],
    ['wrong DB role', (c: ReturnType<typeof claims>) =>
      ({ ...c, admissionDb: { ...c.admissionDb, runtimeRole: 'myeongha_api_executor' } })],
    ['wrong DB login', (c: ReturnType<typeof claims>) =>
      ({ ...c, nonceDb: { ...c.nonceDb, loginRole: 'production_login' } })],
    ['wrong CA', (c: ReturnType<typeof claims>) =>
      ({ ...c, nonceDb: { ...c.nonceDb, caFingerprint256: 'f'.repeat(64) } })],
    ['wrong TLS host', (c: ReturnType<typeof claims>) =>
      ({ ...c, admissionDb: { ...c.admissionDb, tlsHostname: 'rogue.staging.example.com' } })],
    ['guest allowed', (c: ReturnType<typeof claims>) =>
      ({ ...c, auth: { ...c.auth, memberOnlyReported: false } })],
    ['production Auth', (c: ReturnType<typeof claims>) =>
      ({ ...c, auth: { ...c.auth, projectRef: 'cnsfpcdiyofqvhpcegfc' } })],
    ['ordinary calculation origin', (c: ReturnType<typeof claims>) =>
      ({ ...c, proof: { ...c.proof, origin: 'https://calculation.example.com' } })],
    ['insecure proof reported', (c: ReturnType<typeof claims>) =>
      ({ ...c, proof: { ...c.proof, restrictedHttpsReported: false } })],
    ['secret in claim', (c: ReturnType<typeof claims>) =>
      ({ ...c, proof: { ...c.proof, bearer: 'SECRET_PASSWORD' } })],
    ['surplus role membership', (c: ReturnType<typeof claims>) =>
      ({ ...c, subjectDb: { ...c.subjectDb, isAdmin: true } })],
  ])('blocks malformed or mismatched unverified claim: %s', (_name, modify) => {
    const result = assessSajuHeldStagingConnectionClaimsV1({
      planInput: fixture(), claims: modify(claims()),
    });
    expect(result.evidenceCoverage).toBe('BLOCKED');
    expect(result.operationalEvidence).toBe('BLOCKED');
    expect(result.canRunOnce).toBe(false);
    expect(JSON.stringify(result)).not.toContain('SECRET_PASSWORD');
  });

  it('blocks forged approval and malformed top-level evidence', () => {
    const f = fixture();
    const badInput = { ...f, approvedNonSecretPlan: null };
    expect(assessSajuHeldStagingConnectionClaimsV1({
      planInput: badInput, claims: claims(),
    }).evidenceCoverage).toBe('BLOCKED');
    for (const bad of [[], { auth: {} }, { ...claims(), canRunOnce: true }]) {
      expect(assessSajuHeldStagingConnectionClaimsV1({
        planInput: f, claims: bad,
      }).evidenceCoverage).toBe('BLOCKED');
    }
  });
});
