import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  type NodePostgresDriverPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.js';
import { withCloudflareRequestSubjectScopeV1 } from '../apps/api/src/cloudflare-request-subject-scope.js';
import { executePostgresSubjectTransactionV1 } from '../apps/api/src/postgres-subject-execution.js';

const TLS_HOST = 'subject.saju-bridge-ci.invalid';
const WRONG_HOST = 'other-subject.saju-bridge-ci.invalid';
const TLS_DB = 'myeongha_saju_subject_tls_verify';
const LOGIN = 'myeongha_runtime';
const AUTH_A = '8c310001-0000-4000-8000-000000000001';
const AUTH_B = '8c310002-0000-4000-8000-000000000002';
const SUBJECT_A = '8c320001-0000-4000-8000-000000000001';
const SUBJECT_B = '8c320002-0000-4000-8000-000000000002';

function requireIsolatedFixture() {
  const env = process.env;
  if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' ||
    env.MYEONGHA_CLOUDFLARE_DIRECT_TLS_CI_ENABLED !== '1' ||
    env.PGHOST !== '127.0.0.1' || env.PGPORT !== '5432' ||
    env.PGDATABASE !== 'myeongha_saju_local_verify' ||
    !env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD ||
    !env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE ||
    !env.MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE ||
    !env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT) {
    throw Error('Cloudflare Stage 5 real-TLS proof requires disposable GitHub CI Postgres only');
  }
  const ca = readFileSync(env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE, 'utf8');
  const wrongCa = readFileSync(env.MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE,'utf8');
  expect(new X509Certificate(ca).fingerprint256.replaceAll(':','').toLowerCase())
    .toBe(env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT);
  expect(wrongCa).not.toBe(ca);
  return { ca, wrongCa, password:env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD };
}

function options(fixture: ReturnType<typeof requireIsolatedFixture>): PoolConfig {
  return {
    host: TLS_HOST, port: 5444, database: TLS_DB, user: LOGIN,
    password: fixture.password,
    ssl: { ca: fixture.ca, rejectUnauthorized: true },
    max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
    statement_timeout: 5000,
  };
}

function subjectPool(config: PoolConfig) {
  const pool = new Pool(config);
  const driver: NodePostgresDriverPoolV1 = {
    async connect() {
      const client = await pool.connect();
      return {
        async query(text,values) {
          const result = await client.query(text, values === undefined ? [] : [...values]);
          return {rows:result.rows as readonly Record<string,unknown>[]};
        },
        release(error) {client.release(error);},
      };
    },
    async end() {await pool.end();},
  };
  return createNodePostgresSubjectPoolFromDriverV1({
    driverPool: driver, expectedLoginPrincipal:LOGIN,
  });
}

async function member(
  fixture: ReturnType<typeof requireIsolatedFixture>,
  authId: string,
  subjectId: string,
  otherSubjectId: string,
  failWork = false,
) {
  return withCloudflareRequestSubjectScopeV1({
    createPool:()=>subjectPool(options(fixture)),
    execute:pool=>executePostgresSubjectTransactionV1({
      pool,
      verifiedEvidence:{kind:'member',verifiedAuthUserId:authId},
      execute:async({resolvedSubject,client})=>{
        expect(resolvedSubject).toEqual({subjectId,subjectKind:'member'});
        const identity=(await client.query<{
          role:string;login:string;superuser:boolean;bypass:boolean;
          executorlogin:boolean;db:string;pid:number;
        }>(`select current_user::text as role,session_user::text as login,
           (select rolsuper from pg_roles where rolname=session_user) as superuser,
           (select rolbypassrls from pg_roles where rolname=session_user) as bypass,
           (select rolcanlogin from pg_roles where rolname=current_user) as executorlogin,
           current_database()::text as db, pg_backend_pid() as pid`)).rows[0];
        expect(identity).toMatchObject({
          role:'myeongha_api_executor',login:LOGIN,superuser:false,bypass:false,
          executorlogin:false,db:TLS_DB,
        });
        const tls=(await client.query<{ssl:boolean;version:string}>(
          'select ssl,version from pg_stat_ssl where pid=pg_backend_pid()')).rows[0];
        expect(tls?.ssl).toBe(true);
        expect(tls?.version).toMatch(/^TLSv1\.[23]$/);
        const own=(await client.query<{id:string}>(
          'select id::text as id from public.subjects order by id')).rows;
        expect(own).toEqual([{id:subjectId}]);
        const cross=(await client.query(
          'select id from public.subjects where id=$1::uuid',[otherSubjectId])).rows;
        expect(cross).toEqual([]);
        if(failWork)throw Error('synthetic-rollback-trigger');
        return {pid:identity?.pid,verifiedTls:true,isolatedRls:true};
      },
    }),
  });
}

async function mustReject(config: PoolConfig) {
  const pool = new Pool({...config,max:1,connectionTimeoutMillis:2500});
  try {await expect(pool.query('select 1')).rejects.toThrow();}
  finally {await pool.end();}
}

describe('Cloudflare Stage 5 request-scoped Node adapter to disposable REAL PostgreSQL TLS/RLS',()=>{
  // This is Node against a localhost fixture, NOT Worker TCP or Production.
  // It cannot satisfy the Worker outbound network or Production CA approvals.
  it('confirms CA fingerprint and TLS peer configuration from disposable fixtures',()=>{
    const fixture=requireIsolatedFixture();
    expect(options(fixture).ssl).toEqual({ca:fixture.ca,rejectUnauthorized:true});
    expect(options(fixture)).toMatchObject({host:TLS_HOST,port:5444,max:1});
  });

  it('enforces distinct same-transaction subject RLS for concurrent Member A and B',async()=>{
    const fixture=requireIsolatedFixture();
    const [a,b]=await Promise.all([
      member(fixture,AUTH_A,SUBJECT_A,SUBJECT_B),
      member(fixture,AUTH_B,SUBJECT_B,SUBJECT_A),
    ]);
    expect(a).toMatchObject({verifiedTls:true,isolatedRls:true});
    expect(b).toMatchObject({verifiedTls:true,isolatedRls:true});
    expect(a.pid).not.toBe(b.pid);
  });

  it('reconnects after cleanup with no Member B contamination of Member A',async()=>{
    const fixture=requireIsolatedFixture();
    await member(fixture,AUTH_A,SUBJECT_A,SUBJECT_B);
    await member(fixture,AUTH_B,SUBJECT_B,SUBJECT_A);
    const again=await member(fixture,AUTH_A,SUBJECT_A,SUBJECT_B);
    expect(again.isolatedRls).toBe(true);
  });

  it('fails closed for nonexistent canonical Member before protected query',async()=>{
    const fixture=requireIsolatedFixture();
    let executed=false;
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool:()=>subjectPool(options(fixture)),
      execute:pool=>executePostgresSubjectTransactionV1({
        pool,
        verifiedEvidence:{kind:'member',verifiedAuthUserId:'8c310003-0000-4000-8000-000000000003'},
        execute:()=>{executed=true;},
      }),
    })).rejects.toMatchObject({code:'AUTH_REQUIRED'});
    expect(executed).toBe(false);
  });

  it('rolls back rejected work and does not reuse transaction identity',async()=>{
    const fixture=requireIsolatedFixture();
    await expect(member(fixture,AUTH_A,SUBJECT_A,SUBJECT_B,true))
      .rejects.toThrow('synthetic-rollback-trigger');
    await member(fixture,AUTH_B,SUBJECT_B,SUBJECT_A);
  });

  it('rejects CA swap, TLS DNS SAN mismatch and cleartext Postgres',async()=>{
    const fixture=requireIsolatedFixture();
    const config=options(fixture);
    await mustReject({...config,ssl:{ca:fixture.wrongCa,rejectUnauthorized:true}});
    await mustReject({...config,host:WRONG_HOST});
    await mustReject({...config,ssl:false});
  });

  it('rejects incorrect local login password and superuser login cannot be used',async()=>{
    const fixture=requireIsolatedFixture();
    const config=options(fixture);
    await mustReject({...config,password:'synthetic-invalid-password'});
    await mustReject({...config,user:'postgres',password:fixture.password});
  });
});
