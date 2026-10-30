import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LOOPBACK_CAPACITY_PROBE_SCHEMA_V1 = 'myeongha-loopback-capacity-probe-v1';

function invalid(reason) {
  throw new Error('LOCAL_CAPACITY_PROBE: ' + reason);
}

export function parseControlledCapacityConfig(value) {
  if (!value || typeof value !== 'object' ||
      !Number.isSafeInteger(value.port) || value.port < 1 || value.port > 65535 ||
      (value.path !== '/api/health' && value.path !== '/api/readiness') ||
      !Number.isSafeInteger(value.count) || value.count < 20 || value.count > 500 ||
      !Number.isSafeInteger(value.concurrency) || value.concurrency < 1 ||
      value.concurrency > 8 || value.concurrency > value.count) {
    invalid('fixed loopback-only diagnostic route, count 20..500, concurrency 1..8 required');
  }
  return Object.freeze({
    port: value.port, path: value.path,
    count: value.count, concurrency: value.concurrency,
  });
}

function quantile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * fraction;
  const low = Math.floor(rank), high = Math.ceil(rank);
  return Math.round((sorted[low] + (sorted[high] - sorted[low]) * (rank - low)) * 1000) / 1000;
}

function rounded(n) {
  return Math.round(n * 1000) / 1000;
}

export async function measureControlledLoopbackCapacity(
  config, request = fetch, clock = () => performance.now(),
) {
  const c = parseControlledCapacityConfig(config);
  if (typeof request !== 'function' || typeof clock !== 'function') {
    invalid('request transport and monotonic clock are required');
  }
  const target = 'http://127.0.0.1:' + c.port + c.path;
  const results = Array.from({ length: c.count }, () => null);
  let nextIndex = 0;
  let peakInFlight = 0;
  let inFlight = 0;
  const start = clock();

  async function worker() {
    while (nextIndex < c.count) {
      const index = nextIndex++;
      const startedAt = clock();
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      try {
        const response = await request(target, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'Cache-Control': 'no-store' },
          signal: AbortSignal.timeout(5000),
        });
        const body = await response.arrayBuffer();
        if (body.byteLength > 256 * 1024 ||
            response.redirected === true ||
            response.headers.get('location') !== null) {
          invalid('unexpected diagnostic response size or redirect');
        }
        results[index] = { status: response.status, duration: clock() - startedAt };
      } catch {
        results[index] = { status: null, duration: clock() - startedAt };
      } finally {
        inFlight--;
      }
    }
  }
  await Promise.all(Array.from({ length: c.concurrency }, () => worker()));
  const elapsed = clock() - start;
  if (!Number.isFinite(elapsed) || elapsed <= 0 ||
      results.some(x => !x || !Number.isFinite(x.duration) ||
        x.duration < 0 || x.duration > 60000)) {
    invalid('invalid measured run');
  }
  const good = results.filter(x => x.status === 200).map(x => x.duration).sort((a, b) => a - b);
  const unavailable = results.filter(x => x.status === null).length;
  const rejected = results.filter(x => x.status !== null && x.status !== 200).length;
  return Object.freeze({
    schema: LOOPBACK_CAPACITY_PROBE_SCHEMA_V1,
    target: '127.0.0.1-only',
    route: c.path,
    requestedSamples: c.count,
    requestedConcurrency: c.concurrency,
    observedPeakConcurrency: peakInFlight,
    completedSamples: results.length,
    successfulSamples: good.length,
    non200Samples: rejected,
    transportFailureSamples: unavailable,
    observedElapsedMs: rounded(elapsed),
    observedRequestsPerSecond: rounded(c.count * 1000 / elapsed),
    successfulLatencyP50Ms: quantile(good, 0.5),
    successfulLatencyP95Ms: quantile(good, 0.95),
    successfulLatencyP99Ms: quantile(good, 0.99),
    isolatedDbSaturationCeilingProven: false,
    sajuCpuMemoryCeilingProven: false,
    productionCapacityProven: false,
    dataPrivacy: 'loopback-public-diagnostics-only',
    outputContainsIdentifiers: false,
  });
}

function parseCli(argv) {
  const args = {};
  const keys = new Set(['--port', '--path', '--count', '--concurrency']);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!keys.has(key) || !value || value.startsWith('--') || args[key] !== undefined) {
      invalid('invalid command-line argument');
    }
    args[key] = value;
  }
  if (Object.keys(args).length !== 4) invalid('all CLI arguments required');
  return {
    port: Number(args['--port']),
    path: args['--path'],
    count: Number(args['--count']),
    concurrency: Number(args['--concurrency']),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await measureControlledLoopbackCapacity(parseCli(process.argv.slice(2)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'LOCAL_CAPACITY_PROBE_FAILED');
    process.exitCode = 1;
  }
}
