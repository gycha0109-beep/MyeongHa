import { describe, expect, it } from 'vitest';
import {
  SEYEON_GOVERNED_DB_LOGIN_V1,
  GOVERNED_LOGIN_PREFLIGHT_SQL_V1,
  SeyeonGovernedDbBoundaryErrorV1,
  createSeyeonGovernedPostgresPoolFromDriverV1,
  parseSeyeonGovernedDbConfigV1,
  verifySeyeonGovernedLoginPreflightV1,
} from './seyeon-governed-postgres-pool-v1.js';
import {
  createSeyeonGovernedCostTransactionRunnerV1,
} from './seyeon-governed-cost-transaction-v1.js';
import type {
  NodePostgresDriverClientV1,
  NodePostgresDriverPoolV1,
} from './node-postgres-subject-pool.js';

const MEMBER_ID='a0000000-0000-0000-0000-000000000001';
const GOV_URL='postgresql://myeongha_seyeon_governed_login:unique-secret@db.example.test:5432/postgres?sslmode=verify-full';
const BASE_URL='postgresql://myeongha_login:ordinary-secret@db.example.test:5432/postgres?sslmode=require';

function safeRow() {
  return {
    sessionUser:SEYEON_GOVERNED_DB_LOGIN_V1,
    currentUser:SEYEON_GOVERNED_DB_LOGIN_V1,
    canLogin:true,isSuper:false,canBypassRls:false,canInherit:false,
    canCreateDb:false,canCreateRole:false,
    canSetGovernedRole:true,isLegacyMember:false,canSetLegacyRole:false,
    isCostOwnerMember:false,otherMemberships:0,
    canLegacyStart:false,canLegacySettle:false,canLegacyRecord:false,
    canDirectLedger:false,canDirectBudget:false,canDirectRateCard:false,
  };
}
function driver(input: {preflight?:Readonly<Record<string,unknown>>; failSql?:string}={}) {
  const calls: Array<{text:string;values?:readonly unknown[]}>=[];
  const released: Array<Error|undefined>=[];
  let poolEnded=false;
  const client:NodePostgresDriverClientV1={
    async query(text, values) {
      calls.push({text,...(values===undefined?{}:{values})});
      if (input.failSql && text.includes(input.failSql))
        throw new Error('database command rejected');
      if(text===GOVERNED_LOGIN_PREFLIGHT_SQL_V1)
        return {rows:[input.preflight??safeRow()]};
      if(text.startsWith('select subject_id::text'))
        return {rows:[{subjectId:MEMBER_ID,subjectKind:'member'}]};
      return {rows:[]};
    },
    release(error) { released.push(error); },
  };
  const pool:NodePostgresDriverPoolV1={
    async connect(){return client;},
    async end(){poolEnded=true;},
  };
  return {pool,calls,released,get poolEnded(){return poolEnded;}};
}
const evidence={kind:'member',verifiedAuthUserId:'a1000000-0000-0000-0000-000000000001'} as const;

describe('Se-yeon D3B2B-3B2 isolated governed credential boundary',()=>{
  it('requires a different project-bound login, password, and strict TLS source',()=>{
    const input={
      ordinaryDatabaseUrl:BASE_URL,
      ordinaryDatabasePrincipal:'myeongha_login',
      rootCertificatePem:'offline-test-root',
      env:{
        MYEONGHA_SEYEON_GOVERNED_DATABASE_URL:GOV_URL,
        MYEONGHA_SEYEON_GOVERNED_DATABASE_PRINCIPAL:SEYEON_GOVERNED_DB_LOGIN_V1,
      },
    };
    expect(parseSeyeonGovernedDbConfigV1(input).databasePrincipal)
      .toBe(SEYEON_GOVERNED_DB_LOGIN_V1);
    expect(()=>parseSeyeonGovernedDbConfigV1({...input,env:{
      ...input.env,MYEONGHA_SEYEON_GOVERNED_DATABASE_URL:BASE_URL,
    }})).toThrow(SeyeonGovernedDbBoundaryErrorV1);
    expect(()=>parseSeyeonGovernedDbConfigV1({...input,env:{
      ...input.env,
      MYEONGHA_SEYEON_GOVERNED_DATABASE_URL:GOV_URL.replace('unique-secret','ordinary-secret'),
    }})).toThrow(SeyeonGovernedDbBoundaryErrorV1);
    expect(()=>parseSeyeonGovernedDbConfigV1({...input,env:{
      ...input.env,MYEONGHA_SEYEON_GOVERNED_DATABASE_URL:GOV_URL.replace('verify-full','disable'),
    }})).toThrow(SeyeonGovernedDbBoundaryErrorV1);
    expect(()=>parseSeyeonGovernedDbConfigV1({...input,env:{
      ...input.env,MYEONGHA_SEYEON_GOVERNED_DATABASE_URL:GOV_URL.replace('db.example.test','elsewhere.test'),
    }})).toThrow(SeyeonGovernedDbBoundaryErrorV1);
    expect(()=>parseSeyeonGovernedDbConfigV1({...input,env:{
      ...input.env,MYEONGHA_SEYEON_GOVERNED_DATABASE_PRINCIPAL:'myeongha_login',
    }})).toThrow(SeyeonGovernedDbBoundaryErrorV1);
  });

  it('fails closed for every unsafe role flag, membership, direct SQL or legacy function grant',()=>{
    for(const [key,value] of [
      ['sessionUser','myeongha_login'],['currentUser','postgres'],
      ['canLogin',false],['isSuper',true],['canBypassRls',true],
      ['canInherit',true],['canCreateDb',true],['canCreateRole',true],
      ['otherMemberships',1],['canSetGovernedRole',false],
      ['isLegacyMember',true],['canSetLegacyRole',true],
      ['isCostOwnerMember',true],['canLegacyStart',true],
      ['canLegacySettle',true],['canLegacyRecord',true],
      ['canDirectLedger',true],['canDirectBudget',true],
      ['canDirectRateCard',true],
    ] as const) {
      expect(()=>verifySeyeonGovernedLoginPreflightV1(
        [{...safeRow(),[key]:value}],SEYEON_GOVERNED_DB_LOGIN_V1,
      ),key).toThrow(SeyeonGovernedDbBoundaryErrorV1);
    }
    expect(()=>verifySeyeonGovernedLoginPreflightV1(
      [],SEYEON_GOVERNED_DB_LOGIN_V1,
    )).toThrow(SeyeonGovernedDbBoundaryErrorV1);
    expect(()=>verifySeyeonGovernedLoginPreflightV1(
      [safeRow(),safeRow()],SEYEON_GOVERNED_DB_LOGIN_V1,
    )).toThrow(SeyeonGovernedDbBoundaryErrorV1);
    verifySeyeonGovernedLoginPreflightV1(
      [safeRow()],SEYEON_GOVERNED_DB_LOGIN_V1,
    );
  });

  it('checks the login before BEGIN on every checkout and discards unsafe connections',async()=>{
    const safe=driver();
    const p=createSeyeonGovernedPostgresPoolFromDriverV1({
      driverPool:safe.pool,expectedPrincipal:SEYEON_GOVERNED_DB_LOGIN_V1,
    });
    const a=await p.connect();a.release();
    const b=await p.connect();b.release();
    expect(safe.calls).toHaveLength(2);
    expect(safe.calls.every(c=>c.text===GOVERNED_LOGIN_PREFLIGHT_SQL_V1)).toBe(true);
    expect(safe.calls[0]?.values).toEqual([
      'myeongha_seyeon_governed_executor','myeongha_api_executor',
    ]);
    await p.close();
    expect(safe.poolEnded).toBe(true);

    const bad=driver({preflight:{...safeRow(),canLegacyRecord:true}});
    const bp=createSeyeonGovernedPostgresPoolFromDriverV1({
      driverPool:bad.pool,expectedPrincipal:SEYEON_GOVERNED_DB_LOGIN_V1,
    });
    await expect(bp.connect()).rejects.toThrow(SeyeonGovernedDbBoundaryErrorV1);
    expect(bad.released[0]).toBeInstanceOf(Error);
    expect(bad.calls).toHaveLength(1);
  });

  it('uses the fixed governed role and canonical Subject; closes transaction and connection',async()=>{
    const d=driver();
    const p=createSeyeonGovernedPostgresPoolFromDriverV1({
      driverPool:d.pool,expectedPrincipal:SEYEON_GOVERNED_DB_LOGIN_V1,
    });
    const runner=createSeyeonGovernedCostTransactionRunnerV1({
      pool:p,verifiedEvidence:evidence,
    });
    const actual=await runner.run(MEMBER_ID,async(_client,subject)=>{
      expect(subject.subjectId).toBe(MEMBER_ID);
      return 'authorized';
    });
    expect(actual).toBe('authorized');
    expect(d.calls.map(c=>c.text)).toEqual([
      GOVERNED_LOGIN_PREFLIGHT_SQL_V1,
      'BEGIN','SET LOCAL ROLE myeongha_seyeon_governed_executor',
      expect.stringContaining('public.begin_member_subject_context_v1'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      'COMMIT',
    ]);
    expect(d.released).toEqual([undefined]);
    expect(d.calls.some(c=>c.text.includes('SET LOCAL ROLE myeongha_api_executor'))).toBe(false);
  });

  it('never dispatches an operation after preflight failure or Subject mismatch',async()=>{
    const bad=driver({preflight:{...safeRow(),canSetLegacyRole:true}});
    const badPool=createSeyeonGovernedPostgresPoolFromDriverV1({
      driverPool:bad.pool,expectedPrincipal:SEYEON_GOVERNED_DB_LOGIN_V1,
    });
    const badRunner=createSeyeonGovernedCostTransactionRunnerV1({
      pool:badPool,verifiedEvidence:evidence,
    });
    let count=0;
    await expect(badRunner.run(MEMBER_ID,()=>{
      count++;return true;
    })).rejects.toThrow(SeyeonGovernedDbBoundaryErrorV1);
    expect(count).toBe(0);
    expect(bad.calls).toHaveLength(1);
    const good=driver();
    const p=createSeyeonGovernedPostgresPoolFromDriverV1({
      driverPool:good.pool,expectedPrincipal:SEYEON_GOVERNED_DB_LOGIN_V1,
    });
    const runner=createSeyeonGovernedCostTransactionRunnerV1({
      pool:p,verifiedEvidence:evidence,
    });
    await expect(runner.run('a0000000-0000-0000-0000-000000000099',()=>{
      count++;return true;
    })).rejects.toThrow(/canonical Subject changed/);
    expect(count).toBe(0);
    expect(good.calls.at(-1)?.text).toBe('ROLLBACK');
    expect(good.released).toEqual([undefined]);
  });

  it('rolls back exactly once when DB command fails before any paid operation',async()=>{
    const d=driver({failSql:'assert_myeongha_subject_context_v1'});
    const p=createSeyeonGovernedPostgresPoolFromDriverV1({
      driverPool:d.pool,expectedPrincipal:SEYEON_GOVERNED_DB_LOGIN_V1,
    });
    const runner=createSeyeonGovernedCostTransactionRunnerV1({
      pool:p,verifiedEvidence:evidence,
    });
    let count=0;
    await expect(runner.run(MEMBER_ID,()=>{
      count++;return true;
    })).rejects.toThrow('database command rejected');
    expect(count).toBe(0);
    expect(d.calls.map(c=>c.text).filter(t=>t==='ROLLBACK')).toHaveLength(1);
    expect(d.released).toEqual([undefined]);
  });
});
