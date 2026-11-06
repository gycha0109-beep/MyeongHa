import pg from 'pg';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
 createAdminOriginTargetV1,
 assertAdminOriginIdentityV1,
 assertAdminOriginClientTlsV1,
 ADMIN_ORIGIN_PRINCIPAL_SQL_V1,
} from './origin-preflight.mjs';

// Existing A1–A4 read-only Admin menu routes. No customer data leaves the runner.
// Each query uses the same Reader adapter and response projection as the Worker.
export const ADMIN_LIVE_READBACK_KINDS_V1=Object.freeze([
 'overview','users','commerce','credits','entitlements','readings','ai-costs','issues','audit',
]);

export async function verifyAdminReadQueriesV1(input){
 const {port,project}=input;
 if(typeof port?.read!=='function'||typeof project!=='function')
  throw Error('Admin Reader verification dependencies unavailable');
 for(const kind of ADMIN_LIVE_READBACK_KINDS_V1){
  const limit=kind==='overview'?20:2;
  const filters=Object.freeze({
   kind,limit,cursor:null,subjectId:null,from:null,to:null,
  });
  // Errors are fatal; never substitute empty rows for a failed read.
  const result=await port.read(filters);
  project(kind,result,limit);
 }
 return Object.freeze({
  readOnly:true,verified:true,queryKindsChecked:ADMIN_LIVE_READBACK_KINDS_V1.length,
  // No result rows, IDs, emails, SQL text, counts or connection details.
 });
}

export async function verifyProductionAdminReadQueriesV1(env,options={}){
 const role='myeongha_admin_reader';
 if(typeof env?.MYEONGHA_ADMIN_READ_DATABASE_URL!=='string'||
    !env.MYEONGHA_ADMIN_READ_DATABASE_URL||
    typeof env.MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM!=='string'||
    !env.MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM)
  throw Error('Dedicated Reader credentials unavailable');
 const target=await (options.targetFactory??createAdminOriginTargetV1)(
  env,role,'MYEONGHA_ADMIN_READ_DATABASE_URL',
 );
 const factory=options.poolFactory??(config=>new pg.Pool(config));
 const pool=factory({
  connectionString:target.connectionString,ssl:target.ssl,max:1,
  connectionTimeoutMillis:3000,statement_timeout:5000,query_timeout:8000,
 });
 let connection;
 let failed=false;
 try{
  connection=await pool.connect();
  // An exact-role and TLS assertion runs before any real metadata read.
  const principal=await connection.query(ADMIN_ORIGIN_PRINCIPAL_SQL_V1);
  assertAdminOriginClientTlsV1(target,connection);
  assertAdminOriginIdentityV1(target,principal,role);
  connection.release();
  connection=undefined;

  const {createAdminPostgresReadPortV1}=await (options.loadReadAdapter??(()=>import(
   '../../dist/apps/api/src/admin-postgres-read-v1.js'
  )))();
  const {projectAdminRowsV1}=await (options.loadProjection??(()=>import(
   '../../dist/apps/api/src/admin-read-contract-v1.js'
  )))();
  return await verifyAdminReadQueriesV1({
   port:createAdminPostgresReadPortV1({pool}),project:projectAdminRowsV1,
  });
 }catch{
  failed=true;
  // The original error may contain DB host, SQL text or row details.
  throw Error('Scoped Admin Reader queries could not be verified');
 }finally{
  if(connection){try{connection.release();}catch{failed=true;}}
  try{await pool.end();}catch{failed=true;}
  if(failed){ /* Status only, no connection properties are reported. */ }
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const report=await verifyProductionAdminReadQueriesV1(process.env);
  console.log(JSON.stringify(report));
 }catch{
  console.error('Scoped Admin Reader readback failed');
  process.exitCode=2;
 }
}
