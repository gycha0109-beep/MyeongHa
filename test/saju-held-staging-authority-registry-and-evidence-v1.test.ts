import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  parseSajuHeldStagingAuthorityRegistryV1,
  canonicalSajuHeldStagingAuthorityRegistryBytesV1,
  verifySajuHeldStagingAuthorityRegistryV1,
  findSajuHeldStagingRegistryKeyV1,
} from '../apps/api/src/saju-held-staging-authority-registry-v1.js';
import {
  parseSajuHeldStagingTargetEvidenceV1,
  canonicalSajuHeldStagingTargetEvidenceBytesV1,
  digestSajuHeldStagingObservationsV1,
} from '../apps/api/src/saju-held-staging-target-evidence-v1.js';
import { stagingTrustFixture, TRUST_TIME } from './helpers/saju-staging-trust-fixture.js';

describe('8C-2B-2D-3-03 registry and evidence contracts: zero I/O', () => {
  it('accepts a canonical Ed25519-signed registry, but never claims pinned trust-root authority', () => {
    const f = stagingTrustFixture();
    const parsed = parseSajuHeldStagingAuthorityRegistryV1(f.registry);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.keys)).toBe(true);
    expect(Object.isFrozen(parsed.keys[0])).toBe(true);
    expect(canonicalSajuHeldStagingAuthorityRegistryBytesV1(f.registry)).toEqual(
      canonicalSajuHeldStagingAuthorityRegistryBytesV1({
        ...Object.fromEntries(Object.entries(f.registry).reverse()),
        keys:f.registry.keys.map(k=>Object.fromEntries(Object.entries(k).reverse())),
      }),
    );
    const report = verifySajuHeldStagingAuthorityRegistryV1({
      registry:f.registry, detachedSignature:f.registrySignature,
      suppliedRootPublicKey:f.rootPublicKey, expectedRootKeyId:f.expectedRootKeyId,
      minimumRevision:f.minimumRevision, nowMs:f.nowMs,
    });
    expect(report.signature).toBe('VALID_FOR_SUPPLIED_ROOT');
    expect(report.sourceAuthority).toBe('NOT_VERIFIED');
    expect(findSajuHeldStagingRegistryKeyV1(report,'operator-key-v1',
      'OPERATOR_APPROVAL',f.manifest.environmentId,TRUST_TIME)?.principalId)
      .toBe('operator-1');
    expect(findSajuHeldStagingRegistryKeyV1(report,'attestor-key-v1',
      'OPERATOR_APPROVAL',f.manifest.environmentId,TRUST_TIME)).toBeNull();
  });

  it.each([
    ['wrong root', (f: ReturnType<typeof stagingTrustFixture>) => ({
      suppliedRootPublicKey:generateKeyPairSync('ed25519').publicKey })],
    ['wrong root ID', () => ({expectedRootKeyId:'attacker-root'})],
    ['rollback', () => ({minimumRevision:11})],
    ['policy expired', () => ({nowMs:TRUST_TIME+3600000})],
    ['wrong Ed25519 signature', (f:ReturnType<typeof stagingTrustFixture>) => ({
      detachedSignature:sign(null,Buffer.from('not policy'),f.rootPrivateKey).toString('base64url')})],
    ['attestation key replacing root', (f:ReturnType<typeof stagingTrustFixture>) => ({
      suppliedRootPublicKey:generateKeyPairSync('ed25519').publicKey})],
  ])('blocks registry %s',(_label, changed)=>{
    const f = stagingTrustFixture();
    const r = verifySajuHeldStagingAuthorityRegistryV1({
      registry:f.registry,detachedSignature:f.registrySignature,
      suppliedRootPublicKey:f.rootPublicKey,expectedRootKeyId:f.expectedRootKeyId,
      minimumRevision:f.minimumRevision,nowMs:TRUST_TIME,...changed(f),
    });
    expect(r.signature).toBe('BLOCKED');
    expect(r.registry).toBeNull();
    expect(r.sourceAuthority).toBe('NOT_VERIFIED');
  });

  it('rejects untrusted keys, swapped principal, duplicate key, secrets and malicious getters', () => {
    const f = stagingTrustFixture();
    const mutate = [
      {...f.registry,keys:[...f.registry.keys].reverse()},
      {...f.registry,keys:[f.registry.keys[0],f.registry.keys[0]]},
      {...f.registry,keys:[...f.registry.keys,
        {...f.registry.keys[1],keyId:'z-extra',purpose:'OPERATOR_APPROVAL'}]},
      {...f.registry,keys:[f.registry.keys[0],
        {...f.registry.keys[1],publicKeySpkiBase64url:'private-key'}]},
      {...f.registry,secret:'SECRET_ROOT_KEY'},
    ];
    for(const value of mutate){
      expect(()=>parseSajuHeldStagingAuthorityRegistryV1(value)).toThrow(TypeError);
    }
    const malicious={...f.registry};
    Object.defineProperty(malicious,'keys',{enumerable:true,get(){throw Error('SECRET_GETTER');}});
    expect(()=>parseSajuHeldStagingAuthorityRegistryV1(malicious))
      .toThrow('Invalid isolated staging authority registry V1.');
    expect(()=>parseSajuHeldStagingAuthorityRegistryV1(Object.create(f.registry)))
      .toThrow(TypeError);
  });

  it('rejects revoked/stale operator key even if signed policy remains valid', () => {
    const f = stagingTrustFixture();
    const revoked = {...f.registry,keys:f.registry.keys.map(k=>
      k.keyId==='operator-key-v1' ? {...k,revokedAtMs:TRUST_TIME-100} : k)};
    const registrySignature=sign(null,
      canonicalSajuHeldStagingAuthorityRegistryBytesV1(revoked),
      f.rootPrivateKey).toString('base64url');
    const r=verifySajuHeldStagingAuthorityRegistryV1({
      registry:revoked,detachedSignature:registrySignature,
      suppliedRootPublicKey:f.rootPublicKey,expectedRootKeyId:f.expectedRootKeyId,
      minimumRevision:10,nowMs:TRUST_TIME,
    });
    expect(r.signature).toBe('VALID_FOR_SUPPLIED_ROOT');
    expect(findSajuHeldStagingRegistryKeyV1(r,'operator-key-v1',
      'OPERATOR_APPROVAL',f.manifest.environmentId,TRUST_TIME)).toBeNull();
  });

  it('accepts canonical evidence and freezes/normalizes nested observations without network', () => {
    const f=stagingTrustFixture();
    const e=parseSajuHeldStagingTargetEvidenceV1(f.evidence);
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.observations)).toBe(true);
    expect(Object.isFrozen(e.observations.subjectDb)).toBe(true);
    expect(e.observationsDigest).toBe(digestSajuHeldStagingObservationsV1(f.evidence.observations));
    expect(canonicalSajuHeldStagingTargetEvidenceBytesV1(e))
      .toEqual(canonicalSajuHeldStagingTargetEvidenceBytesV1(f.evidence));
    expect(JSON.stringify(e)).not.toContain('SECRET_');
  });

  it('refuses evidence with altered digest, missing checks, secret fields or environment drift', () => {
    const f=stagingTrustFixture(),o=f.evidence.observations;
    for(const e of [
      {...f.evidence,observationsDigest:'f'.repeat(64)},
      {...f.evidence,connectionPlanDigest:'SECRET'},
      {...f.evidence,privateKey:'SECRET_PRIVATE'},
      {...f.evidence,expiresAtMs:f.evidence.observedAtMs+60001},
      {...f.evidence,observations:{...o,
        nonceDb:{...o.nonceDb,tlsPeerVerified:false}}},
      {...f.evidence,observations:{...o,
        proof:{...o.proof,bearerIsolatedObserved:false}}},
      {...f.evidence,observations:{...o,
        subjectDb:{...o.subjectDb,credential:'SECRET_PASSWORD'}}},
    ]) expect(()=>parseSajuHeldStagingTargetEvidenceV1(e)).toThrow(TypeError);
  });
});
