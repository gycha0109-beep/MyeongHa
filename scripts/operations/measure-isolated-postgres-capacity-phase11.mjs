import { execFile as execFileCallback } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const execFile = promisify(execFileCallback);
const bin = process.env.PG_BIN_DIR;
if (!bin) throw Error('PG_BIN_DIR is required for an isolated PostgreSQL drill');
const exe = process.platform === 'win32' ? '.exe' : '';
const owner = 'myeongha_phase11_synthetic';
const dataDir = await mkdtemp(join(tmpdir(), 'myeongha-phase11-capacity-'));
const logFile = join(dataDir, 'postmaster.log');
const stages = Object.freeze([
  { concurrency: 1, count: 20 },
  { concurrency: 2, count: 20 },
  { concurrency: 4, count: 24 },
  { concurrency: 8, count: 32 },
]);
const maxPoolConnections = 2;
const acquireTimeoutMs = 140;
const startupConnectionTimeoutMs = 1500;
const syntheticSqlDelaySeconds = 0.08;
let serverStarted = false;
let serverStopped = false;
let pool;

function assert(value, why) {
  if (!value) throw Error(why);
}
function pct(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * fraction;
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo)) * 1000) / 1000;
}
function round(value) { return Math.round(value * 1000) / 1000; }

async function pgTool(name, args) {
  return execFile(join(bin, name + exe), args, {
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 512 * 1024,
    env: {
      ...process.env,
      PATH: bin + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? ''),
    },
  });
}
async function isolatedPort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    listener.once('listening', resolve);
    listener.once('error', reject);
  });
  const addr = listener.address();
  assert(addr && typeof addr !== 'string', 'No ephemeral loopback port');
  await new Promise((resolve, reject) =>
    listener.close(error => error ? reject(error) : resolve()));
  return addr.port;
}
async function stage(pool, config) {
  const results = [];
  let next = 0;
  let observedPeakConnections = 0;
  const started = performance.now();
  async function worker() {
    while (next < config.count) {
      next++;
      const begin = performance.now();
      let result;
      try {
        await pool.query('SELECT pg_sleep($1::double precision)', [syntheticSqlDelaySeconds]);
        result = { kind: 'ok', durationMs: performance.now() - begin };
      } catch (error) {
        if (/timeout|timed out/iu.test(error?.message ?? '') &&
            error?.code === undefined) {
          result = { kind: 'pool_acquire_timeout', durationMs: performance.now() - begin };
        } else {
          throw Error('Unrecognized isolated DB failure: ' + (error?.code ?? 'unknown'));
        }
      } finally {
        observedPeakConnections = Math.max(observedPeakConnections, pool.totalCount);
        assert(pool.totalCount <= maxPoolConnections, 'DB pool exceeded configured connection budget');
      }
      results.push(result);
    }
  }
  await Promise.all(Array.from({ length: config.concurrency }, () => worker()));
  const elapsedMs = performance.now() - started;
  const success = results.filter(x => x.kind === 'ok').map(x => x.durationMs);
  const timeouts = results.filter(x => x.kind === 'pool_acquire_timeout');
  assert(results.length === config.count, 'Incomplete capacity stage');
  return {
    concurrency: config.concurrency,
    samples: config.count,
    completed: success.length,
    acquireTimeouts: timeouts.length,
    errorRate: round(timeouts.length / config.count),
    successfulP50Ms: pct(success, 0.5),
    successfulP95Ms: pct(success, 0.95),
    successfulP99Ms: pct(success, 0.99),
    observedPeakConnections,
    elapsedMs: round(elapsedMs),
    successfulRequestsPerSecond: round(success.length * 1000 / elapsedMs),
  };
}
let finished = false;
try {
  await pgTool('initdb', [
    '-D', dataDir, '-U', owner, '--auth-host=trust', '--auth-local=trust',
    '--encoding=UTF8', '--no-sync', '--no-instructions',
  ]);
  const port = await isolatedPort();
  await pgTool('pg_ctl', [
    '-D', dataDir, '-l', logFile, '-o',
    '-h 127.0.0.1 -p ' + port + ' -c max_connections=12 -c listen_addresses=127.0.0.1',
    '-w', '-t', '20', 'start',
  ]);
  serverStarted = true;
  pool = new Pool({
    host: '127.0.0.1', port, database: 'postgres', user: owner,
    ssl: false,
    max: maxPoolConnections,
    connectionTimeoutMillis: startupConnectionTimeoutMs,
    statement_timeout: 1000,
    idleTimeoutMillis: 400,
    allowExitOnIdle: true,
  });
  const warmup = await Promise.all([pool.query('SELECT 1 AS ready'), pool.query('SELECT 1 AS ready')]);
  assert(warmup.every(x => x.rows[0]?.ready === 1), 'Isolated DB startup sanity failed');
  // Measure contention only after both local PostgreSQL sockets have connected.
  pool.options.connectionTimeoutMillis = acquireTimeoutMs;

  const observations = [];
  for (const config of stages) observations.push(await stage(pool, config));
  assert(observations[0].acquireTimeouts === 0, 'Sequential baseline unexpectedly saturated');
  assert(observations[1].acquireTimeouts === 0, 'Pool-size baseline unexpectedly saturated');
  assert(observations[3].acquireTimeouts > 0, 'High concurrency must demonstrate bounded pool acquisition pressure');
  assert(observations.every(x => x.observedPeakConnections <= maxPoolConnections), 'DB cap exceeded');
  const healthy = await pool.query('SELECT 1 AS recovered');
  assert(healthy.rows[0]?.recovered === 1, 'Post-saturation DB pool failed healthy query');

  console.log(JSON.stringify({
    schema: 'myeongha-isolated-postgres-capacity-phase11-v1',
    result: 'PASS',
    target: 'ephemeral PostgreSQL on 127.0.0.1',
    dataPrivacy: 'synthetic_sql_only',
    poolMax: maxPoolConnections,
    acquireTimeoutMs,
    queryDelayMs: syntheticSqlDelaySeconds * 1000,
    totalRequested: observations.reduce((s, o) => s + o.samples, 0),
    observations,
    postSaturationRecovery: true,
    productionCapacityProven: false,
    realMyeonghaQueriesMeasured: false,
    scalingThresholdApproved: false,
  }));
  finished = true;
} finally {
  if (pool) await pool.end().catch(() => undefined);
  if (serverStarted && !serverStopped) {
    await pgTool('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', '-t', '20', 'stop'])
      .then(() => { serverStopped = true; })
      .catch(() => undefined);
  }
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  if (!finished) console.error('Isolated PostgreSQL capacity proof failed; no Production DB was targeted.');
}
