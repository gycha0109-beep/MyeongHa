// Watchtower-Track: security
// Only the reviewed, fixed S0 emergency stop; never delete or replay records.
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {parseEnv} from 'node:util';
import {Client} from 'pg';

const argv=process.argv.slice(2);
const flag=name=>{const i=argv.indexOf(name);return i<0?null:argv[i+1];};
const envFile=flag('--env-file'),caFile=flag('--ca-file');
if(argv.length!==5||!argv.includes('--apply')||
   ![envFile,caFile].every(p=>typeof p==='string'&&isAbsolute(p))){
  throw Error('S0 emergency stop requires explicit --apply and env/CA files.');
}
const local=parseEnv(await readFile(envFile,'utf8'));
const url=new URL(local.MYEONGHA_WORKER_DATABASE_URL??'');
if(!['postgres:','postgresql:'].includes(url.protocol)||
   !url.hostname.endsWith('.pooler.supabase.com')||
   (url.port!==''&&url.port!=='5432')||
   typeof local.SUPABASE_DB_PASSWORD!=='string'){
  throw Error('Unapproved S0 emergency stop DB identity');
}
const ca=await readFile(caFile,'utf8');
if(!ca.includes('-----BEGIN CERTIFICATE-----'))
  throw Error('Strict S0 emergency stop CA required');
const c=new Client({host:url.hostname,port:5432,user:'postgres.cnsfpcdiyofqvhpcegfc',
  password:local.SUPABASE_DB_PASSWORD,database:'postgres',
  ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:5000,
  statement_timeout:30000,application_name:'seyeon_s0_operator_emergency_stop'});
let tx=false;
try{
  await c.connect();
  const {rows:[pre]}=await c.query(`select
    current_user='postgres' as principal,
    current_database()='postgres' as database_ok,
    current_setting('server_version_num')::int between 170000 and 179999 as version_ok,
    to_regprocedure('seyeon_private.cmd_set_s0_positive_source_gate_v1(boolean)') is not null as source_gate,
    to_regprocedure('seyeon_private.cmd_set_s0_owner_rpc_permissions_v1(boolean)') is not null as owner_gate`);
  if(!pre||!Object.values(pre).every(x=>x===true))throw Error('S0 emergency stop preflight failed');
  // Use a single outer transaction. Strip the reviewed SQL envelope and
  // attach the same advisory lock used by activation.
  const sql=(await readFile(new URL('./stop-positive-use.sql',import.meta.url),'utf8'))
    .replace(/\r\n/gu,'\n');
  if((sql.match(/^begin;$/gmu)??[]).length!==1||
     (sql.match(/^commit;$/gmu)??[]).length!==1||
     !sql.includes('cmd_set_s0_positive_source_gate_v1(false)')||
     !sql.includes('cmd_set_s0_owner_rpc_permissions_v1(false)')||
     !sql.includes('is_active=false')||
     sql.includes('delete from ')||sql.includes('truncate ')){
    throw Error('S0 emergency stop source unexpectedly changed');
  }
  await c.query('BEGIN');tx=true;
  await c.query("select pg_advisory_xact_lock(hashtextextended('myeongha-seyeon-s0-closed-install-v1',0))");
  const {rows:[priorAccess]}=await c.query(`select
    has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)','EXECUTE') as receipt_ack,
    has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)','EXECUTE') as withdraw_request`);
  if(!priorAccess||typeof priorAccess.receipt_ack!=='boolean'||
     typeof priorAccess.withdraw_request!=='boolean')
    throw Error('S0 receipt/revoke original ACL unknown');
  await c.query(sql.replace(/^begin;\s*/mu,'').replace(/\s*commit;\s*$/mu,''));
  const {rows:[post]}=await c.query(`select
    (select count(*)=0 from public.seyeon_positive_source_type_registry_v1
      where enabled or writable_enabled) as source_off,
    (select count(*)=0 from public.seyeon_ai_governor_model_policies_v1
      where provider_key='openai-responses' and model_key='gpt-5.6-terra'
        and policy_version='seyeon-s0-receipt-production-20261025' and is_active) as model_off,
    not has_function_privilege('myeongha_api_executor',
      'public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)','EXECUTE') as issue_off,
    not has_function_privilege('myeongha_api_executor',
      'public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)','EXECUTE') as g1_off,
    not has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)','EXECUTE') as g2_off,
    not has_function_privilege('myeongha_api_executor',
      'public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(uuid,uuid,uuid)','EXECUTE') as accept_off,
    (has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)','EXECUTE')=$1) as receipt_acl_preserved,
    (has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)','EXECUTE')=$2) as withdrawal_acl_preserved`,
    [priorAccess.receipt_ack,priorAccess.withdraw_request]);
  if(!post||!Object.values(post).every(x=>x===true))
    throw Error('S0 emergency stop not fully confirmed');
  await c.query('COMMIT');tx=false;
  console.log('SEYEON_S0_NEW_PERSONAL_SOURCE_AND_MODEL_USE_STOPPED');
  console.log('SEYEON_S0_EXISTING_RECEIPT_AND_WITHDRAWAL_NOT_REVOKED');
}catch{
  if(tx)try{await c.query('ROLLBACK')}catch{}
  console.error('SEYEON_S0_STOP_FAILED_OR_UNCONFIRMED; CHECK OPERATOR DB BEFORE RETRY');
  process.exitCode=1;
}finally{await c.end().catch(()=>{});}
