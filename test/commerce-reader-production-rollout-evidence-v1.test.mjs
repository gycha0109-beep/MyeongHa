import {describe,it,expect,vi} from 'vitest';
import {
  COMMERCE_READER_STAGED_HISTORY_QUERY_V1 as HISTORY,
  COMMERCE_READER_PRIVATE_ACL_QUERY_V1 as ACL,
  COMMERCE_READER_PRIVATE_FUNCTION_ACL_QUERY_V1 as FUNCTION_ACL,
  COMMERCE_READER_EXPECTED_STAGED_VERSIONS_V1 as VERSIONS,
  inspectCommerceReaderProductionRolloutEvidenceV1 as inspect,
} from '../scripts/operations/commerce-reader-production-rollout-evidence-v1.mjs';

const keys=[
  'protectedAnswerBody','verifiedSajuSource','privateDeliveryAttempt',
  'scopedRefundDispatch','privateWithdrawalClaim',
];
const staged={
  protectedAnswerBody:'1950',
  verifiedSajuSource:'2110',
  privateDeliveryAttempt:'2140',
  scopedRefundDispatch:'2310',
  privateWithdrawalClaim:'2320',
};
const force=new Set(['protectedAnswerBody','verifiedSajuSource','privateDeliveryAttempt']);
function absent(k){return {
  schemaKey:k,tablePresent:false,ordinaryTable:false,
  rlsEnabled:false,rlsForced:false,anonDml:null,memberDml:null,
};}
function secure(k){return {
  schemaKey:k,tablePresent:true,ordinaryTable:true,
  rlsEnabled:true,rlsForced:force.has(k),
  anonDml:false,memberDml:false,
};}
const functionKeys=[
  'preparePaidDelivery','ackPaidDelivery','reserveRefundDispatch',
  'recordRefundResponse','confirmRefundDispatch',
];
function stub({versions=[],meta=keys.map(absent),leakFunction=null,authority={
  readOnly:true,completeVisibility:true,
},failQuery}={}){
  const calls=[];
  const client={query:vi.fn(async sql=>{
    calls.push(sql);
    if(sql===failQuery)throw Error('private connection secret');
    if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
    if(sql===HISTORY)return {rows:versions.map(version=>({version}))};
    if(sql===ACL)return {rows:meta};
    if(sql===FUNCTION_ACL)return {rows:functionKeys.map((key,i)=>{
      const present=versions.includes(i<2?'2140':'2310');
      return {functionKey:key,functionPresent:present,
        anonExecute:present?(leakFunction===key):null,
        memberExecute:present?false:null};
    })};
    return {rows:[]};
  })};
  return {client,calls};
}

describe('Commerce Reader 59 staged migration production ledger and ACL readiness',()=>{
  it('pinpoints exactly 59 staged versions 1740..2320',()=>{
    expect(VERSIONS).toHaveLength(59);
    expect(VERSIONS[0]).toBe('1740');
    expect(VERSIONS.at(-1)).toBe('2320');
    expect(new Set(VERSIONS).size).toBe(59);
    expect(HISTORY).toContain('supabase_migrations.schema_migrations');
    expect(ACL).toContain('pg_catalog.pg_class');
    expect(ACL).toContain('has_table_privilege');
    expect(ACL).toContain('relrowsecurity');
    expect(ACL).toContain('relforcerowsecurity');
    expect(FUNCTION_ACL).toContain('pg_catalog.pg_proc');
    expect(FUNCTION_ACL).toContain('has_function_privilege');
    for(const sql of [HISTORY,ACL,FUNCTION_ACL]){
      expect(sql).not.toMatch(/\b(insert|update|delete|alter|create|drop|grant|revoke|copy)\s+/iu);
      expect(sql).not.toMatch(/\bfrom\s+public\./iu);
    }
  });
  it('observes exact not-deployed staging without pretending it is a rollout permit',async()=>{
    const f=stub();
    const r=await inspect(f.client);
    expect(r).toMatchObject({
      schemaVersion:'commerce-reader-production-rollout-evidence-v1',
      state:'staged_unmounted_hold',
      expectedStagedMigrations:59,appliedStagedMigrations:0,
      productSaleAuthorized:false,paidReaderDeliveryAuthorized:false,
      customerRefundAuthorized:false,productionMigrationAuthorized:false,
      liveAuthorized:false,writesPerformed:false,
    });
    expect(r.missingVersions).toHaveLength(59);
    expect(r.missingTables).toHaveLength(5);
    expect(r.schemaHistoryMismatch).toEqual([]);
    expect(f.calls).toEqual([
      'begin isolation level repeatable read read only',
      "set local statement_timeout='10000ms'",
      expect.stringContaining('pg_catalog.pg_roles'),HISTORY,ACL,FUNCTION_ACL,'rollback',
    ]);
  });
  it('even 59 installed versions and hardened tables remain unapproved',async()=>{
    const r=await inspect(stub({
      versions:[...VERSIONS],meta:keys.map(secure),
    }).client);
    expect(r).toMatchObject({
      state:'schema_present_unverified',
      appliedStagedMigrations:59,missingVersions:[],
      missingTables:[],unsafeAclTables:[],schemaHistoryMismatch:[],
      missingFunctions:[],unsafeFunctionGrants:[],functionHistoryMismatch:[],
      productSaleAuthorized:false,paidReaderDeliveryAuthorized:false,
      customerRefundAuthorized:false,productionMigrationAuthorized:false,
      liveAuthorized:false,
    });
  });
  it('flags privilege leakage on anon and authenticated separately',async()=>{
    for(const field of ['anonDml','memberDml']){
      const meta=keys.map(absent);
      meta[0]={...secure(keys[0]),[field]:true};
      const r=await inspect(stub({
        versions:['1950'],meta,
      }).client);
      expect(r.unsafeAclTables).toEqual(['protectedAnswerBody']);
      expect(r.state).toBe('staged_partial_or_unsafe_hold');
      expect(r.productionMigrationAuthorized).toBe(false);
    }
  });
  it('flags missing FORCE RLS only on the three migrations that specify it',async()=>{
    const meta=keys.map(absent);
    meta[1]={...secure('verifiedSajuSource'),rlsForced:false};
    const r=await inspect(stub({versions:['2110'],meta}).client);
    expect(r.unsafeAclTables).toEqual(['verifiedSajuSource']);
    const second=keys.map(absent);
    second[3]={...secure('scopedRefundDispatch'),rlsForced:false};
    const result=await inspect(stub({versions:['2310'],meta:second}).client);
    expect(result.unsafeAclTables).toEqual([]);
  });
  it('rejects table present without migration history or history without a table',async()=>{
    const r=await inspect(stub({meta:[
      secure(keys[0]),...keys.slice(1).map(absent),
    ]}).client);
    expect(r.schemaHistoryMismatch).toEqual(['protectedAnswerBody']);
    const q=await inspect(stub({versions:['2140']}).client);
    expect(q.schemaHistoryMismatch).toEqual(['privateDeliveryAttempt']);
    expect(q.state).toBe('staged_partial_or_unsafe_hold');
  });
  it('rejects a present table without RLS or with unsupported table type',async()=>{
    for(const patch of [{rlsEnabled:false},{ordinaryTable:false}]){
      const meta=keys.map(absent);
      meta[4]={...secure('privateWithdrawalClaim'),...patch};
      const r=await inspect(stub({versions:['2320'],meta}).client);
      expect(r.unsafeAclTables).toEqual(['privateWithdrawalClaim']);
    }
  });
  it.each([
    ['duplicate',['1950','1950']],
    ['out of range',['1730']],
    ['fake intermediate',['1745']],
    ['non-numeric',['abcd']],
  ])('rejects untrusted history %s',async(_,versions)=>{
    const f=stub({versions});
    await expect(inspect(f.client)).rejects
      .toThrow('COMMERCE_READER_ROLLOUT_HISTORY_UNTRUSTED');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rejects >59 history rows, including duplicates, without truncation',async()=>{
    const f=stub({versions:[...VERSIONS,'1740']});
    await expect(inspect(f.client)).rejects
      .toThrow('COMMERCE_READER_ROLLOUT_HISTORY_UNTRUSTED');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it.each([
    ['incomplete',keys.slice(1).map(absent)],
    ['unknown',[...keys.slice(1).map(absent),absent('unexpectedKey')]],
    ['duplicate',[absent(keys[0]),absent(keys[0]),...keys.slice(2).map(absent)]],
    ['leakedNull',{...absent(keys[0]),anonDml:true}],
  ])('fails closed for untrusted catalog metadata: %s',async(label,meta)=>{
    const m=Array.isArray(meta)?meta:[meta,...keys.slice(1).map(absent)];
    const f=stub({meta:m});
    await expect(inspect(f.client)).rejects
      .toThrow('COMMERCE_READER_ROLLOUT_ACL_UNTRUSTED');
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('refuses incomplete DB role authority before any migration query',async()=>{
    const f=stub({authority:{readOnly:true,completeVisibility:false}});
    await expect(inspect(f.client)).rejects.toThrow(
      'COMMERCE_READER_ROLLOUT_DB_AUDIT_AUTHORITY_REQUIRED');
    expect(f.calls).not.toContain(HISTORY);
    expect(f.calls).not.toContain(ACL);
    expect(f.calls.at(-1)).toBe('rollback');
  });
  it('rejects a publicly executable privileged Reader refund function',async()=>{
    const r=await inspect(stub({versions:['2310'],
      leakFunction:'reserveRefundDispatch'}).client);
    expect(r.unsafeFunctionGrants).toContain('reserveRefundDispatch');
    expect(r.productionMigrationAuthorized).toBe(false);
    expect(r.state).toBe('staged_partial_or_unsafe_hold');
  });
  it.each([HISTORY,ACL,FUNCTION_ACL])('rolls back after private SQL failure',async query=>{
    const f=stub({failQuery:query});
    await expect(inspect(f.client)).rejects.toThrow();
    expect(f.calls.at(-1)).toBe('rollback');
  });
});
