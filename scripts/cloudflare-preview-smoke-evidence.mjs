// Read-only Stage 9 evidence artifact from the existing synthetic Preview
// smoke. Strict allowlisting: no raw paths, query, cookies, tokens, bodies,
// user data, network calls, billing claims or authority elevation.
// Watchtower-Track: ops
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { HTML_ENTRIES } from './verify-cloudflare-static.mjs';
import {
  CLOUDFLARE_DIRECT_API_ROUTES,
  CLOUDFLARE_REWRITE_ROUTES,
} from '../workers/cloudflare-api-router.mjs';

const ALLOWED_TARGETS = Object.freeze(['current', 'recovery']);
const CLASSES = Object.freeze(['static', 'health', 'api-denial', 'protected-hold']);
const ALLOWED_ROUTES = new Set([
  'static.root', 'static.other', ...HTML_ENTRIES.map(x => 'static.' + x),
  'api.unknown',
  ...CLOUDFLARE_DIRECT_API_ROUTES.map(x => x.id),
  ...CLOUDFLARE_REWRITE_ROUTES.map(x => x.id),
]);
const COUNTERS = Object.freeze([
  'requestAttempts', 'responses', 'transportFailures', 'unexpectedStatuses',
  'http429', 'unexpected5xx', 'expectedHolds503',
]);
const STATISTICS = Object.freeze(['n', 'p50Ms', 'p95Ms', 'maxMs']);
const STOP_CODES = new Set([
  'EXACT_PREVIEW_COMMIT_MISMATCH',
  'SYNTHETIC_PROBE_EVIDENCE_MISSING',
  'SYNTHETIC_HTTP_OR_PROTECTION_FAILURE',
  'SEYEON_503_HOLD_NOT_OBSERVED',
  'SYNTHETIC_ROUTE_CLASS_UNCHECKED',
  'SECRET_ROTATION_FAILURE',
  'OAUTH_CALLBACK_FAILURE',
  'DB_TLS_RLS_FAILURE',
  'PROTECTED_RESPONSE_EXPOSED',
  'AI_PROVIDER_TIMEOUT',
  'PAYMENT_REPLAY_RISK',
  'BILLABLE_REQUEST_SPIKE',
  'FREE_DAILY_REQUEST_BUDGET_EXHAUSTED',
  'FREE_CPU_BUDGET_UNSAFE',
  'FREE_MEMORY_BUDGET_UNSAFE',
  'FREE_EXTERNAL_SUBREQUEST_BUDGET_UNSAFE',
  'BUILD_MINUTES_EXHAUSTED',
]);

function boundedCounter(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 256) {
    throw Error('Invalid redacted smoke counter');
  }
  return value;
}

function boundedStats(stat) {
  if (!stat || typeof stat !== 'object') {
    throw Error('Invalid redacted timing statistics');
  }
  const n = boundedCounter(stat.n);
  const result = { n };
  for (const k of STATISTICS.slice(1)) {
    const v = stat[k];
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) ||
                       v < 0 || v > 120000)) {
      throw Error('Invalid redacted timing statistics');
    }
    if (n === 0 && v !== null || n > 0 && v === null) {
      throw Error('Timing statistics without corresponding samples');
    }
    result[k] = v;
  }
  return result;
}

export function buildCloudflarePreviewSmokeEvidenceV1({
  target, expectedCommit, attestedCommit, metrics, stopGate,
  githubRunId, githubRunAttempt, htmlSha256,
}) {
  if (!ALLOWED_TARGETS.includes(target) ||
      typeof expectedCommit !== 'string' ||
      !/^[a-f0-9]{40}$/.test(expectedCommit) ||
      attestedCommit !== expectedCommit ||
      metrics?.schema !== 'myeongha-preview-http-probe-metrics-v1' ||
      stopGate?.schema !== 'myeongha-cloudflare-preview-operating-stop-v1' ||
      !['ALLOW_DENY_ONLY_PREVIEW','STOP_REHEARSAL'].includes(stopGate.previewDecision) ||
      stopGate.productionCutover !== 'HOLD' ||
      stopGate.automaticProductionMutation !== false ||
      !['INSUFFICIENT','UNSAFE','OBSERVED_WITHIN_BOUNDARIES'].includes(stopGate.freeBudgetEvidence) ||
      !['NOT_VERIFIED','ACCOUNT_READ_CONFIRMED'].includes(stopGate.accountBillingEvidence) ||
      !['COST_OR_LIMIT_EVIDENCE_HOLD','USAGE_EVIDENCE_ONLY_OWNER_APPROVAL_REQUIRED'].includes(stopGate.costDecision) ||
      !Array.isArray(stopGate.reasons) ||
      stopGate.reasons.some(x => !STOP_CODES.has(x))) {
    throw Error('Invalid Stage 9 read-only evidence boundary');
  }
  const hasRun = githubRunId !== undefined || githubRunAttempt !== undefined;
  if (hasRun && (
    typeof githubRunId !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(githubRunId) ||
    typeof githubRunAttempt !== 'string' ||
    !/^[1-9][0-9]{0,9}$/.test(githubRunAttempt)
  )) {
    throw Error('Invalid synthetic evidence CI run provenance');
  }
  const htmlNames=Object.keys(htmlSha256 ?? {}).sort();
  if (JSON.stringify(htmlNames)!==JSON.stringify([...HTML_ENTRIES].sort()) ||
      !htmlNames.every(name=>typeof htmlSha256[name]==='string' &&
        /^[a-f0-9]{64}$/.test(htmlSha256[name]))) {
    throw Error('Invalid public HTML SHA-256 evidence (contents redacted)');
  }
  const publicHtmlChecksums=Object.fromEntries(
    HTML_ENTRIES.map(name=>[name,htmlSha256[name]]));
  const counters = Object.fromEntries(COUNTERS.map(k => [k, boundedCounter(metrics[k])]));
  const groups = Object.fromEntries(CLASSES.map(k => [k, boundedStats(metrics.groups?.[k])]));
  if (!metrics.byRoute || typeof metrics.byRoute !== 'object' ||
      Array.isArray(metrics.byRoute)) {
    throw Error('Malformed redacted route metrics');
  }
  const routes = Object.fromEntries(Object.entries(metrics.byRoute)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([key, value])=>{
      if (!ALLOWED_ROUTES.has(key)) throw Error('Unknown route evidence key');
      return [key, boundedStats(value)];
    }));
  if (counters.responses + counters.transportFailures !== counters.requestAttempts) {
    throw Error('Mismatched synthetic probe counters');
  }
  return Object.freeze({
    schema: 'myeongha-cloudflare-stage9-ci-evidence-v1',
    evidenceSource: 'GITHUB_ACTIONS_SYNTHETIC_PREVIEW_HTTP',
    target, expectedCommit, attestedCommit,
    ...(hasRun ? { githubRun: { id: githubRunId, attempt: githubRunAttempt } } : {}),
    syntheticRequestCount: counters.requestAttempts,
    counters, groups, byRoute: routes,
    publicHtmlSha256:publicHtmlChecksums,
    decision: {
      preview: stopGate.previewDecision,
      production: 'HOLD',
      freeBudget: stopGate.freeBudgetEvidence,
      billing: stopGate.accountBillingEvidence,
      cost: stopGate.costDecision,
      reasons: [...stopGate.reasons],
    },
    // These are NOT computed from HTTPS response times.
    notMeasured: [
      'workerCpu','workerMemory','realTraffic','realBillableRequests',
      'cloudflareChargedCost','supabaseOpenAiPortOneCost',
    ],
  });
}

export async function writeCloudflarePreviewSmokeEvidenceV1(target, evidence, cwd = process.cwd()) {
  if (!ALLOWED_TARGETS.includes(target) ||
      evidence?.schema !== 'myeongha-cloudflare-stage9-ci-evidence-v1' ||
      evidence.target !== target) {
    throw Error('Unapproved Preview evidence destination');
  }
  const directory = resolve(cwd, 'artifacts', 'cloudflare-preview-stage9');
  const filename = join(directory, target + '.json');
  await mkdir(directory, { recursive: true });
  // The runner owns exactly one file per smoke. Never replace a previous
  // file or follow a pre-existing link; status/report is in JSON only.
  await writeFile(filename, JSON.stringify(evidence,null,2) + '\n', {
    flag:'wx',mode:0o600,encoding:'utf8',
  });
  return filename;
}
