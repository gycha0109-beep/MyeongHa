// Watchtower-Track: security
// Final tightly scoped S0 activation after exact-head restored PG17 and
// authorized model/budget evidence. Never invoked from a deployment hook.
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {Client} from 'pg';
import {buildSeyeonSecurityS0InstallationPlan} from './plan.mjs';
import {SEYEON_S0_COST_POLICY_DRAFT_V1 as policy} from './model-cost-plan.mjs';
import {assertSeyeonS0ReleaseEvidenceV1} from './release-evidence.mjs';

const argv=process.argv.slice(2);
const opt=name=>{const i=argv.indexOf(name);return i<0?null:argv[i+1];};
const envFile=opt('--env-file'),caFile=opt('--ca-file'),
  evidenceFile=opt('--evidence-file'),utcDate=opt('--utc-date'),
  releaseEvidenceFile=opt('--release-evidence-file');
if(argv.length!==11||!argv.includes('--apply')||
   ![envFile,caFile,evidenceFile,releaseEvidenceFile].every(p=>typeof p==='string'&&isAbsolute(p))||
   typeof utcDate!=='string'|| !/^\d{4}-\d{2}-\d{2}$/.test(utcDate) ||
   utcDate!==new Date().toISOString().slice(0,10)){
  throw Error('Explicit S0 operator files and current UTC budget date required.');
}
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
if(branch!=='main'||dirty!==''||!/^[a-f0-9]{40}$/u.test(head))
  throw Error('Use only an exact tested, clean final main.');
// SRC-25 approval and independent G0/G1/G2/G3/G5 evidence are checked
// BEFORE any credential is loaded or a Production DB socket is created.
await assertSeyeonS0ReleaseEvidenceV1({filePath:releaseEvidenceFile,sourceSha:head});
const evidence=JSON.parse(await readFile(evidenceFile,'utf8'));
const plan=await buildSeyeonSecurityS0InstallationPlan();
if(evidence.schemaVersion!=='seyeon-security-s0-restored-rehearsal-v1'||
   evidence.sourceSha!==head||
   evidence.installedDefaultClosed!==true||
   evidence.productionMutation!==false||evidence.nativeProviderCalls!==0||
   evidence.apiExecutionPrincipal!=='myeongha_s0_receipt_test_login'||
   evidence.testsFailed!==0||evidence.testsPassed<1||
   evidence.installationPlan?.schemaVersion!==plan.schemaVersion||
   JSON.stringify(evidence.installationPlan.files)!==JSON.stringify(plan.files)){
  throw Error('Exact-head PG17 S0 restored proof missing.');
}
const local=parseEnv(await readFile(envFile,'utf8'));
const target=new URL(local.MYEONGHA_WORKER_DATABASE_URL??'');
if(!['postgres:','postgresql:'].includes(target.protocol)||
   !target.hostname.endsWith('.pooler.supabase.com')||
   (target.port!==''&&target.port!=='5432')){
  throw Error('Unapproved Production DB address.');
}
const ca=await readFile(caFile,'utf8');
if(!ca.includes('-----BEGIN CERTIFICATE-----')||
   typeof local.SUPABASE_DB_PASSWORD!=='string'){
  throw Error('Explicit verify-full CA and DB login required.');
}
const client=new Client({host:target.hostname,port:5432,database:'postgres',
  user:'postgres.cnsfpcdiyofqvhpcegfc',password:local.SUPABASE_DB_PASSWORD,
  ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:5000,
  statement_timeout:30000,application_name:'seyeon_s0_limited_operator_activate_v1'});
let tx=false;
const deny=()=>{throw Error('S0 activation authority/readiness mismatch');};
try{
  await client.connect();
  const {rows:[pre]}=await client.query(`select
    current_user='postgres' as principal,
    current_database()='postgres' as database_ok,
    current_setting('server_version_num')::integer between 170000 and 179999 as pg17,
    (select coalesce(max(version),'') from supabase_migrations.schema_migrations)=$1 as frontier,
    (select count(*)=0 from public.seyeon_positive_source_type_registry_v1) as registry_empty,
    to_regprocedure('seyeon_private.cmd_set_s0_positive_source_gate_v1(boolean)') is not null as source_gate_exists,
    to_regprocedure('seyeon_private.cmd_set_s0_owner_rpc_permissions_v1(boolean)') is not null as owner_acl_exists,
    not has_function_privilege('myeongha_api_executor',
      'public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)','EXECUTE') as issuer_off,
    (select count(*)=1 from pg_roles where rolname='myeongha_seyeon_governed_login'
      and rolcanlogin and not rolsuper and not rolbypassrls) as dedicated_login_exists,
    (select count(*)=1 from public.seyeon_ai_governor_model_policies_v1
      where provider_key=$2 and model_key=$3 and policy_version=$4
        and price_version=$5 and not is_active
        and allowed_purposes=$6::text[] and context_window_tokens=$7
        and maximum_input_tokens=$8 and maximum_output_tokens=$9
        and maximum_serialized_request_bytes=$10
        and input_micro_usd_per_million=$11
        and cached_input_micro_usd_per_million=$12
        and output_micro_usd_per_million=$13) as inactive_cost_policy,
    (select count(*)=1 from public.seyeon_ai_governor_daily_budgets_v1
      where bucket_utc_date=$14::date and occupied_micro_usd=0 and
        global_limit_micro_usd>0 and
        subject_limit_micro_usd=global_limit_micro_usd) as bounded_budget`,[
      String(evidence.backupMigrationFrontier),policy.providerKey,policy.modelKey,
      policy.policyVersion,policy.priceVersion,policy.allowedPurposes,
      policy.contextWindowTokens,policy.maximumInputTokens,policy.maximumOutputTokens,
      policy.maximumSerializedRequestBytes,policy.inputMicroUsdPerMillion,
      policy.cachedInputMicroUsdPerMillion,policy.outputMicroUsdPerMillion,utcDate]);
  if(!pre||!Object.values(pre).every(x=>x===true))deny();
  await client.query('BEGIN');tx=true;
  await client.query("select pg_advisory_xact_lock(hashtextextended('myeongha-seyeon-s0-closed-install-v1',0))");
  await client.query("set local lock_timeout='5s'");
  // Fixed functions only. Independent History/replay/direct Node G3 remain OFF.
  const {rows:[owner]}=await client.query(
    'select seyeon_private.cmd_set_s0_owner_rpc_permissions_v1(true) as ok');
  if(owner?.ok!==true)deny();
  await client.query(`grant execute on function
    public.cmd_issue_seyeon_positive_first_reply_v1(
      uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea),
    seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text),
    seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)
    to myeongha_api_executor`);
  await client.query(`update public.seyeon_ai_governor_model_policies_v1 set is_active=true
    where provider_key=$1 and model_key=$2 and policy_version=$3
      and price_version=$4 and not is_active`,
    [policy.providerKey,policy.modelKey,policy.policyVersion,policy.priceVersion]);
  // Source use opens LAST. Read locks and G1/G2 provenance remain mandatory.
  const {rows:[source]}=await client.query(
    'select seyeon_private.cmd_set_s0_positive_source_gate_v1(true) as ok');
  if(source?.ok!==true)deny();
  const {rows:[post]}=await client.query(`select
    (select count(*)=1 from public.seyeon_positive_source_type_registry_v1
      where record_kind='memory' and record_type='conversation_recall'
        and schema_version='v1' and projector_version='seyeon-conversation-recall-projector-v1'
        and enabled and not writable_enabled) as exactly_one_source,
    has_function_privilege('myeongha_api_executor',
      'public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)','EXECUTE') as g1_on,
    has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)','EXECUTE') as g2_on,
    has_function_privilege('myeongha_api_executor',
      'public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)','EXECUTE') as http_issue_on,
    has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)','EXECUTE') as receipt_ack_on,
    has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)','EXECUTE') as revoke_on,
    not has_function_privilege('myeongha_api_executor',
      'public.qry_seyeon_positive_first_memory_locked_reveal_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') as unreceipted_g3_off,
    not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_set_s0_positive_source_gate_v1(boolean)','EXECUTE') as source_operator_only,
    not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_set_s0_owner_rpc_permissions_v1(boolean)','EXECUTE') as acl_operator_only,
    (select count(*)=1 from public.seyeon_ai_governor_model_policies_v1
      where provider_key=$1 and model_key=$2 and policy_version=$3
        and price_version=$4 and is_active) as model_policy_active`,[
      policy.providerKey,policy.modelKey,policy.policyVersion,policy.priceVersion]);
  if(!post||!Object.values(post).every(x=>x===true))deny();
  await client.query('COMMIT');tx=false;
  console.log('SEYEON_S0_LIMITED_DB_AUTHORITY_ACTIVE');
  console.log('S0_ACTIVATED_SHA='+head);
}catch{
  if(tx)try{await client.query('ROLLBACK')}catch{}
  console.error('SEYEON_S0_ACTIVATION_REJECTED_OR_UNCONFIRMED');
  process.exitCode=1;
}finally{await client.end().catch(()=>{});}
