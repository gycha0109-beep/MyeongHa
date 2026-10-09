import { describe, expect, it } from 'vitest';
import {
  assessSajuHeldStagingTargetConfigV1,
} from '../apps/api/src/saju-held-staging-target-validator-v1.js';
import {
  SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
} from '../apps/api/src/saju-held-staging-target-manifest-v1.js';

const REF = 'abcdefghijklmnopqrst';

function fixture() {
  const manifest = {
    version: SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
    environmentId: 'myeongha-staging-smoke1',
    myeonghaCommitSha: 'a'.repeat(40),
    sajuCommitSha: 'b'.repeat(40),
    authProjectRef: REF,
    authOrigin: 'https://' + REF + '.supabase.co',
    subjectDbTargetId: 'stage-subject:login-a',
    nonceDbTargetId: 'stage-nonce:login-b',
    proofServiceOrigin: 'https://proof.stage.example.com',
    proofIssuer: 'saju-preview-service',
    proofAudience: 'myeongha-preview-api',
    proofKeyId: 'proof-v1',
    proofTtlMs: 60_000,
  };
  return {
    manifest,
    approvedNonSecretTarget: { ...manifest },
    productionCalculationOrigin: 'https://calculation.prod.example.com',
    preflightDescriptor: {
      httpPath: '/api/internal/preview/source-readings',
      envelopeVersion: 'myeonghwa-source-reading-proof-http-v1',
      proofVersion: 'myeonghwa-source-reading-transport-proof-v1',
      issuer: manifest.proofIssuer,
      audience: manifest.proofAudience,
      keyId: manifest.proofKeyId,
      ttlMs: manifest.proofTtlMs,
    },
  };
}

describe('8C-2B-2A-01 staging target static config validator', () => {
  it('validates reviewed contract with zero IO, while preserving every HOLD invariant', () => {
    const f = fixture();
    const output = assessSajuHeldStagingTargetConfigV1(f);
    expect(output).toEqual({
      version: 'myeongha-saju-staging-target-config-v1',
      configuration: 'VALID',
      checks: {
        manifest_contract: 'PASS',
        independently_reviewed_target_binding: 'PASS',
        source_wire_binding: 'PASS',
        production_calculation_origin_separation: 'PASS',
      },
      stagingConnection: 'NOT_VERIFIED',
      stagingAdmission: 'HOLD',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.checks)).toBe(true);
    expect(JSON.stringify(output)).not.toContain(f.manifest.authOrigin);
    expect(JSON.stringify(output)).not.toContain(f.manifest.environmentId);
    expect(JSON.stringify(output)).not.toContain(f.manifest.proofKeyId);
  });

  it.each([
    ['unreviewed project', { authProjectRef: 'zyxwvutsrqponmlkjihg',
      authOrigin: 'https://zyxwvutsrqponmlkjihg.supabase.co' }],
    ['MyeongHa SHA drift', { myeonghaCommitSha: 'c'.repeat(40) }],
    ['Saju SHA drift', { sajuCommitSha: 'c'.repeat(40) }],
    ['DB target drift', { nonceDbTargetId: 'another-nonce:login' }],
    ['proof origin drift', { proofServiceOrigin: 'https://other.stage.example.com' }],
    ['issuer drift', { proofIssuer: 'other-issuer' }],
    ['keyId drift', { proofKeyId: 'proof-v2' }],
    ['TTL drift', { proofTtlMs: 30_000 }],
  ])('blocks independently reviewed target drift: %s', (_name, changed) => {
    const f = fixture();
    const outcome = assessSajuHeldStagingTargetConfigV1({
      ...f, manifest: { ...f.manifest, ...changed },
    });
    expect(outcome.configuration).toBe('BLOCKED');
    expect(outcome.checks.independently_reviewed_target_binding).toBe('BLOCKED');
    expect(outcome.stagingAdmission).toBe('HOLD');
    expect(outcome.canExecute).toBe(false);
  });

  it.each([
    ['bad issuer', { issuer: 'other-issuer' }],
    ['bad audience', { audience: 'other-audience' }],
    ['bad key', { keyId: 'proof-key-v2' }],
    ['bad ttl', { ttlMs: 120_000 }],
    ['bad path', { httpPath: '/api/readings' }],
    ['bad envelope', { envelopeVersion: 'v2' }],
    ['bad proof version', { proofVersion: 'v2' }],
    ['extra grant', { canSell: true }],
  ])('blocks source wire drift: %s', (_name, change) => {
    const f = fixture();
    const report = assessSajuHeldStagingTargetConfigV1({
      ...f, preflightDescriptor: { ...f.preflightDescriptor, ...change },
    });
    expect(report.checks.source_wire_binding).toBe('BLOCKED');
    expect(report.configuration).toBe('BLOCKED');
  });

  it('blocks accessor and symbol injection in reviewed source descriptor', () => {
    const f = fixture();
    const wired = { ...f.preflightDescriptor };
    Object.defineProperty(wired, 'issuer', {
      enumerable: true, get() { throw Error('SECRET_ACCESSOR'); },
    });
    expect(assessSajuHeldStagingTargetConfigV1({
      ...f, preflightDescriptor: wired,
    }).configuration).toBe('BLOCKED');
    const symbol = Object.assign({ ...f.preflightDescriptor }, { [Symbol('x')]: 1 });
    expect(assessSajuHeldStagingTargetConfigV1({
      ...f, preflightDescriptor: symbol,
    }).configuration).toBe('BLOCKED');
  });

  it('blocks ordinary calculation service reuse and invalid production Origin', () => {
    const f = fixture();
    expect(assessSajuHeldStagingTargetConfigV1({
      ...f, productionCalculationOrigin: f.manifest.proofServiceOrigin,
    }).checks.production_calculation_origin_separation).toBe('BLOCKED');
    expect(assessSajuHeldStagingTargetConfigV1({
      ...f, productionCalculationOrigin: f.manifest.authOrigin,
    }).configuration).toBe('BLOCKED');
    expect(assessSajuHeldStagingTargetConfigV1({
      ...f, productionCalculationOrigin: 'http://insecure.example.com',
    }).configuration).toBe('BLOCKED');
    expect(assessSajuHeldStagingTargetConfigV1({
      ...f, productionCalculationOrigin: undefined,
    }).configuration).toBe('BLOCKED');
  });

  it('blocks unknown fields and production Auth regardless of copied reviewed target', () => {
    const f = fixture();
    const unsafe = {
      ...f.manifest, authProjectRef: 'cnsfpcdiyofqvhpcegfc',
      authOrigin: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
      serviceBearer: 'SECRET_BEARER',
    };
    const report = assessSajuHeldStagingTargetConfigV1({
      ...f, manifest: unsafe, approvedNonSecretTarget: unsafe,
    });
    expect(report.configuration).toBe('BLOCKED');
    expect(report.checks.manifest_contract).toBe('BLOCKED');
    expect(JSON.stringify(report)).not.toContain('SECRET_BEARER');
  });

  it('does not turn a copied review object into operator permission', () => {
    const f = fixture();
    const report = assessSajuHeldStagingTargetConfigV1({
      ...f, approvedNonSecretTarget: f.manifest,
    });
    expect(report.configuration).toBe('VALID');
    expect(report.stagingConnection).toBe('NOT_VERIFIED');
    expect(report.stagingAdmission).toBe('HOLD');
    expect(report.canSell).toBe(false);
  });
});
