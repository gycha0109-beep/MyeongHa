import { describe, expect, it } from 'vitest';
import {
  assessSajuHeldStagingReadinessV1,
  SAJU_HELD_STAGING_EVIDENCE_GATES_V1,
} from '../apps/api/src/saju-held-staging-readiness-v1.js';
import {
  digestSajuHeldStagingTargetManifestV1,
  SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
} from '../apps/api/src/saju-held-staging-target-manifest-v1.js';

const REF = 'abcdefghijklmnopqrst';
const NOW = 1_800_000_000_000;

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
  const configInput = {
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
  const evidence = SAJU_HELD_STAGING_EVIDENCE_GATES_V1.map(gate => ({
    gate,
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    authorityId: 'unverified-reporter',
    observedAtMs: NOW - 30_000,
    expiresAtMs: NOW + 120_000,
    result: 'REPORTED_PASS' as 'REPORTED_PASS' | 'REPORTED_BLOCKED',
  }));
  return { configInput, evidence, nowMs: NOW };
}

describe('8C-2B-2A-04 evidence coverage, never live authority', () => {
  it('reports missing operational evidence without any IO or activation', () => {
    const f = fixture();
    const result = assessSajuHeldStagingReadinessV1({
      ...f, evidence: undefined,
    });
    expect(result.configuration).toBe('VALID');
    expect(result.evidenceCoverage).toBe('INCOMPLETE');
    expect(result.operationalEvidence).toBe('NOT_VERIFIED');
    expect(Object.values(result.checks)).toEqual(Array(8).fill('MISSING'));
    expect(result.stagingConnection).toBe('NOT_VERIFIED');
    expect(result.stagingAdmission).toBe('HOLD');
    expect(result.canRunOnce).toBe(false);
    expect(result.canExecute).toBe(false);
    expect(result.canPublish).toBe(false);
    expect(result.canSell).toBe(false);
  });

  it('never promotes a complete self-reported PASS list to real verification', () => {
    const f = fixture();
    const result = assessSajuHeldStagingReadinessV1(f);
    expect(result).toMatchObject({
      version: 'myeongha-saju-staging-readiness-v1',
      configuration: 'VALID',
      evidenceCoverage: 'COMPLETE_UNTRUSTED',
      operationalEvidence: 'NOT_VERIFIED',
      stagingConnection: 'NOT_VERIFIED', stagingAdmission: 'HOLD',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canRunOnce: false, canExecute: false, canPublish: false, canSell: false,
    });
    expect(Object.values(result.checks)).toEqual(Array(8).fill('REPORTED_ONLY'));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checks)).toBe(true);
    const output = JSON.stringify(result);
    expect(output).not.toContain(f.configInput.manifest.authOrigin);
    expect(output).not.toContain(f.evidence[0]!.manifestDigest);
    expect(output).not.toContain('unverified-reporter');
    expect(output).not.toContain(f.configInput.manifest.environmentId);
  });

  it('reports incomplete set as unverified, including partial and empty arrays', () => {
    const f = fixture();
    for (const evidence of [[], f.evidence.slice(0, 3)]) {
      const result = assessSajuHeldStagingReadinessV1({ ...f, evidence });
      expect(result.configuration).toBe('VALID');
      expect(result.evidenceCoverage).toBe('INCOMPLETE');
      expect(result.operationalEvidence).toBe('NOT_VERIFIED');
    }
  });

  it.each([
    ['duplicate gate', (f: ReturnType<typeof fixture>) =>
      [...f.evidence.slice(0, 7), f.evidence[0]]],
    ['expired record', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, expiresAtMs: NOW } : e)],
    ['future observed record', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, observedAtMs: NOW + 1 } : e)],
    ['wrong manifest digest', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, manifestDigest: 'f'.repeat(64) } : e)],
    ['wrong deployment SHA', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, sajuCommitSha: 'c'.repeat(40) } : e)],
    ['operator denied', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, result: 'REPORTED_BLOCKED' } : e)],
    ['unknown gate', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, gate: 'commerce_can_sell' } : e)],
    ['extra secret field', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, serviceBearer: 'SECRET_BEARER' } : e)],
    ['extra permission', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0 ? { ...e, canExecute: true } : e)],
    ['excessive validity', (f: ReturnType<typeof fixture>) =>
      f.evidence.map((e, i) => i === 0
        ? { ...e, expiresAtMs: NOW + 2 * 24 * 3600_000 } : e)],
  ])('fails closed on %s', (_label, mutate) => {
    const f = fixture();
    const result = assessSajuHeldStagingReadinessV1({ ...f, evidence: mutate(f) });
    expect(result.evidenceCoverage).toBe('BLOCKED');
    expect(result.operationalEvidence).toBe('BLOCKED');
    expect(result.canRunOnce).toBe(false);
    expect(result.canSell).toBe(false);
    expect(JSON.stringify(result)).not.toContain('SECRET_BEARER');
  });

  it('blocks forged config success claim instead of trusting an output object', () => {
    const f = fixture();
    const forged: unknown = {
      configuration: 'VALID', stagingAdmission: 'ALLOWED', canSell: true,
    };
    const result = assessSajuHeldStagingReadinessV1({
      configInput: forged as typeof f.configInput,
      evidence: f.evidence,
      nowMs: NOW,
    });
    expect(result.configuration).toBe('BLOCKED');
    expect(result.evidenceCoverage).toBe('BLOCKED');
    expect(result.stagingAdmission).toBe('HOLD');
  });

  it('blocks invalid time input and malformed evidence containers', () => {
    const f = fixture();
    for (const nowMs of [Number.NaN, -1, 'untrusted']) {
      const result = assessSajuHeldStagingReadinessV1({ ...f, nowMs });
      expect(result.operationalEvidence).toBe('BLOCKED');
    }
    for (const evidence of [{ ...f.evidence }, 'approved', [{ password: 'SECRET' }]]) {
      const result = assessSajuHeldStagingReadinessV1({ ...f, evidence });
      expect(result.evidenceCoverage).toBe('BLOCKED');
      expect(result.canExecute).toBe(false);
    }
  });

  it('blocks accessor injection without leaking thrown error or executing on claimed approval', () => {
    const f = fixture();
    const forged = { ...f.evidence[0] };
    Object.defineProperty(forged, 'result', {
      enumerable: true, get() { throw new Error('SECRET_ACCESSOR'); },
    });
    const result = assessSajuHeldStagingReadinessV1({
      ...f, evidence: [forged, ...f.evidence.slice(1)],
    });
    expect(result.operationalEvidence).toBe('BLOCKED');
    expect(JSON.stringify(result)).not.toContain('SECRET_ACCESSOR');
  });
});
