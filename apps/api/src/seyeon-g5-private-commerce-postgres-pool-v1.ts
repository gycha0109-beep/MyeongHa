// Watchtower-Track: security
// Separate credential boundary only. No Production mount, scheduler or provider.
import { Pool } from 'pg';
import {
  buildProductionNodePostgresPoolConfigV1,
  type NodePostgresDriverPoolV1,
  type NodePostgresSubjectPoolOptionsV1,
} from './node-postgres-subject-pool.js';
import type { PostgresSubjectConnectionV1, PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
  type ProductionPostgresRuntimeConfigV1,
} from './production-user-data-runtime-config.js';

export const SEYEON_G5_PRIVATE_COMMERCE_DB_V1 = Object.freeze({
  login: 'myeongha_seyeon_g5_commerce_login',
  executionRole: 'myeongha_commerce_internal_executor',
  urlEnv: 'MYEONGHA_SEYEON_G5_PRIVATE_DATABASE_URL',
  principalEnv: 'MYEONGHA_SEYEON_G5_PRIVATE_DATABASE_PRINCIPAL',
  productionMounted: false,
  scheduled: false,
} as const);

type Env = Readonly<Record<string, string | undefined>>;
export type SeyeonG5PrivateCommerceConfigV1 = Readonly<{
  databaseUrl: string;
  databasePrincipal: typeof SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login;
  rootCertificatePem: string;
}>;

export class SeyeonG5PrivateCommerceBoundaryErrorV1 extends Error {
  constructor(readonly code: 'INVALID_CONFIG'|'INVALID_LOGIN'|'UNSAFE_LOGIN'|
    'EXCESS_AUTHORITY'|'MISSING_AUTHORITY'|'INVALID_PROBE', message: string) {
    super(message);
    this.name = 'SeyeonG5PrivateCommerceBoundaryErrorV1';
  }
}
const fail = (code:SeyeonG5PrivateCommerceBoundaryErrorV1['code'],message:string):never => {
  throw new SeyeonG5PrivateCommerceBoundaryErrorV1(code,message);
};
function url(source:string):URL {
  let parsed:URL;
  try { parsed=new URL(source); }
  catch { return fail('INVALID_CONFIG','G5 private PostgreSQL URL is invalid.'); }
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||
     !parsed.hostname||!parsed.username||!parsed.password||
     !['require','verify-full'].includes(parsed.searchParams.get('sslmode')??'')) {
    return fail('INVALID_CONFIG','G5 private PostgreSQL requires login credentials and strict TLS source.');
  }
  return parsed;
}

/** Pure validation; does not read or provision Production credentials. */
export function parseSeyeonG5PrivateCommerceConfigV1(input:Readonly<{
  env:Env; ordinaryDatabaseUrl:string; rootCertificatePem:string;
}>):SeyeonG5PrivateCommerceConfigV1 {
  const raw=input.env[SEYEON_G5_PRIVATE_COMMERCE_DB_V1.urlEnv];
  const principal=input.env[SEYEON_G5_PRIVATE_COMMERCE_DB_V1.principalEnv];
  if(!raw || principal!==SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login ||
     !input.ordinaryDatabaseUrl || !input.rootCertificatePem.trim()) {
    return fail('INVALID_CONFIG','G5 dedicated Commerce credential and pinned TLS CA are required.');
  }
  const dedicated=url(raw);
  const ordinary=url(input.ordinaryDatabaseUrl);
  const qualified=SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login+'.'+MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF;
  const username=decodeURIComponent(dedicated.username);
  const pooler=/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/u.test(dedicated.hostname)
    && dedicated.port==='5432' && username===qualified;
  if(username!==SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login && !pooler) {
    return fail('INVALID_CONFIG','G5 private database URL login is not the dedicated principal.');
  }
  if(dedicated.href===ordinary.href||dedicated.password===ordinary.password||
     username===decodeURIComponent(ordinary.username)||
     dedicated.hostname.toLowerCase()!==ordinary.hostname.toLowerCase()||
     dedicated.port!==ordinary.port||dedicated.pathname!==ordinary.pathname) {
    return fail('INVALID_CONFIG','G5 private database must use a distinct login and secret on the approved target.');
  }
  return Object.freeze({databaseUrl:raw,
    databasePrincipal:SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login,
    rootCertificatePem:input.rootCertificatePem});
}

export const SEYEON_G5_PRIVATE_COMMERCE_LOGIN_PREFLIGHT_SQL_V1 = `
select
  session_user::text as "sessionUser",
  current_user::text as "currentUser",
  r.rolcanlogin as "canLogin",
  r.rolinherit as "canInherit",
  r.rolsuper as "isSuper",
  r.rolbypassrls as "canBypassRls",
  r.rolcreatedb as "canCreateDb",
  r.rolcreaterole as "canCreateRole",
  (r.rolvaliduntil is null or r.rolvaliduntil > pg_catalog.statement_timestamp())
    as "credentialUnexpired",
  (select count(*)::integer from pg_catalog.pg_auth_members m
    where m.member=r.oid) as "membershipCount",
  pg_catalog.pg_has_role(current_user,$1,'MEMBER') as "commerceMember",
  (select count(*)::integer from pg_catalog.pg_auth_members m
    where m.member=r.oid and m.roleid=to_regrole($1)) as "directCommerceMembershipCount",
  pg_catalog.pg_has_role(current_user,$2,'MEMBER') as "apiMember",
  coalesce(pg_catalog.has_function_privilege(current_user,
    to_regprocedure('public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)'),'EXECUTE'),false) as "directSettle",
  coalesce(pg_catalog.has_function_privilege(current_user,
    to_regprocedure('public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)'),'EXECUTE'),false) as "directCatalog",
  coalesce(pg_catalog.has_table_privilege(current_user,
    to_regclass('public.chat_credit_turn_reservations_v1'),'UPDATE'),false) as "directLedgerUpdate"
from pg_catalog.pg_roles r where r.rolname=current_user
`.trim();

export function verifySeyeonG5PrivateCommerceLoginPreflightV1(
  rows:readonly Record<string,unknown>[]):void {
  const r=rows[0];
  if(rows.length!==1||!r)return fail('INVALID_PROBE','G5 login check returned no unique catalog row.');
  if(r.sessionUser!==SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login||
     r.currentUser!==SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login)
    return fail('INVALID_LOGIN','G5 separate Commerce session login mismatch.');
  if(r.canLogin!==true||r.canInherit!==false||r.isSuper!==false||
     r.canBypassRls!==false||r.canCreateDb!==false||r.canCreateRole!==false||
     r.credentialUnexpired!==true||r.membershipCount!==1||r.directCommerceMembershipCount!==1)
    return fail('UNSAFE_LOGIN','G5 login flags or role membership exceed minimum authority.');
  if(r.commerceMember!==true)
    return fail('MISSING_AUTHORITY','G5 login cannot assume the private Commerce role.');
  if(r.apiMember!==false||r.directSettle!==false||r.directCatalog!==false||
     r.directLedgerUpdate!==false)
    return fail('EXCESS_AUTHORITY','G5 login has direct/ordinary API authority without transaction role switch.');
}

export const SEYEON_G5_PRIVATE_COMMERCE_ROLE_PREFLIGHT_SQL_V1 = `
select current_user::text as "effectiveRole",
  coalesce(pg_catalog.has_function_privilege(current_user,
    to_regprocedure('public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)'),'EXECUTE'),false) as "canSettle",
  coalesce(pg_catalog.has_function_privilege(current_user,
    to_regprocedure('public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)'),'EXECUTE'),false) as "canCatalog",
  coalesce(pg_catalog.has_table_privilege(current_user,
    to_regclass('public.chat_credit_turn_reservations_v1'),'UPDATE'),false) as "canDirectLedgerUpdate"
`.trim();

export function verifySeyeonG5PrivateCommerceRolePreflightV1(
  rows:readonly Record<string,unknown>[]):void {
  const r=rows[0];
  if(rows.length!==1||!r||r.effectiveRole!==SEYEON_G5_PRIVATE_COMMERCE_DB_V1.executionRole||
     r.canSettle!==true||r.canCatalog!==true||r.canDirectLedgerUpdate!==false)
    return fail('MISSING_AUTHORITY','G5 Commerce role cannot prove narrow private RPC access.');
}

/** A checkout is returned only after real session LOGIN and role-switch proofs. */
export class SeyeonG5PrivateCommercePostgresPoolV1 implements PostgresSubjectPoolV1 {
  readonly authority='seyeon-g5-private-commerce-v1' as const;
  constructor(private readonly driver:NodePostgresDriverPoolV1){}
  async connect():Promise<PostgresSubjectConnectionV1>{
    const client=await this.driver.connect();
    let open=false;
    try {
      const r=await client.query(SEYEON_G5_PRIVATE_COMMERCE_LOGIN_PREFLIGHT_SQL_V1,
        [SEYEON_G5_PRIVATE_COMMERCE_DB_V1.executionRole,MYEONGHA_API_EXECUTION_ROLE]);
      verifySeyeonG5PrivateCommerceLoginPreflightV1(r.rows);
      await client.query('BEGIN');open=true;
      await client.query('SET LOCAL ROLE myeongha_commerce_internal_executor');
      const proof=await client.query(SEYEON_G5_PRIVATE_COMMERCE_ROLE_PREFLIGHT_SQL_V1);
      verifySeyeonG5PrivateCommerceRolePreflightV1(proof.rows);
      await client.query('ROLLBACK');open=false;
      return {
        async query<Row = Record<string,unknown>>(sql:string,values?:readonly unknown[]){
          const result=await client.query(sql,values);
          return {rows:result.rows as readonly Row[]};
        },
        release(error){client.release(error instanceof Error?error:undefined);},
      };
    } catch(error) {
      if(open) {
        try{await client.query('ROLLBACK');}
        catch(rollbackError){
          client.release(rollbackError instanceof Error?rollbackError:
            new Error('G5 credential rollback failed.'));
          throw new AggregateError([error,rollbackError],'G5 private role preflight rollback failed.');
        }
      }
      client.release(error instanceof Error?error:new Error('G5 private credential denied.'));
      throw error;
    }
  }
  async close():Promise<void>{await this.driver.end();}
}

/** Constructed only by explicit Owner code. Never installed into a runtime route. */
export function createSeyeonG5PrivateCommercePoolV1(
  config:SeyeonG5PrivateCommerceConfigV1,
  options:NodePostgresSubjectPoolOptionsV1={},
):SeyeonG5PrivateCommercePostgresPoolV1 {
  if(config.databasePrincipal!==SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login)
    return fail('INVALID_CONFIG','G5 Commerce principal must remain dedicated.');
  const tls:ProductionPostgresRuntimeConfigV1={
    databaseUrl:config.databaseUrl,
    databasePrincipal:config.databasePrincipal,
    databaseExecutionRole:MYEONGHA_API_EXECUTION_ROLE,
    databaseTlsPeerMode:'verify-full',
    databaseSslRootCertificatePem:config.rootCertificatePem,
  };
  let pool:Pool|undefined;
  const driver:NodePostgresDriverPoolV1={
    async connect(){
      if(!pool){
        pool=new Pool(buildProductionNodePostgresPoolConfigV1(tls,options));
        pool.on('error',e=>console.error('G5 private Commerce idle DB failure',{
          code:(e as Error&{code?:unknown}).code??null,
        }));
      }
      const c=await pool.connect();
      return {
        async query(sql,values){
          const result=values===undefined?await c.query(sql):await c.query(sql,[...values]);
          return {rows:result.rows as readonly Record<string,unknown>[]};
        },
        release(error){c.release(error);},
      };
    },
    async end(){const current=pool;pool=undefined;if(current)await current.end();},
  };
  return new SeyeonG5PrivateCommercePostgresPoolV1(driver);
}
