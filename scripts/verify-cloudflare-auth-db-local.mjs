// Run a separate, local-only workerd import probe for production Auth/DB modules.
// No real auth, TLS handshake, database, Cloudflare account or deploy.
// Watchtower-Track: ops
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = 'http://127.0.0.1:8791';
const HEADERS = Object.freeze({ 'X-Myeongha-Local-Probe': 'isolated-v1' });
const PROBE_PATH = '/__offline/auth-db';
const START_TIMEOUT_MS = 120_000;
const WRANGLER_VERSION = '4.151.2';

function assert(value, description) {
  if (!value) throw new Error(description);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function request(path, options = {}) {
  return fetch(URL + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
    ...options,
  });
}

async function checkConfig() {
  const active = await readJson('wrangler.jsonc');
  const isolated = await readJson('workers/cloudflare-auth-db-compat.local.jsonc');
  assert(active.name === 'myeongha', 'Production preview Worker name unexpectedly changed');
  assert(active.main === './workers/cloudflare-static-preview.mjs',
    'Isolated Auth/DB test must NOT be wired into Cloudflare deployed Worker');
  assert(isolated.main === './cloudflare-auth-db-compatibility.mjs',
    'Isolated entrypoint mismatch');
  assert(isolated.workers_dev === false && isolated.preview_urls === false,
    'Local-only config may not advertise deployment routes');
  for (const key of ['assets','vars','secrets','route','routes','triggers','hyperdrive','d1_databases','kv_namespaces']) {
    assert(!Object.hasOwn(isolated, key), 'Isolated test may not configure '+key);
  }
}

async function waitReady(child, getDiagnostics) {
  const end = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < end) {
    if (child.exitCode !== null) {
      throw new Error('Isolated Wrangler stopped before ready: ' + getDiagnostics());
    }
    try {
      const response = await request(PROBE_PATH,{ headers: HEADERS });
      if (response.status === 200 || response.status === 503) return;
    } catch {
      // Wrangler local dev is starting.
    }
    await new Promise(done => setTimeout(done, 500));
  }
  throw new Error('Isolated Wrangler startup timed out: ' + getDiagnostics());
}

async function validate() {
  const response = await request(PROBE_PATH, { headers: HEADERS });
  assert(response.status === 200, 'Auth/DB workerd module probe expected 200, got '+response.status);
  assert(response.headers.get('cache-control') === 'no-store', 'Probe must not be cached');
  assert(response.headers.get('x-content-type-options') === 'nosniff', 'Probe must set nosniff');
  assert(!response.headers.has('set-cookie'), 'Probe must not set cookies');
  assert(!response.headers.has('access-control-allow-origin'), 'Probe must not enable CORS');
  const value = await response.json();
  const keys = [
    'postgresDriverExports','productionPoolAdapterLoadable',
    'strictTlsAuthorityBuilderLoadable','nodeCryptoAvailable',
    'nodeTlsApiAvailable','missingCredentialsRejected',
  ];
  assert(value.status === 'pass', 'Worker signaled failed compatibility');
  assert(Object.keys(value.checks ?? {}).sort().join() === keys.sort().join(),
    'Unexpected isolated checks (risk of data exposure)');
  assert(keys.every(key => value.checks[key] === true),
    'Auth/DB module load or fail-closed invariant failed: '+JSON.stringify(value));
  for (const [path,method,headers,expected] of [
    [PROBE_PATH,'GET',{},404],
    ['/__offline/auth-db?debug=1','GET',HEADERS,404],
    ['/api/health','GET',HEADERS,404],
    ['/__offline/auth-db-extra','GET',HEADERS,404],
    [PROBE_PATH,'POST',HEADERS,405],
    [PROBE_PATH,'OPTIONS',HEADERS,405],
  ]) {
    const denied = await request(path,{method,headers});
    assert(denied.status === expected, method+' '+path+' must remain '+expected);
    assert(await denied.text() === '', 'Probe denial body must be empty');
    assert(!denied.headers.has('set-cookie'), 'Probe may not set cookies');
    assert(!denied.headers.has('access-control-allow-origin'), 'Probe may not enable CORS');
  }
  return {
    environment:'isolated local Wrangler workerd',
    pgImport:'PASS',
    productionSubjectPoolModule:'LOADABLE_ONLY',
    tls:'API_EXPORTS_ONLY_NOT_HANDSHAKE',
    emptyCredentials:'DENIED',
    networkOrDatabaseCalls:0,
    productionDeployment:'NONE',
    checks:'PASS',
  };
}

async function main() {
  await checkConfig();
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',[
    'exec', '--yes', `--package=wrangler@${WRANGLER_VERSION}`, '--',
    'wrangler','dev','--config','workers/cloudflare-auth-db-compat.local.jsonc',
    '--ip','127.0.0.1','--port','8791',
  ], {
    cwd: resolve('.'),
    env: { ...process.env, WRANGLER_SEND_METRICS:'false', NO_COLOR:'1' },
    stdio:['ignore','pipe','pipe'],
    detached:process.platform!=='win32',
  });
  let logs = '';
  const collect = part => { logs = (logs+part.toString()).slice(-8000); };
  child.stdout.on('data',collect);
  child.stderr.on('data',collect);
  let spawnError;
  child.on('error', error => { spawnError=error; });
  try {
    await waitReady(child,()=>logs);
    if (spawnError) throw spawnError;
    console.log('Cloudflare Auth/DB compatibility local:',await validate());
  } catch(error) {
    console.error('Cloudflare Auth/DB compatibility local FAILED:',error);
    console.error('Latest local Wrangler diagnostics:',logs.slice(-4000));
    process.exitCode=1;
  } finally {
    if (child.exitCode === null) {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid,'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
