/**
 * Local-only, disposable PostgreSQL 17 for the approved 14-offer Saju checkout.
 * --check: stage the complete schema, grant four separate DB logins and verify
 *          host-side TCP connections, then destroy the disposable container.
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
if (mode !== '--check' && mode !== '--serve') {
  console.error('Specify --check or --serve. Never targets Production.');
  process.exitCode = 2;
} else {
  try {
    if (mode === '--serve') {
      const required = ['MYEONGHA_SAJU_TEST_STORE_ID', 'MYEONGHA_SAJU_TEST_CHANNEL_KEY',
        'MYEONGHA_SAJU_TEST_PORTONE_API_SECRET',
        'MYEONGHA_SAJU_TEST_EVIDENCE_HMAC_SECRET', 'MYEONGHA_SUPABASE_API_KEY'];
      const missing = required.filter(key => !process.env[key]?.trim());
      if (missing.length) throw Error('PortOne TEST / Auth settings are missing: ' + missing.join(', '));
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
    const credentials = roles.flatMap(([key]) => ['-e', key + '=' + pw[key]]);
    const rolesOutput = docker(['exec',
      '-e', 'MYEONGHA_DISPOSABLE_SAJU14=explicit-local-only',
      '-e', 'PGHOST=/var/run/postgresql', ...credentials,
      name, 'bash', '/app/scripts/local/provision-approved-saju14-local-roles.sh']);
    if (!rolesOutput.includes('SAJU14_LOCAL_ROLE_SEPARATION_READY')) {
      throw Error('Local DB role isolation was not established.');
    }
    const portOutput = docker(['port', name, '5432/tcp']);
    const match = /^127\.0\.0\.1:(\d{2,5})$/u.exec(portOutput);
    const port = Number(match?.[1]);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw Error('Postgres was not published on loopback only.');
    }
    for (const [key, login, group] of roles) await checkLogin(port, login, pw[key], group);
    console.log('SAJU14_LOCAL_HOST_DB_READY: 14 offers, four distinct TCP executor accounts.');
    if (mode === '--serve') {
      const member = roles[0], commerce = roles[1];
      const env = { ...process.env };
      env.MYEONGHA_SAJU_TEST_MEMBER_DB_URL =
        'postgresql://' + member[1] + ':' + pw[member[0]] + '@127.0.0.1:' + port + '/' + database;
      env.MYEONGHA_SAJU_TEST_COMMERCE_DB_URL =
        'postgresql://' + commerce[1] + ':' + pw[commerce[0]] + '@127.0.0.1:' + port + '/' + database;
      child = spawn(process.execPath,
        [resolve(root, 'scripts/local/start-approved-saju-owner-sandbox.mjs')],
        { env, cwd: root, stdio: 'inherit', windowsHide: true });
      await new Promise((done, reject) => {
        child.once('exit', (code, signal) => code === 0 || signal
          ? done() : reject(Error('Owner test checkout stopped unsuccessfully.')));
        child.once('error', reject);
        process.once('SIGINT', () => child.kill('SIGINT'));
        process.once('SIGTERM', () => child.kill('SIGTERM'));
      });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Disposable Saju14 stack failed.');
    process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null) child.kill();
    cleanup();
  }
}
