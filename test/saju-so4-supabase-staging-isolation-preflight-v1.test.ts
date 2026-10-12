import {describe,expect,it} from 'vitest';
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF as PROD } from '../apps/api/src/production-user-data-runtime-config.js';
import {
  SAJU_SO4_SUPABASE_PREFLIGHT_VERSION_V1,
  assessSajuSo4SupabaseStagingIsolationClaimV1,
} from '../apps/api/src/saju-so4-supabase-staging-isolation-preflight-v1.js';

const unrelated='uhytfztmvgkdpimccyzh';
const auth='aaaaaaaaaaaaaaaaaaaa',subject='bbbbbbbbbbbbbbbbbbbb';
const nonce='cccccccccccccccccccc',admission='dddddddddddddddddddd';
const entry=(ref:string,classification:string)=>({ref,classification});
function inventory(){
  return {
    version:SAJU_SO4_SUPABASE_PREFLIGHT_VERSION_V1,
    provider:'SUPABASE',
    environmentId:'myeongha-staging-so4',
    observedProjects:[entry(PROD,'PRODUCTION'),entry(unrelated,'UNRELATED')],
    proposal:{authProjectRef:null as string|null,subjectProjectRef:null as string|null,
      nonceProjectRef:null as string|null,admissionProjectRef:null as string|null},
    maxIncrementalCostUsdCents:0,
  };
}
function future(){
  const f=inventory();
  f.observedProjects.push(...[auth,subject,nonce,admission].map(ref=>entry(ref,'STAGING_CANDIDATE')));
  f.proposal={authProjectRef:auth,subjectProjectRef:subject,
    nonceProjectRef:nonce,admissionProjectRef:admission};
  return f;
}
const check=(input:unknown)=>assessSajuSo4SupabaseStagingIsolationClaimV1(input);
describe('SO-4 Supabase isolation claim / unconnected fail closed',()=>{
  it('S01 actual known project inventory has no isolated staging',()=>{
    const r=check(inventory());
    expect(r.planShape).toBe('NO_STAGING_RESOURCES');
    expect(r).toMatchObject({observedProviderAuthority:'NOT_VERIFIED',
      independentSubjectDbAuthority:'NOT_VERIFIED',
      independentNonceDbAuthority:'NOT_VERIFIED',
      independentAdmissionDbAuthority:'NOT_VERIFIED',
      evidenceR01ToR14:'NOT_VERIFIED',stagingAdmission:'HOLD',
      mayCreateResource:false,mayAccessProduction:false,mayRunProbe:false,
      mayRetryConsumption:false,canRunOnce:false,canExecute:false,
      canPublish:false,canSell:false});
    expect(Object.isFrozen(r)).toBe(true);
  });
  it('S02 hypothetical four-project topology still has NO authority',()=>{
    const r=check(future());
    expect(r.planShape).toBe('CONSISTENT_UNVERIFIED_ORIGIN');
    expect(r.evidenceR01ToR14).toBe('NOT_VERIFIED');
    expect(r.stagingAdmission).toBe('HOLD');
  });
  it('S03 Auth can colocate with Subject in *plan* but R05 remains unverified',()=>{
    const f=future();f.proposal.authProjectRef=subject;
    const r=check(f);
    expect(r.planShape).toBe('CONSISTENT_UNVERIFIED_ORIGIN');
    expect(r.authProjectAuthority).toBe('NOT_VERIFIED');
  });
  it.each([
    ['S04 production as Subject',(f:ReturnType<typeof future>)=>{f.proposal.subjectProjectRef=PROD;}],
    ['S05 unrelated project as Nonce',(f:ReturnType<typeof future>)=>{f.proposal.nonceProjectRef=unrelated;}],
    ['S06 shared Nonce and Subject',(f:ReturnType<typeof future>)=>{f.proposal.nonceProjectRef=subject;}],
    ['S07 shared Admission and Nonce',(f:ReturnType<typeof future>)=>{f.proposal.admissionProjectRef=nonce;}],
    ['S08 fictional unobserved project',(f:ReturnType<typeof future>)=>{f.proposal.admissionProjectRef='eeeeeeeeeeeeeeeeeeee';}],
    ['S09 cost higher than zero',(f:ReturnType<typeof future>)=>{f.maxIncrementalCostUsdCents=1;}],
    ['S10 untrusted provider',(f:ReturnType<typeof future>)=>{f.provider='OTHER';}],
    ['S11 no production baseline',(f:ReturnType<typeof future>)=>{f.observedProjects=f.observedProjects.filter(p=>p.ref!==PROD);}],
    ['S12 production reclassified',(f:ReturnType<typeof future>)=>{f.observedProjects[0]={ref:PROD,classification:'STAGING_CANDIDATE'};}],
    ['S13 mixed incomplete plan',(f:ReturnType<typeof future>)=>{f.proposal.authProjectRef=null;}],
    ['S14 duplicate inventory ref',(f:ReturnType<typeof future>)=>{f.observedProjects.push(entry(PROD,'PRODUCTION'));}],
  ] as const)('%s blocked',(_,mutate)=>{
    const f=future();mutate(f);
    expect(check(f).planShape).toBe('BLOCKED');
    expect(check(f).mayAccessProduction).toBe(false);
  });
  it('S15 prototype, symbol, accessor, array and injected secrets are blocked',()=>{
    const f=future();
    const g={...f};Object.defineProperty(g,'proposal',{enumerable:true,get(){throw Error('SECRET');}});
    const bad=[
      {...f,secret:'sensitive'}, {...f,[Symbol('extra')]:'secret'},
      Object.create(f),g,[f],null,
      {...f,proposal:{...f.proposal,credential:'secret'}},
      {...f,observedProjects:[...f.observedProjects,{...f.observedProjects[0],jwt:'secret'}]},
    ];
    for(const x of bad) expect(check(x).planShape).toBe('BLOCKED');
  });
  it('S16 never echoes project refs or secrets in result',()=>{
    const r=check(future());
    expect(JSON.stringify(r)).not.toContain(PROD);
    expect(JSON.stringify(r)).not.toContain(unrelated);
  });
});
