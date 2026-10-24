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


const PREVIEW_BRANCH = 'feat/ops/cloudflare-authdb-clean-snapshot-20261021';
const MAX_BUILD_HISTORY_PAGES = 10;
const uuid = v => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
const buildUuid = v => typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));

// Build records belong to the exact Ops Preview, not main or another track.
// Running/stopped wall time is NOT Cloudflare billed build-minute usage.
export function normalizeCloudflareStage9BuildHistoryV1({
  pages, fromUtc, toUtc,
} = {}) {
  if (!Array.isArray(pages) || !pages.length ||
      pages.length > MAX_BUILD_HISTORY_PAGES ||
      !timestamp(fromUtc) || !timestamp(toUtc) || fromUtc >= toUtc) return null;
  const records = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i], info = page?.result_info;
    if (!Array.isArray(page?.result) || !info ||
        info.page !== i + 1 || info.total_pages !== pages.length ||
        info.next_page !== (i < pages.length - 1) ||
        !Number.isSafeInteger(info.count) ||
        info.count !== page.result.length) return null;
    records.push(...page.result);
  }
  const seen = new Set();
  const summary = { created: 0, success: 0, fail: 0, skipped: 0,
    cancelled: 0, terminated: 0, inProgress: 0,
    completedWithRuntime: 0, measuredRunWallSeconds: 0 };
  for (const entry of records) {
    if (!buildUuid(entry?.build_uuid) || seen.has(entry.build_uuid) ||
        !timestamp(entry.created_on) ||
        entry.build_trigger_metadata?.branch !== PREVIEW_BRANCH) return null;
    seen.add(entry.build_uuid);
    if (entry.created_on < fromUtc || entry.created_on >= toUtc) continue;
    summary.created++;
    if (entry.status !== 'stopped') {
      if (!['queued','initializing','running'].includes(entry.status)) return null;
      summary.inProgress++;
      continue;
    }
    if (!['success','fail','skipped','cancelled','terminated'].includes(
      entry.build_outcome)) return null;
    summary[entry.build_outcome]++;
    if (timestamp(entry.running_on) && timestamp(entry.stopped_on)) {
      const seconds = (Date.parse(entry.stopped_on) -
        Date.parse(entry.running_on)) / 1000;
      if (seconds < 0 || !Number.isFinite(seconds)) return null;
      summary.completedWithRuntime++;
      summary.measuredRunWallSeconds += seconds;
    }
  }
  summary.measuredRunWallSeconds =
    Math.round(summary.measuredRunWallSeconds * 1000) / 1000;
  return Object.freeze({
    evidenceSource: 'CLOUDFLARE_BUILDS_EXACT_OPS_PREVIEW_BRANCH',
    scope: 'OPS_PREVIEW_BUILDS_NOT_ACCOUNT_BUILD_MINUTES',
    windowUtc: { from: fromUtc, to: toUtc },
    ...summary,
    billingMinutes: null,
  });
}

async function readOpsPreviewBuilds(fetchImpl, accountId, headers, fromUtc, toUtc) {
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + accountId;
  const workers = await readJson(fetchImpl, base + '/workers/scripts',
    { method: 'GET', headers });
  if (!Array.isArray(workers?.result)) return null;
  const worker = workers.result.find(w => w?.id === 'myeongha');
  if (!uuid(worker?.tag)) return null;
  const previews = await readJson(fetchImpl,
    base + '/builds/workers/' + worker.tag + '/previews?page=1&per_page=200',
    { method: 'GET', headers });
  if (!Array.isArray(previews?.result)) return null;
  const preview = previews.result.find(p => p?.branch === PREVIEW_BRANCH);
  if (!uuid(preview?.preview_id)) return null;
  const endpoint = base + '/builds/workers/' + worker.tag +
    '/previews/' + preview.preview_id + '/builds';
  const pages = [];
  for (let page = 1; page <= MAX_BUILD_HISTORY_PAGES; page++) {
    const result = await readJson(fetchImpl,
      endpoint + '?page=' + page + '&per_page=200',
      { method: 'GET', headers });
    if (!result || !Array.isArray(result.result) ||
        result.result_info?.page !== page) return null;
    pages.push(result);
    if (result.result_info.next_page === false) {
      return normalizeCloudflareStage9BuildHistoryV1({
        pages, fromUtc, toUtc,
      });
    }
    if (result.result_info.next_page !== true) return null;
  }
  return null;
}

export function normalizeCloudflareStage9LiveUsageV1({
  graphql = null, builds = null, buildHistory = null, fromUtc, toUtc, observedAtUtc,
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
    worker, builds: build, buildHistory,
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
      ...(buildHistory ? [] : ['OPS_PREVIEW_BUILD_HISTORY_HOLD']),
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
  const buildHistory = await readOpsPreviewBuilds(
    fetchImpl, accountId, headers, fromUtc, toUtc,
  );
  return normalizeCloudflareStage9LiveUsageV1({
    graphql, builds, buildHistory, fromUtc, toUtc, observedAtUtc: toUtc,
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
