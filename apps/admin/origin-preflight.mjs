// Read-only origin verification. Never installs roles, records audit or changes
// credentials. Requires npm run build, then explicitly supplied scoped origins.
import pg from 'pg';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const CONFIG=[
 ['myeongha_admin_reader','MYEONGHA_ADMIN_READ_DATABASE_URL'],
 ['myeongha_admin_audit_writer','MYEONGHA_ADMIN_AUDIT_DATABASE_URL'],
 ['myeongha_admin_command_executor','MYEONGHA_ADMIN_COMMAND_DATABASE_URL'],
];
export const ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1=Object.freeze([...CONFIG.map(([,key])=>key),'MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM']);
const PRINCIPAL=`SELECT r.rolname AS role, r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS restricted, s.ssl AS tls FROM pg_catalog.pg_roles r LEFT JOIN pg_catalog.pg_stat_ssl s ON s.pid=pg_backend_pid() WHERE r.rolname=current_user`;
const PRIVILEGES={
 myeongha_admin_reader:`SELECT has_column_privilege(current_user,'public.subjects','id','SELECT') AND NOT has_column_privilege(current_user,'public.subjects','auth_user_id','SELECT') AND NOT has_table_privilege(current_user,'public.subjects','UPDATE,DELETE') AS isolated`,
 myeongha_admin_audit_writer:`SELECT has_column_privilege(current_user,'myeongha_admin_ops.admin_audit_events_v1','request_id','INSERT') AND NOT has_table_privilege(current_user,'myeongha_admin_ops.admin_audit_events_v1','SELECT,UPDATE,DELETE') AS isolated`,
 myeongha_admin_command_executor:`SELECT has_function_privilege(current_user,'myeongha_admin_ops.qry_presentation_entries_v1(uuid,integer)','EXECUTE') AND NOT has_table_privilege(current_user,'myeongha_admin_ops.presentation_entries_v1','INSERT,UPDATE,DELETE') AS isolated`,
 myeongha_admin_retention_executor:`SELECT has_function_privilege(current_user,'myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(integer)','EXECUTE') AND NOT has_table_privilege(current_user,'myeongha_admin_ops.admin_audit_events_v1','INSERT,UPDATE,DELETE') AS isolated`,
 myeongha_reading_ai_cost_writer_v1:`SELECT has_function_privilege(current_user,'myeongha_admin_ops.cmd_record_reading_ai_call_v1(uuid,uuid,uuid,jsonb)','EXECUTE') AND NOT has_table_privilege(current_user,'myeongha_admin_ops.reading_ai_call_cost_events_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege(current_user,'public.reading_execution_attempts','INSERT,UPDATE,DELETE') AND NOT has_table_privilege(current_user,'public.readings','INSERT,UPDATE,DELETE') AND NOT has_table_privilege(current_user,'public.subjects','INSERT,UPDATE,DELETE') AS isolated`,
 myeongha_analytics_writer:`SELECT has_table_privilege(current_user,'myeongha_admin_analytics.events_v1','INSERT') AND has_table_privilege(current_user,'myeongha_admin_analytics.events_v1','DELETE') AND NOT has_table_privilege(current_user,'myeongha_admin_analytics.events_v1','UPDATE,TRUNCATE') AND has_table_privilege(current_user,'myeongha_admin_analytics.consents_v1','INSERT') AND has_table_privilege(current_user,'myeongha_admin_analytics.consents_v1','DELETE') AND has_column_privilege(current_user,'myeongha_admin_analytics.consents_v1','withdrawn_at','UPDATE') AND NOT has_column_privilege(current_user,'myeongha_admin_analytics.consents_v1','subject_link_ref','UPDATE') AND NOT has_table_privilege(current_user,'public.subjects','INSERT,UPDATE,DELETE') AS isolated`,
};
async function strictTarget(env,role,key){
 const url=new URL(env[key]);
 const project='cnsfpcdiyofqvhpcegfc';
 const pooler=url.hostname.endsWith('.pooler.supabase.com');
 if((!pooler&&url.hostname!=='db.'+project+'.supabase.co')||url.pathname!=='/postgres'||
   decodeURIComponent(url.username)!==(pooler?role+'.'+project:role))throw Error('Dedicated project origin role mismatch');
 const tls=await import('../../dist/apps/api/src/production-postgres-tls-peer-verification.js');
 return tls.buildProductionPostgresStrictTlsTargetV1({databaseUrl:env[key],rootCertificatePem:env.MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM,
  authority:{contractVersion:tls.PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,projectRef:'cnsfpcdiyofqvhpcegfc',requiredTlsMode:tls.PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,rootCertificateFingerprint256:tls.PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1}});
}
export async function inspectAdminOriginRolesV1(env,options={}){
 const missing=ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1.filter(key=>typeof env[key]!=='string'||!env[key].trim());
 if(missing.length)return {originRolesVerified:false,activationEnabled:false,missing,roles:[]};
 const results=[];
 const roles=[...CONFIG,...(env.MYEONGHA_ADMIN_RETENTION_DATABASE_URL?[['myeongha_admin_retention_executor','MYEONGHA_ADMIN_RETENTION_DATABASE_URL']]:[]),...(env.MYEONGHA_ADMIN_ANALYTICS_WRITER_DATABASE_URL?[['myeongha_analytics_writer','MYEONGHA_ADMIN_ANALYTICS_WRITER_DATABASE_URL']]:[]),...(env.MYEONGHA_ADMIN_READING_AI_COST_WRITER_DATABASE_URL?[['myeongha_reading_ai_cost_writer_v1','MYEONGHA_ADMIN_READING_AI_COST_WRITER_DATABASE_URL']]:[])];
 for(const[role,key]of roles){
  let pool,connection,active=false,discard;
  try{
   const target=await (options.targetFactory??strictTarget)(env,role,key);
   pool=(options.poolFactory??(config=>new pg.Pool(config)))({connectionString:target.connectionString,ssl:target.ssl,max:1,connectionTimeoutMillis:3000,statement_timeout:3000});
   connection=await pool.connect();await connection.query('BEGIN READ ONLY');active=true;
   const principal=await connection.query(PRINCIPAL);const identity=principal.rows[0];
   if(principal.rows.length!==1||identity?.role!==role||identity.restricted!==true||identity.tls!==true)throw Error('Origin identity unavailable');
   const privileges=await connection.query(PRIVILEGES[role]);
   if(privileges.rows.length!==1||privileges.rows[0]?.isolated!==true)throw Error('Origin isolation unavailable');
   await connection.query('COMMIT');active=false;results.push({role,verified:true});
  }catch{results.push({role,verified:false});}
  finally{
   if(active)try{await connection.query('ROLLBACK');}catch(error){discard=error;}
   try{connection?.release(discard);await pool?.end();}catch{results[results.length-1].verified=false;}
  }
 }
 return {originRolesVerified:results.every(result=>result.verified),activationEnabled:false,missing,roles:results};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await inspectAdminOriginRolesV1(process.env);console.log(JSON.stringify(result,null,2));
 if(!result.originRolesVerified&&!process.argv.includes('--allow-blocked'))process.exitCode=2;
}
