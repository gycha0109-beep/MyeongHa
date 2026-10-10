import { describe, expect, it } from 'vitest';
import {
  assessSajuSoloOwnerCrossDbReconciliationV1,
  type SajuSoloOwnerReconciliationReadPortV1,
} from '../apps/api/src/saju-held-staging-solo-owner-reconciliation-v1.js';

const NOW=1_800_000_000_000;
const expected={
  environmentId:'myeongha-staging-isolated',
  permitId:'12345678-1234-4123-8123-123456789abc',
  manifestDigest:'a'.repeat(64),connectionPlanDigest:'b'.repeat(64),
  myeonghaCommitSha:'c'.repeat(40),sajuCommitSha:'d'.repeat(40),
  requestDigest:'e'.repeat(64),
};
type State='ISSUED'|'CONSUMED'|'UNKNOWN'|'REVOKED'|'EXPIRED'|'UNOBSERVED';
function observation(ledger:'CHALLENGE_DB'|'ADMISSION_DB',state:State){
  return {...expected,ledger,state,
    witnessRef:ledger==='CHALLENGE_DB'?'receipt:challenge-01':'receipt:admission-01',
    observedAtMs:NOW};
}
function port(c:unknown,a:unknown):SajuSoloOwnerReconciliationReadPortV1{
  return {
    async readTrustedTimeMs(){return NOW;},
    async readChallengeState(){return c;},
    async readAdmissionState(){return a;},
  };
}
async function check(a:State,b:State,attempted:boolean){
  return assessSajuSoloOwnerCrossDbReconciliationV1(
    port(observation('CHALLENGE_DB',a),observation('ADMISSION_DB',b)),
    expected,attempted,
  );
}

describe('SO-3 read-only cross DB reconciliation claim: ALWAYS HOLD',()=>{
  it('does not mistake two consumed claims for operational attestation',async()=>{
    const r=await check('CONSUMED','CONSUMED',true);
    expect(r).toMatchObject({state:'CONSUMED_RECONCILED',
      observationAuthority:'NOT_VERIFIED',crossDbAtomicity:'NOT_VERIFIED',
      trustedClockAuthority:'NOT_VERIFIED',auditDurability:'NOT_VERIFIED',
      stagingAdmission:'HOLD',mayRetryConsumption:false,
      canRunOnce:false,canExecute:false,canPublish:false,canSell:false});
    expect(Object.isFrozen(r)).toBe(true);
    expect(JSON.stringify(r)).not.toContain(expected.requestDigest);
  });
  it.each([
    ['ISSUED','ISSUED',false,'CONSUMPTION_PENDING'],
    ['ISSUED','ISSUED',true,'CONSUMPTION_UNKNOWN'],
    ['CONSUMED','ISSUED',true,'CROSS_DB_PARTIAL_HOLD'],
    ['ISSUED','CONSUMED',true,'CROSS_DB_PARTIAL_HOLD'],
    ['UNKNOWN','CONSUMED',true,'CONSUMPTION_UNKNOWN'],
    ['CONSUMED','UNKNOWN',true,'CONSUMPTION_UNKNOWN'],
    ['CONSUMED','UNOBSERVED',true,'RECOVERY_HOLD'],
    ['REVOKED','CONSUMED',true,'REVOKED'],
    ['ISSUED','EXPIRED',false,'EXPIRED'],
  ] as const)('classifies %s/%s attempted=%s as %s without retry',
    async (a,b,attempted,wanted)=>{
      const r=await check(a,b,attempted);
      expect(r.state).toBe(wanted);
      expect(r.mayRetryConsumption).toBe(false);
      expect(r.stagingAdmission).toBe('HOLD');
    });
  it('rejects malformed scopes and invalid attempt flags without source reads',async()=>{
    let reads=0;
    const spy:SajuSoloOwnerReconciliationReadPortV1={
      async readTrustedTimeMs(){reads++;return NOW;},
      async readChallengeState(){reads++;return null;},
      async readAdmissionState(){reads++;return null;},
    };
    expect((await assessSajuSoloOwnerCrossDbReconciliationV1(spy,
      {...expected,environmentId:'production'},false)).state).toBe('BLOCKED');
    expect((await assessSajuSoloOwnerCrossDbReconciliationV1(spy,
      {...expected,requestDigest:'not-hash'},false)).state).toBe('BLOCKED');
    expect((await assessSajuSoloOwnerCrossDbReconciliationV1(spy,expected,'true')).state)
      .toBe('BLOCKED');
    expect(reads).toBe(0);
  });
  it('blocks mismatched environment/permit/digest/SHA/source and duplicate witnesses',async()=>{
    for(const mod of [
      {environmentId:'myeongha-staging-other'},
      {permitId:'22222222-2222-4222-8222-222222222222'},
      {manifestDigest:'f'.repeat(64)},
      {myeonghaCommitSha:'f'.repeat(40)},
      {ledger:'CHALLENGE_DB'},
      {witnessRef:'receipt:challenge-01'},
    ]){
      const r=await assessSajuSoloOwnerCrossDbReconciliationV1(port(
        observation('CHALLENGE_DB','CONSUMED'),
        {...observation('ADMISSION_DB','CONSUMED'),...mod},
      ),expected,true);
      expect(r.state).toBe('RECOVERY_HOLD');
    }
  });
  it('contains provider failures, invalid clocks, stale receipts and hostile getters',async()=>{
    const bad:SajuSoloOwnerReconciliationReadPortV1={
      async readTrustedTimeMs(){throw Error('clock unavailable');},
      async readChallengeState(){throw Error('secret');},
      async readAdmissionState(){throw Error('secret');},
    };
    expect((await assessSajuSoloOwnerCrossDbReconciliationV1(bad,expected,true)).state)
      .toBe('RECOVERY_HOLD');
    const stale={...observation('CHALLENGE_DB','CONSUMED'),observedAtMs:NOW-31_000};
    expect((await assessSajuSoloOwnerCrossDbReconciliationV1(
      port(stale,observation('ADMISSION_DB','CONSUMED')),expected,true)).state)
      .toBe('RECOVERY_HOLD');
    const hostile={...observation('CHALLENGE_DB','CONSUMED')};
    Object.defineProperty(hostile,'state',{enumerable:true,get(){throw Error('payload');}});
    expect((await assessSajuSoloOwnerCrossDbReconciliationV1(
      port(hostile,observation('ADMISSION_DB','CONSUMED')),expected,true)).state)
      .toBe('RECOVERY_HOLD');
    expect((await assessSajuSoloOwnerCrossDbReconciliationV1(
      {...port(observation('CHALLENGE_DB','CONSUMED'),observation('ADMISSION_DB','CONSUMED')),
        async readTrustedTimeMs(){return Number.NaN;}},expected,true)).state)
      .toBe('RECOVERY_HOLD');
  });
  it('accepts neither array/prototype observations nor unknown keys',async()=>{
    for(const bad of [
      [],Object.create({ledger:'CHALLENGE_DB'}),
      {...observation('CHALLENGE_DB','CONSUMED'),securityToken:'secret'},
    ]){
      expect((await assessSajuSoloOwnerCrossDbReconciliationV1(
        port(bad,observation('ADMISSION_DB','CONSUMED')),expected,true)).state)
        .toBe('RECOVERY_HOLD');
    }
  });
});
