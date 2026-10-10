import { describe, it, expect } from 'vitest';
import {
  SAJU_SOLO_OWNER_INTENT_CLAIM_VERSION_V1,
  parseSajuSoloOwnerIntentClaimV1,
  assessSajuSoloOwnerIntentPreflightV1,
} from '../apps/api/src/saju-held-staging-solo-owner-intent-v1.js';

const TIME = 1_800_000_000_000;
const roles = ['OWNER_PORTAL', 'ROOT_CUSTODY', 'OPERATOR_SIGNER',
  'ATTESTOR_WORKER', 'CHALLENGE_CONSUMER', 'RUNNER'] as const;
const domains = ['control', 'custody', 'custody', 'attestation', 'custody', 'runtime'] as const;
function fixture(p3 = true) {
  const intent = {
    version: SAJU_SOLO_OWNER_INTENT_CLAIM_VERSION_V1,
    intentId:'123e4567-e89b-42d3-a456-426614174001',
    ownerSubject:'sole-owner',
    actionClass:p3 ? 'P3_STAGING_SINGLE_REHEARSAL' : 'P2_STAGING_READ_ONLY',
    environmentId:'myeongha-staging-ci',
    permitId:p3 ? '123e4567-e89b-42d3-a456-426614174002' : null,
    manifestDigest:'a'.repeat(64),
    connectionPlanDigest:'b'.repeat(64),
    myeonghaCommitSha:'c'.repeat(40),
    sajuCommitSha:'d'.repeat(40),
    requestDigest:'e'.repeat(64),
    issuedAtMs:TIME-10_000, expiresAtMs:TIME+30_000,
    authMethod:'PASSKEY_ASSERTION_CLAIM',
    authEventRef:'auth-ref-123',
    policyRevision:7,
    auditEventRef:'audit-ref-123',
  };
  const expectedScope={
    environmentId:intent.environmentId, permitId:intent.permitId,
    manifestDigest:intent.manifestDigest,
    connectionPlanDigest:intent.connectionPlanDigest,
    myeonghaCommitSha:intent.myeonghaCommitSha,
    sajuCommitSha:intent.sajuCommitSha,
    requestDigest:intent.requestDigest,
  };
  const authenticationEvent={
    intentId:intent.intentId,
    ownerSubject:intent.ownerSubject,
    requestDigest:intent.requestDigest,
    authMethod:intent.authMethod,authEventRef:intent.authEventRef,
    verifiedAtMs:TIME-8_000,
  };
  const principals=roles.map((role,i)=>({
    role,principalId:'svc-'+String(i+1),
    humanOwnerSubject:intent.ownerSubject,
    securityDomainId:domains[i],
  }));
  return {intent,expectedScope,authenticationEvent,principals,nowMs:TIME};
}

describe('SO-1 solo Owner claim and technical role boundary (zero I/O)',()=>{
  it.each([true,false])('accepts consistent synthetic claims P3=%s, never approves',p3=>{
    const f=fixture(p3);
    const parsed=parseSajuSoloOwnerIntentClaimV1(f.intent);
    expect(Object.isFrozen(parsed)).toBe(true);
    const r=assessSajuSoloOwnerIntentPreflightV1(f);
    expect(r.claimConsistency).toBe('CONSISTENT_UNVERIFIED_ORIGIN');
    expect(Object.values(r.checks)).toEqual(Array(5).fill('CONSISTENT_CLAIM'));
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.checks)).toBe(true);
    expect(r).toMatchObject({
      humanReviewersVerified:0,ownerAuthentication:'NOT_VERIFIED',
      custodyAuthority:'NOT_VERIFIED',operatorSigningAuthority:'NOT_VERIFIED',
      attestorIndependence:'NOT_VERIFIED',auditDurability:'NOT_VERIFIED',
      stagingAdmission:'HOLD',
      canRunOnce:false,canExecute:false,canPublish:false,canSell:false,
    });
    expect(JSON.stringify(r)).not.toContain('sole-owner');
    expect(JSON.stringify(r)).not.toContain('auth-ref-123');
  });

  it('two technical principals do NOT become two humans or trusted passkey proof',()=>{
    const r=assessSajuSoloOwnerIntentPreflightV1(fixture());
    expect(r.claimConsistency).toBe('CONSISTENT_UNVERIFIED_ORIGIN');
    expect(r.humanReviewersVerified).toBe(0);
    expect(r.ownerAuthentication).toBe('NOT_VERIFIED');
    expect(r.canExecute).toBe(false);
  });

  it.each([
    ['wrong scope environment', (x: ReturnType<typeof fixture>)=>({...x,expectedScope:{...x.expectedScope,environmentId:'myeongha-staging-other'}})],
    ['changed manifest', (x: ReturnType<typeof fixture>)=>({...x,expectedScope:{...x.expectedScope,manifestDigest:'f'.repeat(64)}})],
    ['changed Saju commit', (x: ReturnType<typeof fixture>)=>({...x,expectedScope:{...x.expectedScope,sajuCommitSha:'f'.repeat(40)}})],
    ['permit reuse', (x: ReturnType<typeof fixture>)=>({...x,expectedScope:{...x.expectedScope,permitId:'123e4567-e89b-42d3-a456-426614174003'}})],
    ['wrong auth subject', (x: ReturnType<typeof fixture>)=>({...x,authenticationEvent:{...x.authenticationEvent,ownerSubject:'evil'}})],
    ['different request', (x: ReturnType<typeof fixture>)=>({...x,authenticationEvent:{...x.authenticationEvent,requestDigest:'f'.repeat(64)}})],
    ['stale authentication event', (x: ReturnType<typeof fixture>)=>({...x,authenticationEvent:{...x.authenticationEvent,verifiedAtMs:TIME-20_000}})],
    ['expired intent', (x: ReturnType<typeof fixture>)=>({...x,nowMs:TIME+30_000})],
    ['duplicate workload', (x: ReturnType<typeof fixture>)=>({...x,principals:x.principals.map((p,i)=>i===1?{...p,principalId:'svc-1'}:p)})],
    ['combined signer/attestor role', (x: ReturnType<typeof fixture>)=>({...x,principals:x.principals.map((p,i)=>i===3?{...p,role:'OPERATOR_SIGNER'}:p)})],
    ['same custody and runner trust domain', (x: ReturnType<typeof fixture>)=>({...x,principals:x.principals.map((p,i)=>i===5?{...p,securityDomainId:'custody'}:p)})],
    ['same Owner portal and custody domain', (x: ReturnType<typeof fixture>)=>({...x,principals:x.principals.map((p,i)=>i===1?{...p,securityDomainId:'control'}:p)})],
    ['impersonated human owner', (x: ReturnType<typeof fixture>)=>({...x,principals:x.principals.map((p,i)=>i===3?{...p,humanOwnerSubject:'second-human'}:p)})],
    ['invalid intent TTL', (x: ReturnType<typeof fixture>)=>({...x,intent:{...x.intent,expiresAtMs:TIME+90000}})],
    ['P3 absent permit', (x: ReturnType<typeof fixture>)=>({...x,intent:{...x.intent,permitId:null}})],
    ['P4 root escalation', (x: ReturnType<typeof fixture>)=>({...x,intent:{...x.intent,actionClass:'P4_ROOT_CHANGE'}})],
    ['secret injected intent', (x: ReturnType<typeof fixture>)=>({...x,intent:{...x.intent,privateKey:'NEVER'}})],
    ['secret injected role', (x: ReturnType<typeof fixture>)=>({...x,principals:x.principals.map((p,i)=>i===2?{...p,key:'NEVER'}:p)})],
    ['unapproved authentication method', (x: ReturnType<typeof fixture>)=>({...x,intent:{...x.intent,authMethod:'SESSION_COOKIE'}})],
    ['policy revision 0', (x: ReturnType<typeof fixture>)=>({...x,intent:{...x.intent,policyRevision:0}})],
  ] as const)('blocks %s',(_title,mutate)=>{
    const r=assessSajuSoloOwnerIntentPreflightV1(mutate(fixture()));
    expect(r.claimConsistency).toBe('BLOCKED');
    expect(r.stagingAdmission).toBe('HOLD');
    expect(r.canRunOnce).toBe(false);
  });

  it('rejects hostile getters, symbols, inheritance, and arrays without throwing from assessor',()=>{
    const base=fixture();
    const poisoned={...base.intent};
    Object.defineProperty(poisoned,'authEventRef',{enumerable:true,get(){throw Error('SECRET')}});

    const symbolIntent=Object.assign({...base.intent},{[Symbol('x')]:'shadow'});
    for(const intent of [poisoned,symbolIntent,Object.create(base.intent),
      Object.assign({...base.intent},{metadata:'SECRET'}),[base.intent],
      {...base.intent,issuedAtMs:NaN}]) {
      expect(()=>parseSajuSoloOwnerIntentClaimV1(intent)).toThrow(TypeError);
      expect(assessSajuSoloOwnerIntentPreflightV1({...base,intent}).claimConsistency)
        .toBe('BLOCKED');
    }
    const poisonedScope={...base.expectedScope};
    Object.defineProperty(poisonedScope,'manifestDigest',{
      enumerable:true,get(){throw Error('NO_SCAN');},
    });
    expect(assessSajuSoloOwnerIntentPreflightV1({
      ...base,expectedScope:poisonedScope,
    }).claimConsistency).toBe('BLOCKED');
  });

  it('P2 cannot borrow P3 permit; forged consistent P3 still receives no execution token',()=>{
    const p2=fixture(false);
    expect(assessSajuSoloOwnerIntentPreflightV1({
      ...p2,intent:{...p2.intent,permitId:'123e4567-e89b-42d3-a456-426614174002'},
    }).claimConsistency).toBe('BLOCKED');
    const attacker=fixture(true);
    expect(assessSajuSoloOwnerIntentPreflightV1(attacker).claimConsistency)
      .toBe('CONSISTENT_UNVERIFIED_ORIGIN');
    expect(assessSajuSoloOwnerIntentPreflightV1(attacker).canRunOnce).toBe(false);
  });
});
