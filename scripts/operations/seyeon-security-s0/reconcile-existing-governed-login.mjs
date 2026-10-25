// Watchtower-Track: security
// Read-only existing-login reconciliation, NEVER credential recovery/rotation.
import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {parseEnv} from 'node:util';
import {Client} from 'pg';

const argv=process.argv.slice(2);
const value=name=>{const i=argv.indexOf(name);return i<0?null:argv[i+1];};
const credentialsPath=value('--credentials-file');
const envPath=value('--env-file'),caPath=value('--ca-file');
if(argv.length!==6||![credentialsPath,envPath,caPath].every(x=>typeof x==='string'&&isAbsolute(x))){
  throw Error('Supply existing credentials, local Production env, and exact CA file paths');
}
for(const path of [credentialsPath,envPath,caPath]){
  const meta=await lstat(path);
  if(!meta.isFile()||meta.isSymbolicLink()||meta.size>200_000){
    throw Error('Existing credentials require regular bounded files');
  }
}
const secrets=JSON.parse(await readFile(credentialsPath,'utf8'));
const local=parseEnv(await readFile(envPath,'utf8'));
const governedUrl=secrets.MYEONGHA_SEYEON_GOVERNED_DATABASE_URL;
const ordinaryUrl=local.MYEONGHA_WORKER_DATABASE_URL;
const secretPrincipal=secrets.MYEONGHA_SEYEON_GOVERNED_DATABASE_PRINCIPAL;
if(typeof governedUrl!=='string'||typeof ordinaryUrl!=='string'||
   secretPrincipal!=='myeongha_seyeon_governed_login'){
  throw Error('Existing dedicated credential is absent or has wrong principal');
}
const governed=new URL(governedUrl),ordinary=new URL(ordinaryUrl);
if(!['postgres:','postgresql:'].includes(governed.protocol)||
   governed.hostname!==ordinary.hostname||
   !governed.hostname.endsWith('.pooler.supabase.com')||
   governed.port!=='5432'||governed.pathname!=='/postgres'||
   governed.searchParams.get('sslmode')!=='verify-full'||
   decodeURIComponent(governed.username)!=='myeongha_seyeon_governed_login.cnsfpcdiyofqvhpcegfc'||
   typeof governed.password!=='string'||governed.password.length<16||
   governed.password===ordinary.password){
  throw Error('Existing credential does not target the approved isolated identity');
}
const ca=await readFile(caPath,'utf8');
if(!ca.includes('-----BEGIN CERTIFICATE-----')){
  throw Error('Existing credential requires a trusted server CA');
}
const client=new Client({host:governed.hostname,port:5432,database:'postgres',
  user:decodeURIComponent(governed.username),
  password:decodeURIComponent(governed.password),
  ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:5000,
  statement_timeout:5000,application_name:'seyeon_s0_existing_login_readonly_audit'});
try{
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const {rows:[row]}=await client.query(`select
    current_user='myeongha_seyeon_governed_login' as exact_login,
    current_database()='postgres' as exact_database,
    current_setting('server_version_num')::int between 170000 and 179999 as pg17,
    (select count(*)=1 from pg_roles where rolname=current_user
      and rolcanlogin and not rolsuper and not rolbypassrls
      and not rolcreatedb and not rolcreaterole and rolconnlimit between 1 and 5) as least_privilege,
    pg_has_role(current_user,'myeongha_seyeon_governed_executor','SET') as explicit_governed_set,
    not pg_has_role(current_user,'myeongha_seyeon_cost_meter_owner','MEMBER') as no_cost_owner,
    not pg_has_role(current_user,'myeongha_api_executor','MEMBER') as no_ordinary_api,
    not has_table_privilege(current_user,
      'public.seyeon_ai_governor_model_policies_v1','SELECT,INSERT,UPDATE,DELETE') as no_direct_policy_table,
    not has_table_privilege(current_user,
      'public.seyeon_ai_governor_daily_budgets_v1','SELECT,INSERT,UPDATE,DELETE') as no_direct_budget_table`);
  if(!row||!Object.values(row).every(v=>v===true)){
    throw Error('Existing dedicated login fails least-privilege preflight');
  }
  await client.query('ROLLBACK');
  console.log('SEYEON_S0_EXISTING_GOVERNED_LOGIN_VERIFIED_READONLY');
  console.log('SEYEON_S0_EXISTING_GOVERNED_LOGIN_NO_ROTATION');
}catch{
  try{await client.query('ROLLBACK')}catch{}
  console.error('SEYEON_S0_EXISTING_GOVERNED_LOGIN_UNVERIFIED');
  process.exitCode=1;
}finally{await client.end().catch(()=>{});}
