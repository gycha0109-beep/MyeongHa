// Read-only real Cloudflare Stage 9 observations. No raw payload or secrets emitted.
// A script-wide sampled invocation aggregate is NOT route-level CPU, static asset
// volume, billable account total, or evidence of one exact Preview deployment.
// Watchtower-Track: ops
import { pathToFileURL } from 'node:url';

export const WORKER_USAGE_QUERY =
  'query Stage9Usage($accountTag: string!, $scriptName: string!, $start: Time!, $end: Time!) {' +
  ' viewer { accounts(filter: { accountTag: $accountTag }) {' +
  ' workersInvocationsAdaptive(limit: 1, filter: {' +
  ' scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end }) {' +
  ' sum { requests errors } quantiles { cpuTimeP50 cpuTimeP95 cpuTimeP99 }' +
  ' } } } }';

const NOT_MEASURED = Object.freeze([
  'cpuMaxPerInvocation', 'perRouteCpuP50P95Max', 'workerMemory',
  'perRouteHttp429And5xx', 'staticAssetRequests', 'accountWideRequestCount',
  'accountBilledRequests', 'buildMinutesConsumed', 'cloudflareChargedCost',
  'supabaseOpenAiPortOneChargedCost',
]);
const valid = (n, integer = false) => typeof n === 'number' &&
  Number.isFinite(n) && n >= 0 && (!integer || Number.isSafeInteger(n));

function workerAggregate(payload) {
  const accounts = payload?.data?.viewer?.accounts;
  if (payload?.errors?.length || !Array.isArray(accounts) || accounts.length !== 1) return null;
  const samples = accounts[0].workersInvocationsAdaptive;
  if (!Array.isArray(samples) || samples.length !== 1) return null;
  const s = samples[0]?.sum, q = samples[0]?.quantiles;
  const r = s?.requests, e = s?.errors;
  const p50 = q?.cpuTimeP50, p95 = q?.cpuTimeP95, p99 = q?.cpuTimeP99;
  if (!valid(r, true) || !valid(e, true) || e > r ||
      ![p50,p95,p99].every(n => valid(n)) || p50 > p95 || p95 > p99) return null;
  // Cloudflare GraphQL Workers CPU time quantiles are in microseconds.
  return {
    requests: r, executionErrors: e, executionErrorRate: r ? e / r : 0,
    cpuP50Ms: p50 / 1000, cpuP95Ms: p95 / 1000, cpuP99Ms: p99 / 1000,
  };
}

function buildsLimit(payload) {
  const data = payload?.result;
  if (payload?.success !== true ||
      typeof data?.has_reached_build_minutes_limit !== 'boolean' ||
      typeof data?.build_minutes_refresh_on !== 'string' ||
      !Number.isFinite(Date.parse(data.build_minutes_refresh_on))) return null;
  return {
    minutesExhausted: data.has_reached_build_minutes_limit,
    refreshAtUtc: new Date(data.build_minutes_refresh_on).toISOString(),
  };
}

export function normalizeCloudflareStage9LiveUsageV1({
  graphql = null, builds = null, fromUtc, toUtc, observedAtUtc,
} = {}) {
  const range = [fromUtc, toUtc, observedAtUtc];
  if (range.some(t => typeof t !== 'string' || !Number.isFinite(Date.parse(t)) ||
      new Date(t).toISOString() !== t) ||
      fromUtc >= toUtc || toUtc > observedAtUtc) {
    throw Error('Invalid UTC usage observation window');
  }
  const worker = workerAggregate(graphql), build = buildsLimit(builds);
  const utcDayPartial = fromUtc === toUtc.slice(0,10) + 'T00:00:00.000Z';
  return Object.freeze({
    schema: 'myeongha-cloudflare-stage9-live-usage-v1',
    evidenceSource: 'CLOUDFLARE_WORKERS_GRAPHQL_AND_BUILDS_READ_API',
    scope: 'WORKER_SCRIPT_ALL_DEPLOYMENTS_NOT_EXACT_SHA',
    scriptName: 'myeongha',
    windowUtc: { from: fromUtc, to: toUtc, kind: utcDayPartial ? 'UTC_DAY_PARTIAL' : 'OTHER' },
    observedAtUtc,
    worker, builds: build,
    stopGateUsage: {
      scriptRequestsTodayUtc: utcDayPartial ? worker?.requests ?? null : null,
      workerCpuP95Ms: worker?.cpuP95Ms ?? null,
      buildMinutesExhausted: build?.minutesExhausted ?? null,
      accountBillingVerified: false,
    },
    notMeasured: [...NOT_MEASURED],
    unavailable: [
      ...(worker ? [] : ['GRAPHQL_WORKER_USAGE_HOLD']),
      ...(build ? [] : ['BUILDS_USAGE_LIMIT_HOLD']),
      'BILLING_PERMISSION_HOLD',
    ],
    productionCutover: 'HOLD',
    costDecision: 'COST_OR_LIMIT_EVIDENCE_HOLD',
  });
}

async function readJson(fetchImpl, url, options) {
  try {
    const res = await fetchImpl(url, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    // Permission, timeout and network failures remain HOLD. Never log
    // raw Cloudflare error text (could contain resource details).
    return null;
  }
}

export async function fetchCloudflareStage9LiveUsageV1({
  accountId, apiToken, now = new Date(), fetchImpl = fetch,
} = {}) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') ||
      typeof apiToken !== 'string' || apiToken.length < 8 ||
      !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw Error('Missing or invalid Cloudflare read-only usage configuration');
  }
  const toUtc = now.toISOString(), fromUtc = toUtc.slice(0,10) + 'T00:00:00.000Z';
  if (toUtc === fromUtc) throw Error('Empty UTC day observation');
  const headers = { Authorization: 'Bearer ' + apiToken, Accept: 'application/json' };
  const [graphql, builds] = await Promise.all([
    readJson(fetchImpl, 'https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: WORKER_USAGE_QUERY,
        variables: { accountTag: accountId, scriptName: 'myeongha',
          start: fromUtc, end: toUtc } }),
    }),
    readJson(fetchImpl, 'https://api.cloudflare.com/client/v4/accounts/' +
      accountId + '/builds/account/limits', { method: 'GET', headers }),
  ]);
  return normalizeCloudflareStage9LiveUsageV1({
    graphql, builds, fromUtc, toUtc, observedAtUtc: toUtc,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const usage = await fetchCloudflareStage9LiveUsageV1({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    });
    process.stdout.write(JSON.stringify(usage, null, 2) + '\n');
  } catch {
    process.stderr.write('Cloudflare read-only Stage 9 measurement unavailable; HOLD.\n');
    process.exitCode = 1;
  }
}
