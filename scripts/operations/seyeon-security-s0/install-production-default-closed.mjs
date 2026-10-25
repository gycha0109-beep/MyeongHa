// Watchtower-Track: security
// Apply the exact restore-rehearsed S0 SQL to Production, DEFAULT CLOSED.
// Operator-only, explicitly gated; not a migration or deploy hook.
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {Client} from 'pg';
import {buildSeyeonSecurityS0InstallationBundle} from './bundle.mjs';
import {buildSeyeonSecurityS0InstallationPlan} from './plan.mjs';

const argv=process.argv.slice(2);
const opt=name=>{const index=argv.indexOf(name);return index<0?null:argv[index+1];};
const envPath=opt('--env-file'),caPath=opt('--ca-file'),evidencePath=opt('--evidence-file');
if(!argv.includes('--apply')||![envPath,caPath,evidencePath].every(p=>typeof p==='string'&&isAbsolute(p))||
   argv.length!==7)throw Error('Explicit --apply and three absolute file paths required.');
// Never authorize Production from a working feature branch or a dirty tree.
const ref=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
if(ref!=='main'||dirty!==''||!/^[a-f0-9]{40}$/u.test(head)){
  throw Error('S0 Production installation requires a clean, reviewed main HEAD.');
}
const evidence=JSON.parse(await readFile(evidencePath,'utf8'));
const plan=await buildSeyeonSecurityS0InstallationPlan();
const bundle=await buildSeyeonSecurityS0InstallationBundle();
if(evidence.schemaVersion!=='seyeon-security-s0-restored-rehearsal-v1'||
   evidence.sourceSha!==head||
   evidence.target!=='loopback-disposable-clone-of-restored-postgres'||
   evidence.productionMutation!==false||
   evidence.nativeProviderCalls!==0||
   evidence.installedDefaultClosed!==true||
   evidence.testsFailed!==0||
   !Number.isSafeInteger(evidence.testsPassed)||evidence.testsPassed<1||
   !Number.isSafeInteger(Number(evidence.backupMigrationFrontier))||
   evidence.installationPlan?.schemaVersion!==plan.schemaVersion||
   JSON.stringify(evidence.installationPlan.files)!==JSON.stringify(plan.files)||
   !Array.isArray(bundle.files)||bundle.files.length!==plan.files.length){
  throw Error('S0 PostgreSQL17 same-head restored-backup proof mismatch; no Production connection.');
}
const local=parseEnv(await readFile(envPath,'utf8'));
const dbPassword=local.SUPABASE_DB_PASSWORD;
const databaseUrl=local.MYEONGHA_WORKER_DATABASE_URL;
if(typeof dbPassword!=='string'||dbPassword.length<8||typeof databaseUrl!=='string'){
  throw Error('Existing Production credentials missing.');
}
const url=new URL(databaseUrl);
if(!['postgres:','postgresql:'].includes(url.protocol)||
   !url.hostname.endsWith('.pooler.supabase.com')||
   (url.port!==''&&url.port!=='5432')){
  throw Error('Unapproved Production database endpoint.');
}
const ca=await readFile(caPath,'utf8');
if(!ca.includes('-----BEGIN CERTIFICATE-----'))throw Error('Explicit CA is required.');
const client=new Client({host:url.hostname,port:5432,database:'postgres',
  user:'postgres.cnsfpcdiyofqvhpcegfc',password:dbPassword,
  ssl:{ca,rejectUnauthorized:true},application_name:'seyeon_s0_closed_operator_install_v1',
  connectionTimeoutMillis:5000,statement_timeout:60000});
let tx=false;
try{
  await client.connect();
  const {rows:[preflight]}=await client.query(`select
    current_user='postgres' as expected_principal,
    current_database()='postgres' as expected_database,
    current_setting('server_version_num')::integer between 170000 and 179999 as expected_pg17,
    to_regnamespace('seyeon_private') is null as s0_schema_absent,
    to_regprocedure('seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)') is null as receipt_absent,
    (select coalesce(max(version),'') from supabase_migrations.schema_migrations)=$1 as backup_matches_schema,
    (select count(*)=1 from pg_auth_members m join pg_roles p on p.oid=m.roleid
      join pg_roles u on u.oid=m.member
      where p.rolname='myeongha_seyeon_chat_runtime_owner'
        and u.rolname='postgres' and m.admin_option
        and not m.inherit_option and not m.set_option
        and pg_get_userbyid(m.grantor)='supabase_admin') as installer_role_admin`,[
       String(evidence.backupMigrationFrontier)]);
  if(!preflight||!Object.values(preflight).every(x=>x===true)){
    throw Error('Production S0 initial state does not match reviewed proof.');
  }
  await client.query('BEGIN');tx=true;
  await client.query("select pg_advisory_xact_lock(hashtextextended('myeongha-seyeon-s0-closed-install-v1',0))");
  // Exact rehearsed source order, single transaction and rollback on failure.
  await client.query(bundle.sql);
  const {rows:[closed]}=await client.query(`select
    to_regprocedure('seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)') is not null as receipt_exists,
    to_regprocedure('seyeon_private.cmd_set_s0_positive_source_gate_v1(boolean)') is not null as private_gate_exists,
    has_function_privilege('postgres',
      'seyeon_private.cmd_set_s0_positive_source_gate_v1(boolean)','EXECUTE') as private_gate_operator_only,
    to_regprocedure('public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)') is not null as issuer_exists,
    to_regprocedure('public.qry_seyeon_positive_first_memory_locked_reveal_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)') is not null as g3_exists,
    not exists(select 1 from public.seyeon_positive_source_type_registry_v1) as registry_empty,
    not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)','EXECUTE') as receipt_execute_denied,
    not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_set_s0_positive_source_gate_v1(boolean)','EXECUTE') as gate_execute_denied,
    not has_function_privilege('myeongha_api_executor',
      'public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)','EXECUTE') as issuer_execute_denied,
    not has_function_privilege('myeongha_api_executor',
      'public.qry_seyeon_positive_first_memory_locked_reveal_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') as g3_execute_denied,
    (select count(*)=1 from pg_auth_members m join pg_roles p on p.oid=m.roleid
      join pg_roles u on u.oid=m.member
      where p.rolname='myeongha_seyeon_chat_runtime_owner'
        and u.rolname='postgres' and m.admin_option
        and not m.inherit_option and not m.set_option
        and pg_get_userbyid(m.grantor)='supabase_admin') as installer_role_preserved`);
  if(!closed||!Object.values(closed).every(x=>x===true)){
    throw Error('S0 default-CLOSED ACL or registry invariant failed.');
  }
  await client.query('COMMIT');tx=false;
  console.log('SEYEON_S0_PRODUCTION_INSTALLED_DEFAULT_CLOSED');
  console.log('S0_INSTALLED_MAIN_SHA='+head);
  console.log('S0_INSTALLED_SQL_SHA256='+bundle.sha256LfUtf8);
}catch{
  if(tx)try{await client.query('ROLLBACK')}catch{}
  console.error('SEYEON_S0_PRODUCTION_INSTALL_FAILED_OR_UNCONFIRMED');
  process.exitCode=1;
}finally{await client.end().catch(()=>{});}
