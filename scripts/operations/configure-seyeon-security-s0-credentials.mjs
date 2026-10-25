// Watchtower-Track: security
// Operator-only bootstrap: no secret in argv, SQL files, stdout or artifacts.
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,pbkdf2Sync,createHmac,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {prepareProductionPostgresStrictLibpqV1} from './prepare-production-postgres-strict-libpq.mjs';

const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const envFile=option('--env-file'),caFile=option('--ca-file'),output=option('--output-secrets-file');
if(!args.includes('--apply')||![envFile,caFile,output].every(p=>typeof p==='string'&&isAbsolute(p))){
  throw Error('Explicit --apply and absolute env/CA/exclusive secret output paths required.');
}
for(const root of [fileURLToPath(new URL('../../',import.meta.url)),dirname(envFile)]){
  const rel=relative(resolve(root),resolve(output));
  if(rel===''||(!rel.startsWith('..'+sep)&&!isAbsolute(rel))){
    throw Error('Credential output must be outside both repository checkouts.');
  }
}
const source=parseEnv(await readFile(envFile,'utf8'));
if(!source.SUPABASE_DB_PASSWORD||!source.MYEONGHA_WORKER_DATABASE_URL||!source.OPENAI_API_KEY){
  throw Error('Existing operator DB and native Provider credentials required.');
}
const ref='cnsfpcdiyofqvhpcegfc',principal='myeongha_seyeon_governed_login';
const ordinary=new URL(source.MYEONGHA_WORKER_DATABASE_URL);
const secretDir=dirname(resolve(output));
await mkdir(secretDir,{recursive:true,mode:0o700});
if(process.platform==='win32'){
  const account=`${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  execFileSync('icacls',[secretDir,'/inheritance:r','/grant:r',`${account}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{stdio:'ignore'});
}else await chmod(secretDir,0o700);
const root=await readFile(caFile,'utf8');
await prepareProductionPostgresStrictLibpqV1({output:resolve(secretDir,'verified-public-ca.pem'),
  host:ordinary.hostname,principal:`postgres.${ref}`,port:'5432',database:'postgres'},
{...process.env,RUNNER_TEMP:secretDir,SUPABASE_PROJECT_ID:ref,SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM:root});
const client=new Client({host:ordinary.hostname,port:5432,database:'postgres',user:`postgres.${ref}`,
  password:source.SUPABASE_DB_PASSWORD,ssl:{ca:root,rejectUnauthorized:true},connectionTimeoutMillis:5000});
await client.connect();
let transaction=false;
try{
  await client.query('BEGIN');transaction=true;
  await client.query('set local lock_timeout=\'5s\'');
  await client.query("select pg_advisory_xact_lock(hashtextextended('seyeon-s0-governed-login-bootstrap-v1',0))");
  const {rows:[state]}=await client.query(`select current_user='postgres' and current_database()='postgres' as owner,
    to_regprocedure('seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)') is not null as installed,
    exists(select 1 from pg_roles where rolname=$1) as login_exists`,[principal]);
  if(state.owner!==true||state.installed!==true||state.login_exists!==false){
    throw Error('Requires installed S0 and absent dedicated LOGIN; never rotate an unknown existing credential.');
  }
  const password=randomBytes(32).toString('hex');
  const governed=new URL(ordinary);
  governed.username=`${principal}.${ref}`;governed.password=password;
  governed.port='5432';governed.pathname='/postgres';governed.search='?sslmode=verify-full';
  // Save before sending credential DDL: ambiguous COMMIT must never lose the
  // only credential copy or silently trigger a second CREATE/rotation.
  await writeFile(output,JSON.stringify({OPENAI_API_KEY:source.OPENAI_API_KEY,
    MYEONGHA_SEYEON_OPENAI_MODEL:'gpt-5.6-terra',
    MYEONGHA_SEYEON_GOVERNED_DATABASE_URL:governed.href,
    MYEONGHA_SEYEON_GOVERNED_DATABASE_PRINCIPAL:principal},null,2)+'\n',{flag:'wx',mode:0o600});
  // Send a SCRAM verifier, never the plaintext password in SQL text/parameters.
  // Generated ASCII hex needs no SASLprep normalization.
  if(!/^[a-f0-9]{64}$/u.test(password))throw Error('Credential generation failure');
  const salt=randomBytes(16),iterations=4096;
  const salted=pbkdf2Sync(password,salt,iterations,32,'sha256');
  const stored=createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64');
  const server=createHmac('sha256',salted).update('Server Key').digest('base64');
  const verifier=`SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${stored}:${server}`;
  await client.query(`create role myeongha_seyeon_governed_login login noinherit nosuperuser
    nocreatedb nocreaterole noreplication nobypassrls connection limit 4 password '${verifier}'`);
  await client.query('grant myeongha_seyeon_governed_executor to myeongha_seyeon_governed_login');
  await client.query('COMMIT');transaction=false;
  console.log('S0_DEDICATED_LOGIN_CREATED_SECRETS_SAVED_LOCALLY');
}catch(error){
  if(transaction)try{await client.query('ROLLBACK');}catch{ /* retain exclusive credential file for outcome reconciliation */ }
  // A server message can include SQL credential material. Emit only fixed text.
  console.error('S0_CREDENTIAL_BOOTSTRAP_FAILED_RECONCILE_BEFORE_RETRY');
  process.exitCode=1;
}finally{await client.end();}
