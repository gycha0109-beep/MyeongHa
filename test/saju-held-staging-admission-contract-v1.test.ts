import { describe, expect, it } from 'vitest';
import {
  assessSajuHeldStagingAdmissionContractV1,
  parseSajuHeldStagingAdmissionPermitV1,
  SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1,
} from '../apps/api/src/saju-held-staging-admission-contract-v1.js';
import {
  digestSajuHeldStagingTargetManifestV1,
  SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
} from '../apps/api/src/saju-held-staging-target-manifest-v1.js';

const TIME = 1_800_000_000_000;
const ACTOR = 'stage-operator-001';
const REF = 'abcdefghijklmnopqrst';

function fixture() {
  const manifest = {
    version: SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
    environmentId: 'myeongha-staging-test',
    myeonghaCommitSha: 'a'.repeat(40),
    sajuCommitSha: 'b'.repeat(40),
    authProjectRef: REF,
    authOrigin: 'https://' + REF + '.supabase.co',
    subjectDbTargetId: 'staging-subject:login',
    nonceDbTargetId: 'staging-nonce:login',
    proofServiceOrigin: 'https://proof.staging.example.com',
    proofIssuer: 'saju-preview-service',
    proofAudience: 'myeongha-staging-api',
    proofKeyId: 'proof-key-v1',
    proofTtlMs: 60_000,
  };
  const permit = {
    version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1,
    permitId: '123e4567-e89b-42d3-a456-426614174000',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    approvedOperatorId: ACTOR,
    issuedAtMs: TIME - 60_000,
    expiresAtMs: TIME + 120_000,
    consumedAtMs: null as number | null,
    status: 'ISSUED' as 'ISSUED' | 'CONSUMED' | 'REVOKED',
    approvalSignatureKeyId: 'operator-key-id-v1',
  };
  return { manifest, permit, expectedOperatorId: ACTOR, nowMs: TIME };
}

describe('8C-2B-2A-03 one-shot admission metadata contract (synthetic only)', () => {
  it('is a pure zero-authority shape/binding check; cannot issue or consume permit', () => {
    const f = fixture();
    const report = assessSajuHeldStagingAdmissionContractV1(f);
    expect(report).toEqual({
      version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1,
      contract: 'MATCHED_UNVERIFIED',
      checks: {
        permit_shape: 'PASS',
        target_binding: 'PASS',
        operator_binding: 'PASS',
        unconsumed_and_unexpired: 'PASS',
      },
      signatureVerification: 'NOT_VERIFIED',
      atomicConsumption: 'NOT_VERIFIED',
      stagingConnection: 'NOT_VERIFIED',
      stagingAdmission: 'HOLD',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canRunOnce: false, canExecute: false, canPublish: false, canSell: false,
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.checks)).toBe(true);
    expect(f.permit.status).toBe('ISSUED');
    expect(f.permit.consumedAtMs).toBe(null);
    expect(JSON.stringify(report)).not.toContain(f.permit.permitId);
    expect(JSON.stringify(report)).not.toContain(ACTOR);
    expect(JSON.stringify(report)).not.toContain(f.permit.manifestDigest);
  });

  it.each([
    ['wrong digest', { manifestDigest: 'f'.repeat(64) }],
    ['wrong environment', { environmentId: 'myeongha-staging-other' }],
    ['MyeongHa SHA drift', { myeonghaCommitSha: 'c'.repeat(40) }],
    ['Saju SHA drift', { sajuCommitSha: 'c'.repeat(40) }],
  ])('blocks target mismatch: %s', (_label, change) => {
    const f = fixture();
    expect(assessSajuHeldStagingAdmissionContractV1({
      ...f, permit: { ...f.permit, ...change },
    }).checks.target_binding).toBe('BLOCKED');
  });

  it('blocks operator mismatch, even when other fields align', () => {
    const f = fixture();
    const report = assessSajuHeldStagingAdmissionContractV1({
      ...f, expectedOperatorId: 'another-operator',
    });
    expect(report.contract).toBe('BLOCKED');
    expect(report.checks.operator_binding).toBe('BLOCKED');
    expect(report.canRunOnce).toBe(false);
  });

  it.each([
    ['expired', TIME + 120_000],
    ['before issue', TIME - 60_001],
    ['invalid injected clock', Number.NaN],
  ])('blocks invalid time: %s', (_label, nowMs) => {
    const f = fixture();
    expect(assessSajuHeldStagingAdmissionContractV1({
      ...f, nowMs,
    }).checks.unconsumed_and_unexpired).toBe('BLOCKED');
  });

  it.each([
    ['consumed', { status: 'CONSUMED', consumedAtMs: TIME - 10_000 }],
    ['revoked', { status: 'REVOKED', consumedAtMs: null }],
    ['status tampering', { status: 'AUTHORIZED' }],
    ['unexpected consumed-at', { consumedAtMs: TIME - 10_000 }],
    ['missing consumption timestamp', { status: 'CONSUMED' }],
    ['overlong permit', { expiresAtMs: TIME + 16 * 60_000 }],
    ['future issue', { issuedAtMs: TIME + 1 }],
  ])('blocks reuse/replay/status and invalid window: %s', (_label, change) => {
    const f = fixture();
    const report = assessSajuHeldStagingAdmissionContractV1({
      ...f, permit: { ...f.permit, ...change },
    });
    expect(report.contract).toBe('BLOCKED');
    expect(report.stagingAdmission).toBe('HOLD');
    expect(report.canRunOnce).toBe(false);
  });

  it.each([
    { serviceBearer: 'SECRET_BEARER' },
    { databaseUrl: 'postgresql://SECRET_DB' },
    { approved: true },
    { canSell: true },
    { signature: 'forged' },
  ])('rejects unknown fields and secret-bearing metadata: %#', extra => {
    const f = fixture();
    expect(() => parseSajuHeldStagingAdmissionPermitV1({
      ...f.permit, ...extra,
    })).toThrow('Invalid staging admission permit metadata.');
  });

  it('rejects accessors, symbols, non-plain objects, malformed signature key IDs', () => {
    const f = fixture();
    const withAccessor = { ...f.permit };
    Object.defineProperty(withAccessor, 'permitId', {
      enumerable: true, get() { throw new Error('SECRET_ERROR'); },
    });
    expect(() => parseSajuHeldStagingAdmissionPermitV1(withAccessor)).toThrow(
      'Invalid staging admission permit metadata.',
    );
    expect(() => parseSajuHeldStagingAdmissionPermitV1(
      Object.assign(f.permit, { [Symbol('token')]: 'secret' }),
    )).toThrow(TypeError);
    const inherited = Object.create(f.permit) as unknown;
    expect(() => parseSajuHeldStagingAdmissionPermitV1(inherited)).toThrow(TypeError);
    expect(() => parseSajuHeldStagingAdmissionPermitV1({
      ...fixture().permit, approvalSignatureKeyId: 'bad key with spaces',
    })).toThrow(TypeError);
  });

  it('cannot be tricked by a caller-supplied manifest or explicit approval boolean', () => {
    const f = fixture();
    const permit = { ...f.permit, manifestDigest: '1'.repeat(64) };
    const result = assessSajuHeldStagingAdmissionContractV1({
      ...f, permit: { ...permit, approved: true },
    });
    expect(result.contract).toBe('BLOCKED');
    expect(result.signatureVerification).toBe('NOT_VERIFIED');
    expect(result.atomicConsumption).toBe('NOT_VERIFIED');
  });
});
