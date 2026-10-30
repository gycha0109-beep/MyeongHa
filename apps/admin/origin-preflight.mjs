// Read-only origin verification. Never installs roles, records audit or changes
// credentials. Requires npm run build, then explicitly supplied scoped origins.
import pg from 'pg';
import {ADMIN_READER_ALLOWED_COLUMNS_V1} from './reader-allowed-columns-v1.mjs';
import {adminReaderExactColumnsPredicateV1} from './reader-effective-columns-v1.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const CONFIG=[
 ['myeongha_admin_reader','MYEONGHA_ADMIN_READ_DATABASE_URL'],
 ['myeongha_admin_audit_writer','MYEONGHA_ADMIN_AUDIT_DATABASE_URL'],
];
// Read-only Admin activation requires Reader and append-only Audit Writer.
// A command executor is separately admitted only when that capability exists.
const OPTIONAL=[
 ['myeongha_admin_command_executor','MYEONGHA_ADMIN_COMMAND_DATABASE_URL'],
 ['myeongha_admin_retention_executor','MYEONGHA_ADMIN_RETENTION_DATABASE_URL'],
 ['myeongha_analytics_writer','MYEONGHA_ADMIN_ANALYTICS_WRITER_DATABASE_URL'],
 ['myeongha_reading_ai_cost_writer_v1','MYEONGHA_ADMIN_READING_AI_COST_WRITER_DATABASE_URL'],
];
export const ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1=Object.freeze([...CONFIG.map(([,key])=>key),'MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM']);
const PRINCIPAL=`SELECT r.rolname AS role, r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS restricted, s.ssl AS tls FROM pg_catalog.pg_roles r LEFT JOIN pg_catalog.pg_stat_ssl s ON s.pid=pg_backend_pid() WHERE r.rolname=current_user`;
// Confirm forbidden metadata cannot become readable through a broad table
// GRANT, a column GRANT, or a schema default-privilege change.
export const ADMIN_READER_SENSITIVE_COLUMNS_V1=Object.freeze([
 ['public.subjects','auth_user_id'],
 ['public.birth_profile_revisions','birth_date'],
 ['public.birth_profile_revisions','birth_time'],
 ['public.birth_profile_revisions','sex'],
 ['public.birth_profile_revisions','input_hash'],
 ['public.readings','request_snapshot_jsonb'],
 ['public.readings','request_hash'],
 ['public.reading_execution_attempts','external_request_ref'],
 ['public.reading_refs','response_snapshot_jsonb'],
 ['public.reading_refs','source_birth_input_hash'],
 ['public.reading_refs','required_action_jsonb'],
 ['public.reading_groundings','approved_blocks_jsonb'],
 ['public.reading_groundings','semantic_claims_jsonb'],
 ['public.ai_execution_logs','input_ref_jsonb'],
 ['public.ai_execution_logs','output_ref_jsonb'],
 ['public.commerce_receipts','verified_payload_jsonb'],
 ['public.commerce_receipts','receipt_fingerprint'],
 ['public.commerce_receipts','external_transaction_id'],
 ['public.commerce_provider_events','verified_payload_jsonb'],
 ['public.commerce_provider_events','payload_fingerprint'],
 ['public.entitlement_events','payload_jsonb'],
 ['public.seyeon_ai_call_cost_events','event_jsonb'],
 ['public.outbox_events','payload_jsonb'],
 ['public.data_deletion_jobs','retention_exceptions_jsonb'],
]);
const READER_REQUIRED=[
 "has_column_privilege(current_user,'public.subjects','id','SELECT')",
 adminReaderExactColumnsPredicateV1(ADMIN_READER_ALLOWED_COLUMNS_V1),
 "has_column_privilege(current_user,'public.readings','id','SELECT')",
 "has_column_privilege(current_user,'public.commerce_receipts','id','SELECT')",
 "has_column_privilege(current_user,'myeongha_admin_ops.admin_audit_events_v1','request_id','SELECT')",
 "NOT has_table_privilege(current_user,'public.subjects','INSERT,UPDATE,DELETE,TRUNCATE')",
 "NOT has_table_privilege(current_user,'auth.users','SELECT')",
];
const READER_PRIVILEGES_SQL='SELECT '+[
 ...READER_REQUIRED,
 ...ADMIN_READER_SENSITIVE_COLUMNS_V1.map(([table,column])=>
   `NOT has_column_privilege(current_user,'${table}','${column}','SELECT')`),
].join(' AND ')+' AS isolated';
const PRIVILEGES={
 myeongha_admin_reader:READER_PRIVILEGES_SQL,
 myeongha_admin_audit_writer:`SELECT has_column_privilege(current_user,'myeongha_admin_ops.admin_audit_events_v1','request_id','INSERT') AND NOT has_column_privilege(current_user,'myeongha_admin_ops.admin_audit_events_v1','request_id','SELECT') AND NOT has_table_privilege(current_user,'myeongha_admin_ops.admin_audit_events_v1','SELECT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege(current_user,'public.subjects','SELECT,INSERT,UPDATE,DELETE') AS isolated`,
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
export {strictTarget as createAdminOriginTargetV1, PRINCIPAL as ADMIN_ORIGIN_PRINCIPAL_SQL_V1};
export async function inspectAdminOriginRolesV1(env,options={}){
 const missing=ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1.filter(key=>typeof env[key]!=='string'||!env[key].trim());
 if(missing.length)return {originRolesVerified:false,activationEnabled:false,missing,roles:[]};
 const results=[];
 const roles=[...CONFIG,...OPTIONAL.filter(([,key])=>typeof env[key]==='string'&&env[key].trim())];
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
