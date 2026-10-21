// CI-only local workerd -> disposable Postgres TLS/RLS proof.
// Requires scripts/local/setup-saju-bridge-tls-subject-ci.sh fixture.
// Does not need or read any Production secret; no Cloudflare deployment.
// Watchtower-Track: ops
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT=8792;
const URL='http://127.0.0.1:'+PORT;
const CONFIG='workers/cloudflare-auth-db-tls.local.jsonc';
const CASES=['member-a','member-b','member-a','unknown-member','rollback',
  'member-b','bad-ca','bad-host','plaintext','bad-login','member-a'];
const HDR={'X-Myeongha-Offline-Token':'isolated-ci-guard-v1'};
const VARS=['workers/.dev.vars','.dev.vars'];
const assert=(v,msg)=>{if(!v)throw Error(msg);};
const pause=ms=>new Promise(done=>setTimeout(done,ms));

function guardedEnvironment(){
  assert(process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true',
    'Refusing TLS PostgreSQL network probe outside disposable CI');
  assert(process.env.PGHOST==='127.0.0.1'&&process.env.PGPORT==='5432'&&
    process.env.PGDATABASE==='myeongha_saju_local_verify'&&
    process.env.PGUSER==='postgres','Unexpected local PostgreSQL fixture origin');
  assert(process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD&&
    process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE&&
    process.env.MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE&&
    process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT,
    'Disposable TLS Subject fixture not configured');
}
async function localFileCannotExist(file){
  try {await access(file);throw Error('Local test binding already exists: '+file);}
  catch(err){if(err.code!=='ENOENT')throw err;}
}
async function probe(path,options={}){
  return fetch(URL+path,{redirect:'manual',signal:AbortSignal.timeout(15_000),...options});
}
async function test(){
  const baseline=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const local=JSON.parse(await readFile(CONFIG,'utf8'));
  assert(baseline.name==='myeongha'&&
    baseline.main==='./workers/cloudflare-static-preview.mjs',
    'Real Worker config must stay unchanged and DB-free');
  assert(local.name==='myeongha-auth-db-tls-offline'&&
    local.main==='./cloudflare-auth-db-tls-e2e.mjs'&&
    local.workers_dev===false&&local.preview_urls===false,
    'TLS integration probe must be a separate offline entrypoint');
  for(const key of ['assets','hyperdrive','route','routes','vars','secrets','d1_databases','kv_namespaces']){
    assert(!Object.hasOwn(local,key),'Offline TLS config must not provision '+key);
  }
  for(const file of VARS)await localFileCannotExist(file);
  const cert=await readFile(process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE,'utf8');
  const wrong=await readFile(process.env.MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE,'utf8');
  const password=process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD;
  const caB64=Buffer.from(cert).toString('base64');
  const wrongB64=Buffer.from(wrong).toString('base64');
  const fingerprint=process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT;
  assert(fingerprint.match(/^[a-f0-9]{64}$/),'Test CA fingerprint invalid');
  const values={MYEONGHA_LOCAL_TEST_PASSWORD:password,
    MYEONGHA_LOCAL_TEST_CA_B64:caB64,
    MYEONGHA_LOCAL_TEST_WRONG_CA_B64:wrongB64,
    MYEONGHA_LOCAL_TEST_CA_FP:fingerprint};
  const vars=Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n';
  // Config-relative path differs between Wrangler versions; write identical
  // temporary fixtures to both search paths, never to a deployed Worker.
  for(const file of VARS)await writeFile(file,vars,{mode:0o600,flag:'wx'});
  let diagnostics='';
  const collect=chunk=>{
    diagnostics=(diagnostics+String(chunk)).slice(-9000);
  };
  const child=spawn(process.platform==='win32'?'npm.cmd':'npm',[
    'exec','--yes','--package=wrangler@4.151.2','--',
    'wrangler','dev','--config',CONFIG,'--ip','127.0.0.1','--port',String(PORT),
  ],{
    cwd:resolve('.'),env:{...process.env,WRANGLER_SEND_METRICS:'false',NO_COLOR:'1'},
    stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',
  });
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  let spawnError;
  child.on('error',err=>{spawnError=err;});
  try{
    let ready=false;
    for(let i=0;i<240;i++){
      if(spawnError||child.exitCode!==null)throw Error('Offline Worker process terminated before ready');
      try{
        const response=await probe('/__offline/subject-tls');
        if(response.status===404){ready=true;break;}
      }catch{}
      await pause(500);
    }
    assert(ready,'Offline Worker did not become ready within 120 seconds');
    const unknown=await probe('/api/health',{headers:HDR});
    assert(unknown.status===404,'Unrelated API must remain closed in test-only Worker');
    const missing=await probe('/__offline/subject-tls');
    assert(missing.status===404,'Untrusted probe must be 404');
    for(const testCase of CASES){
      const response=await probe('/__offline/subject-tls',{
        headers:{...HDR,'X-Myeongha-Offline-Case':testCase},
      });
      if(response.status!==200){
        const details=await response.json().catch(()=>null);
        const reason=typeof details?.diagnostic?.reason==='string'
          ?details.diagnostic.reason.slice(0,35):'NO_REASON';
        const code=typeof details?.diagnostic?.code==='string'
          ?details.diagnostic.code.slice(0,45):'NO_CODE';
        const stage=typeof details?.diagnostic?.stage==='string'
          ?details.diagnostic.stage.slice(0,40):'NO_STAGE';
        // Worker strips synthetic fixture values itself; repeat redaction
        // using the CI-only values before any error reaches GitHub logs.
        let detail=typeof details?.diagnostic?.detail==='string'
          ?details.diagnostic.detail.slice(0,180):'NO_DETAIL';
        for(const sensitive of [password,caB64,wrongB64]){
          if(sensitive)detail=detail.replaceAll(sensitive,'[redacted]');
        }
        throw Error('Isolated TLS/subject test failed: '+testCase+
          ' HTTP '+response.status+' stage='+stage+
          ' reason='+reason+' code='+code+' detail='+detail);
      }
      assert(response.headers.get('cache-control')==='no-store','Sensitive test responses must not cache');
      assert(!response.headers.has('set-cookie')&&!response.headers.has('access-control-allow-origin'),
        'Isolated test leaked cookie/CORS');
      const data=await response.json();
      assert(data.pass===true&&data.case===testCase&&Object.keys(data).sort().join()==='case,checks,pass',
        'Invalid test result contract: '+testCase);
      const expected=['member-a','member-b'].includes(testCase)
        ?{tls:true,role:true,rls:true}:{denied:true};
      assert(JSON.stringify(data.checks)===JSON.stringify(expected),
        'TLS/RLS contract mismatch: '+testCase);
    }
    const rejected=await probe('/__offline/subject-tls',{
      method:'POST',headers:{...HDR,'X-Myeongha-Offline-Case':'member-a'},
    });
    assert(rejected.status===405&&rejected.headers.get('allow')==='GET',
      'Offline test must reject other methods');
    assert((await rejected.text())==='','Offline test must not disclose denied body');
    console.log(JSON.stringify({status:'PASS',runtime:'local workerd',
      postgres:'disposable TLS PG15',requests:CASES.length,
      tls:'peer CA and hostname checked; negative peers blocked',
      authority:'NOLOGIN execution role and member subject RLS checked',
      negative:'unknown identity/rollback/CA/hostname/plaintext/password denied',
      productionDbConnections:0,cloudflareDeployments:0},null,2));
  }catch(error){
    const scrub=v=>String(v).replaceAll(password,'[masked]')
      .replaceAll(caB64,'[masked-CA]').replaceAll(wrongB64,'[masked-other-CA]');
    console.error('Cloudflare disposable TLS/RLS verification FAILED:',scrub(error?.message));
    console.error('Sanitized Wrangler diagnostics:',scrub(diagnostics.slice(-1200)));
    process.exitCode=1;
  }finally{
    if(child.exitCode===null) {
      try{
        if(process.platform!=='win32')process.kill(-child.pid,'SIGTERM');
        else child.kill('SIGTERM');
      }catch{child.kill('SIGTERM');}
    }
    for(const file of VARS)await rm(file,{force:true});
  }
}

async function main(){
  guardedEnvironment();
  await test();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await main();
}
