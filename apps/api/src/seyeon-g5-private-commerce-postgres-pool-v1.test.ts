import { describe,expect,it } from 'vitest';
import type { NodePostgresDriverPoolV1, NodePostgresDriverClientV1 } from './node-postgres-subject-pool.js';
import {
  SEYEON_G5_PRIVATE_COMMERCE_DB_V1 as G5,
  SEYEON_G5_PRIVATE_COMMERCE_LOGIN_PREFLIGHT_SQL_V1,
  SEYEON_G5_PRIVATE_COMMERCE_ROLE_PREFLIGHT_SQL_V1,
  SeyeonG5PrivateCommerceBoundaryErrorV1,
  SeyeonG5PrivateCommercePostgresPoolV1,
  parseSeyeonG5PrivateCommerceConfigV1,
  verifySeyeonG5PrivateCommerceLoginPreflightV1,
  verifySeyeonG5PrivateCommerceRolePreflightV1,
} from './seyeon-g5-private-commerce-postgres-pool-v1.js';

const host='db.example.test:5432/postgres?sslmode=verify-full';
const ordinary='postgresql://member:fixture-a@'+host;
const dedicated='postgresql://'+G5.login+':fixture-b@'+host;
const settings=(value:string=dedicated)=>({
  env:{
    [G5.urlEnv]:value,
    [G5.principalEnv]:G5.login,
  },
  ordinaryDatabaseUrl:ordinary,
  rootCertificatePem:'synthetic-fixture-root',
});
const loginRow=()=>({
  sessionUser:G5.login,currentUser:G5.login,
  canLogin:true,canInherit:false,isSuper:false,canBypassRls:false,
  canCreateDb:false,canCreateRole:false,membershipCount:1,directCommerceMembershipCount:1,
  commerceMember:true,apiMember:false,directSettle:false,
  directCatalog:false,directLedgerUpdate:false,
});
const roleRow=()=>({
  effectiveRole:G5.executionRole,canSettle:true,canCatalog:true,
  canDirectLedgerUpdate:false,
});
function driver(input:{login?:Record<string,unknown>;role?:Record<string,unknown>;failSql?:string}={}) {
  const calls:string[]=[];
  const releases:Array<Error|undefined>=[];
  let ended=false;
  const client:NodePostgresDriverClientV1={
    async query(sql) {
      calls.push(sql);
      if(input.failSql===sql) throw new Error('synthetic SQL denial');
      if(sql===SEYEON_G5_PRIVATE_COMMERCE_LOGIN_PREFLIGHT_SQL_V1)
        return {rows:[input.login??loginRow()]};
      if(sql===SEYEON_G5_PRIVATE_COMMERCE_ROLE_PREFLIGHT_SQL_V1)
        return {rows:[input.role??roleRow()]};
      return {rows:[]};
    },
    release(error){releases.push(error);},
  };
  const pool:NodePostgresDriverPoolV1={
    async connect(){return client;},
    async end(){ended=true;},
  };
  return {pool,calls,releases,get ended(){return ended;}};
}

describe('G5 private Commerce physical credential preflight (unmounted)',()=>{
  it('requires a distinct login, distinct password, matching target and TLS CA',()=>{
    expect(parseSeyeonG5PrivateCommerceConfigV1(settings()).databasePrincipal).toBe(G5.login);
    const invalid=[
      ordinary,
      dedicated.replace('fixture-b','fixture-a'),
      dedicated.replace(G5.login,'member'),
      dedicated.replace('verify-full','disable'),
      dedicated.replace('db.example.test','other.example.test'),
      dedicated.replace(':5432',':6543'),
      dedicated.replace('/postgres?','/other?'),
    ];
    for(const source of invalid){
      expect(()=>parseSeyeonG5PrivateCommerceConfigV1(settings(source)),source)
        .toThrow(SeyeonG5PrivateCommerceBoundaryErrorV1);
    }
    expect(()=>parseSeyeonG5PrivateCommerceConfigV1({...settings(),rootCertificatePem:''}))
      .toThrow(SeyeonG5PrivateCommerceBoundaryErrorV1);
    const supavisor='aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
    const project='cnsfpcdiyofqvhpcegfc';
    expect(parseSeyeonG5PrivateCommerceConfigV1({
      ...settings(),
      env:{[G5.urlEnv]:'postgresql://'+G5.login+'.'+project+':fixture-b@'+supavisor,
        [G5.principalEnv]:G5.login},
      ordinaryDatabaseUrl:'postgresql://member.'+project+':fixture-a@'+supavisor,
    }).databasePrincipal).toBe(G5.login);
  });

  it('denies privileged/ordinary/shared LOGIN before any SQL transaction',()=>{
    for(const [field,value] of [
      ['sessionUser','member'],['currentUser','postgres'],['canLogin',false],
      ['canInherit',true],['isSuper',true],['canBypassRls',true],
      ['canCreateDb',true],['canCreateRole',true],['membershipCount',2],
      ['directCommerceMembershipCount',0],
      ['commerceMember',false],['apiMember',true],['directSettle',true],
      ['directCatalog',true],['directLedgerUpdate',true],
    ] as const){
      expect(()=>verifySeyeonG5PrivateCommerceLoginPreflightV1([
        {...loginRow(),[field]:value},
      ]),field).toThrow(SeyeonG5PrivateCommerceBoundaryErrorV1);
    }
    expect(()=>verifySeyeonG5PrivateCommerceLoginPreflightV1([])).toThrow();
    verifySeyeonG5PrivateCommerceLoginPreflightV1([loginRow()]);
  });

  it('denies role switch, unavailable private RPCs and direct ledger writes',()=>{
    for(const invalid of [
      {...roleRow(),effectiveRole:'myeongha_api_executor'},
      {...roleRow(),canSettle:false},
      {...roleRow(),canCatalog:false},
      {...roleRow(),canDirectLedgerUpdate:true},
    ]){
      expect(()=>verifySeyeonG5PrivateCommerceRolePreflightV1([invalid]))
        .toThrow(SeyeonG5PrivateCommerceBoundaryErrorV1);
    }
    verifySeyeonG5PrivateCommerceRolePreflightV1([roleRow()]);
  });

  it('checks both DB login and SET LOCAL ROLE on each checkout, then returns a clean connection',async()=>{
    const t=driver();
    const pool=new SeyeonG5PrivateCommercePostgresPoolV1(t.pool);
    const c1=await pool.connect();
    await c1.query('select 1');
    c1.release();
    const c2=await pool.connect();c2.release();
    expect(t.calls.slice(0,5)).toEqual([
      SEYEON_G5_PRIVATE_COMMERCE_LOGIN_PREFLIGHT_SQL_V1,
      'BEGIN','SET LOCAL ROLE myeongha_commerce_internal_executor',
      SEYEON_G5_PRIVATE_COMMERCE_ROLE_PREFLIGHT_SQL_V1,'ROLLBACK',
    ]);
    expect(t.calls.filter(c=>c===SEYEON_G5_PRIVATE_COMMERCE_LOGIN_PREFLIGHT_SQL_V1))
      .toHaveLength(2);
    expect(t.releases).toEqual([undefined,undefined]);
    await pool.close();
    expect(t.ended).toBe(true);
  });

  it('discards a login without expected privileges before entering transaction',async()=>{
    const t=driver({login:{...loginRow(),apiMember:true}});
    const pool=new SeyeonG5PrivateCommercePostgresPoolV1(t.pool);
    await expect(pool.connect()).rejects.toThrow(SeyeonG5PrivateCommerceBoundaryErrorV1);
    expect(t.calls).toHaveLength(1);
    expect(t.releases).toHaveLength(1);
    expect(t.releases[0]).toBeInstanceOf(Error);
  });

  it('rolls back and discards the connection when private role proof fails',async()=>{
    const t=driver({role:{...roleRow(),canCatalog:false}});
    await expect(new SeyeonG5PrivateCommercePostgresPoolV1(t.pool).connect())
      .rejects.toThrow(SeyeonG5PrivateCommerceBoundaryErrorV1);
    expect(t.calls.slice(-1)).toEqual(['ROLLBACK']);
    expect(t.releases[0]).toBeInstanceOf(Error);
  });
});
