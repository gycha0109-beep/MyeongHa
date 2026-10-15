import {describe,expect,it} from 'vitest';
import {
  assessCancelCutoverEvidenceV1,
  CANCEL_REQUIRED_ROUTINES_V1,
  CANCEL_EXTERNAL_CUTOVER_PROOFS_V1,
  type CancelCutoverEvidenceV1,
} from './support/private-official-reader-cancel-cutover-evidence-v1.js';

const NAMES=[
  'anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner',
  'postgres','myeongha_cancel_verifier','myeongha_cancel_executor',
  'myeongha_cancel_owner',
];
function fixture():CancelCutoverEvidenceV1{
  return {
    evidence_kind:'read_only_catalog_snapshot_not_authorization',
    release_authorized:false,observed_at:'2026-10-15T05:44:52.437Z',
    roles:NAMES.map(role_name=>({
      role_name,role_exists:true,
      can_login:['postgres','myeongha_cancel_verifier',
        'myeongha_cancel_executor'].includes(role_name),
      superuser:false,
      bypass_rls:role_name==='service_role'||role_name==='postgres',
      can_create_roles:role_name==='postgres',
      member_of_dedicated_owner:role_name==='myeongha_cancel_owner'
        ?true:false,
    })),
    functions:CANCEL_REQUIRED_ROUTINES_V1.map(routine_name=>({
      routine_name,matching_overloads:1,owner_roles:'myeongha_cancel_owner',
      public_execute:false,anon_execute:false,
      authenticated_execute:false,service_role_execute:false,
      api_executor_execute:false,commerce_executor_execute:false,
    })),
    entitlement_table:{
      table_exists:true,service_role_all_mutations:false,
      postgres_all_mutations:true,commerce_executor_all_mutations:false,
    },
  };
}
const assess=(s:unknown)=>assessCancelCutoverEvidenceV1(s);
describe('D3e20 read-only live role and direct entitlement writer cutover assessment',()=>{
  it('even a fully healthy hypothetical catalogue can NEVER authorize release',()=>{
    const result=assess(fixture());
    expect(result.state).toBe('HOLD');
    expect(result.releaseAuthorized).toBe(false);
    expect(result.blockers).toEqual([]);
    expect(result.externalProofs).toEqual(CANCEL_EXTERNAL_CUTOVER_PROOFS_V1);
  });
  it('actual observed environment: 5 absent routine deployments block the transition',()=>{
    const x=fixture();
    const functions=x.functions.map((f,index)=>index===0?f:
      {...f,matching_overloads:0,owner_roles:null,
        public_execute:null,anon_execute:null,
        authenticated_execute:null,service_role_execute:null,
        api_executor_execute:null,commerce_executor_execute:null});
    const r=assess({...x,functions});
    expect(r.blockers.filter(b=>b.startsWith('protected function absent'))).toHaveLength(5);
    expect(r.releaseAuthorized).toBe(false);
  });
  it('actual observed service_role table INSERT+UPDATE+DELETE is an explicit blocker',()=>{
    const x=fixture();
    const r=assess({...x,entitlement_table:{
      ...x.entitlement_table,service_role_all_mutations:true,
    }});
    expect(r.blockers).toContain(
      'service_role direct entitlement DML is permitted or unknown',
    );
  });
  it.each(['true','null'] as const)(
    'fails closed when privileged service ledger ACL is %s',kind=>{
      const x=fixture();
      const r=assess({...x,entitlement_table:{
        ...x.entitlement_table,
        service_role_all_mutations:kind==='true'?true:null,
      }});
      expect(r.blockers.some(b=>b.includes('service_role direct'))).toBe(true);
    },
  );
  it('blocks regular-login DB owner and missing dedicated service accounts',()=>{
    const x=fixture();
    const roles=x.roles.map(r=>
      r.role_name==='myeongha_cancel_owner'?{...r,can_login:true}:
      r.role_name==='myeongha_cancel_executor'?{...r,role_exists:false}:r);
    const r=assess({...x,roles});
    expect(r.blockers.some(b=>b.includes('NOLOGIN function owner'))).toBe(true);
    expect(r.blockers.some(b=>b.includes('dedicated verifier/executor'))).toBe(true);
  });
  it('blocks role membership escalation to database owner',()=>{
    const x=fixture();
    const roles=x.roles.map(r=>
      r.role_name==='service_role'?{...r,member_of_dedicated_owner:true}:r);
    expect(assess({...x,roles}).blockers.some(b=>b.includes('impersonate owner')))
      .toBe(true);
  });
  it.each(['public_execute','service_role_execute',
    'commerce_executor_execute'] as const)(
    'blocks inherited PUBLIC, service and commerce routine execute grant %s',key=>{
      const x=fixture();
      const functions=x.functions.map((r,i)=>i===0?{...r,[key]:true}:r);
      expect(assess({...x,functions}).blockers.some(b=>b.includes(key))).toBe(true);
    },
  );
  it('blocks unexpected privileged function owner, overload and missing inventory',()=>{
    const x=fixture();
    const changed=x.functions.map((f,i)=>
      i===0?{...f,owner_roles:'postgres',matching_overloads:2}:f);
    const r=assess({...x,functions:changed});
    expect(r.blockers.some(b=>b.includes('overloaded'))).toBe(true);
    expect(assess({...x,functions:x.functions.slice(1)})
      .blockers).toContain('incomplete or duplicate protected function evidence');
  });
  it('rejects malformed evidence and lies about release authorization',()=>{
    expect(assess(null).releaseAuthorized).toBe(false);
    expect(assess({}).blockers).toHaveLength(1);
    expect(assess({...fixture(),release_authorized:true}).blockers)
      .toContain('catalogue evidence missing, stale or malformed');
  });
  it('never treats a PostgreSQL snapshot as proof of deployed secrets, owner custody, or payment correctness',()=>{
    const result=assess(fixture());
    expect(result.externalProofs).toHaveLength(7);
    expect(result.externalProofs.some(p=>p.includes('administrator secret'))).toBe(true);
    expect(result.externalProofs.some(p=>p.includes('real Reader payment'))).toBe(true);
  });
});
