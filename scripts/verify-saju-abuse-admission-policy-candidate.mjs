import { readFile } from 'node:fs/promises';

const paths = {
  policy: 'config/operations/saju-abuse-admission-policy-candidate-v1.json',
  observability: 'apps/api/src/saju-abuse-observability.ts',
  calculationRuntime: 'apps/api/src/production-current-subject-saju-calculation-runtime.ts',
  previewRuntime: 'apps/api/src/production-current-subject-saju-preview-reading-runtime.ts',
  apiClientHttp: 'packages/api-client/src/http.ts',
  calculationAdapter: 'apps/api/src/saju-production-calculation-http-adapter.ts',
  readingAdapter: 'apps/api/src/saju-production-reading-http-adapter.ts',
  snapshot: 'docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03.json',
  docs: 'docs/operations/SAJU_ABUSE_ADMISSION_POLICY_CANDIDATE_V1.md',
};

const [
  policyRaw,
  observability,
  calculationRuntime,
  previewRuntime,
  apiClientHttp,
  calculationAdapter,
  readingAdapter,
  snapshotRaw,
  docs,
] = await Promise.all([
  readFile(paths.policy, 'utf8'),
  readFile(paths.observability, 'utf8'),
  readFile(paths.calculationRuntime, 'utf8'),
  readFile(paths.previewRuntime, 'utf8'),
  readFile(paths.apiClientHttp, 'utf8'),
  readFile(paths.calculationAdapter, 'utf8'),
  readFile(paths.readingAdapter, 'utf8'),
  readFile(paths.snapshot, 'utf8'),
  readFile(paths.docs, 'utf8'),
]);

const policy = JSON.parse(policyRaw);
const snapshot = JSON.parse(snapshotRaw);

function equal(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      label + ' drifted: expected=' + JSON.stringify(expected) +
      ' actual=' + JSON.stringify(actual),
    );
  }
}

function requireFragment(name, source, fragment) {
  if (!source.includes(fragment)) {
    throw new Error(name + ' missing required fragment: ' + fragment);
  }
}

function forbidFragment(name, source, fragment) {
  if (source.includes(fragment)) {
    throw new Error(name + ' contains forbidden fragment: ' + fragment);
  }
}

function countFragment(source, fragment) {
  return source.split(fragment).length - 1;
}

equal(
  'contractVersion',
  policy.contractVersion,
  'myeongha-saju-abuse-admission-policy-candidate-v1',
);
equal('issue', policy.issue, '#1526');
equal('policyAuthority', policy.policyAuthority, 'NOT_APPROVED');
equal('activationState', policy.activationState, 'hold-baseline-insufficient');
equal('enforcementAuthorized', policy.enforcementAuthorized, false);
equal('productionMutationAuthorized', policy.productionMutationAuthorized, false);
equal('strategy', policy.strategy, 'postgres-application-admission');
equal('algorithm', policy.algorithm, 'anchored-fixed-window');
equal('windowSeconds', policy.windowSeconds, null);
equal('requestLimit', policy.requestLimit, null);
equal('blockedCountSaturation', policy.blockedCountSaturation, null);

equal(
  'routes',
  policy.routes,
  [
    {
      routeId: 'api.me.saju.calculation',
      publicPath: '/api/me/saju/calculation',
      method: 'POST',
      bucketScope: 'route+clientKey',
    },
    {
      routeId: 'api.me.saju.preview-reading',
      publicPath: '/api/me/saju/preview-reading',
      method: 'POST',
      bucketScope: 'route+clientKey',
    },
  ],
);

equal(
  'clientKey',
  policy.clientKey,
  {
    version: 'myeongha-saju-abuse-client-hmac-sha256-v1',
    derivationAuthority:
      'apps/api/src/saju-abuse-observability.ts#fingerprintSajuAbuseClientV1',
    source: 'verified-member-or-guest-evidence',
    rawIdentityPersistence: false,
    rawNetworkIdentifierPersistence: false,
    admissionBucketComponents: ['routeId', 'clientKey'],
  },
);

equal(
  'counterStoreCandidate',
  policy.counterStoreCandidate,
  {
    kind: 'postgres',
    persistence: 'unlogged-ephemeral',
    directTableAuthorityForApiExecutor: false,
    commandAuthority: 'dedicated-security-definer-command',
    failureMode: 'fail-closed',
    unavailableHttpStatus: 503,
    unavailableCode: 'SAJU_ADMISSION_UNAVAILABLE',
    cleanupRetention: 'UNDECIDED_UNTIL_WINDOW_APPROVAL',
    rationale:
      'Reuse the already runtime-proven Member Auth PostgreSQL application-admission pattern without adding a new external store dependency.',
  },
);

equal(
  'blockedResponseCandidate',
  policy.blockedResponseCandidate,
  {
    httpStatus: 429,
    code: 'RATE_LIMITED',
    retryAfterSource: 'admission-reset-at',
    retryAfterMaximumSeconds: null,
    cacheControl: 'no-store',
  },
);

equal(
  'retryBoundary',
  policy.retryBoundary,
  {
    sharedApiClientAutomaticRetry: false,
    upstreamCalculationAutomaticRetry: false,
    upstreamPreviewReadingAutomaticRetry: false,
    deniedRequestReachesSubjectResolution: false,
    deniedRequestReachesBirthProfileRead: false,
    deniedRequestReachesUpstreamSaju: false,
    allowedRepeatedRequestsConsumeAdmission: true,
  },
);

equal(
  'observability',
  policy.observability,
  {
    rateLimitedEventRequired: true,
    eventCode: 'RATE_LIMITED',
    rawClientKeyInRateLimitedEvent: false,
    rawIdentityInRateLimitedEvent: false,
    requestBodyInRateLimitedEvent: false,
    birthDataInRateLimitedEvent: false,
    sajuPayloadInRateLimitedEvent: false,
  },
);

equal(
  'baselineAuthority',
  policy.baselineAuthority,
  {
    analyzer: 'scripts/analyze-saju-abuse-baseline.mjs',
    latestSnapshot: 'docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03.json',
    organicBaseline: 'INSUFFICIENT',
    numericPolicyDecision: 'HOLD',
  },
);

equal(
  'approvalRequirements',
  policy.approvalRequirements,
  [
    'usable-organic-baseline-or-explicit-product-authority',
    'windowSeconds-approved',
    'requestLimit-approved',
    'retryAfterMaximumSeconds-approved',
    'counter-cleanup-retention-approved',
    'production-canary-plan-approved',
  ],
);

equal('snapshot organic baseline', snapshot.disposition?.organicBaseline, 'INSUFFICIENT');
equal('snapshot numeric policy', snapshot.disposition?.numericAdmissionPolicy, 'HOLD');
equal('snapshot enforcement', snapshot.disposition?.enforcement, 'HOLD');
equal('snapshot issue closure', snapshot.disposition?.issueClosureAllowed, false);

for (const fragment of [
  "SAJU_ABUSE_CLIENT_KEY_VERSION_V1 =",
  "'myeongha-saju-abuse-client-hmac-sha256-v1'",
  'fingerprintSajuAbuseClientV1',
  'createHmac',
  '.digest(\'hex\')',
]) {
  requireFragment(paths.observability, observability, fragment);
}

for (const source of [calculationRuntime, previewRuntime]) {
  requireFragment(
    'Saju runtime',
    source,
    'createSajuAbuseObservedIdentityVerifierV1',
  );
  forbidFragment('Saju runtime', source, 'SAJU_ADMISSION_UNAVAILABLE');
  forbidFragment('Saju runtime', source, "'RATE_LIMITED'");
}

equal(
  'shared API client fetch count',
  countFragment(apiClientHttp, 'await this.fetchImpl('),
  1,
);
forbidFragment(paths.apiClientHttp, apiClientHttp, 'retry(');
forbidFragment(paths.apiClientHttp, apiClientHttp, 'retryRequest');

equal(
  'calculation upstream fetch count',
  countFragment(calculationAdapter, 'input.fetchImpl(input.url,'),
  1,
);
equal(
  'preview upstream fetch count',
  countFragment(readingAdapter, 'input.fetchImpl(input.url,'),
  1,
);

for (const fragment of [
  'NOT APPROVED',
  'INSUFFICIENT',
  'PostgreSQL',
  'UNLOGGED',
  'fail-closed',
  '429',
  '503',
  'RATE_LIMITED',
  'SAJU_ADMISSION_UNAVAILABLE',
  'no automatic retry',
  'no numeric threshold',
  'no Production mutation',
]) {
  requireFragment(paths.docs, docs, fragment);
}

for (const forbiddenField of [
  'approvedBy',
  'approvedAt',
  'approvedPolicyVersion',
]) {
  if (Object.hasOwn(policy, forbiddenField)) {
    throw new Error('Unapproved candidate must not contain ' + forbiddenField + '.');
  }
}

console.log(
  'MyeongHa Saju abuse admission policy candidate verification passed: identity/store/failure/retry boundaries are pinned while numeric limits and Production enforcement remain unapproved.',
);
