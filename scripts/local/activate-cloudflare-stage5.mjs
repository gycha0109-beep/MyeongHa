#!/usr/bin/env node
// Interactive, owner-operated Stage 5 credential activation.
// A fresh credential exists only in this process and the user's local
// clipboard. Never write it to the repository, logs, arguments or shell history.
// Watchtower-Track: ops
import { randomBytes, X509Certificate, createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const ROLE = 'myeongha_cf_api_login';
const EXECUTION_ROLE = 'myeongha_api_executor';
const POOLER_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';
const PORT = 5432;
const ROOT_FINGERPRINT = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
const DESTINATION = 'https://myeongha.gycha0109.workers.dev';
const CA_PATH = 'C:/Temp/myeongha-supabase-root-ca.pem';
const ROLE_LOGIN = ROLE + '.' + PROJECT_REF;

function postgresScramVerifier(password) {
  const salt=randomBytes(16);
  const salted=pbkdf2Sync(password,salt,4096,32,'sha256');
  const clientKey=createHmac('sha256',salted).update('Client Key').digest();
  const storedKey=createHash('sha256').update(clientKey).digest('base64');
  const serverKey=createHmac('sha256',salted).update('Server Key').digest('base64');
  return 'SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+storedKey+':'+serverKey;
}

function checkRootCertificate(pem) {
  const x509 = new X509Certificate(pem);
  if (!x509.ca || x509.fingerprint256 !== ROOT_FINGERPRINT ||
      !x509.verify(x509.publicKey) || x509.subject !== x509.issuer) {
    throw new Error('Saved Supabase root CA does not match the audited certificate');
  }
}

function runProcess(command, args, input='', options={}) {
  return new Promise((resolveProcess,reject)=>{
    const child=spawn(command,args,{
      cwd:process.cwd(),
      windowsHide:true,
      stdio:['pipe','pipe','pipe'],
      ...options,
    });
    // Do not log child stdout or stderr: these tools can be supplied secrets.
    const stdout=[],stderr=[];
    child.stdout.on('data',c=>{if(stdout.reduce((n,b)=>n+b.length,0)<10_000) stdout.push(c)});
    child.stderr.on('data',c=>{if(stderr.reduce((n,b)=>n+b.length,0)<10_000) stderr.push(c)});
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0){reject(new Error('Local command failed ('+command+', exit '+code+')'));return;}
      resolveProcess({stdout:Buffer.concat(stdout).toString('utf8').slice(0,1000)});
    });
    child.stdin.end(input);
  });
}

async function wrangler(args,input='') {
  // Windows .cmd scripts must be run through cmd.exe. Nothing secret is
  // interpolated into the argv command or passed through the shell.
  return runProcess('cmd.exe',
    ['/d','/s','/c','npx.cmd --yes wrangler@4.151.2 '+args.join(' ')],input);
}

async function copySql(sql) {
  await runProcess('powershell.exe',
    ['-NoProfile','-NonInteractive','-Command','$input | Set-Clipboard'],sql);
}

async function verifyDatabase(password,pem) {
  let lastError;
  // The Supavisor shared pooler may briefly cache the prior custom-role
  // credential after its first activation.
  for(let attempt=0;attempt<3;attempt++){
    const client=new Client({
      host:POOLER_HOST,port:PORT,database:'postgres',
      user:ROLE_LOGIN,password,
      ssl:{ca:pem,rejectUnauthorized:true,servername:POOLER_HOST},
      connectionTimeoutMillis:8_000,
      query_timeout:8_000,
      statement_timeout:5_000,
    });
    try{
      await client.connect();
      const before=await client.query(
        'select current_user::text as principal, pg_catalog.pg_has_role(current_user,$1::name,\'MEMBER\') as can_enter',
        [EXECUTION_ROLE],
      );
      if(before.rows.length!==1||before.rows[0].principal!==ROLE||
         before.rows[0].can_enter!==true)throw Error('Database login role preflight failed');
      await client.query('begin');
      try{
        await client.query('set local role '+EXECUTION_ROLE);
        const asRole=await client.query('select current_user::text as principal');
        if(asRole.rows[0]?.principal!==EXECUTION_ROLE){
          throw Error('Transaction-local subject execution role failed');
        }
      }finally{
        await client.query('rollback');
      }
      return;
    }catch(error){
      lastError=error;
      if(attempt<2) await new Promise(done=>setTimeout(done,2_500*(attempt+1)));
    }finally{await client.end().catch(()=>undefined)}
  }
  // Keep database error messages and URL/user/pass completely out of output.
  throw Error('DB TLS/login/SET LOCAL ROLE verification failed ('+
    String(lastError?.code||'unknown')+'). Check that the SQL ran successfully.');
}

async function main(){
  if(process.platform!=='win32') throw Error('Run this setup on the authorized Windows development PC');
  // An interrupted or outdated checkout must not write live Worker bindings.
  const repoManifest=JSON.parse(await readFile(resolve('wrangler.ops.jsonc'),'utf8'));
  if(repoManifest.name!=='myeongha' ||
     repoManifest.main!=='./workers/cloudflare-static-preview.mjs'){
    throw Error('Run from the approved MyeongHa Ops repository root');
  }
  const pem=await readFile(resolve(CA_PATH),'utf8');
  checkRootCertificate(pem);
  if (process.argv.includes('--preflight')) {
    console.log('Stage 5 local prerequisites: Worker manifest, pg driver and pinned root CA verified.');
    return;
  }
  const password=randomBytes(36).toString('base64url');
  const scramVerifier=postgresScramVerifier(password);
  const connectorHandoff=process.argv.includes('--connector-handoff');
  const authRateSecret=randomBytes(48).toString('base64url');
  const end=new Date(Date.now()+180*24*60*60*1000).toISOString().slice(0,19).replace('T',' ')+'+00';
  const sql=`DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}'
      AND NOT rolbypassrls AND NOT rolsuper
      AND rolconnlimit = 5
  ) THEN RAISE EXCEPTION 'Cloudflare dedicated least-privileged login role is missing';
  END IF;
  IF NOT pg_has_role('${ROLE}', '${EXECUTION_ROLE}', 'MEMBER') THEN
    RAISE EXCEPTION 'Cloudflare login cannot enter the existing API execution role';
  END IF;
END
$check$;
ALTER ROLE ${ROLE} WITH LOGIN PASSWORD '${scramVerifier}' VALID UNTIL '${end}';`;
  if (connectorHandoff) {
    // This contains a high-entropy SCRAM verifier only, never the plaintext
    // password. The supervising automation applies SQL via Supabase's
    // authorized connector and returns the exact confirmation token.
    console.log('STAGE5_SQL_B64='+Buffer.from(sql,'utf8').toString('base64'));
    const rl=createInterface({input:process.stdin,output:process.stdout});
    let answer;
    try{answer=await rl.question('Awaiting SQL activation confirmation: ')}
    finally{rl.close()}
    if(answer.trim()!=='SQL_APPLIED') throw Error('SQL confirmation was not received');
  } else {
    await copySql(sql);
    console.log('Supabase SQL has been copied to the local Windows clipboard.');
    console.log('1. Open https://supabase.com/dashboard/project/'+PROJECT_REF+'/sql/new');
    console.log('2. Paste (Ctrl+V), run the SQL and confirm success.');
    console.log('3. Return to this console and press Enter. Use Ctrl+C to cancel.');
    const rl=createInterface({input:process.stdin,output:process.stdout});
    try{await rl.question('SQL succeeded? Press Enter to verify DB TLS/login: ')}
    finally{rl.close()}
    await copySql('').catch(()=>undefined);
  }
  await verifyDatabase(password,pem);
  console.log('DB TLS, dedicated login and transaction-local execution role: verified.');

  const url=new URL('postgresql://'+POOLER_HOST+':'+PORT+'/postgres');
  url.username=ROLE_LOGIN;
  url.password=password;
  url.searchParams.set('sslmode','verify-full');

  // Register only after the independent DB preflight. Keep all existing
  // unrelated Worker bindings and Vercel environment untouched.
  const updates={
    MYEONGHA_DATABASE_URL:url.toString(),
    MYEONGHA_AUTH_RATE_LIMIT_SECRET:authRateSecret,
    MYEONGHA_CLOUDFLARE_AUTH_DB_MODE:'approved-auth-db-v1',
    MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL:'approved-isolated-tls-rls-v1',
  };
  await wrangler(['secret','bulk','--name','myeongha','--config','wrangler.ops.jsonc'],
    JSON.stringify(updates));
  console.log('Cloudflare Stage 5 credentials installed; restoring Worker static assets...');
  // Wrangler secret writes can temporarily remove static asset routing;
  // always redeploy the exact checked-out source, keeping unrelated vars.
  await wrangler(['deploy','--config','wrangler.ops.jsonc','--keep-vars']);
  const health=await fetch(DESTINATION+'/api/health',{cache:'no-store'});
  const auth=await fetch(DESTINATION+'/auth.html',{cache:'no-store'});
  if(health.status!==200||auth.status!==200)
    throw Error('Worker deployed, but static health/auth parity needs repair');
  const bootstrap=await fetch(DESTINATION+'/api/session/bootstrap',{
    method:'POST',
    headers:{'content-type':'application/json','origin':DESTINATION},
    body:'{}',
    cache:'no-store',
  });
  console.log('Cloudflare guest bootstrap HTTP status: '+bootstrap.status);
  // Never log or store the one-time guest bearer token in response.json().
  if(bootstrap.status!==200){
    throw Error('DB connected, but guest bootstrap E2E did not succeed');
  }
  console.log('Stage 5 DB activation and guest bootstrap E2E: PASS');
  console.log('Next: complete Google OAuth interactively in a browser.');
}

main().catch(error=>{
  console.error('Stage 5 activation stopped safely: '+error.message);
  process.exitCode=1;
});
