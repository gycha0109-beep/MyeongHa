import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assessSajuSoloOwnerRegistryFloorV1,
  type SajuSoloOwnerRegistryFloorPortV1,
  type SajuSoloOwnerSignedRegistryCandidateV1,
  type SajuSoloOwnerVerifiedRegistryFloorClaimV1,
} from '../apps/api/src/saju-held-staging-registry-floor-v1.js';
import { canonicalSajuHeldStagingAuthorityRegistryBytesV1 } from
  '../apps/api/src/saju-held-staging-authority-registry-v1.js';
import { stagingTrustFixture, TRUST_TIME } from './helpers/saju-staging-trust-fixture.js';

function setup() {
  const fixture=stagingTrustFixture();
  const der=Buffer.from(fixture.rootPublicKey.export({format:'der',type:'spki'}));
  const fingerprint=createHash('sha256').update(der).digest('hex');
  const snapshot={
    environmentId:fixture.registry.environmentId,
    rootKeyId:fixture.registry.rootKeyId,
    rootSpkiSha256:fingerprint,
    minimumRegistryRevision:10,
  };
  const candidate:SajuSoloOwnerSignedRegistryCandidateV1={
    registry:fixture.registry,
    detachedSignature:fixture.registrySignature,
    candidateRootSpkiBase64url:der.toString('base64url'),
    expectedEnvironmentId:fixture.registry.environmentId,
  };
  let currentRevision=10;
  let anchoredRevision=10;
  let reads=0;
  let writes=0;
  let clock=TRUST_TIME;
  let staleRead=false;
  let lostCommitResponse=false;
  let revoked=false;
  let offline=false;
  let lastClaim:SajuSoloOwnerVerifiedRegistryFloorClaimV1|null=null;
  const port:SajuSoloOwnerRegistryFloorPortV1={
    async readPinnedSnapshot() {
      reads++;
      if(offline)throw new Error('offline');
      return {...snapshot,minimumRegistryRevision:staleRead?10:currentRevision};
    },
    async readTrustedTimeMs() {return clock;},
    async commitVerifiedRegistryClaim(claim) {
      writes++;
      lastClaim=claim;
      if(offline) throw Error('ledger offline');
      // Simulates independent DB and monotonic external recovery anchor.
      if(revoked || currentRevision<anchoredRevision
        || claim.environmentId!==snapshot.environmentId
        || claim.rootKeyId!==snapshot.rootKeyId
        || claim.rootSpkiSha256!==snapshot.rootSpkiSha256
        || claim.expectedMinimumRevision!==currentRevision
        || claim.candidateRevision<currentRevision) return {status:'REJECTED'};
      currentRevision=claim.candidateRevision;
      anchoredRevision=Math.max(anchoredRevision,currentRevision);
      if(lostCommitResponse) throw Error('commit response unknown');
      return {
        status:'ACK',minimumRevision:currentRevision,
        environmentId:claim.environmentId,rootKeyId:claim.rootKeyId,
        rootSpkiSha256:claim.rootSpkiSha256,
        registryDigestSha256:claim.registryDigestSha256,
      };
    },
  };
  return {
    fixture,snapshot,candidate,port,
    read:()=>reads,write:()=>writes,claim:()=>lastClaim,
    setCurrent:(x:number)=>{currentRevision=x;},
    setAnchor:(x:number)=>{anchoredRevision=x;},
    floor:()=>currentRevision,
    setClock:(x:number)=>{clock=x;},
    setStale:(x:boolean)=>{staleRead=x;},
    setLost:(x:boolean)=>{lostCommitResponse=x;},
    setRevoked:(x:boolean)=>{revoked=x;},
    setOffline:(x:boolean)=>{offline=x;},
  };
}

describe('SO-2 signed Registry -> monotone Ledger claim, ZERO operating authority',()=>{
  it('calls atomic storage once only after verifying Ed25519 pin/signature/floor and stays HOLD',async()=>{
    const f=setup();
    const r=await assessSajuSoloOwnerRegistryFloorV1(f.port,f.candidate);
    expect(r).toMatchObject({
      state:'SIGNED_CLAIM_WRITE_ACK_UNVERIFIED_CUSTODY',
      reason:'CHECKED_UNVERIFIED_CUSTODY',
      custodyAuthority:'NOT_VERIFIED',
      registryStorageDurability:'NOT_VERIFIED',
      signerAuthority:'NOT_VERIFIED',
      operationalEvidence:'NOT_VERIFIED',stagingAdmission:'HOLD',
      canRunOnce:false,canExecute:false,canPublish:false,canSell:false,
    });
    expect(f.read()).toBe(1);
    expect(f.write()).toBe(1);
    expect(f.claim()).toMatchObject({
      environmentId:f.snapshot.environmentId,rootKeyId:f.snapshot.rootKeyId,
      rootSpkiSha256:f.snapshot.rootSpkiSha256,
      expectedMinimumRevision:10,candidateRevision:10,
    });
    expect(Object.isFrozen(r)).toBe(true);
    expect(JSON.stringify(r)).not.toContain(f.snapshot.rootSpkiSha256);
  });

  it('rejects wrong root key or attacker pin before ANY ledger write',async()=>{
    const f=setup();
    const stranger=generateKeyPairSync('ed25519');
    const result=await assessSajuSoloOwnerRegistryFloorV1(f.port,{
      ...f.candidate,candidateRootSpkiBase64url:
        Buffer.from(stranger.publicKey.export({format:'der',type:'spki'})).toString('base64url'),
    });
    expect(result.state).toBe('HOLD');expect(f.write()).toBe(0);
  });

  it('rejects altered signature, revision, root ID, environment, or expired clock before writes',async()=>{
    const cases:Array<(f:ReturnType<typeof setup>)=>SajuSoloOwnerSignedRegistryCandidateV1>=[
      f=>({...f.candidate,detachedSignature:'A'.repeat(86)}),
      f=>({...f.candidate,registry:{...f.fixture.registry,revision:11}}),
      f=>({...f.candidate,registry:{...f.fixture.registry,rootKeyId:'other-root'}}),
      f=>({...f.candidate,expectedEnvironmentId:'myeongha-staging-other'}),
      f=>({...f.candidate,registry:{
        ...f.fixture.registry,environmentId:'myeongha-staging-other',
      }}),
    ];
    for(const alter of cases){
      const f=setup();
      expect((await assessSajuSoloOwnerRegistryFloorV1(f.port,alter(f))).state).toBe('HOLD');
      expect(f.write()).toBe(0);
    }
    const expired=setup();expired.setClock(TRUST_TIME+3_600_000);
    expect((await assessSajuSoloOwnerRegistryFloorV1(expired.port,expired.candidate)).state)
      .toBe('HOLD');
    expect(expired.write()).toBe(0);
  });

  it('requires monotonic CAS; stale snapshot cannot rewrite floor',async()=>{
    const f=setup();f.setCurrent(12);f.setAnchor(12);f.setStale(true);
    const r=await assessSajuSoloOwnerRegistryFloorV1(f.port,f.candidate);
    expect(r.state).toBe('HOLD');
    expect(f.floor()).toBe(12);
    expect(f.write()).toBe(1);
  });

  it('a restored LOWER DB revision than an independent anchor is blocked',async()=>{
    const f=setup();f.setCurrent(9);f.setAnchor(15);
    const r=await assessSajuSoloOwnerRegistryFloorV1(f.port,f.candidate);
    expect(r.state).toBe('HOLD');
    expect(f.floor()).toBe(9);
  });

  it('a future signed Registry can advance once, a reused stale snapshot cannot',async()=>{
    const f=setup();
    const next={...f.fixture.registry,revision:12};
    const candidate={...f.candidate,registry:next,
      detachedSignature:sign(null,canonicalSajuHeldStagingAuthorityRegistryBytesV1(next),
        f.fixture.rootPrivateKey).toString('base64url')};
    const first=await assessSajuSoloOwnerRegistryFloorV1(f.port,candidate);
    expect(first.state).toBe('SIGNED_CLAIM_WRITE_ACK_UNVERIFIED_CUSTODY');
    expect(f.floor()).toBe(12);
    const second=await assessSajuSoloOwnerRegistryFloorV1(f.port,f.candidate);
    expect(second.state).toBe('HOLD');
    expect(f.floor()).toBe(12);
  });

  it('rejected, revoked, broken clock and ledger failure are always HOLD',async()=>{
    const f=setup();f.setRevoked(true);
    expect((await assessSajuSoloOwnerRegistryFloorV1(f.port,f.candidate)).state).toBe('HOLD');
    const clock=setup();clock.setClock(Number.NaN);
    expect((await assessSajuSoloOwnerRegistryFloorV1(clock.port,clock.candidate)).reason)
      .toBe('UNTRUSTED_CLOCK');expect(clock.write()).toBe(0);
    const offline=setup();offline.setOffline(true);
    expect((await assessSajuSoloOwnerRegistryFloorV1(offline.port,offline.candidate)).reason)
      .toBe('UNAVAILABLE_OR_UNTRUSTED_SNAPSHOT');
  });

  it('unknown COMMIT response is HOLD and never retried',async()=>{
    const f=setup();f.setLost(true);
    const r=await assessSajuSoloOwnerRegistryFloorV1(f.port,f.candidate);
    expect(r.reason).toBe('ATOMIC_ACK_MISSING_OR_AMBIGUOUS');
    expect(r.canRunOnce).toBe(false);expect(f.write()).toBe(1);
    // Database may have committed. New invocation is NOT a retry authorization.
    expect(f.floor()).toBe(10);
  });

  it('forged ACK cannot promote mismatched scope, digest or revision',async()=>{
    const x=setup();
    for(const mutation of [
      {minimumRevision:999},
      {registryDigestSha256:'f'.repeat(64)},
      {environmentId:'myeongha-staging-attacker'},
      {rootKeyId:'attacker-key'},
    ]) {
      const f=setup();
      const p:SajuSoloOwnerRegistryFloorPortV1={
        readPinnedSnapshot:f.port.readPinnedSnapshot,
        readTrustedTimeMs:f.port.readTrustedTimeMs,
        async commitVerifiedRegistryClaim(claim) {return {
          status:'ACK' as const,minimumRevision:claim.candidateRevision,
          environmentId:claim.environmentId,rootKeyId:claim.rootKeyId,
          rootSpkiSha256:claim.rootSpkiSha256,
          registryDigestSha256:claim.registryDigestSha256,...mutation,
        };},
      };
      const r=await assessSajuSoloOwnerRegistryFloorV1(p,f.candidate);
      expect(r.state).toBe('HOLD');
    }
    expect(x.write()).toBe(0);
  });

  it('self-owned root/pin/registry can pass claimed write but NOT actual custody',async()=>{
    const fake=stagingTrustFixture();
    const root=generateKeyPairSync('ed25519');
    const der=Buffer.from(root.publicKey.export({format:'der',type:'spki'}));
    const pin=createHash('sha256').update(der).digest('hex');
    const forged={...fake.registry,rootKeyId:'attacker-root'};
    const signed=sign(null,canonicalSajuHeldStagingAuthorityRegistryBytesV1(forged),
      root.privateKey).toString('base64url');
    const p:SajuSoloOwnerRegistryFloorPortV1={
      async readPinnedSnapshot(){return {
        environmentId:forged.environmentId,rootKeyId:forged.rootKeyId,
        rootSpkiSha256:pin,minimumRegistryRevision:10,
      };},
      async readTrustedTimeMs(){return TRUST_TIME;},
      async commitVerifiedRegistryClaim(claim){return {
        status:'ACK',minimumRevision:claim.candidateRevision,
        rootKeyId:claim.rootKeyId,rootSpkiSha256:claim.rootSpkiSha256,
        environmentId:claim.environmentId,
        registryDigestSha256:claim.registryDigestSha256,
      };},
    };
    const report=await assessSajuSoloOwnerRegistryFloorV1(p,{
      registry:forged,detachedSignature:signed,
      candidateRootSpkiBase64url:der.toString('base64url'),
      expectedEnvironmentId:forged.environmentId,
    });
    expect(report.state).toBe('SIGNED_CLAIM_WRITE_ACK_UNVERIFIED_CUSTODY');
    expect(report.custodyAuthority).toBe('NOT_VERIFIED');
    expect(report.canExecute).toBe(false);
  });
});
