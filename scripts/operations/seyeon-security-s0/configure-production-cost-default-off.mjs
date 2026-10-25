// Watchtower-Track: security
// Explicit, inert S0 cost-ledger configuration. Never enables model usage.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {parseEnv} from 'node:util';
import {Client} from 'pg';
import {SEYEON_S0_COST_POLICY_DRAFT_V1 as policy,
  parseSeyeonS0CostBudgetV1} from './model-cost-plan.mjs';

const argv=process.argv.slice(2);
const option=name=>{const index=argv.indexOf(name);return index<0?null:argv[index+1];};
const envFile=option('--env-file'),caFile=option('--ca-file');
if(argv.length!==9||!argv.includes('--apply')||
   ![envFile,caFile].every(p=>typeof p==='string'&&isAbsolute(p))||
   argv.includes('--subject-micro-usd')){
  throw Error('Explicit --apply, absolute env and CA, UTC date and one global provider-safety ceiling required.');
}
const budget=parseSeyeonS0CostBudgetV1({
  utcDate:option('--utc-date'),globalMicroUsd:option('--global-micro-usd'),
});
const ref=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
if(ref!=='main'||dirty!=='')throw Error('Production model budget requires clean final main.');
const local=parseEnv(await readFile(envFile,'utf8'));
const host=new URL(local.MYEONGHA_WORKER_DATABASE_URL??'');
if(!['postgres:','postgresql:'].includes(host.protocol)||
   !host.hostname.endsWith('.pooler.supabase.com')){
  throw Error('Unapproved Production database host.');
}
const ca=await readFile(caFile,'utf8');
if(!ca.includes('-----BEGIN CERTIFICATE-----')||
   typeof local.SUPABASE_DB_PASSWORD!=='string')throw Error('Strict Production TLS/credential required.');
const c=new Client({host:host.hostname,port:5432,database:'postgres',
  user:'postgres.cnsfpcdiyofqvhpcegfc',password:local.SUPABASE_DB_PASSWORD,
  ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:5000,statement_timeout:5000});
let tx=false;
try{
  await c.connect();
  const {rows:[ready]}=await c.query(`select current_user='postgres' as principal,
    current_database()='postgres' as database_ok,
    to_regprocedure('seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)') is not null as s0_installed,
    not exists(select 1 from public.seyeon_positive_source_type_registry_v1) as source_registry_closed`);
  if(!ready||!Object.values(ready).every(x=>x===true))
    throw Error('Requires installed default-CLOSED S0.');
  await c.query('BEGIN');tx=true;
  await c.query("select pg_advisory_xact_lock(hashtextextended('seyeon-s0-governed-budget-default-off-v1',0))");
  const p=policy;
  await c.query(`insert into public.seyeon_ai_governor_model_policies_v1 (
    provider_key,model_key,policy_version,price_version,allowed_purposes,
    context_window_tokens,maximum_input_tokens,maximum_output_tokens,
    maximum_serialized_request_bytes,input_micro_usd_per_million,
    cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
  ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)
  on conflict (provider_key,model_key,policy_version) do nothing`,[
    p.providerKey,p.modelKey,p.policyVersion,p.priceVersion,p.allowedPurposes,
    p.contextWindowTokens,p.maximumInputTokens,p.maximumOutputTokens,
    p.maximumSerializedRequestBytes,p.inputMicroUsdPerMillion,
    p.cachedInputMicroUsdPerMillion,p.outputMicroUsdPerMillion,
  ]);
  await c.query(`insert into public.seyeon_ai_governor_daily_budgets_v1
    (bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd,occupied_micro_usd)
    values ($1::date,$2::bigint,$3::bigint,0)
    on conflict (bucket_utc_date) do nothing`,[
    budget.utcDate,budget.globalMicroUsd,budget.subjectMicroUsd,
  ]);
  const {rows:[saved]}=await c.query(`select
    (select count(*)=1 from public.seyeon_ai_governor_model_policies_v1
      where provider_key=$1 and model_key=$2 and policy_version=$3
        and price_version=$4 and allowed_purposes=$5::text[]
        and context_window_tokens=$6 and maximum_input_tokens=$7
        and maximum_output_tokens=$8 and maximum_serialized_request_bytes=$9
        and input_micro_usd_per_million=$10 and cached_input_micro_usd_per_million=$11
        and output_micro_usd_per_million=$12 and not is_active) as inactive_exact_policy,
    (select count(*)=1 from public.seyeon_ai_governor_daily_budgets_v1
      where bucket_utc_date=$13::date and global_limit_micro_usd=$14::bigint
        and subject_limit_micro_usd=$15::bigint
        and subject_limit_micro_usd=global_limit_micro_usd
        and occupied_micro_usd=0) as exact_empty_budget`,[
    p.providerKey,p.modelKey,p.policyVersion,p.priceVersion,p.allowedPurposes,
    p.contextWindowTokens,p.maximumInputTokens,p.maximumOutputTokens,
    p.maximumSerializedRequestBytes,p.inputMicroUsdPerMillion,
    p.cachedInputMicroUsdPerMillion,p.outputMicroUsdPerMillion,
    budget.utcDate,budget.globalMicroUsd,budget.subjectMicroUsd,
  ]);
  if(saved?.inactive_exact_policy!==true||saved.exact_empty_budget!==true)
    throw Error('Existing budget/policy conflict, or model became active.');
  await c.query('COMMIT');tx=false;
  console.log('SEYEON_S0_BUDGET_STAGED_MODEL_INACTIVE');
}catch{
  if(tx)try{await c.query('ROLLBACK')}catch{}
  console.error('SEYEON_S0_BUDGET_REJECTED_OR_UNCONFIRMED');
  process.exitCode=1;
}finally{await c.end().catch(()=>{});}
