import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAdminOriginTargetV1,ADMIN_ORIGIN_PRINCIPAL_SQL_V1} from './origin-preflight.mjs';

const ROLE='myeongha_admin_audit_writer';
const REQUIRED=['MYEONGHA_ADMIN_AUDIT_DATABASE_URL','MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM'];
const INSERT=`INSERT INTO myeongha_admin_ops.admin_audit_events_v1
 (request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at)
 VALUES ($1::uuid,NULL,NULL,'admin:stage-probe',$2::text,clock_timestamp())`;
const DENIED=[
 'SELECT request_id FROM myeongha_admin_ops.admin_audit_events_v1 LIMIT 0',
 'SELECT id FROM public.subjects LIMIT 0',
 // EXPLAIN without ANALYZE checks DML permissions without executing customer DML.
 'EXPLAIN UPDATE public.subjects SET status=status WHERE false',
];

/** Real TLS login, append and rejection checks on the dedicated Audit Writer.
 * Every probe is rolled back. No customer DML executes, no audit event persists,
 * and no credentials, SQL errors or database rows are included in the report. */
export async function verifyAdminAuditWriteV1(env,options={}){
 const missing=REQUIRED.filter(key=>typeof env[key]!=='string'||!env[key].trim());
 const report={auditWriteVerified:false,permissionDenialsVerified:0,
  invalidAuditRejected:false,transactionRolledBack:false,activationEnabled:false,missing};
 if(missing.length)return report;
 let pool,connection,active=false,discard,passed=false;
 try{
  const target=await(options.targetFactory??createAdminOriginTargetV1)(env,ROLE,REQUIRED[0]);
  pool=(options.poolFactory??(config=>new pg.Pool(config)))({
   connectionString:target.connectionString,ssl:target.ssl,max:1,
   connectionTimeoutMillis:3000,statement_timeout:3000,
  });
  connection=await pool.connect();
  await connection.query('BEGIN');active=true;
  const principal=await connection.query(ADMIN_ORIGIN_PRINCIPAL_SQL_V1);
  const identity=principal.rows[0];
  if(principal.rows.length!==1||identity?.role!==ROLE||identity.restricted!==true||identity.tls!==true)
   throw Error('Dedicated audit identity unavailable');
  const inserted=await connection.query(INSERT,[randomUUID(),'allowed']);
  if(inserted.rowCount!==1)throw Error('Audit append was not accepted');
  async function rejects(sql,values,expectedCode){
   await connection.query('SAVEPOINT admin_stage_probe');
   let rejected=false;
   try{await connection.query(sql,values);}catch(error){
    if(error?.code!==expectedCode)throw Error('Unexpected audit probe rejection');
    rejected=true;
   }
   await connection.query('ROLLBACK TO SAVEPOINT admin_stage_probe');
   await connection.query('RELEASE SAVEPOINT admin_stage_probe');
   if(!rejected)throw Error('Audit probe unexpectedly permitted');
  }
  for(const sql of DENIED){await rejects(sql,undefined,'42501');report.permissionDenialsVerified++;}
  await rejects(INSERT,[randomUUID(),'invalid-probe-outcome'],'23514');
  report.invalidAuditRejected=true;
  await connection.query('ROLLBACK');active=false;report.transactionRolledBack=true;
  passed=true;
 }catch{
  // Safe status only. pg errors can contain connection details or row contents.
 }finally{
  if(active){
   try{await connection.query('ROLLBACK');report.transactionRolledBack=true;}
   catch(error){discard=error;passed=false;}
  }
  try{connection?.release(discard);}catch{passed=false;}
  try{await pool?.end();}catch{passed=false;}
 }
 report.auditWriteVerified=passed&&report.transactionRolledBack;
 return Object.freeze(report);
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const result=await verifyAdminAuditWriteV1(process.env);
 console.log(JSON.stringify(result));
 if(!result.auditWriteVerified)process.exitCode=2;
}
