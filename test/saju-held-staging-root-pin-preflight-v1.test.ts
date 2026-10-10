import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assessSajuHeldStagingRootPinPreflightV1,
  parseSajuHeldStagingRootPinSnapshotV1,
} from '../apps/api/src/saju-held-staging-root-pin-preflight-v1.js';
import { canonicalSajuHeldStagingAuthorityRegistryBytesV1 } from
  '../apps/api/src/saju-held-staging-authority-registry-v1.js';
import { stagingTrustFixture, TRUST_TIME } from './helpers/saju-staging-trust-fixture.js';

function fixture() {
  const f = stagingTrustFixture();
  const rootBytes = Buffer.from(f.rootPublicKey.export({format:'der', type:'spki'}));
  const pin = {
    environmentId:f.registry.environmentId,
    rootKeyId:f.registry.rootKeyId,
    rootSpkiSha256:createHash('sha256').update(rootBytes).digest('hex'),
    minimumRegistryRevision:10,
  };
  return {
    pin,
    candidateRootSpkiBase64url:rootBytes.toString('base64url'),
    registry:f.registry,
    registrySignature:f.registrySignature,
    nowMs:TRUST_TIME,
  };
}
type Inputs = ReturnType<typeof fixture>;

describe('3-04-02C synthetic Root fingerprint/signature/floor preflight', () => {
  it('checks a synthetic signature against the pinned SPKI/floor but always HELDs', () => {
    const input = fixture();
    const report=assessSajuHeldStagingRootPinPreflightV1({
      custodySnapshot:input.pin,...input,
    });
    expect(report.contract).toBe('PINNED_SIGNED_CLAIM_UNVERIFIED_CUSTODY');
    expect(Object.values(report.checks)).toEqual(['PASS','PASS','PASS','PASS']);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.checks)).toBe(true);
    expect(report).toMatchObject({
      rootAuthority:'NOT_VERIFIED',signerAuthority:'NOT_VERIFIED',
      operationalEvidence:'NOT_VERIFIED',stagingConnection:'NOT_VERIFIED',
      stagingAdmission:'HOLD',sourceAuthority:'NOT_EVALUATED',
      releaseAuthorization:'NOT_EVALUATED',
      canRunOnce:false,canExecute:false,canPublish:false,canSell:false,
    });
    expect(JSON.stringify(report)).not.toContain(input.candidateRootSpkiBase64url);
    expect(JSON.stringify(report)).not.toContain(input.registrySignature);
  });

  it.each([
    ['replaced key', (x: Inputs) => ({
      ...x,candidateRootSpkiBase64url: Buffer.from(generateKeyPairSync('ed25519')
        .publicKey.export({format:'der',type:'spki'})).toString('base64url')})],
    ['wrong pin', (x:Inputs)=>({...x,pin:{...x.pin,rootSpkiSha256:'0'.repeat(64)}})],
    ['changed root id', (x:Inputs)=>({...x,pin:{...x.pin,rootKeyId:'rogue-root'}})],
    ['changed environment', (x:Inputs)=>({...x,pin:{...x.pin,environmentId:'myeongha-staging-other'}})],
    ['floor ahead of registry', (x:Inputs)=>({...x,pin:{...x.pin,minimumRegistryRevision:11}})],
    ['invalid signature', (x:Inputs)=>({...x,registrySignature:'A'.repeat(86)})],
    ['expired registry', (x:Inputs)=>({...x,nowMs:TRUST_TIME+3600000})],
    ['changed revision under same signature', (x:Inputs)=>({
      ...x,registry:{...x.registry,revision:12}})],
    ['malformed DER', (x:Inputs)=>({...x,candidateRootSpkiBase64url:'AA'})],
    ['secret field injection', (x:Inputs)=>({
      ...x,pin:{...x.pin,privateKey:'DO_NOT_EXPOSE'}})],
    ['invalid floor', (x:Inputs)=>({...x,pin:{...x.pin,minimumRegistryRevision:0}})],
  ])('blocks %s',(_name,alter)=>{
    const v=alter(fixture());
    const report=assessSajuHeldStagingRootPinPreflightV1({
      custodySnapshot:v.pin,
      candidateRootSpkiBase64url:v.candidateRootSpkiBase64url,
      registry:v.registry,
      registrySignature:v.registrySignature,
      nowMs:v.nowMs,
    });
    expect(report.contract).toBe('BLOCKED');
    expect(report.canRunOnce).toBe(false);
    expect(report.rootAuthority).toBe('NOT_VERIFIED');
  });

  it('rejects proxy/getter, inherited, extra symbol, and out-of-range snapshot',()=>{
    const x=fixture().pin;
    expect(Object.isFrozen(parseSajuHeldStagingRootPinSnapshotV1(x))).toBe(true);
    const poisoned={...x};
    Object.defineProperty(poisoned,'rootSpkiSha256',{
      enumerable:true,get(){throw Error('PRIVATE_KEY');},
    });
    for(const bad of [
      poisoned,Object.create(x),{...x,minimumRegistryRevision:1.5},
      {...x,environmentId:'prod'},
      Object.assign({...x},{[Symbol('private')]:true}),
    ]) {
      expect(()=>parseSajuHeldStagingRootPinSnapshotV1(bad)).toThrow(TypeError);
      expect(assessSajuHeldStagingRootPinPreflightV1({
        ...fixture(),custodySnapshot:bad,
      }).contract).toBe('BLOCKED');
    }
  });

  it('self-signed fake Root + attacker-owned matching pin is STILL NOT independently trusted',()=>{
    const input=fixture();
    const adversary=generateKeyPairSync('ed25519');
    const bytes=Buffer.from(adversary.publicKey.export({format:'der',type:'spki'}));
    const fakeRegistry={...input.registry,rootKeyId:'rogue-governed-root'};
    const fakeSignature=sign(null,
      canonicalSajuHeldStagingAuthorityRegistryBytesV1(fakeRegistry),
      adversary.privateKey).toString('base64url');
    const report=assessSajuHeldStagingRootPinPreflightV1({
      custodySnapshot:{
        ...input.pin,rootKeyId:'rogue-governed-root',
        rootSpkiSha256:createHash('sha256').update(bytes).digest('hex'),
      },
      candidateRootSpkiBase64url:bytes.toString('base64url'),
      registry:fakeRegistry,registrySignature:fakeSignature,nowMs:TRUST_TIME,
    });
    // A matching but self-owned "pin" is not independent custody.
    expect(report.contract).toBe('PINNED_SIGNED_CLAIM_UNVERIFIED_CUSTODY');
    expect(report.rootAuthority).toBe('NOT_VERIFIED');
    expect(report.stagingAdmission).toBe('HOLD');
    expect(report.canExecute).toBe(false);
  });
});
