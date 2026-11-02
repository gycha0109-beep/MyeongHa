import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SUSTAINED_LOOPBACK_SCHEMA_V1 = 'myeongha-sustained-loopback-capacity-v1';
const PUBLIC_PATHS = new Set(['/api/health', '/api/readiness']);
const MAX_RESPONSE_BYTES = 256 * 1024;

function invalid(reason) {
  throw new Error('SUSTAINED_LOOPBACK_CAPACITY: ' + reason);
}

function rounded(number) {
  return Math.round(number * 1000) / 1000;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * fraction;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return rounded(sorted[low] + (sorted[high] - sorted[low]) * (rank - low));
}

export function validateSustainedLoopbackConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isSafeInteger(value.port) || value.port < 1 || value.port > 65535 ||
      !PUBLIC_PATHS.has(value.path) ||
      (value.durationSeconds !== 300 && value.durationSeconds !== 900) ||
      !Number.isSafeInteger(value.maxRequestsPerSecond) ||
      value.maxRequestsPerSecond < 1 || value.maxRequestsPerSecond > 8 ||
      !Number.isSafeInteger(value.concurrency) ||
      value.concurrency < 1 || value.concurrency > 8) {
    invalid('only 5m/15m bounded 127.0.0.1 public diagnostic measurements are supported');
  }
  return Object.freeze({
    port: value.port,
    path: value.path,
    durationSeconds: value.durationSeconds,
    maxRequestsPerSecond: value.maxRequestsPerSecond,
    concurrency: value.concurrency,
  });
}

export async function measureSustainedLoopbackCapacity(
  input,
  request = fetch,
  clock = () => performance.now(),
  wait = sleep,
) {
  const config = validateSustainedLoopbackConfig(input);
  if (typeof request !== 'function' || typeof clock !== 'function' ||
      typeof wait !== 'function') invalid('request, clock and wait implementations required');

  const url = 'http://127.0.0.1:' + config.port + config.path;
  const intervalMs = 1000 / config.maxRequestsPerSecond;
  const scheduledSlots = config.durationSeconds * config.maxRequestsPerSecond;
  const start = clock();
  if (!Number.isFinite(start)) invalid('invalid monotonic start');

  const deadline = start + config.durationSeconds * 1000;
  const pending = new Set();
  const results = [];
  let skippedSlots = 0;
  let peakInFlight = 0;
  let fatal = false;

  function startProbe() {
    const started = clock();
    const task = (async () => {
      try {
        const response = await request(url, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'Cache-Control': 'no-store' },
          signal: AbortSignal.timeout(5000),
        });
        if (!Number.isSafeInteger(response.status) ||
            response.status < 100 || response.status > 599 ||
            response.redirected === true ||
            response.headers?.get?.('location') !== null) {
          fatal = true;
          return;
        }
        const body = await response.arrayBuffer();
        if (!(body instanceof ArrayBuffer) || body.byteLength > MAX_RESPONSE_BYTES) {
          fatal = true;
          return;
        }
        const duration = clock() - started;
        if (!Number.isFinite(duration) || duration < 0 || duration > 60000) {
          fatal = true;
          return;
        }
        results.push({ status: response.status, duration });
      } catch {
        const duration = clock() - started;
        if (!Number.isFinite(duration) || duration < 0 || duration > 60000) {
          fatal = true;
          return;
        }
        results.push({ status: null, duration });
      }
    })();
    pending.add(task);
    peakInFlight = Math.max(peakInFlight, pending.size);
    void task.finally(() => pending.delete(task));
  }

  for (let slot = 0; slot < scheduledSlots && !fatal; slot++) {
    const scheduledAt = start + slot * intervalMs;
    const beforeWait = clock();
    if (!Number.isFinite(beforeWait)) invalid('invalid monotonic clock');
    if (beforeWait < scheduledAt) await wait(scheduledAt - beforeWait);
    const now = clock();
    if (!Number.isFinite(now) || now < start) invalid('invalid monotonic clock');
    if (now >= deadline) {
      skippedSlots += scheduledSlots - slot;
      break;
    }
    if (now - scheduledAt > intervalMs || pending.size >= config.concurrency) {
      skippedSlots++;
      continue;
    }
    startProbe();
    await Promise.resolve();
  }

  if (!fatal && clock() < deadline) await wait(deadline - clock());
  await Promise.all([...pending]);
  if (fatal) invalid('unsafe diagnostic response or measurement');
  const elapsed = clock() - start;
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > config.durationSeconds * 1000 + 60000 ||
      results.length + skippedSlots !== scheduledSlots) {
    invalid('incomplete or invalid measurement');
  }

  const success = results.filter(x => x.status === 200)
    .map(x => x.duration).sort((a, b) => a - b);
  const non200 = results.filter(x => x.status !== null && x.status !== 200).length;
  const transportFailure = results.filter(x => x.status === null).length;
  return Object.freeze({
    schema: SUSTAINED_LOOPBACK_SCHEMA_V1,
    target: '127.0.0.1-only',
    route: config.path,
    configuredDurationSeconds: config.durationSeconds,
    configuredMaxRequestsPerSecond: config.maxRequestsPerSecond,
    configuredMaxConcurrency: config.concurrency,
    scheduledSlots,
    attemptedRequests: results.length,
    skippedSlots,
    observedPeakConcurrency: peakInFlight,
    successfulRequests: success.length,
    non200Requests: non200,
    transportFailureRequests: transportFailure,
    observedElapsedMs: rounded(elapsed),
    observedRequestsPerSecond: rounded(results.length * 1000 / elapsed),
    successfulLatencyP50Ms: percentile(success, 0.50),
    successfulLatencyP95Ms: percentile(success, 0.95),
    successfulLatencyP99Ms: percentile(success, 0.99),
    dataPrivacy: 'synthetic-public-loopback-only',
    productionCapacityProven: false,
    isolatedDbSaturationCeilingProven: false,
    sajuCpuMemoryCeilingProven: false,
    numericalProductionScalingThresholdApproved: false,
    outputContainsIdentifiers: false,
  });
}

function cliArgs(argv) {
  const args = {};
  const allowed = new Set([
    '--port', '--path', '--duration-seconds', '--max-rps', '--concurrency',
  ]);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--') ||
        args[key] !== undefined) invalid('invalid command-line arguments');
    args[key] = value;
  }
  if (Object.keys(args).length !== allowed.size) invalid('all CLI options required');
  return {
    port: Number(args['--port']),
    path: args['--path'],
    durationSeconds: Number(args['--duration-seconds']),
    maxRequestsPerSecond: Number(args['--max-rps']),
    concurrency: Number(args['--concurrency']),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await measureSustainedLoopbackCapacity(cliArgs(process.argv.slice(2)))));
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith('SUSTAINED_LOOPBACK_CAPACITY:')
      ? error.message : 'SUSTAINED_LOOPBACK_CAPACITY: execution failed');
    process.exitCode = 1;
  }
}
