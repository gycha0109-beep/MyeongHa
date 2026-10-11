import {describe,it,expect} from 'vitest';
import {
  SAJU_SOLO_OWNER_PROVIDER_READINESS_VERSION_V1,
  assessSajuSoloOwnerProviderReadinessClaimV1,
} from '../apps/api/src/saju-held-staging-solo-owner-provider-readiness-v1.js';

const roles = ['OWNER_PORTAL','ROOT_CUSTODY','OPERATOR_SIGNER',
  'ATTESTOR_WORKER','CHALLENGE_CONSUMER','RUNNER'] as const;
const purposes = ['OWNER_INTENT','ROOT_ANCHOR','PERMIT_V2',
  'EVIDENCE_ATTESTATION','CHALLENGE_CONSUMPTION','DISABLED'] as const;
const capabilities: string[][] = [['INTENT_RECORD'],['ROOT_ANCHOR_READ'],
  ['PERMIT_SIGN'],['TARGET_READ','ATTEST_SIGN'],['CHALLENGE_CONSUME'],[]];
const scope = {
  environmentId:'myeongha-staging-ci',
  permitId:'123e4567-e89b-42d3-a456-426614174002',
  manifestDigest:'a'.repeat(64),
  connectionPlanDigest:'b'.repeat(64),
  myeonghaCommitSha:'c'.repeat(40),
  sajuCommitSha:'d'.repeat(40),
  requestDigest:'e'.repeat(64),
};
function valid() {
  return {
    version:SAJU_SOLO_OWNER_PROVIDER_READINESS_VERSION_V1,
    profiles:roles.map((role,i)=>({
      role,principalId:'principal-'+i,securityDomainId:'domain-'+i,
      humanOwnerSubject:'one-owner',keyPurpose:purposes[i],
      capabilities:[...(capabilities[i] ?? [])],keyExportable:false,
    })),
    witnessClaims:{
      ...scope,
      rootAnchorRef:'ref:root',externalHighWaterRef:'ref:highwater',
      revocationRef:'ref:revocations',trustedClockRef:'ref:clock',
      attestorWitnessRef:'ref:attestor',challengeWitnessRef:'ref:challenge',
      admissionWitnessRef:'ref:admission',auditReceiptRef:'ref:audit',
      auditRetentionDays:90,maxIncrementalCostUsdCents:0,
    },
  };
}
function check(x: unknown, e: unknown = scope) {
  return assessSajuSoloOwnerProviderReadinessClaimV1(x,e);
}
describe('SO-3B provider readiness — caller assertions only, zero I/O',()=>{
  it('T01 consistent fixture stays NOT_VERIFIED/HOLD',()=>{
    const result = check(valid());
    expect(result.claimShape).toBe('CONSISTENT_UNVERIFIED_ORIGIN');
    expect(Object.values(result.checks)).toEqual(Array(3).fill('CONSISTENT_CLAIM'));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checks)).toBe(true);
    expect(result).toMatchObject({
      humanReviewersVerified:0,workloadIdentityAuthority:'NOT_VERIFIED',
      rootCustodyAuthority:'NOT_VERIFIED',signerAuthority:'NOT_VERIFIED',
      attestorAuthority:'NOT_VERIFIED',trustedClockAuthority:'NOT_VERIFIED',
      revisionDurability:'NOT_VERIFIED',auditDurability:'NOT_VERIFIED',
      evidenceProvenance:'NOT_VERIFIED',budgetAuthority:'NOT_VERIFIED',
      stagingAdmission:'HOLD',mayRetryConsumption:false,canRunOnce:false,
      canExecute:false,canPublish:false,canSell:false,
    });
    expect(JSON.stringify(result)).not.toContain('ref:root');
    expect(JSON.stringify(result)).not.toContain('one-owner');
  });
  it.each([
    ['T02 wrong version', (x:ReturnType<typeof valid>)=>({...x,version:'malicious'})],
    ['T03 added credential', (x:ReturnType<typeof valid>)=>({...x,secret:'sk-fake'})],
    ['T04 omitted profile', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.slice(0,-1)})],
    ['T05 role substitution', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===4?{...p,role:'OPERATOR_SIGNER' as typeof p.role}:p)})],
    ['T06 principal crossover', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===3?{...p,principalId:'principal-2'}:p)})],
    ['T07 domain crossover', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===3?{...p,securityDomainId:'domain-2'}:p)})],
    ['T08 forged human plurality', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===3?{...p,humanOwnerSubject:'other-human'}:p)})],
    ['T09 signer key purpose crossover', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===2?{...p,keyPurpose:'EVIDENCE_ATTESTATION' as typeof p.keyPurpose}:p)})],
    ['T10 root export allowed', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===1?{...p,keyExportable:true}:p)})],
    ['T11 runner execution grant', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===5?{...p,capabilities:['RUN_ONCE']}:p)})],
    ['T12 portal Root key read', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===0?{...p,capabilities:['KEY_READ']}:p)})],
    ['T13 extra role capability', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===4?{...p,capabilities:['CHALLENGE_CONSUME','CHALLENGE_ISSUE']}:p)})],
    ['T14 credential in profile', (x:ReturnType<typeof valid>)=>({...x,profiles:x.profiles.map((p,i)=>i===1?{...p,privateKey:'secret'}:p)})],
    ['T15 wrong env', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,environmentId:'myeongha-staging-other'}})],
    ['T16 changed manifest', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,manifestDigest:'f'.repeat(64)}})],
    ['T17 Saju SHA drift', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,sajuCommitSha:'f'.repeat(40)}})],
    ['T18 replayed permit', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,permitId:'123e4567-e89b-42d3-a456-426614174003'}})],
    ['T19 duplicate witness', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,auditReceiptRef:'ref:root'}})],
    ['T20 missing highwater', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,externalHighWaterRef:''}})],
    ['T21 missing trusted clock', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,trustedClockRef:''}})],
    ['T22 inadequate retention', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,auditRetentionDays:0}})],
    ['T23 budget over zero', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,maxIncrementalCostUsdCents:1}})],
    ['T24 extra witness token', (x:ReturnType<typeof valid>)=>({...x,witnessClaims:{...x.witnessClaims,bearerToken:'secret'}})],
  ] as const)('%s => BLOCKED',(_,mutate)=>{
    const result=check(mutate(valid()));
    expect(result.claimShape).toBe('BLOCKED');
    expect(result.stagingAdmission).toBe('HOLD');
    expect(result.canExecute).toBe(false);
  });
  it('T25 rejects inherited, symbol, getter, and array payloads',()=>{
    const f=valid();
    const getter={...f};
    Object.defineProperty(getter,'profiles',{enumerable:true,get(){throw Error('LEAK');}});
    const symbol={...f,[Symbol('hidden')]:'secret'};
    const inherited=Object.create(f);
    const nestedGetter=valid();
    Object.defineProperty(nestedGetter.witnessClaims,'rootAnchorRef',{
      enumerable:true,get(){throw Error('LEAK');},
    });
    for(const data of [getter,symbol,inherited,[f],nestedGetter,null]) {
      expect(check(data).claimShape).toBe('BLOCKED');
    }
  });
  it('T26 rejects counterfeit expected scope, unknown/poisoned reference',()=>{
    const f=valid();
    expect(check(f,{...scope,requestDigest:'f'.repeat(64)}).claimShape).toBe('BLOCKED');
    const expected={...scope};
    Object.defineProperty(expected,'sajuCommitSha',{enumerable:true,get(){throw Error('LEAK');}});
    expect(check(f,expected).claimShape).toBe('BLOCKED');
    expect(check(f,{...scope,secret:'x'}).claimShape).toBe('BLOCKED');
  });
  it('T27 consistency does not prove trusted time, IAM or source authenticity',()=>{
    const x=check(valid());
    expect(x.claimShape).toBe('CONSISTENT_UNVERIFIED_ORIGIN');
    expect(x.trustedClockAuthority).toBe('NOT_VERIFIED');
    expect(x.evidenceProvenance).toBe('NOT_VERIFIED');
    expect(x.mayRetryConsumption).toBe(false);
  });
});
