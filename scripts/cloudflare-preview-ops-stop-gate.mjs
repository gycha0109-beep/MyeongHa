// Read-only Ops Stage 9 stop/admission verdict.
// No Cloudflare API/billing access, deployment action, secrets or PII.
// An unmeasured Free budget never becomes a Production green light.
// Watchtower-Track: ops

export const CLOUDFLARE_WORKERS_FREE_OPERATING_LIMITS_V1 = Object.freeze({
  requestsPerUtcDay: 100_000,
  cpuTimePerInvocationMs: 10,
  memoryMb: 128,
  externalSubrequestsPerInvocation: 50,
});

// Explicit incident signals from a separate authorized source, not guessed
// from synthetic HTTP timing. Missing signals are UNKNOWN, never a pass.
const INCIDENT_FLAGS = Object.freeze([
  ['credentialRotationFailure', 'SECRET_ROTATION_FAILURE'],
  ['oauthCallbackFailure', 'OAUTH_CALLBACK_FAILURE'],
  ['postgresTlsRlsFailure', 'DB_TLS_RLS_FAILURE'],
  ['protectedResponseExposed', 'PROTECTED_RESPONSE_EXPOSED'],
  ['providerTimeout', 'AI_PROVIDER_TIMEOUT'],
  ['paymentReplayRisk', 'PAYMENT_REPLAY_RISK'],
  ['billableRequestSpike', 'BILLABLE_REQUEST_SPIKE'],
]);

const requiredMetricCounts = Object.freeze([
  'static', 'health', 'api-denial', 'protected-hold',
]);

function readNonnegative(observation, key, integer = false) {
  const n = observation?.[key];
  if (n === undefined || n === null) return null;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 ||
      (integer && !Number.isSafeInteger(n))) {
    throw Error('Invalid bounded read-only operating observation');
  }
  return n;
}

function boundedCount(summary, key) {
  const n = summary?.[key];
  if (!Number.isSafeInteger(n) || n < 0 || n > 256) {
    throw Error('Malformed synthetic smoke summary (redacted)');
  }
  return n;
}

export function assessCloudflarePreviewOpsStopGateV1({
  metrics, expectedCommit, attestedCommit,
  usage = null, incidents = null,
} = {}) {
  const stops = new Set();
  if (typeof expectedCommit !== 'string' ||
      !/^[a-f0-9]{40}$/.test(expectedCommit) ||
      attestedCommit !== expectedCommit) {
    stops.add('EXACT_PREVIEW_COMMIT_MISMATCH');
  }

  if (!metrics || metrics.schema !== 'myeongha-preview-http-probe-metrics-v1') {
    stops.add('SYNTHETIC_PROBE_EVIDENCE_MISSING');
  } else {
    const requestAttempts = boundedCount(metrics, 'requestAttempts');
    const responses = boundedCount(metrics, 'responses');
    const transportFailures = boundedCount(metrics, 'transportFailures');
    const unexpectedStatuses = boundedCount(metrics, 'unexpectedStatuses');
    const http429 = boundedCount(metrics, 'http429');
    const unexpected5xx = boundedCount(metrics, 'unexpected5xx');
    const expectedHolds503 = boundedCount(metrics, 'expectedHolds503');

    if (requestAttempts === 0 || responses + transportFailures !== requestAttempts ||
        transportFailures > 0 || unexpectedStatuses > 0 || http429 > 0 ||
        unexpected5xx > 0) {
      stops.add('SYNTHETIC_HTTP_OR_PROTECTION_FAILURE');
    }
    if (!Number.isSafeInteger(expectedHolds503) || expectedHolds503 < 1) {
      stops.add('SEYEON_503_HOLD_NOT_OBSERVED');
    }
    for (const group of requiredMetricCounts) {
      const n = metrics.groups?.[group]?.n;
      if (!Number.isSafeInteger(n) || n < 1 || n > requestAttempts) {
        stops.add('SYNTHETIC_ROUTE_CLASS_UNCHECKED');
      }
    }
  }

  if (incidents !== null) {
    if (!incidents || typeof incidents !== 'object' || Array.isArray(incidents)) {
      throw Error('Invalid reviewed incident signals');
    }
    for (const [flag,code] of INCIDENT_FLAGS) {
      if (incidents[flag] === true) stops.add(code);
      else if (incidents[flag] !== undefined && incidents[flag] !== null &&
               incidents[flag] !== false) {
        throw Error('Invalid reviewed incident flag');
      }
    }
  }

  const limits = CLOUDFLARE_WORKERS_FREE_OPERATING_LIMITS_V1;
  const evidenceKeys = [
    ['workerRequestsTodayUtc', true],
    ['cpuMaxMsPerInvocation', false],
    ['memoryMaxMb', false],
    ['externalSubrequestsMaxPerInvocation', true],
  ];
  const observed = Object.fromEntries(evidenceKeys.map(([key,integer])=>
    [key,readNonnegative(usage,key,integer)]));
  const allResourceMetrics = Object.values(observed).every(v=>v !== null);
  if (observed.workerRequestsTodayUtc !== null &&
      observed.workerRequestsTodayUtc >= limits.requestsPerUtcDay) {
    stops.add('FREE_DAILY_REQUEST_BUDGET_EXHAUSTED');
  }
  if (observed.cpuMaxMsPerInvocation !== null &&
      observed.cpuMaxMsPerInvocation >= limits.cpuTimePerInvocationMs) {
    stops.add('FREE_CPU_BUDGET_UNSAFE');
  }
  if (observed.memoryMaxMb !== null &&
      observed.memoryMaxMb >= limits.memoryMb) {
    stops.add('FREE_MEMORY_BUDGET_UNSAFE');
  }
  if (observed.externalSubrequestsMaxPerInvocation !== null &&
      observed.externalSubrequestsMaxPerInvocation >=
        limits.externalSubrequestsPerInvocation) {
    stops.add('FREE_EXTERNAL_SUBREQUEST_BUDGET_UNSAFE');
  }
  // Script-wide GraphQL counts are only a LOWER bound on account traffic.
  // Crossing the account Free ceiling is grounds to stop; a lower count
  // does not establish that the account is within its total daily quota.
  const scriptCalls = readNonnegative(usage, 'scriptRequestsTodayUtc', true);
  if (scriptCalls !== null && scriptCalls >= limits.requestsPerUtcDay) {
    stops.add('FREE_DAILY_REQUEST_BUDGET_EXHAUSTED');
  }
  // Observed p95 above the CPU ceiling is unsafe. A lower p95 is not
  // evidence of a safe invocation maximum or per-route CPU acceptance.
  const cpuP95 = readNonnegative(usage, 'workerCpuP95Ms');
  if (cpuP95 !== null && cpuP95 >= limits.cpuTimePerInvocationMs) {
    stops.add('FREE_CPU_BUDGET_UNSAFE');
  }
  if (usage?.buildMinutesExhausted === true) stops.add('BUILD_MINUTES_EXHAUSTED');
  else if (usage?.buildMinutesExhausted !== undefined &&
           usage?.buildMinutesExhausted !== null &&
           usage.buildMinutesExhausted !== false) {
    throw Error('Invalid build-minute limit observation');
  }

  // Billing is an account-authorized, separately scoped observation.
  // A synthetic request, zero-value placeholder or success CI is NOT evidence.
  const accountBillingVerified = usage?.accountBillingVerified === true;
  if (usage?.accountBillingVerified !== undefined &&
      usage.accountBillingVerified !== true &&
      usage.accountBillingVerified !== false) {
    throw Error('Invalid billing evidence status');
  }
  const stopReasons=[...stops].sort();
  return Object.freeze({
    schema:'myeongha-cloudflare-preview-operating-stop-v1',
    previewDecision:stopReasons.length ? 'STOP_REHEARSAL' : 'ALLOW_DENY_ONLY_PREVIEW',
    productionCutover:'HOLD',
    freeBudgetEvidence:allResourceMetrics && usage?.buildMinutesExhausted === false
      ? (stopReasons.length ? 'UNSAFE' : 'OBSERVED_WITHIN_BOUNDARIES')
      : 'INSUFFICIENT',
    accountBillingEvidence:accountBillingVerified ? 'ACCOUNT_READ_CONFIRMED' : 'NOT_VERIFIED',
    costDecision:accountBillingVerified && allResourceMetrics &&
      usage?.buildMinutesExhausted === false && stopReasons.length===0
      ? 'USAGE_EVIDENCE_ONLY_OWNER_APPROVAL_REQUIRED'
      : 'COST_OR_LIMIT_EVIDENCE_HOLD',
    reasons:stopReasons,
    // Do not perform this action here: separate, expressly authorized manual
    // response chooses HOLD, pinned earlier Preview, or Vercel standby.
    recoveryAction:'RETAIN_VERCEL_PRODUCTION_AND_PROTECTED_404_503_HOLDS',
    automaticProductionMutation:false,
  });
}
