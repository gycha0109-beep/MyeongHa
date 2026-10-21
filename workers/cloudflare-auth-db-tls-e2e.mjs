// Disposable GitHub CI ONLY: real local workerd -> local Postgres TLS + RLS.
// Synthetic subjects, separate TLS database, no Production credentials.
// This file is NOT imported by wrangler.jsonc / live Cloudflare Preview.
// Watchtower-Track: ops
import { Pool } from 'pg';
import { X509Certificate } from 'node:crypto';
import { createNodePostgresSubjectPoolFromDriverV1 } from '../apps/api/src/node-postgres-subject-pool.ts';
import { executePostgresSubjectTransactionV1 } from '../apps/api/src/postgres-subject-execution.ts';
import { withCloudflareRequestSubjectScopeV1 } from '../apps/api/src/cloudflare-request-subject-scope.ts';

const TLS_HOST = 'subject.saju-bridge-ci.invalid';
const TLS_WRONG_HOST = 'other-subject.saju-bridge-ci.invalid';
const TLS_DB = 'myeongha_saju_subject_tls_verify';
const LOGIN = 'myeongha_runtime';
const A = '8c310001-0000-4000-8000-000000000001';
const B = '8c310002-0000-4000-8000-000000000002';
const SA = '8c320001-0000-4000-8000-000000000001';
const SB = '8c320002-0000-4000-8000-000000000002';
const cases = new Set(['member-a','member-b','unknown-member','rollback',
  'bad-ca','bad-host','plaintext','bad-login']);
const hdr = Object.freeze({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'});

function testEnv(env) {
  const cert = Buffer.from(env.MYEONGHA_LOCAL_TEST_CA_B64 ?? '', 'base64').toString('utf8');
  const wrong = Buffer.from(env.MYEONGHA_LOCAL_TEST_WRONG_CA_B64 ?? '', 'base64').toString('utf8');
  if (!env.MYEONGHA_LOCAL_TEST_PASSWORD || !cert.includes('BEGIN CERTIFICATE') ||
    !wrong.includes('BEGIN CERTIFICATE') || wrong === cert ||
    new X509Certificate(cert).fingerprint256.replaceAll(':','').toLowerCase() !==
      env.MYEONGHA_LOCAL_TEST_CA_FP) {
    throw Error('Disposable TLS fixture binding invalid');
  }
  return {cert,wrong};
}
function pgOptions(env, cert, overrides={}) {
  return {
    // workerd local TCP connects to loopback; TLS peer name is checked
    // independently against the fixture's DNS SAN, never disabled.
    host:'127.0.0.1',port:5444,database:TLS_DB,user:LOGIN,
    password:env.MYEONGHA_LOCAL_TEST_PASSWORD,
    ssl:{ca:cert,rejectUnauthorized:true,servername:TLS_HOST},
    max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,
    statement_timeout:5000,
    ...overrides,
  };
}
function fromDriver(pool) {
  return createNodePostgresSubjectPoolFromDriverV1({
    expectedLoginPrincipal:LOGIN,
    driverPool:{
      async connect(){
        const client=await pool.connect();
        return {
          async query(text,values){const data=await client.query(text,values?[...values]:[]);return {rows:data.rows};},
          release(error){client.release(error);},
        };
      },
      async end(){await pool.end();},
    },
  });
}
async function member(env, cert, which, rollback=false) {
  const authId=which==='a'?A:B;
  const subjectId=which==='a'?SA:SB;
  let stage='CONNECT_OR_PREFLIGHT';
  try {
  return await withCloudflareRequestSubjectScopeV1({
    createPool:()=>fromDriver(new Pool(pgOptions(env,cert))),
    execute:pool=>executePostgresSubjectTransactionV1({
      pool, verifiedEvidence:{kind:'member',verifiedAuthUserId:authId},
      execute:async({client,resolvedSubject})=>{
        stage='CANONICAL_SUBJECT';
        if(resolvedSubject.subjectId!==subjectId||resolvedSubject.subjectKind!=='member')
          throw Error('Incorrect canonical member');
        stage='ROLE_QUERY';
        const identity=(await client.query(`select current_user::text as role,session_user::text as login,
          (select rolsuper from pg_roles where rolname=session_user) as superuser,
          (select rolbypassrls from pg_roles where rolname=session_user) as bypass,
          (select rolcanlogin from pg_roles where rolname=current_user) as executorlogin,
          current_database()::text as db`)).rows[0];
        if(identity.role!=='myeongha_api_executor'||identity.login!==LOGIN||
          identity.superuser!==false||identity.bypass!==false||
          identity.executorlogin!==false||identity.db!==TLS_DB)
          throw Error('Postgres authority role drift');
        stage='TLS_STATUS_QUERY';
        const tls=(await client.query(`select ssl.ssl,ssl.version from pg_stat_ssl ssl
          where ssl.pid=pg_backend_pid()`)).rows[0];
        if(tls?.ssl!==true||!/^TLSv1\\.[23]$/.test(tls.version))
          throw Error('No verified TLS PostgreSQL connection');
        stage='RLS_QUERY';
        const subjects=(await client.query('select id::text as id from public.subjects order by id')).rows;
        if(subjects.length!==1||subjects[0].id!==subjectId)
          throw Error('Cross-subject RLS read exposure');
        stage='RLS_CROSS_SUBJECT_QUERY';
        const forbidden=(await client.query('select id from public.subjects where id=$1::uuid',
          [which==='a'?SB:SA])).rows;
        if(forbidden.length!==0) throw Error('Cross-subject explicit ID read exposure');
        if(rollback) throw Error('synthetic-request-rollback-sentinel');
        return {tls:true,role:true,rls:true};
      },
    }),
  });
  } catch(error) {
    if(error&&typeof error==='object') {
      error.probeStage=stage;
    }
    throw error;
  }
}
async function missingMember(env,cert){
  try{
    await withCloudflareRequestSubjectScopeV1({
      createPool:()=>fromDriver(new Pool(pgOptions(env,cert))),
      execute:pool=>executePostgresSubjectTransactionV1({
        pool,verifiedEvidence:{kind:'member',verifiedAuthUserId:'8c310003-0000-4000-8000-000000000003'},
        execute:()=>{throw Error('Unverified subject reached guarded work');},
      }),
    });
    throw Error('Unknown subject accepted');
  }catch(error){
    if(error?.code!=='AUTH_REQUIRED') throw error;
    return {denied:true};
  }
}
async function deniedConnection(env,cert,name,wrong){
  const overrides=name==='bad-ca'?{ssl:{ca:wrong,rejectUnauthorized:true,servername:TLS_HOST}}:
    name==='bad-host'?{ssl:{ca:cert,rejectUnauthorized:true,servername:TLS_WRONG_HOST}}:
    name==='plaintext'?{ssl:false}:
    name==='bad-login'?{password:'synthetic-wrong-password-never-valid'}:{};
  const pool=new Pool(pgOptions(env,cert,overrides));
  let denied=false;
  try{
    await pool.query('select 1');
  }catch{
    denied=true;
  }finally{
    await pool.end();
  }
  if(!denied)throw Error('TLS/credential negative probe unexpectedly connected');
  return {denied:true};
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const name=request.headers.get('X-Myeongha-Offline-Case');
    if(url.hostname!=='127.0.0.1'||url.pathname!=='/__offline/subject-tls'||
      url.search!==''||request.headers.get('X-Myeongha-Offline-Token')!=='isolated-ci-guard-v1'||
      !cases.has(name)) return new Response(null,{status:404,headers:hdr});
    if(request.method!=='GET')return new Response(null,{status:405,headers:{...hdr,Allow:'GET'}});
    try {
      const {cert,wrong}=testEnv(env);
      let checks;
      if(name==='member-a'||name==='member-b'){
        checks=await member(env,cert,name==='member-a'?'a':'b');
      }else if(name==='rollback'){
        let denied=false;
        try {await member(env,cert,'a',true);}
        catch(e){denied=e?.message==='synthetic-request-rollback-sentinel';}
        if(!denied)throw Error('Rollback not enforced');
        checks={denied:true};
      }else if(name==='unknown-member'){
        checks=await missingMember(env,cert);
      }else{
        checks=await deniedConnection(env,cert,name,wrong);
      }
      return Response.json({pass:true,case:name,checks},{status:200,headers:hdr});
    }catch(e){
      // Error message/stack may include a DSN or password: never display them.
      // Only reveal a narrow, allowlisted diagnostic category + error code.
      const rawCode=typeof e?.code==='string'?e.code:
        typeof e?.cause?.code==='string'?e.cause.code:'';
      const safeCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ETIMEDOUT',
        'CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN',
        'ERR_TLS_CERT_ALTNAME_INVALID','AUTH_REQUIRED',
        'PRINCIPAL_MISMATCH','EXECUTION_ROLE_UNAVAILABLE','28P01','42501','28000']);
      const code=safeCodes.has(rawCode)?rawCode:'UNCLASSIFIED';
      const stage=typeof e?.probeStage==='string'&&/^[A-Z_]{2,40}$/.test(e.probeStage)
        ?e.probeStage:'OTHER';
      const reason=typeof e?.message==='string'&&e.message.includes('Disposable TLS fixture binding invalid')
        ?'ENV_BINDING':typeof e?.message==='string'&&e.message.includes('Cross-subject')
        ?'RLS_CROSS_SUBJECT':typeof e?.message==='string'&&e.message.includes('authority role drift')
        ?'ROLE_SHAPE':typeof e?.message==='string'&&e.message.includes('verified TLS')
        ?'TLS_STATUS':typeof e?.message==='string'&&e.message.includes('Incorrect canonical')
        ?'SUBJECT_MAPPING':'SOCKET_OR_QUERY';
      // The CI database is synthetic only; redact binding values and any
      // URI/PASSWORD-looking tokens before returning a bounded clue.
      let detail=typeof e?.message==='string'?e.message:'unknown runtime error';
      for(const secret of [env.MYEONGHA_LOCAL_TEST_PASSWORD,
          env.MYEONGHA_LOCAL_TEST_CA_B64,env.MYEONGHA_LOCAL_TEST_WRONG_CA_B64]) {
        if(typeof secret==='string'&&secret.length>0)detail=detail.replaceAll(secret,'[redacted]');
      }
      detail=detail.replace(/postgres(?:ql)?:[^\\s]+/gi,'[redacted-DSN]')
        .replace(/[0-9a-f]{32,}/gi,'[redacted-hex]')
        .slice(0,180);
      console.error('Disposable TLS worker check rejected:',stage,reason,code);
      return Response.json({pass:false,case:name,diagnostic:{stage,reason,code,detail}},
        {status:503,headers:hdr});
    }
  },
};
