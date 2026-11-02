import { execFile as execFileCallback } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const execFile = promisify(execFileCallback);
const bin = process.env.PG_BIN_DIR;
if (!bin) {
  throw new Error('Set PG_BIN_DIR to the installed PostgreSQL binaries before local isolated drill.');
}
const exe = process.platform === 'win32' ? '.exe' : '';
const user = 'myeongha_phase7_synthetic';
const dataDir = await mkdtemp(join(tmpdir(), 'myeongha-phase7-postgres-'));
const logFile = join(dataDir, 'postmaster.log');
let clusterStarted = false;
let pool;
let stopped = false;

async function cli(name, args) {
  return execFile(join(bin, name + exe), args, {
    timeout: 30000, windowsHide: true, maxBuffer: 512 * 1024,
    env: { ...process.env, PATH: bin + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? '') },
  });
}
async function portFromLoopback() {
  const s = createServer();
  s.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    s.once('listening', resolve);
    s.once('error', reject);
  });
  const addr = s.address();
  if (!addr || typeof addr === 'string') throw new Error('Cannot reserve loopback port');
  const port = addr.port;
  await new Promise((resolve, reject) => s.close(error => error ? reject(error) : resolve()));
  return port;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function expectFail(promise, expectedCode, description) {
  const begin = performance.now();
  const error = await promise.then(() => null, e => e);
  assert(error !== null, description + ': should fail');
  assert(error.code === expectedCode, description + ': wrong rejection category ' + String(error.code));
  if (expectedCode === undefined) {
    assert(/timeout|timed out/i.test(error.message), description + ': failure was not a timeout');
  }
  const elapsedMs = Math.round(performance.now() - begin);
  assert(elapsedMs < 3000, description + ': unbounded failure');
  return elapsedMs;
}
let success = false;
try {
  await cli('initdb', [
    '-D', dataDir, '-U', user, '--auth-host=trust', '--auth-local=trust',
    '--encoding=UTF8', '--no-instructions', '--no-sync',
  ]);
  const port = await portFromLoopback();
  await cli('pg_ctl', [
    '-D', dataDir, '-l', logFile, '-o',
    '-h 127.0.0.1 -p ' + port + ' -c max_connections=12 -c listen_addresses=127.0.0.1',
    '-w', '-t', '20', 'start',
  ]);
  clusterStarted = true;
  const config = {
    host: '127.0.0.1', port, database: 'postgres', user, ssl: false,
    max: 1, connectionTimeoutMillis: 250, idleTimeoutMillis: 300,
    statement_timeout: 180,
    allowExitOnIdle: true,
  };
  pool = new Pool(config);
  const warmup = await pool.query('SELECT 1 AS ok');
  assert(warmup.rows[0]?.ok === 1, 'isolated PostgreSQL failed initial query');
  const queryTimeoutMs = await expectFail(
    pool.query('SELECT pg_sleep(0.6)'), '57014',
    'delayed SQL was not canceled by statement timeout',
  );
  const recovered = await pool.query('SELECT 1 AS ok');
  assert(recovered.rows[0]?.ok === 1, 'post-timeout PostgreSQL pool did not recover');
  const occupied = await pool.connect();
  let poolTimeoutMs;
  try {
    poolTimeoutMs = await expectFail(
      pool.connect(), undefined,
      'queued request did not obey the connection acquisition deadline',
    );
  } finally {
    occupied.release();
  }
  assert(pool.totalCount <= 1, 'pool exceeded isolated max=1 connection cap');
  await pool.end();
  pool = null;
  await cli('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', '-t', '20', 'stop']);
  stopped = true;
  const unavailable = new Pool(config);
  let offlineMs;
  try {
    offlineMs = await expectFail(
      unavailable.query('SELECT 1'), 'ECONNREFUSED',
      'stopped local PostgreSQL must reject new connections',
    );
  } finally {
    await unavailable.end();
  }
  console.log(JSON.stringify({
    result: 'PASS', target: 'isolated_127_0_0_1_postgres',
    dbUnavailable: 'ECONNREFUSED', sqlStatementTimeout: '57014',
    maxPoolConnections: 1, queryTimeoutMs, poolTimeoutMs, offlineMs,
  }));
  success = true;
} finally {
  if (pool) await pool.end().catch(() => undefined);
  if (clusterStarted && !stopped) {
    await cli('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', '-t', '20', 'stop']).catch(() => undefined);
  }
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  if (!success) console.error('Isolated PostgreSQL chaos drill failed; no production database was targeted.');
}
