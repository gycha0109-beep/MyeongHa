import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assessSajuHeldStagingAdmissionSignatureV2,
  canonicalSajuHeldStagingPermitApprovalBytesV2,
  parseSajuHeldStagingAdmissionPermitV2,
  SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2,
} from '../apps/api/src/saju-held-staging-admission-signature-v2.js';
import {
  canonicalSajuHeldStagingPermitApprovalBytesV1,
} from '../apps/api/src/saju-held-staging-admission-postgres-v1.js';
import {
  digestSajuHeldStagingTargetManifestV1,
} from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import {
  digestSajuHeldStagingConnectionPlanV1,
} from '../apps/api/src/saju-held-staging-connection-plan-v1.js';

const NOW = 1_800_000_000_000;
const keys = generateKeyPairSync('ed25519');
const REF = 'abcdefghijklmnopqrst';

function manifest() {
  return {
    version: 'myeongha-saju-staging-target-v1',
    environmentId: 'myeongha-staging-permit-v2',
    myeonghaCommitSha: 'a'.repeat(40),
    sajuCommitSha: 'b'.repeat(40),
    authProjectRef: REF,
    authOrigin: 'https://' + REF + '.supabase.co',
    subjectDbTargetId: 'stage-subject-db',
    nonceDbTargetId: 'stage-nonce-db',
    proofServiceOrigin: 'https://proof.staging.example.com',
    proofIssuer: 'saju-preview-service',
    proofAudience: 'myeongha-staging-api',
    proofKeyId: 'proof-key-v1',
    proofTtlMs: 60_000,
  };
}

function connectionPlan(m: ReturnType<typeof manifest>) {
  return {
    version: 'myeongha-saju-staging-connection-plan-v1',
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
      loginRole: 'staging_subject_login',
      runtimeRole: 'myeongha_api_executor',
      tlsHostname: 'subject.db.staging.example.com',
      caFingerprint256: '1'.repeat(64),
      tlsMode: 'verify-full',
    },
    nonceDb: {
      targetId: m.nonceDbTargetId,
      loginRole: 'staging_nonce_login',
      runtimeRole: 'myeongha_saju_proof_nonce_runtime',
      tlsHostname: 'nonce.db.staging.example.com',
      caFingerprint256: '2'.repeat(64),
      tlsMode: 'verify-full',
    },
    admissionDb: {
      targetId: 'stage-admission-db',
      loginRole: 'staging_admission_login',
      runtimeRole: 'myeongha_saju_staging_admission_runtime',
      tlsHostname: 'admission.db.staging.example.com',
      caFingerprint256: '3'.repeat(64),
      tlsMode: 'verify-full',
    },
  };
}

function fixture() {
  const m = manifest();
  const p = connectionPlan(m);
  const permit = {
    version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V2,
    permitId: '123e4567-e89b-42d3-a456-426614174000',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(m),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(p),
    environmentId: m.environmentId,
    myeonghaCommitSha: m.myeonghaCommitSha,
    sajuCommitSha: m.sajuCommitSha,
    approvedOperatorId: 'reviewed-operator-v2',
    issuedAtMs: NOW - 20_000,
    expiresAtMs: NOW + 60_000,
    consumedAtMs: null as number | null,
    status: 'ISSUED',
    approvalSignatureKeyId: 'operator-key-v2',
  };
  return {
    manifest: m,
    approvedManifest: structuredClone(m),
    connectionPlan: p,
    approvedConnectionPlan: structuredClone(p),
    permit,
    approvalSignature: sign(
      null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit), keys.privateKey,
    ).toString('base64url'),
    approvalPublicKey: keys.publicKey,
    expectedOperatorId: 'reviewed-operator-v2',
    expectedApprovalKeyId: 'operator-key-v2',
    nowMs: NOW,
  };
}

describe('8C-2B-2D-3-01 V2 cryptographic target binding, zero I/O', () => {
  it('validates a V2 detached signature over BOTH manifest and connection plan digests, without admission', () => {
    const f = fixture();
    const parsed = parseSajuHeldStagingAdmissionPermitV2(f.permit);
    expect(parsed).toEqual(f.permit);
    expect(parsed).not.toBe(f.permit);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(canonicalSajuHeldStagingPermitApprovalBytesV2(f.permit))
      .toEqual(canonicalSajuHeldStagingPermitApprovalBytesV2(
        Object.fromEntries(Object.entries(f.permit).reverse()),
      ));
    expect(Buffer.from(canonicalSajuHeldStagingPermitApprovalBytesV2(f.permit))
      .toString('utf8')).toContain(f.permit.connectionPlanDigest);
    const report = assessSajuHeldStagingAdmissionSignatureV2(f);
    expect(report).toMatchObject({
      contract: 'SIGNED_TARGET_MATCHED_UNVERIFIED_AUTHORITY',
      signatureVerification: 'VALID_FOR_SUPPLIED_KEY',
      signerAuthority: 'NOT_VERIFIED',
      atomicConsumption: 'NOT_VERIFIED',
      operationalEvidence: 'NOT_VERIFIED',
      stagingAdmission: 'HOLD',
      stagingConnection: 'NOT_VERIFIED',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canRunOnce: false, canExecute: false, canPublish: false, canSell: false,
    });
    expect(Object.values(report.checks)).toEqual(Array(5).fill('PASS'));
    expect(Object.isFrozen(report.checks)).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    expect(JSON.stringify(report)).not.toContain(f.permit.permitId);
    expect(JSON.stringify(report)).not.toContain(f.approvalSignature);
    expect(JSON.stringify(report)).not.toContain(f.connectionPlan.admissionDb.tlsHostname);
  });

  it('never accepts a signed Permit V1 or a V1 Ed25519 domain signature in V2', () => {
    const f = fixture();
    const v1 = {
      ...f.permit,
      version: 'myeongha-saju-staging-admission-contract-v1',
    };
    const { connectionPlanDigest: _unused, ...old } = v1;
    const v1Signature = sign(
      null, canonicalSajuHeldStagingPermitApprovalBytesV1(old), keys.privateKey,
    ).toString('base64url');
    expect(() => parseSajuHeldStagingAdmissionPermitV2(old)).toThrow(TypeError);
    const result = assessSajuHeldStagingAdmissionSignatureV2({
      ...f, approvalSignature: v1Signature,
    });
    expect(result.contract).toBe('BLOCKED');
    expect(result.signatureVerification).toBe('BLOCKED');
    expect(result.canRunOnce).toBe(false);
  });

  it.each([
    ['different approved connection plan', (f: ReturnType<typeof fixture>) => ({
      ...f, approvedConnectionPlan: { ...f.approvedConnectionPlan,
        admissionDb: { ...f.approvedConnectionPlan.admissionDb, targetId: 'rogue-db' } },
    })],
    ['changed runtime login', (f: ReturnType<typeof fixture>) => ({
      ...f, connectionPlan: { ...f.connectionPlan,
        nonceDb: { ...f.connectionPlan.nonceDb, loginRole: 'rogue_login' } },
    })],
    ['changed CA pin', (f: ReturnType<typeof fixture>) => ({
      ...f, connectionPlan: { ...f.connectionPlan,
        subjectDb: { ...f.connectionPlan.subjectDb, caFingerprint256: 'f'.repeat(64) } },
    })],
    ['changed proof origin', (f: ReturnType<typeof fixture>) => ({
      ...f, connectionPlan: { ...f.connectionPlan, proofServiceOrigin: 'https://evil.example.com' },
    })],
    ['changed manifest SHA', (f: ReturnType<typeof fixture>) => ({
      ...f, manifest: { ...f.manifest, sajuCommitSha: 'c'.repeat(40) },
    })],
    ['different approved Manifest', (f: ReturnType<typeof fixture>) => ({
      ...f, approvedManifest: { ...f.approvedManifest, proofKeyId: 'wrong-key' },
    })],
    ['production Auth', (f: ReturnType<typeof fixture>) => ({
      ...f, manifest: { ...f.manifest, authProjectRef: 'cnsfpcdiyofqvhpcegfc',
        authOrigin: 'https://cnsfpcdiyofqvhpcegfc.supabase.co' },
    })],
    ['permit different manifest digest', (f: ReturnType<typeof fixture>) => ({
      ...f, permit: { ...f.permit, manifestDigest: 'f'.repeat(64) },
    })],
    ['permit different plan digest', (f: ReturnType<typeof fixture>) => ({
      ...f, permit: { ...f.permit, connectionPlanDigest: 'f'.repeat(64) },
    })],
    ['wrong operator', (f: ReturnType<typeof fixture>) => ({
      ...f, expectedOperatorId: 'other-operator' },
    )],
    ['wrong key id', (f: ReturnType<typeof fixture>) => ({
      ...f, expectedApprovalKeyId: 'other-signing-key' },
    )],
    ['wrong verification key', (f: ReturnType<typeof fixture>) => ({
      ...f, approvalPublicKey: generateKeyPairSync('ed25519').publicKey },
    )],
    ['forged signature', (f: ReturnType<typeof fixture>) => ({
      ...f, approvalSignature: sign(null, Buffer.from('forged'), keys.privateKey).toString('base64url') },
    )],
    ['malformed signature', (f: ReturnType<typeof fixture>) => ({
      ...f, approvalSignature: 'SECRET_IMPOSTOR_SIGNATURE' },
    )],
    ['non Ed25519 key', (f: ReturnType<typeof fixture>) => ({
      ...f, approvalPublicKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey },
    )],
    ['unsigned key object', (f: ReturnType<typeof fixture>) => ({
      ...f, approvalPublicKey: { type: 'public', asymmetricKeyType: 'ed25519' } },
    )],
    ['expired', (f: ReturnType<typeof fixture>) => ({
      ...f, nowMs: f.permit.expiresAtMs },
    )],
    ['not yet issued', (f: ReturnType<typeof fixture>) => ({
      ...f, nowMs: f.permit.issuedAtMs - 1 },
    )],
    ['consumed permit', (f: ReturnType<typeof fixture>) => ({
      ...f, permit: { ...f.permit, status: 'CONSUMED', consumedAtMs: NOW - 10_000 } },
    )],
    ['revoked permit', (f: ReturnType<typeof fixture>) => ({
      ...f, permit: { ...f.permit, status: 'REVOKED' } },
    )],
    ['untrusted time', (f: ReturnType<typeof fixture>) => ({
      ...f, nowMs: Number.NaN },
    )],
  ])('fails closed on %s', (_label, change) => {
    const result = assessSajuHeldStagingAdmissionSignatureV2(change(fixture()));
    expect(result.contract).toBe('BLOCKED');
    expect(result.canRunOnce).toBe(false);
    expect(result.stagingAdmission).toBe('HOLD');
    expect(JSON.stringify(result)).not.toContain('SECRET_IMPOSTOR');
    expect(JSON.stringify(result)).not.toContain('rogue-login');
  });

  it.each([
    ['unexpected secret', (p: ReturnType<typeof fixture>['permit']) =>
      ({ ...p, serviceBearer: 'SECRET_BEARER' })],
    ['missing plan digest', (p: ReturnType<typeof fixture>['permit']) =>
      Object.fromEntries(Object.entries(p).filter(([key]) => key !== 'connectionPlanDigest'))],
    ['excessive TTL', (p: ReturnType<typeof fixture>['permit']) =>
      ({ ...p, expiresAtMs: p.issuedAtMs + 900_001 })],
    ['invalid uuid version', (p: ReturnType<typeof fixture>['permit']) =>
      ({ ...p, permitId: '123e4567-e89b-12d3-a456-426614174000' })],
    ['future consumption before issue', (p: ReturnType<typeof fixture>['permit']) =>
      ({ ...p, status: 'CONSUMED', consumedAtMs: p.issuedAtMs - 1 })],
    ['invalid issued state', (p: ReturnType<typeof fixture>['permit']) =>
      ({ ...p, consumedAtMs: NOW - 1 })],
    ['unknown status', (p: ReturnType<typeof fixture>['permit']) =>
      ({ ...p, status: 'AUTHORIZED' })],
  ])('strict parser rejects %s', (_label, mutate) => {
    expect(() => parseSajuHeldStagingAdmissionPermitV2(mutate(fixture().permit)))
      .toThrow('Invalid isolated staging V2 permit metadata.');
  });

  it('rejects accessors/prototypes/symbols without invoking malicious properties', () => {
    const f = fixture();
    const accessor = { ...f.permit };
    Object.defineProperty(accessor, 'connectionPlanDigest', {
      enumerable: true,
      get() { throw Error('SECRET_ACCESSOR'); },
    });
    expect(() => parseSajuHeldStagingAdmissionPermitV2(accessor)).toThrow(TypeError);
    expect(() => parseSajuHeldStagingAdmissionPermitV2(Object.create(f.permit))).toThrow(TypeError);
    expect(() => parseSajuHeldStagingAdmissionPermitV2({
      ...f.permit, [Symbol('secret')]: 'SECRET',
    })).toThrow(TypeError);
    expect(() => parseSajuHeldStagingAdmissionPermitV2(null)).toThrow(TypeError);
  });

  it('returns no signing capability, no token, no pool and no product authority', () => {
    const report = assessSajuHeldStagingAdmissionSignatureV2(fixture());
    expect(Object.keys(report)).not.toContain('sign');
    expect(Object.keys(report)).not.toContain('consumeAuthorizedAttemptOnce');
    expect(Object.keys(report)).not.toContain('approvalPublicKey');
    expect(Object.keys(report)).not.toContain('approvalSignature');
    expect(report.canExecute).toBe(false);
    expect(report.canPublish).toBe(false);
    expect(report.canSell).toBe(false);
  });
});
