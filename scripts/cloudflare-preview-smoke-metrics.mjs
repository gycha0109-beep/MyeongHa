// Preview-only, read-only smoke metrics. No accounts, credentials, request
// bodies, URLs, query values, IP addresses, Worker CPU or billing guesses.
// Watchtower-Track: ops
import { HTML_ENTRIES } from './verify-cloudflare-static.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';

const MAX_SAMPLES = 256;
const HTML_SET = new Set(HTML_ENTRIES);
const CLASSES = Object.freeze(['static','health','api-denial','protected-hold']);
const round = n => Math.round(n * 10) / 10;

export function classifyCloudflarePreviewMetricRouteV1(path, expectedStatus) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
      !Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
    throw Error('Invalid synthetic Preview probe shape');
  }
  // The input path is only from the fixed smoke fixtures. Never log the path,
  // query, cookie, payload, Authorization, or per-request identity.
  const pathname = new URL(path, 'https://offline.invalid').pathname;
  if (pathname === '/') return { kind: 'static', route: 'static.root' };
  const file = pathname.slice(1);
  if (HTML_SET.has(file)) return { kind: 'static', route: 'static.' + file };
  if (!pathname.startsWith('/api/') && pathname !== '/api') {
    return { kind: 'static', route: 'static.other' };
  }
  const approved = matchCloudflareApiRoute(pathname);
  const kind = expectedStatus === 503 ? 'protected-hold' :
    approved?.id === 'api.health' ? 'health' : 'api-denial';
  return { kind, route: approved?.id ?? 'api.unknown' };
}

function summarizeTimings(samples) {
  const sorted = [...samples].sort((a,b) => a-b);
  const percentile = p => round(sorted[Math.ceil(sorted.length * p)-1]);
  return Object.freeze({
    n: sorted.length,
    p50Ms: sorted.length ? percentile(0.5) : null,
    p95Ms: sorted.length ? percentile(0.95) : null,
    maxMs: sorted.length ? round(sorted[sorted.length-1]) : null,
  });
}

export function summarizeCloudflarePreviewProbeMetricsV1(samples) {
  if (!Array.isArray(samples) || samples.length > MAX_SAMPLES) {
    throw Error('Invalid smoke timing sample count');
  }
  const categorySamples = new Map(CLASSES.map(kind=>[kind,[]]));
  const routeSamples = new Map();
  let transportFailures=0, unexpectedStatuses=0, http429=0, unexpected5xx=0;
  let expectedHolds503=0, responseCount=0;
  for (const sample of samples) {
    if (!sample || typeof sample.path !== 'string' ||
        typeof sample.elapsedMs !== 'number' || !Number.isFinite(sample.elapsedMs) ||
        sample.elapsedMs < 0 || sample.elapsedMs > 120_000 ||
        !Number.isInteger(sample.expectedStatus) ||
        sample.expectedStatus < 100 || sample.expectedStatus > 599 ||
        (sample.actualStatus !== null &&
          (!Number.isInteger(sample.actualStatus) ||
           sample.actualStatus < 100 || sample.actualStatus > 599))) {
      throw Error('Invalid smoke timing sample (details redacted)');
    }
    const {kind,route} = classifyCloudflarePreviewMetricRouteV1(
      sample.path, sample.expectedStatus,
    );
    if (!categorySamples.has(kind)) throw Error('Unrecognized timing class');
    const ms = sample.elapsedMs;
    categorySamples.get(kind).push(ms);
    if (!routeSamples.has(route)) routeSamples.set(route,[]);
    routeSamples.get(route).push(ms);
    if (sample.actualStatus === null) {
      transportFailures++;
      unexpectedStatuses++;
    } else {
      responseCount++;
      if (sample.actualStatus !== sample.expectedStatus) unexpectedStatuses++;
      if (sample.actualStatus === 429) http429++;
      if (sample.actualStatus >= 500 &&
          !(sample.actualStatus === 503 && sample.expectedStatus === 503)) {
        unexpected5xx++;
      }
      if (sample.actualStatus === 503 && sample.expectedStatus === 503) {
        expectedHolds503++;
      }
    }
  }
  return Object.freeze({
    schema: 'myeongha-preview-http-probe-metrics-v1',
    evidence: 'synthetic GET/POST response headers only; NOT a production traffic sample',
    latency: 'client-observed response-header wall time in milliseconds; NOT Worker CPU',
    requestAttempts: samples.length,
    responses: responseCount,
    transportFailures, unexpectedStatuses, http429, unexpected5xx,
    expectedHolds503,
    groups: Object.fromEntries(CLASSES.map(kind=>[
      kind, summarizeTimings(categorySamples.get(kind)),
    ])),
    byRoute: Object.fromEntries([...routeSamples].sort(([a],[b])=>a.localeCompare(b))
      .map(([route,times])=>[route,summarizeTimings(times)])),
    notMeasured: Object.freeze([
      'workerCpuP50P95Max','workerMemory','realRouteTraffic',
      'billableWorkerRequests','cloudflareBilledCostUsd',
      'supabaseOpenAiPortOneCostUsd',
    ]),
  });
}
