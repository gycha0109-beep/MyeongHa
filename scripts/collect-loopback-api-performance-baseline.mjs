import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_PATHS = new Set(['/api/health', '/api/readiness']);
const METRIC_SCHEMA = 'myeongha-loopback-api-performance-baseline-v1';

function fail(message) {
  throw new Error('LOCAL_API_BASELINE: ' + message);
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0 ||
      !values.every(v => Number.isFinite(v) && v >= 0) ||
      !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    fail('invalid measured sample set');
  }
  const ordered = [...values].sort((a, b) => a - b);
  const rank = (ordered.length - 1) * fraction;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return Math.round((ordered[lower] +
    (ordered[upper] - ordered[lower]) * (rank - lower)) * 1000) / 1000;
}

export function validateLoopbackBaselineConfig(config) {
  if (!config || typeof config !== 'object' ||
      !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 ||
      !ALLOWED_PATHS.has(config.path) ||
      !Number.isInteger(config.samples) || config.samples < 20 || config.samples > 250 ||
      !Number.isInteger(config.warmup) || config.warmup < 0 || config.warmup > 20) {
    fail('only bounded 127.0.0.1 public diagnostic GETs are allowed');
  }
  return Object.freeze({
    port: config.port, path: config.path,
    samples: config.samples, warmup: config.warmup,
  });
}

export async function collectLoopbackApiBaseline(config, request = fetch, clock = () => performance.now()) {
  const c = validateLoopbackBaselineConfig(config);
  if (typeof request !== 'function' || typeof clock !== 'function') {
    fail('missing request/clock implementation');
  }
  const target = 'http://127.0.0.1:' + c.port + c.path;
  const samples = [];
  for (let i = 0; i < c.warmup + c.samples; i++) {
    const start = clock();
    // Never send authorization, cookies, request body, or a user URL.
    const response = await request(target, {
      method: 'GET', redirect: 'manual',
      headers: { 'Cache-Control': 'no-store' },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 200 || response.redirected === true ||
        response.headers?.get?.('location') !== null) {
      fail('non-200, redirected, or unexpected response: observation not usable');
    }
    // Await the body to measure response completion rather than header arrival.
    const body = await response.arrayBuffer();
    if (body.byteLength > 256 * 1024) fail('unexpected diagnostic payload size');
    const duration = clock() - start;
    if (!Number.isFinite(duration) || duration < 0 || duration > 60_000) {
      fail('invalid monotonic measurement');
    }
    if (i >= c.warmup) samples.push(duration);
  }

  const rounded = samples.map(x => Math.round(x * 1000) / 1000);
  return Object.freeze({
    schema: METRIC_SCHEMA,
    target: '127.0.0.1-only',
    route: c.path,
    sampleCount: c.samples,
    warmupExcluded: c.warmup,
    measuredLatencyMs: Object.freeze(rounded),
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    dataPrivacy: 'synthetic-public-diagnostic-only',
    productionBaselineProven: false,
    dependencyLatencyProven: false,
    outputContainsIdentifiers: false,
  });
}

function cliArgs(argv) {
  const fields = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!['--port', '--path', '--samples', '--warmup'].includes(k) ||
        v === undefined || fields[k] !== undefined) fail('invalid CLI argument');
    fields[k] = v;
  }
  if (!fields['--port']) fail('--port is required');
  return {
    port: Number(fields['--port']),
    path: fields['--path'] ?? '/api/health',
    samples: fields['--samples'] === undefined ? 50 : Number(fields['--samples']),
    warmup: fields['--warmup'] === undefined ? 5 : Number(fields['--warmup']),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await collectLoopbackApiBaseline(cliArgs(process.argv.slice(2)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'LOCAL_API_BASELINE_FAILED');
    process.exitCode = 1;
  }
}
