import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assessSajuHeldStagingTargetTrustV1 } from
  '../apps/api/src/saju-held-staging-target-trust-v1.js';
import { canonicalSajuHeldStagingAuthorityRegistryBytesV1 } from
  '../apps/api/src/saju-held-staging-authority-registry-v1.js';
import { canonicalSajuHeldStagingTargetEvidenceBytesV1,
  digestSajuHeldStagingObservationsV1 } from
  '../apps/api/src/saju-held-staging-target-evidence-v1.js';
import { stagingTrustFixture, TRUST_TIME } from './helpers/saju-staging-trust-fixture.js';

function verifyInput(f=stagingTrustFixture()) {
  return {
    manifest:f.manifest,reviewedManifest:structuredClone(f.manifest),
    connectionPlan:f.plan,reviewedConnectionPlan:structuredClone(f.plan),
    permit:f.permit,permitSignature:f.permitSignature,registry:f.registry,
    registrySignature:f.registrySignature,suppliedRootPublicKey:f.rootPublicKey,
    expectedRootKeyId:f.expectedRootKeyId,minimumRegistryRevision:f.minimumRevision,
    evidence:f.evidence,evidenceSignature:f.evidenceSignature,
    expectedChallengeDigest:f.expectedChallengeDigest,nowMs:f.nowMs,
  };
}
function resignRegistry(f:ReturnType<typeof stagingTrustFixture>,registry:unknown) {
  return sign(null,canonicalSajuHeldStagingAuthorityRegistryBytesV1(registry),
    f.rootPrivateKey).toString('base64url');
}
function resignEvidence(f:ReturnType<typeof stagingTrustFixture>,evidence:unknown) {
  return sign(null,canonicalSajuHeldStagingTargetEvidenceBytesV1(evidence),
    f.attestorPrivateKey).toString('base64url');
}

describe('8C-2B-2D-3-03 Target Trust Authority evaluator: zero I/O', () => {
  it('authenticates TWO different signed claims while withholding root/operational authority', () => {
    const result=assessSajuHeldStagingTargetTrustV1(verifyInput());
    expect(result.contract).toBe('SIGNED_ASSERTIONS_UNANCHORED');
    expect(Object.values(result.checks)).toEqual(Array(8).fill('PASS'));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checks)).toBe(true);
    expect(result).toMatchObject({
      rootAuthority:'NOT_VERIFIED',signerAuthority:'NOT_VERIFIED',
      operationalEvidence:'NOT_VERIFIED',stagingConnection:'NOT_VERIFIED',
      stagingAdmission:'HOLD',sourceAuthority:'NOT_EVALUATED',
      releaseAuthorization:'NOT_EVALUATED',
      canRunOnce:false,canExecute:false,canPublish:false,canSell:false,
    });
    expect(JSON.stringify(result)).not.toContain('abcdefghijklmnopqrst');
    expect(JSON.stringify(result)).not.toContain('operator-key-v1');
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it.each([
    ['root replacement',(v:ReturnType<typeof verifyInput>)=>({
      ...v,suppliedRootPublicKey:generateKeyPairSync('ed25519').publicKey})],
    ['root ID drift',(v:ReturnType<typeof verifyInput>)=>({...v,expectedRootKeyId:'bad-root'})],
    ['registry rollback',(v:ReturnType<typeof verifyInput>)=>({...v,minimumRegistryRevision:11})],
    ['registry expired',(v:ReturnType<typeof verifyInput>)=>({...v,nowMs:TRUST_TIME+4000000})],
    ['wrong challenge',(v:ReturnType<typeof verifyInput>)=>({
      ...v,expectedChallengeDigest:'f'.repeat(64)})],
    ['evidence expired',(v:ReturnType<typeof verifyInput>)=>({
      ...v,nowMs:TRUST_TIME+25000})],
    ['target SHA drift',(v:ReturnType<typeof verifyInput>)=>({
      ...v,manifest:{...v.manifest,sajuCommitSha:'c'.repeat(40)}})],
    ['plan login role drift',(v:ReturnType<typeof verifyInput>)=>({
      ...v,connectionPlan:{...v.connectionPlan,
        admissionDb:{...v.connectionPlan.admissionDb,loginRole:'rogue_login'}}})],
    ['reviewed plan changed',(v:ReturnType<typeof verifyInput>)=>({
      ...v,reviewedConnectionPlan:{...v.reviewedConnectionPlan,
        nonceDb:{...v.reviewedConnectionPlan.nonceDb,targetId:'wrong-nonce'}}})],
    ['operator forged signature',(v:ReturnType<typeof verifyInput>)=>({
      ...v,permitSignature:sign(null,Buffer.from('forged'),generateKeyPairSync('ed25519').privateKey)
        .toString('base64url')})],
    ['attestor forged signature',(v:ReturnType<typeof verifyInput>)=>({
      ...v,evidenceSignature:sign(null,Buffer.from('forged'),generateKeyPairSync('ed25519').privateKey)
        .toString('base64url')})],
    ['self-reported production Auth',(v:ReturnType<typeof verifyInput>)=>({
      ...v,evidence:{...v.evidence,observations:{...v.evidence.observations,
        auth:{...v.evidence.observations.auth,origin:'https://prod.example.com'}}}})],
    ['missing required observation',(v:ReturnType<typeof verifyInput>)=>({
      ...v,evidence:{...v.evidence,observations:{...v.evidence.observations,
        proof:{...v.evidence.observations.proof,httpsPeerVerified:false}}}})],
  ])('fails closed for %s',(_label,mutate)=>{
    const result=assessSajuHeldStagingTargetTrustV1(mutate(verifyInput()));
    expect(result.contract).toBe('BLOCKED');
    expect(result.canRunOnce).toBe(false);
    expect(result.rootAuthority).toBe('NOT_VERIFIED');
    expect(result.operationalEvidence).toBe('NOT_VERIFIED');
  });

  it('rejects even AUTHENTIC attestor-signed observations of wrong DB/cluster',()=>{
    const f=stagingTrustFixture();
    const wrongObs={...f.evidence.observations,
      nonceDb:{...f.evidence.observations.nonceDb,
        clusterIdentityDigest:f.evidence.observations.subjectDb.clusterIdentityDigest}};
    const evidence={...f.evidence,observations:wrongObs,
      observationsDigest:digestSajuHeldStagingObservationsV1(wrongObs)};
    const report=assessSajuHeldStagingTargetTrustV1({
      ...verifyInput(f),evidence,evidenceSignature:resignEvidence(f,evidence),
    });
    expect(report.checks.evidence_signature).toBe('PASS');
    expect(report.checks.attested_observation_claims).toBe('BLOCKED');
    expect(report.contract).toBe('BLOCKED');
  });

  it('detects a separately signed attestor statement whose TLS peer differs from plan',()=>{
    const f=stagingTrustFixture();
    const obs={...f.evidence.observations,
      admissionDb:{...f.evidence.observations.admissionDb,
        tlsHostname:'attacker.example.com'}};
    const evidence={...f.evidence,observations:obs,
      observationsDigest:digestSajuHeldStagingObservationsV1(obs)};
    const report=assessSajuHeldStagingTargetTrustV1({
      ...verifyInput(f),evidence,evidenceSignature:resignEvidence(f,evidence),
    });
    expect(report.checks.evidence_signature).toBe('PASS');
    expect(report.contract).toBe('BLOCKED');
  });

  it.each(['operator-key-v1','attestor-key-v1'])(
    'revoked key %s blocks even if the registry was signed by the root', keyId=>{
      const f=stagingTrustFixture();
      const registry={...f.registry,keys:f.registry.keys.map(k=>k.keyId===keyId
        ? {...k,revokedAtMs:TRUST_TIME-1000} : k)};
      const report=assessSajuHeldStagingTargetTrustV1({
        ...verifyInput(f),registry,registrySignature:resignRegistry(f,registry),
      });
      expect(report.checks.registry_signature).toBe('PASS');
      expect(report.contract).toBe('BLOCKED');
    },
  );

  it('purpose swap of operator and attestor cannot confer permit signing authority',()=>{
    const f=stagingTrustFixture();
    const keys=f.registry.keys.map(k=>({
      ...k,purpose:k.purpose==='OPERATOR_APPROVAL'
        ? 'TARGET_ATTESTATION' : 'OPERATOR_APPROVAL',
    }));
    const registry={...f.registry,keys};
    const report=assessSajuHeldStagingTargetTrustV1({
      ...verifyInput(f),registry,registrySignature:resignRegistry(f,registry),
    });
    expect(report.checks.registry_signature).toBe('PASS');
    expect(report.checks.operator_key_purpose_and_validity).toBe('BLOCKED');
    expect(report.contract).toBe('BLOCKED');
  });

  it('never turns a supplied public root and full signed claims into an executable authorization',()=>{
    const f=stagingTrustFixture();
    const report=assessSajuHeldStagingTargetTrustV1(verifyInput(f));
    expect(report.contract).toBe('SIGNED_ASSERTIONS_UNANCHORED');
    expect(report.rootAuthority).toBe('NOT_VERIFIED');
    expect(report.stagingAdmission).toBe('HOLD');
    expect(report.canRunOnce).toBe(false);
    expect(Object.keys(report)).not.toContain('targetAssertionPort');
    expect(Object.keys(report)).not.toContain('consumeAuthorizedAttemptOnce');
  });
});
