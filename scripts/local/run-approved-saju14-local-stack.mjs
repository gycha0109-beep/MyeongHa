/**
 * Local-only, disposable PostgreSQL 17 for the approved 14-offer Saju checkout.
 * --check: stage the complete schema, grant four separate DB logins and verify
 *          host-side TCP connections, then destroy the disposable container.
 * --check-t10: verify signed pair issuance, archive and Reader with synthetic receipts.
 * --serve: also run the existing authorized Owner PortOne TEST checkout host.
 * Never connects to or alters the production database. No keys written to disk.
 */
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const name = 'mh-saju14-local-' + randomBytes(5).toString('hex');
const database = 'myeongha_saju_sandbox_v1';
const roles = [
  ['SAJU14_LOCAL_MEMBER_PASSWORD', 'saju14_local_member_login', 'myeongha_api_executor'],
  ['SAJU14_LOCAL_COMMERCE_PASSWORD', 'saju14_local_commerce_login', 'myeongha_commerce_internal_executor'],
  ['SAJU14_LOCAL_ISSUER_PASSWORD', 'saju14_local_issuer_login', 'myeongha_approved_saju_issuer_executor'],
  ['SAJU14_LOCAL_PAIR_READER_PASSWORD', 'saju14_local_pair_reader_login', 'myeongha_approved_saju_pair_reader_executor'],
];
const pw = Object.fromEntries(roles.map(([key]) => [key, randomBytes(36).toString('base64url')]));
const adminPw = randomBytes(36).toString('base64url');
let created = false;
let child;
let issuerChild;
const issuerRequired = [
  'MYEONGHA_SAJU_SOURCE_ORIGIN', 'MYEONGHA_SAJU_PAIR_SOURCE_ORIGIN',
  'MYEONGHA_SAJU_ENGINE_KEY', 'MYEONGHA_SAJU_ENGINE_VERSION',
  'MYEONGHA_SAJU_SOURCE_TOKEN', 'MYEONGHA_SAJU_SOURCE_AUTHORITY_HASH',
  'MYEONGHA_SAJU_SOURCE_PROOF_ISSUER', 'MYEONGHA_SAJU_SOURCE_PROOF_AUDIENCE',
  'MYEONGHA_SAJU_SOURCE_KEY_ID', 'MYEONGHA_SAJU_SOURCE_VERIFY_PEM_B64',
  'MYEONGHA_SAJU_PAIR_SOURCE_TOKEN', 'MYEONGHA_SAJU_PAIR_PROOF_ISSUER',
  'MYEONGHA_SAJU_PAIR_PROOF_AUDIENCE', 'MYEONGHA_SAJU_PAIR_PROOF_KEY_ID',
  'MYEONGHA_SAJU_PAIR_VERIFY_PEM_B64', 'MYEONGHA_SAJU_ISSUER_RELEASES_JSON',
  'MYEONGHA_SAJU_PAIR_RELEASE_REF', 'MYEONGHA_SAJU_PAIR_READER_ID',
];
const PINNED_COMPONENTS = ['career', 'business', 'wealth', 'relationship',
  'year', 'month'];
const RELEASE_REF = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;

function readExactSignedReleasePins() {
  const input = JSON.parse(process.env.MYEONGHA_SAJU_ISSUER_RELEASES_JSON);
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).length !== PINNED_COMPONENTS.length ||
    PINNED_COMPONENTS.some(component =>
      !input[component] || typeof input[component] !== 'object' ||
      Array.isArray(input[component]) || Object.keys(input[component]).length !== 2 ||
      !RELEASE_REF.test(input[component].releaseRef) ||
      typeof input[component].readerCharacterId !== 'string')) {
    throw Error('Exact six official individual Saju release pins are required.');
  }
  const pairRelease = process.env.MYEONGHA_SAJU_PAIR_RELEASE_REF;
  if (!RELEASE_REF.test(pairRelease)) {
    throw Error('Exact official compatibility release pin is required.');
  }
  return Object.freeze(Object.fromEntries([
    ...PINNED_COMPONENTS.map(component => [component, input[component].releaseRef]),
    ['compatibility', pairRelease],
  ]));
}

function rebuildCurrentCheckout() {
  // The local host serves /public, not Vite's dev server. Always compile the
  // exact checked-out React checkout before accepting TEST credentials.
  const tasks = [
    [resolve(root, 'node_modules/typescript/bin/tsc'), ['-p', 'tsconfig.build.json']],
    [resolve(root, 'scripts/build-web-static.mjs'), []],
    [resolve(root, 'node_modules/vite/bin/vite.js'), ['build', '--config', 'apps/web/vite.config.ts']],
  ];
  for (const [entrypoint, args] of tasks) {
    const result = spawnSync(process.execPath, [entrypoint, ...args], {
      cwd: root, encoding: 'utf8', timeout: 90_000,
      maxBuffer: 5 * 1024 * 1024, windowsHide: true,
    });
    if (result.status !== 0) {
      throw Error('Current Saju checkout build failed: ' +
        String(result.stderr || result.stdout || result.error?.message).slice(-1500));
    }
  }
}

async function startVerifiedIssuer(env) {
  const script = resolve(root, 'scripts/local/start-approved-saju-issuers.mjs');
  const proc = spawn(process.execPath, [script, '--serve'], {
    env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  // An unattended stderr pipe can fill up and stall the actual issuer.
  // Never print Source tokens, database URLs or provider diagnostics here.
  proc.stderr.resume();
  await new Promise((resolveReady, rejectReady) => {
    let output = '';
    let finished = false;
    const timer = setTimeout(() => fail('Official signed Saju issuer did not become ready.'), 30_000);
    const detach = () => {
      clearTimeout(timer);
      proc.stdout.off('data', onOutput);
      proc.off('exit', onExit);
      proc.off('error', onError);
    };
    function success() {
      if (finished) return;
      finished = true;
      detach();
      // Drain ongoing issue-cycle stdout without exposing sensitive source data.
      proc.stdout.resume();
      resolveReady();
    }
    function fail(message) {
      if (finished) return;
      finished = true;
      detach();
      rejectReady(Error(message));
    }
    function onOutput(data) {
      output = (output + data.toString()).slice(-4096);
      if (output.includes('Isolated paid-issuance consumer active;')) success();
    }
    function onExit() { fail('Official signed Saju issuer exited before checkout admission.'); }
    function onError() { fail('Official signed Saju issuer cannot start.'); }
    proc.stdout.on('data', onOutput);
    proc.once('exit', onExit);
    proc.once('error', onError);
  }).catch(error => {
    proc.kill();
    throw error;
  });
  return proc;
}

function waitForProcess(proc, label) {
  return new Promise((resolveDone, rejectDone) => {
    if (proc.exitCode !== null) {
      rejectDone(Error(label + ' exited unexpectedly.'));
      return;
    }
    proc.once('error', () => rejectDone(Error(label + ' encountered an error.')));
    proc.once('exit', (code, signal) => {
      if (label === 'issuer') {
        rejectDone(Error('Official Saju issuer stopped; checkout is now closed.'));
      } else if (code === 0 || signal) {
        resolveDone();
      } else {
        rejectDone(Error('Owner TEST checkout stopped unexpectedly.'));
      }
    });
  });
}

function docker(args, timeout = 90_000) {
  const r = spawnSync('docker', args, {
    cwd: root, encoding: 'utf8', timeout, windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error('Disposable Docker command failed: ' +
    String(r.stderr || r.error?.message || r.stdout || 'no output').slice(-1300));
  return r.stdout.trim();
}
async function checkLogin(port, login, password, expectedRole) {
  const pool = new Pool({ host: '127.0.0.1', port, database, user: login,
    password, ssl: false, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ' + expectedRole);
      const result = await client.query('SELECT current_user AS role_name');
      if (result.rows[0]?.role_name !== expectedRole) throw Error('Incorrect local executor role');
      await client.query('ROLLBACK');
    } finally { client.release(); }
  } finally { await pool.end(); }
}
function cleanup() {
  if (!created) return;
  try { docker(['rm', '--force', name], 20_000); }
  catch { console.error('Disposable database removal failed; inspect label myeongha.disposable=saju14-pg17'); }
  created = false;
}
const mode = process.argv[2];
let exactReleasePins;
if (!['--check', '--check-t10', '--serve'].includes(mode)) {
  console.error('Specify --check, --check-t10 or --serve. Never targets Production.');
  process.exitCode = 2;
} else {
  try {
    if (mode === '--serve') {
      // Never allow a payment without a live, verified Source/Reader issuer.
      const required = ['MYEONGHA_SAJU_TEST_STORE_ID', 'MYEONGHA_SAJU_TEST_CHANNEL_KEY',
        'MYEONGHA_SAJU_TEST_PORTONE_API_SECRET',
        'MYEONGHA_SAJU_TEST_EVIDENCE_HMAC_SECRET', 'MYEONGHA_SUPABASE_API_KEY',
        'MYEONGHA_SAJU_TEST_OWNER_AUTH_USER_ID',
        ...issuerRequired];
      const missing = required.filter(key => !process.env[key]?.trim());
      if (missing.length) throw Error('PortOne TEST / Auth settings are missing: ' + missing.join(', '));
      exactReleasePins = readExactSignedReleasePins();
      rebuildCurrentCheckout();
    }
    const context = docker(['context', 'show']);
    const endpoint = docker(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}']);
    if (!['default', 'desktop-linux'].includes(context) ||
        !/^(npipe:\/\/|unix:\/\/)/u.test(endpoint)) throw Error('Refusing remote Docker daemon.');
    docker(['run', '--detach', '--rm', '--name', name,
      '--label', 'myeongha.disposable=saju14-pg17',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data',
      '--mount', 'type=bind,source=' + root + ',target=/app,readonly',
      '--env', 'POSTGRES_PASSWORD=' + adminPw, 'postgres:17']);
    created = true;
    let ready = false;
    for (let i = 0; i < 45; i++) {
      // Official postgres Docker initdb starts an INTERMEDIATE postmaster,
      // then shuts it down. A successful query alone is not final readiness.
      const logResult = spawnSync('docker', ['logs', name], {
        encoding: 'utf8', windowsHide: true, timeout: 5_000,
      });
      const initFinished = logResult.status === 0 &&
        (String(logResult.stdout) + String(logResult.stderr))
          .includes('PostgreSQL init process complete; ready for start up.');
      if (initFinished) {
        try {
          if (docker(['exec', name, 'psql', '-X', '-U', 'postgres',
            '-d', 'postgres', '-Atqc', 'select 1'], 5_000) === '1') {
            ready = true; break;
          }
        } catch { /* Final postmaster has not started yet */ }
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 450);
    }
    if (!ready) throw Error('Disposable PostgreSQL startup failed.');
    docker(['exec', name, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', 'create database ' + database]);
    const stage = docker(['exec', '-e', 'MYEONGHA_DISPOSABLE_SAJU14=explicit-local-only',
      '-e', 'PGHOST=/var/run/postgresql', name, 'bash',
      '/app/scripts/local/install-approved-saju14-isolated-pg17.sh']);
    if (!stage.includes('STAGED_SAJU14_LOCAL_READY')) throw Error('14-offer schema was not installed.');
    if (mode === '--serve') {
      // Only the isolated disposable registry may be pinned to the actual
      // official individual and T10 Source versions before the first order.
      // No synthetic ReleaseRef is promoted to a production release.
      const encoded = Buffer.from(JSON.stringify(exactReleasePins), 'utf8').toString('base64');
      const state = docker(['exec', '-e', 'PGHOST=/var/run/postgresql',
        '-e', 'SAJU14_LOCAL_SIGNED_RELEASE_REFS_B64=' + encoded,
        name, 'psql', '-X', '-U', 'postgres', '-d', database,
        '-v', 'ON_ERROR_STOP=1', '-At',
        '-f', '/app/scripts/local/pin-approved-saju14-isolated-releases.psql']);
      if (!state.includes('SAJU14_SOURCE_RELEASE_PINS_READY')) {
        throw Error('14-offer official Source release pinning was not admitted.');
      }
    }
    const credentials = roles.flatMap(([key]) => ['-e', key + '=' + pw[key]]);
    const rolesOutput = docker(['exec',
      '-e', 'MYEONGHA_DISPOSABLE_SAJU14=explicit-local-only',
      '-e', 'PGHOST=/var/run/postgresql', ...credentials,
      name, 'bash', '/app/scripts/local/provision-approved-saju14-local-roles.sh']);
    if (!rolesOutput.includes('SAJU14_LOCAL_ROLE_SEPARATION_READY')) {
      throw Error('Local DB role isolation was not established.');
    }
    if (mode === '--serve' || (mode === '--check' && process.env.MYEONGHA_SAJU_TEST_OWNER_AUTH_USER_ID)) {
      const ownerId = process.env.MYEONGHA_SAJU_TEST_OWNER_AUTH_USER_ID;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(ownerId)) {
        throw Error('An existing verified Supabase Owner account UUID is required.');
      }
      const seeded = docker(['exec', '-e', 'MYEONGHA_DISPOSABLE_SAJU14=explicit-local-only',
        '-e', 'PGHOST=/var/run/postgresql',
        '-e', 'MYEONGHA_SAJU_TEST_OWNER_AUTH_USER_ID=' + ownerId,
        name, 'bash', '/app/scripts/local/provision-approved-saju14-local-owner.sh']);
      if (!seeded.includes('SAJU14_LOCAL_OWNER_AUTHORITY_READY')) {
        throw Error('Verified Owner membership was not bound to the local database.');
      }
    }
    if (mode === '--serve') {
      // This overlays only the disposable local PG17's reviewed functions.
      // Production and hosted SQL remain unchanged. PortOne TEST receipts
      // must still be independently verified and tied to an Owner purchase.
      const sandbox = docker(['exec', '-e', 'PGHOST=/var/run/postgresql',
        name, 'psql', '-X', '-U', 'postgres', '-d', database,
        '-v', 'ON_ERROR_STOP=1', '-At',
        '-f', '/app/scripts/local/approved-saju14-sandbox-issuer-overlay.psql']);
      if (!sandbox.includes('SAJU14_VERIFIED_SANDBOX_ONLY_ISSUANCE_READY')) {
        throw Error('Isolated verified TEST issuance was not enabled.');
      }
    }
    const portOutput = docker(['port', name, '5432/tcp']);
    const match = /^127\.0\.0\.1:(\d{2,5})$/u.exec(portOutput);
    const port = Number(match?.[1]);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw Error('Postgres was not published on loopback only.');
    }
    for (const [key, login, group] of roles) await checkLogin(port, login, pw[key], group);
    console.log('SAJU14_LOCAL_HOST_DB_READY: 14 offers, four distinct TCP executor accounts.');
    if (mode === '--check-t10') {
      const url = (user, password) => 'postgresql://' + user + ':' + password +
        '@127.0.0.1:' + port + '/' + database;
      const roleUrl = ([key, login]) => url(login, pw[key]);
      const result = spawnSync(process.execPath, [
        resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
        'test/saju-t10-pair-production-cross-service.e2e.test.ts',
      ], {
        cwd: root, stdio: 'inherit', timeout: 120_000, windowsHide: true,
        env: {
          ...process.env,
          MYEONGHA_RUN_SAJU_T10_PAIR_CROSS_SERVICE_E2E: '1',
          MYEONGHA_T10_FIXTURE_DB_URL: url('postgres', adminPw),
          MYEONGHA_T10_MEMBER_DB_URL: roleUrl(roles[0]),
          MYEONGHA_T10_ISSUER_DB_URL: roleUrl(roles[2]),
          MYEONGHA_T10_PAIR_READER_DB_URL: roleUrl(roles[3]),
        },
      });
      if (result.status !== 0) throw Error('Isolated T10 cross-service verification failed.');
    }
    if (mode === '--serve') {
      const member = roles[0], commerce = roles[1];
      const env = { ...process.env };
      env.MYEONGHA_SAJU_TEST_MEMBER_DB_URL =
        'postgresql://' + member[1] + ':' + pw[member[0]] + '@127.0.0.1:' + port + '/' + database;
      env.MYEONGHA_SAJU_TEST_COMMERCE_DB_URL =
        'postgresql://' + commerce[1] + ':' + pw[commerce[0]] + '@127.0.0.1:' + port + '/' + database;
      const issuer = roles[2], pairReader = roles[3];
      env.MYEONGHA_SAJU_TEST_PAIR_READER_DB_URL =
        'postgresql://' + pairReader[1] + ':' + pw[pairReader[0]] + '@127.0.0.1:' + port + '/' + database;
      const issuerEnv = {
        ...env,
        MYEONGHA_SAJU_ISSUER_STAGE: 'local-only',
        MYEONGHA_SAJU_ISSUER_DB_URL:
          'postgresql://' + issuer[1] + ':' + pw[issuer[0]] + '@127.0.0.1:' + port + '/' + database,
        MYEONGHA_SAJU_PAIR_READER_DB_URL:
          'postgresql://' + pairReader[1] + ':' + pw[pairReader[0]] + '@127.0.0.1:' + port + '/' + database,
      };
      // Never open a payment-capable server until BOTH existing signed
      // issuing workers have started successfully on the same isolated DB.
      issuerChild = await startVerifiedIssuer(issuerEnv);
      console.log('Local official Saju individual/pair issuer is active.');
      child = spawn(process.execPath,
        [resolve(root, 'scripts/local/start-approved-saju-owner-sandbox.mjs')],
        { env, cwd: root, stdio: 'inherit', windowsHide: true });
      const stopAll = () => {
        if (child && child.exitCode === null) child.kill('SIGTERM');
        if (issuerChild && issuerChild.exitCode === null) issuerChild.kill('SIGTERM');
      };
      process.once('SIGINT', stopAll);
      process.once('SIGTERM', stopAll);
      await Promise.race([
        waitForProcess(child, 'checkout'),
        waitForProcess(issuerChild, 'issuer'),
      ]);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Disposable Saju14 stack failed.');
    process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (issuerChild && issuerChild.exitCode === null) issuerChild.kill();
    cleanup();
  }
}
