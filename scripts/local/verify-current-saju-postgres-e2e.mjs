// Existing PG fixture + current-subject route + pinned Saju + Vitest/Chrome.
// Disposable local evidence only. Never reads .env or accepts a database URL.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const expectedSajuSha = '2bb797f0ca05775ccaaa36814c041ae4262ac872';
const saju = resolve(process.argv[2] ?? 'missing-saju-checkout');
const minimal = Object.fromEntries(
  ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]),
);
const container = 'myeongha-current-saju-e2e-' + randomBytes(5).toString('hex');
const dbPassword = randomBytes(32).toString('base64url');
const runtimePassword = randomBytes(32).toString('base64url');
const bearer = randomBytes(32).toString('base64url');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH;

function command(binary, args, input) {
  const result = spawnSync(binary, args, {
    cwd: root, env: minimal, encoding: 'utf8', input,
    timeout: 180_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  });
  if (result.status !== 0) {
    // Never print command arguments (ephemeral credentials are passed to Docker).
    throw new Error(binary + ' failed: ' + String(result.stderr || result.error || '').slice(-2000));
  }
  return result.stdout.trim();
}
const docker = (args, input) => command('docker', args, input);

function verifySajuProvenance() {
  if (existsSync(join(saju, '.git'))) {
    if (command('git', ['-C', saju, 'rev-parse', 'HEAD']) !== expectedSajuSha
      || command('git', ['-C', saju, 'status', '--porcelain', '--untracked-files=no']).length > 0) {
      throw new Error('A clean Saju checkout at the pinned SHA is required.');
    }
    return;
  }
  // A git-archive workspace may carry a per-file manifest generated immediately
  // after an independently verified pinned archive/build. It is local provenance,
  // not a release signature or a new semantic/release authority.
  const provenance = JSON.parse(readFileSync(join(saju, '.myeongha-saju-provenance.json'), 'utf8'));
  if (provenance.sourceSha !== expectedSajuSha || !Array.isArray(provenance.files)
    || provenance.files.length < 10) throw new Error('Pinned archive provenance is missing.');
  let serverVerified = false;
  let sourceVerified = false;
  for (const entry of provenance.files) {
    if (typeof entry.path !== 'string' || !/^(?:src\/|dist\/|package(?:-lock)?\.json$|tsconfig[^/]*\.json$)/u.test(entry.path)
      || entry.path.split('/').some(part => part === '..' || part.startsWith('.env'))
      || !/^[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error('Unsafe archive provenance entry.');
    if (createHash('sha256').update(readFileSync(join(saju, entry.path))).digest('hex') !== entry.sha256) {
      throw new Error('Pinned archive file drift: ' + entry.path);
    }
    if (entry.path === 'dist/production-calculation-process.js') serverVerified = true;
    if (entry.path === 'src/production-calculation-process.ts') sourceVerified = true;
  }
  if (!serverVerified || !sourceVerified) throw new Error('Calculation process provenance is incomplete.');
}

let sajuServer;
let created = false;
try {
  if (process.argv.length !== 3 || Number(process.versions.node.split('.')[0]) !== 24
    || JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== 'myeongha'
    || JSON.parse(readFileSync(join(saju, 'package.json'), 'utf8')).name !== 'myeonghwa-saju-engine'
    || !existsSync(join(saju, 'dist/production-calculation-process.js'))
    || !existsSync(join(root, 'node_modules/vitest/vitest.mjs'))) {
    throw new Error('Usage: Node 24, installed MyeongHa, built pinned Saju; pass one Saju checkout path.');
  }
  verifySajuProvenance();
  if (chromeBin && !existsSync(chromeBin)) throw new Error('CHROME_BIN must name a local Chrome executable.');
  if (chromeBin && !existsSync(join(root, 'public/reading.html'))) throw new Error('Run npm run build:web first.');
  const context = docker(['context', 'show']);
  const endpoint = docker(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}']);
  if (!['desktop-linux', 'default'].includes(context) || !/^(?:npipe:\/\/|unix:\/\/)/u.test(endpoint)) {
    throw new Error('Refusing a nonlocal Docker daemon or context.');
  }
  docker(['run', '--detach', '--name', container, '--label', 'myeongha.disposable=current-saju-e2e',
    '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data',
    '--mount', 'type=bind,source=' + root + ',target=/workspace,readonly',
    '--env', 'POSTGRES_DB=myeongha_saju_subject_local_verify', '--env', 'POSTGRES_PASSWORD=' + dbPassword,
    'postgres:15']);
  created = true;
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'],
      { env: minimal, encoding: 'utf8', windowsHide: true });
    if (result.status === 0) { ready = true; break; }
    await sleep(500);
  }
  if (!ready) throw new Error('Disposable PG unavailable.');
  console.log('Applying existing migrations and the disposable current-Birth fixture (PG15).');
  docker(['exec', '-i', container, 'bash'], `set -eu
cd /workspace
psql -U postgres -d myeongha_saju_subject_local_verify -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql >/dev/null
for migration in supabase/migrations/*.sql; do
  psql -U postgres -d myeongha_saju_subject_local_verify -v ON_ERROR_STOP=1 -f "$migration" >/dev/null 2>/tmp/migration-error || { echo "$migration"; cat /tmp/migration-error; exit 1; }
done
psql -U postgres -d myeongha_saju_subject_local_verify -v ON_ERROR_STOP=1 -f test/db/fixtures/saju_local_subject_birth_proof_e2e.sql >/dev/null
psql -U postgres -d myeongha_saju_subject_local_verify -v ON_ERROR_STOP=1 -v subject_password=${runtimePassword} -f scripts/local/saju-bridge-subject-local-login.sql >/dev/null
`);
  const dbPort = docker(['port', container, '5432/tcp']).split(':').at(-1);
  if (!/^\d+$/u.test(dbPort)) throw new Error('Unexpected local Docker port mapping.');
  const { createMyeonghwaProductionCalculationProcessV1 } = await import(
    pathToFileURL(join(saju, 'dist/production-calculation-process.js')).href);
  sajuServer = createMyeonghwaProductionCalculationProcessV1({
    SAJU_PRODUCTION_SERVICE_BEARER: bearer, SAJU_PRODUCTION_HOST: '127.0.0.1', PORT: '3000',
  }).server;
  await new Promise(resolve => sajuServer.listen(0, '127.0.0.1', resolve));
  const env = { ...minimal, NODE_ENV: 'test', MYEONGHA_RUN_CURRENT_SAJU_POSTGRES_E2E: '1',
    PGHOST: '127.0.0.1', PGPORT: dbPort, PGUSER: 'postgres', PGDATABASE: 'myeongha_saju_subject_local_verify',
    PGPASSWORD: dbPassword, MYEONGHA_LOCAL_SUBJECT_DB_PASSWORD: runtimePassword,
    MYEONGHA_SAJU_CROSS_SERVICE_ORIGIN: 'http://127.0.0.1:' + sajuServer.address().port,
    MYEONGHA_SAJU_CROSS_SERVICE_BEARER: bearer, ...(chromeBin ? { CHROME_BIN: chromeBin } : {}) };
  console.log(chromeBin ? 'Running all 5 cases including real Chrome rendering.'
    : 'CHROME_BIN absent: running 4 service cases; browser rendering is SKIPPED.');
  const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run',
    'test/current-subject-saju-calculation-postgres.e2e.test.ts'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', resolve);
  });
  process.exitCode = code ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local current-Saju verification failed.');
  process.exitCode = 1;
} finally {
  if (sajuServer) {
    sajuServer.closeAllConnections();
    await new Promise(resolve => sajuServer.close(resolve));
  }
  if (created) docker(['rm', '--force', container]);
  console.log('Disposable resources cleaned; identity fixture is synthetic and no Production flow was exercised.');
}
