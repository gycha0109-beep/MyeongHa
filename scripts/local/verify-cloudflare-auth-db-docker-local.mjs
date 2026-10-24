#!/usr/bin/env node
// Stage 5: disposable LOCAL Docker Desktop/Linux PostgreSQL TLS + subject RLS.
// No Cloudflare deployment, Supabase, Production credential or remote DB.
// Watchtower-Track: ops
import { spawnSync } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const db = 'myeongha_saju_subject_tls_verify';
const id = randomBytes(6).toString('hex');
const container = 'myeongha-cf-stage5-' + id;
const certVolume = 'myeongha-cf-stage5-certs-' + id;
const portable = [
  'PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEPATH', 'HOMEDRIVE',
  'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'DOCKER_CONFIG',
  'DOCKER_CONTEXT', 'DOCKER_HOST',
];
const localEnv = Object.fromEntries(portable
  .filter(key => process.env[key] !== undefined)
  .map(key => [key, process.env[key]]));
let certDir;
let volumeCreated = false;
let failure;

function docker(args, { input, allowFailure = false, timeout = 120_000 } = {}) {
  const result = spawnSync('docker', args, {
    shell: false, encoding: 'utf8', windowsHide: true,
    env: localEnv, input, timeout, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    // Do not print stderr, SQL, credentials or certificate bytes.
    throw new Error('Local Docker step rejected (' + args[0] + '): '
      + (result.error?.code || result.signal || 'exit ' + result.status));
  }
  return result.stdout.trim();
}

function requireLocalDocker() {
  if (process.argv.length !== 2) {
    throw new Error('No arguments accepted; disposable local DB only.');
  }
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('Node 24 is required.');
  }
  const remote = process.env.DOCKER_HOST;
  if (remote && !remote.startsWith('unix://') && !remote.startsWith('npipe://')) {
    throw new Error('Remote Docker daemon is forbidden.');
  }
  const endpoint = docker([
    'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}',
  ], { timeout: 15_000 });
  if (!endpoint.startsWith('unix://') && !endpoint.startsWith('npipe://')) {
    throw new Error('Docker context must point to a local socket/Desktop.');
  }
  docker(['info', '--format', '{{.ServerVersion}}'], { timeout: 15_000 });
  if (docker(['image', 'inspect', 'postgres:15'], {
    allowFailure: true, timeout: 15_000,
  }) === null) {
    throw new Error('postgres:15 image not cached locally; image pull is not automatic.');
  }
  if (!existsSync(join(root, 'node_modules/vitest/vitest.mjs'))) {
    throw new Error('Install project dependencies first: npm ci --ignore-scripts');
  }
}

function runSql(path, extraVars = []) {
  const input = readFileSync(join(root, path));
  docker([
    'exec', '-i', '-u', 'postgres', container,
    'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    ...extraVars.flatMap(([key, value]) => ['-v', key + '=' + value]),
    '-d', db,
  ], { input, timeout: 120_000 });
}

const certSetup = [
  'set -eu',
  "openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 -subj '/CN=Disposable Local Subject CA' -keyout /tls/ca.key -out /tls/ca.crt >/dev/null 2>&1",
  "openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 -subj '/CN=Disposable Wrong Subject CA' -keyout /tls/wrong-ca.key -out /tls/wrong-ca.crt >/dev/null 2>&1",
  "openssl req -new -newkey rsa:2048 -nodes -sha256 -subj '/CN=subject.saju-bridge-ci.invalid' -keyout /tls/server.key -out /tls/server.csr >/dev/null 2>&1",
  "printf 'subjectAltName=DNS:subject.saju-bridge-ci.invalid\\nextendedKeyUsage=serverAuth\\n' > /tls/server.ext",
  'openssl x509 -req -in /tls/server.csr -CA /tls/ca.crt -CAkey /tls/ca.key -CAcreateserial -out /tls/server.crt -days 1 -sha256 -extfile /tls/server.ext >/dev/null 2>&1',
  'chown 999:999 /tls/server.key',
  'chmod 600 /tls/server.key /tls/ca.key /tls/wrong-ca.key',
  'chmod 644 /tls/ca.crt /tls/wrong-ca.crt /tls/server.crt',
].join('\n');
const pause = ms => new Promise(done => setTimeout(done, ms));

async function run() {
  requireLocalDocker();
  const adminPassword = randomBytes(28).toString('hex');
  const subjectPassword = randomBytes(28).toString('hex');

  docker(['volume', 'create', certVolume]);
  volumeCreated = true;
  docker([
    'run', '--rm', '--pull=never', '--network', 'none',
    '--user', 'root', '--volume', certVolume + ':/tls',
    'postgres:15', 'sh', '-euc', certSetup,
  ], { timeout: 90_000 });

  docker([
    'run', '--detach', '--pull=never', '--name', container,
    '--publish', '127.0.0.1::5432',
    '--volume', certVolume + ':/tls:ro',
    '--env', 'POSTGRES_USER=postgres',
    '--env', 'POSTGRES_DB=' + db,
    '--env', 'POSTGRES_PASSWORD=' + adminPassword,
    'postgres:15',
    '-c', 'ssl=on', '-c', 'ssl_cert_file=/tls/server.crt',
    '-c', 'ssl_key_file=/tls/server.key',
    '-c', 'ssl_min_protocol_version=TLSv1.2',
  ], { timeout: 90_000 });

  const portResult = docker(['port', container, '5432/tcp']);
  const matched = /^127\.0\.0\.1:(\d+)$/.exec(portResult);
  if (!matched) throw new Error('DB port is not bound only to 127.0.0.1.');
  const port = Number(matched[1]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid isolated DB port.');
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ok = docker([
      'exec', '-u', 'postgres', container,
      'psql', '-X', '-A', '-t', '-d', db, '-c', 'select 1',
    ], { allowFailure: true, timeout: 5_000 });
    if (ok === '1') { ready = true; break; }
    await pause(1000);
  }
  if (!ready) throw new Error('Local disposable PostgreSQL did not become ready.');
  docker([
    'exec', '-u', 'postgres', container, 'sh', '-ec',
    "sed -i '1i hostnossl all all 0.0.0.0/0 reject' /var/lib/postgresql/data/pg_hba.conf && pg_ctl -D /var/lib/postgresql/data reload",
  ]);

  runSql('test/db/bootstrap_supabase_auth_stub.sql');
  const migrations = readdirSync(join(root, 'supabase/migrations'))
    .filter(name => name.endsWith('.sql')).sort();
  if (migrations.length === 0) throw new Error('No checked-in DB migrations found.');
  for (const migration of migrations) {
    try { runSql('supabase/migrations/' + migration); }
    catch { throw new Error('Disposable DB migration rejected: ' + basename(migration)); }
  }
  runSql('test/db/fixtures/saju_local_subject_birth_proof_e2e.sql');
  runSql('test/db/fixtures/saju_local_tls_subject_login.sql', [
    ['subject_password', subjectPassword],
  ]);

  const ca = docker(['exec', container, 'cat', '/tls/ca.crt']);
  const wrongCa = docker(['exec', container, 'cat', '/tls/wrong-ca.crt']);
  const fingerprint = new X509Certificate(ca).fingerprint256.replaceAll(':', '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || ca === wrongCa) {
    throw new Error('Disposable CA authority generation rejected.');
  }
  certDir = mkdtempSync(join(tmpdir(), 'myeongha-cf-stage5-'));
  const caPath = join(certDir, 'ca.crt');
  const wrongPath = join(certDir, 'wrong-ca.crt');
  writeFileSync(caPath, ca + '\n', { mode: 0o600 });
  writeFileSync(wrongPath, wrongCa + '\n', { mode: 0o600 });

  // Explicit allowlist: never inherit Production, Supabase, OAuth or Cloudflare secrets.
  const testEnv = {
    ...localEnv,
    MYEONGHA_CLOUDFLARE_DIRECT_TLS_LOCAL_DOCKER_ENABLED: '1',
    MYEONGHA_LOCAL_CLOUDFLARE_DB_PORT: String(port),
    MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD: subjectPassword,
    MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE: caPath,
    MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE: wrongPath,
    MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT: fingerprint,
  };
  const test = spawnSync(process.execPath, [
    join(root, 'node_modules/vitest/vitest.mjs'),
    'run', 'test/cloudflare-request-scope-real-tls-postgres.e2e.test.ts',
  ], {
    cwd: root, shell: false, env: testEnv, stdio: 'inherit',
    windowsHide: true, timeout: 120_000,
  });
  if (test.error || test.status !== 0) {
    throw new Error('Local TLS/RLS test did not pass; no admission granted.');
  }
  console.log('[cloudflare-stage5] Local Docker PostgreSQL TLS + member RLS PASS.');
  console.log('[cloudflare-stage5] Worker remote TCP/OAuth/Production: NOT TESTED / HOLD.');
}

try { await run(); }
catch (error) {
  failure = error;
  console.error('[cloudflare-stage5] BLOCKED:', error instanceof Error
    ? error.message : 'unknown local failure');
} finally {
  // Unique disposable resources only. Never prune other Docker projects.
  docker(['rm', '-f', '-v', container], { allowFailure: true, timeout: 30_000 });
  if (volumeCreated) docker(['volume', 'rm', certVolume], {
    allowFailure: true, timeout: 30_000,
  });
  if (certDir) rmSync(certDir, { recursive: true, force: true });
  if (docker(['container', 'inspect', container], { allowFailure: true }) !== null ||
    (volumeCreated && docker(['volume', 'inspect', certVolume], {
      allowFailure: true,
    }) !== null)) {
    failure ??= new Error('Disposable Docker/CA cleanup incomplete.');
    console.error('[cloudflare-stage5] CLEANUP BLOCKED: inspect only '
      + container + ' and ' + certVolume + '.');
  }
  if (!failure) console.log('[cloudflare-stage5] Disposable Docker DB/CA: removed.');
}
if (failure) process.exitCode = 1;
