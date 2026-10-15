import {describe,expect,it,vi} from 'vitest';
import {
  auditOfflinePrivateCancelRoleDenialsD3e18,
  PRIVATE_CANCEL_DIRECT_ROUTINES_D3E18,
  PRIVATE_CANCEL_FUNCTION_CATALOG_READ_SQL_D3E18,
  PRIVATE_CANCEL_OTHER_APP_ROLES_D3E18,
  PRIVATE_CANCEL_ROLE_CATALOG_READ_SQL_D3E18,
  type PrivateCancelD3e18RoleNames,
} from '../apps/api/src/official-reader-portone-cancel-private-role-isolation-audit-v1.js';

const serviceRoles: PrivateCancelD3e18RoleNames = Object.freeze({
  verifier:'myeongha_cancel_verifier_offline',
  executor:'myeongha_cancel_executor_offline',
  owner:'myeongha_cancel_owner_offline',
});
const allRoles = [
  serviceRoles.verifier,serviceRoles.executor,serviceRoles.owner,
  ...PRIVATE_CANCEL_OTHER_APP_ROLES_D3E18,
];
const unprivileged = allRoles.filter(r => r !== serviceRoles.owner);
const routines = [...PRIVATE_CANCEL_DIRECT_ROUTINES_D3E18];

function fakeCatalog() {
  const roles:Record<string,unknown>[] = allRoles.map(roleName => ({
    roleName,canLogin: !PRIVATE_CANCEL_OTHER_APP_ROLES_D3E18.some(x => x === roleName),
    superuser:false,bypassRls:false,createRole:false,createDb:false,
    memberOfOwner:roleName === serviceRoles.owner,
  }));
  const functionRows:Record<string,unknown>[] = unprivileged.flatMap(roleName =>
    routines.map((routineName,index) => ({
      roleName,routineName,schemaName:'public',
      routineOid:String(30000+index),canExecute:false,
    })),
  );
  const query=vi.fn(async(sql:string,params:readonly unknown[])=>{
    if (sql === PRIVATE_CANCEL_ROLE_CATALOG_READ_SQL_D3E18) {
      expect(params).toEqual([allRoles,serviceRoles.owner]);
      return {rows:roles};
    }
    if (sql === PRIVATE_CANCEL_FUNCTION_CATALOG_READ_SQL_D3E18) {
      expect(params).toEqual([unprivileged,routines]);
      return {rows:functionRows};
    }
    throw new Error('unexpected SQL');
  });
  return {roles,functionRows,query,run:(override:unknown=serviceRoles)=>
    auditOfflinePrivateCancelRoleDenialsD3e18({
      serviceRoles:override as PrivateCancelD3e18RoleNames,
      catalog:{query},
    })};
}

describe('D3e18 read-only OFFLINE separate-service SQL privilege denial (no live DB)',()=>{
  it('checks all protected direct function calls for ALL non-owner logins',async()=>{
    const f=fakeCatalog();
    await expect(f.run()).resolves.toEqual({
      mode:'offline-catalog-evidence-only',
      checkedRoleCount:9,
      checkedRoutineCount:6,
      deniedDirectCalls:48,
      liveRoleIsolationVerified:false,
    });
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it('read-only SQL uses PostgreSQL effective grants plus SET ROLE membership',()=>{
    expect(PRIVATE_CANCEL_ROLE_CATALOG_READ_SQL_D3E18).toContain('pg_has_role');
    expect(PRIVATE_CANCEL_ROLE_CATALOG_READ_SQL_D3E18).toContain("'MEMBER'");
    expect(PRIVATE_CANCEL_FUNCTION_CATALOG_READ_SQL_D3E18).toContain('has_function_privilege');
    expect(PRIVATE_CANCEL_FUNCTION_CATALOG_READ_SQL_D3E18).toContain("'EXECUTE'");
    for(const sql of [
      PRIVATE_CANCEL_ROLE_CATALOG_READ_SQL_D3E18,
      PRIVATE_CANCEL_FUNCTION_CATALOG_READ_SQL_D3E18,
    ]){
      expect(sql).toMatch(/^SELECT /u);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|GRANT|REVOKE|ALTER|DROP|SET)\s+(?:ROLE|TABLE|FUNCTION|POLICY)\b/iu);
      expect(sql).toContain('$1::text[]');
    }
  });

  it.each(routines)('refuses accidental direct SQL EXECUTE of %s',async routine=>{
    const f=fakeCatalog();
    const row=f.functionRows.find(x=>x.roleName===serviceRoles.executor
      &&x.routineName===routine);
    expect(row).toBeDefined();
    row!.canExecute=true;
    await expect(f.run()).rejects.toThrow('direct protected function execution');
  });

  it('rejects direct EXECUTE from ordinary API, Commerce, logged-in, service and Chat roles',async()=>{
    for(const roleName of PRIVATE_CANCEL_OTHER_APP_ROLES_D3E18){
      const f=fakeCatalog();
      f.functionRows.find(x=>x.roleName===roleName)!.canExecute=true;
      await expect(f.run()).rejects.toThrow('direct protected function execution');
    }
  });

  it('detects owner impersonation via inherited OR SET ROLE membership, even with direct DENY',async()=>{
    for(const roleName of [serviceRoles.verifier,serviceRoles.executor,...PRIVATE_CANCEL_OTHER_APP_ROLES_D3E18]){
      const f=fakeCatalog();
      f.roles.find(x=>x.roleName===roleName)!.memberOfOwner=true;
      await expect(f.run()).rejects.toThrow('can become database owner');
    }
  });

  it('rejects owner credential reuse, shared service identities and privileged defaults',async()=>{
    const f=fakeCatalog();
    for(const wrong of [
      {...serviceRoles,executor:serviceRoles.verifier},
      {...serviceRoles,executor:serviceRoles.owner},
      {...serviceRoles,verifier:'service_role'},
      {...serviceRoles,owner:'postgres'},
      {...serviceRoles,verifier:'role; DROP FUNCTION'},
    ]){
      await expect(f.run(wrong)).rejects.toThrow('identity');
    }
  });

  it('fails if runtime identities gain privileged PostgreSQL attributes',async()=>{
    for(const field of ['superuser','bypassRls','createRole','createDb']){
      const f=fakeCatalog();
      f.roles.find(x=>x.roleName===serviceRoles.executor)![field]=true;
      await expect(f.run()).rejects.toThrow('privileged');
    }
    const f=fakeCatalog();
    f.roles.find(x=>x.roleName===serviceRoles.verifier)!.canLogin=false;
    await expect(f.run()).rejects.toThrow('dedicated service login');
  });

  it('never assumes missing roles, functions, privilege rows or catalog columns mean deny',async()=>{
    const cases:Array<(f:ReturnType<typeof fakeCatalog>)=>void>=[
      f=>{f.roles.pop();},
      f=>{f.roles.push({...f.roles[0]!});},
      f=>{f.functionRows.pop();},
      f=>{f.functionRows.push({...f.functionRows[0]!});},
      f=>{delete f.roles[0]!.memberOfOwner;},
      f=>{delete f.functionRows[0]!.canExecute;},
      f=>{f.functionRows[0]!.canExecute=null;},
      f=>{f.functionRows[0]!.schemaName='pg_temp';},
      f=>{f.functionRows[0]!.routineOid='???';},
      f=>{f.functionRows[0]!.routineName='internal_unreviewed_helper';},
      f=>{f.functionRows[0]!.roleName='unknown_external_worker';},
    ];
    for(const change of cases){
      const f=fakeCatalog(); change(f);
      await expect(f.run()).rejects.toThrow('DENY');
    }
  });

  it('rejects same-name overloaded function, different OIDs, unexpected extra schema',async()=>{
    const f=fakeCatalog();
    f.functionRows[1]!.routineOid='99999';
    await expect(f.run()).rejects.toThrow('inconsistent protected routine identity');
    const g=fakeCatalog();
    g.functionRows[0]!.schemaName='other_schema';
    await expect(g.run()).rejects.toThrow('unexpected function identity');
    const h=fakeCatalog();
    h.functionRows[0]!.routineName=h.functionRows[1]!.routineName;
    await expect(h.run()).rejects.toThrow('overloaded');
  });

  it('catalogue outage, forged optional audit fields and missing dependencies deny',async()=>{
    const f=fakeCatalog();
    f.query.mockRejectedValueOnce(new Error('connection details'));
    await expect(f.run()).rejects.toThrow('catalogue inaccessible');
    await expect(auditOfflinePrivateCancelRoleDenialsD3e18({
      serviceRoles, catalog:null as never,
    })).rejects.toThrow('catalogue');
    const g=fakeCatalog();
    g.functionRows[0]!.canExecute='false'; // textual claims do not mean denial
    await expect(g.run()).rejects.toThrow('malformed privilege');
  });

  it('the offline database owner is NOT falsely claimed to be SQL-denied',async()=>{
    const f=fakeCatalog();
    const snapshot=await f.run();
    expect(snapshot.liveRoleIsolationVerified).toBe(false);
    expect(f.functionRows.some(row=>row.roleName===serviceRoles.owner)).toBe(false);
    // Owner can call privileged SQL in a real DB. Owner isolation requires
    // separately attested OS/DB credentials, independent policy and approval.
  });
});
