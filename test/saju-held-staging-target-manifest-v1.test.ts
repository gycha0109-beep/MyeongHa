import { describe, expect, it } from 'vitest';
import {
  digestSajuHeldStagingTargetManifestV1,
  parseSajuHeldStagingTargetManifestV1,
  SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
} from '../apps/api/src/saju-held-staging-target-manifest-v1.js';

const REF = 'abcdefghijklmnopqrst';
const AUTH = 'https://' + REF + '.supabase.co';

function fixture() {
  return {
    version: SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
    environmentId: 'myeongha-staging-preview1',
    myeonghaCommitSha: 'a'.repeat(40),
    sajuCommitSha: 'b'.repeat(40),
    authProjectRef: REF,
    authOrigin: AUTH,
    subjectDbTargetId: 'staging-db:subject-login',
    nonceDbTargetId: 'staging-db:nonce-login',
    proofServiceOrigin: 'https://proof.staging.example.com',
    proofIssuer: 'saju-preview-service',
    proofAudience: 'myeongha-staging-api',
    proofKeyId: 'proof-key-v1',
    proofTtlMs: 60_000,
  };
}

describe('8C-2B-2A-01 non-secret staging target manifest', () => {
  it('copies validated fields and produces stable order-independent digest', () => {
    const candidate = fixture();
    const manifest = parseSajuHeldStagingTargetManifestV1(candidate);
    expect(manifest).toEqual(candidate);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(manifest).not.toBe(candidate);
    const hash = digestSajuHeldStagingTargetManifestV1(candidate);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(digestSajuHeldStagingTargetManifestV1(
      Object.fromEntries(Object.entries(candidate).reverse()),
    ));
    candidate.proofKeyId = 'mutated-key';
    expect(manifest.proofKeyId).toBe('proof-key-v1');
    expect(digestSajuHeldStagingTargetManifestV1(candidate)).not.toBe(hash);
  });

  it('rejects unknown sensitive fields', () => {
    for (const extra of [
      { serviceBearer: 'SECRET_BEARER' }, { keyBytes: 'SECRET_SIGNER' },
      { databaseUrl: 'postgresql://secret' }, { subjectId: 'secret' },
      { birth: { date: 'SECRET_BIRTH' } }, { canSell: true },
    ]) {
      expect(() => parseSajuHeldStagingTargetManifestV1({
        ...fixture(), ...extra,
      })).toThrow('Invalid isolated staging target manifest.');
    }
  });

  it('rejects accessors, prototypes, symbols, arrays and null', () => {
    const inherited = Object.create(fixture()) as Record<string, unknown>;
    expect(() => parseSajuHeldStagingTargetManifestV1(inherited)).toThrow(TypeError);
    const accessor = { ...fixture() };
    Object.defineProperty(accessor, 'proofKeyId', {
      configurable: true, enumerable: true,
      get() { throw Error('SECRET_SHOULD_NOT_BE_READ'); },
    });
    expect(() => parseSajuHeldStagingTargetManifestV1(accessor)).toThrow(
      'Invalid isolated staging target manifest.',
    );
    const symbol = Object.assign(fixture(), { [Symbol('secret')]: 'secret' });
    expect(() => parseSajuHeldStagingTargetManifestV1(symbol)).toThrow(TypeError);
    expect(() => parseSajuHeldStagingTargetManifestV1([])).toThrow(TypeError);
    expect(() => parseSajuHeldStagingTargetManifestV1(null)).toThrow(TypeError);
  });

  it.each([
    ['production project', { authProjectRef: 'cnsfpcdiyofqvhpcegfc',
      authOrigin: 'https://cnsfpcdiyofqvhpcegfc.supabase.co' }],
    ['unmatched Auth origin', { authOrigin: 'https://otherproject.supabase.co' }],
    ['Auth HTTP', { authOrigin: 'http://' + REF + '.supabase.co' }],
    ['Auth userinfo', { authOrigin: 'https://root:secret@' + REF + '.supabase.co' }],
    ['Auth custom port', { authOrigin: 'https://' + REF + '.supabase.co:8443' }],
    ['Auth path', { authOrigin: AUTH + '/auth/v1/user' }],
    ['Auth query', { authOrigin: AUTH + '?secret=a' }],
    ['Auth fragment', { authOrigin: AUTH + '#secret' }],
    ['missing SHA', { sajuCommitSha: '' }],
    ['abbreviated SHA', { myeonghaCommitSha: 'abc123' }],
    ['capitalized SHA', { sajuCommitSha: 'B'.repeat(40) }],
    ['invalid environment', { environmentId: 'production' }],
    ['same DB login target', { nonceDbTargetId: 'staging-db:subject-login' }],
    ['proof HTTP', { proofServiceOrigin: 'http://proof.staging.example.com' }],
    ['proof localhost', { proofServiceOrigin: 'https://localhost' }],
    ['proof IP', { proofServiceOrigin: 'https://127.0.0.1' }],
    ['proof local domain', { proofServiceOrigin: 'https://proof.local' }],
    ['proof userinfo', { proofServiceOrigin: 'https://a:b@proof.staging.example.com' }],
    ['proof path', { proofServiceOrigin: 'https://proof.staging.example.com/extra' }],
    ['proof equals Auth', { proofServiceOrigin: AUTH }],
    ['zero TTL', { proofTtlMs: 0 }],
    ['overlong TTL', { proofTtlMs: 120_001 }],
    ['fractional TTL', { proofTtlMs: 100.5 }],
    ['text TTL', { proofTtlMs: '60000' }],
    ['invalid key ID', { proofKeyId: 'key with spaces' }],
  ])('blocks %s', (_name, changed) => {
    expect(() => parseSajuHeldStagingTargetManifestV1({
      ...fixture(), ...changed,
    })).toThrow('Invalid isolated staging target manifest.');
  });

  it('rejects incomplete and prototype-pollution fields', () => {
    const { proofIssuer: _omitted, ...partial } = fixture();
    expect(() => parseSajuHeldStagingTargetManifestV1(partial)).toThrow(TypeError);
    const unsafe: unknown = JSON.parse(JSON.stringify(fixture()).replace(
      '"version":', '"__proto__":{"canSell":true},"version":',
    ));
    expect(() => parseSajuHeldStagingTargetManifestV1(unsafe)).toThrow(TypeError);
  });

  it('changes digest when binding fields change', () => {
    const baseline = fixture();
    const original = digestSajuHeldStagingTargetManifestV1(baseline);
    for (const [field, value] of [
      ['environmentId', 'myeongha-staging-preview2'],
      ['sajuCommitSha', 'c'.repeat(40)],
      ['nonceDbTargetId', 'staging-db:nonce-login2'],
      ['proofKeyId', 'proof-key-v2'],
      ['proofTtlMs', 30_000],
    ] as const) {
      expect(digestSajuHeldStagingTargetManifestV1({ ...baseline, [field]: value }))
        .not.toEqual(original);
    }
    expect(original).not.toContain(REF);
  });
});
