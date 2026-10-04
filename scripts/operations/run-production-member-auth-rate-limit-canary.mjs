const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const REQUEST_LIMIT = 30;
const WINDOW_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10_000;
const EXPECTED_CONFIRM = 'VERIFY_MEMBER_AUTH_RATE_LIMIT_CANARY_V2';

const endpoints = Object.freeze([
  Object.freeze({
    action: 'sign-in',
    url: `${PRODUCTION_ORIGIN}/api/auth/sign-in`,
    body: '{"email":"","password":""}',
    expectedPreLimitStatus: 400,
    expectedPreLimitCode: 'INVALID_REQUEST',
  }),
  Object.freeze({
    action: 'sign-up',
    url: `${PRODUCTION_ORIGIN}/api/auth/sign-up`,
    body: '{"email":"","password":""}',
    expectedPreLimitStatus: 400,
    expectedPreLimitCode: 'INVALID_REQUEST',
  }),
  Object.freeze({
    action: 'refresh',
    url: `${PRODUCTION_ORIGIN}/api/auth/refresh`,
    body: '{"refreshToken":""}',
    expectedPreLimitStatus: 401,
    expectedPreLimitCode: 'SESSION_EXPIRED',
  }),
]);

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNoStore(response, label) {
  const directives = (response.headers.get('cache-control') ?? '')
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
  if (!directives.includes('no-store')) {
    throw new Error(`${label} must return Cache-Control containing no-store.`);
  }
}

async function readJson(response, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} did not return JSON.`);
  }
  if (!isRecord(body)) throw new Error(`${label} returned a non-object JSON body.`);
  return body;
}

async function send(endpoint) {
  return fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: endpoint.body,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function assertPreLimitResponse(response, endpoint, attempt) {
  if (response.status !== endpoint.expectedPreLimitStatus) {
    throw new Error(
      `${endpoint.action} attempt ${attempt} expected local HTTP ${endpoint.expectedPreLimitStatus} before the governed limit, received ${response.status}.`,
    );
  }
  requireNoStore(response, `${endpoint.action} attempt ${attempt}`);
  const body = await readJson(response, `${endpoint.action} attempt ${attempt}`);
  if (
    body.ok !== false ||
    !isRecord(body.error) ||
    body.error.code !== endpoint.expectedPreLimitCode ||
    body.error.retryable !== false
  ) {
    throw new Error(
      `${endpoint.action} attempt ${attempt} did not return ${endpoint.expectedPreLimitCode}.`,
    );
  }
}

async function readRateLimit(response, label) {
  if (response.status !== 429) {
    throw new Error(`${label} expected HTTP 429, received ${response.status}.`);
  }
  requireNoStore(response, label);
  const rawRetryAfter = response.headers.get('retry-after');
  if (rawRetryAfter === null || !/^\d+$/.test(rawRetryAfter)) {
    throw new Error(`${label} did not return an integer Retry-After.`);
  }
  const retryAfter = Number(rawRetryAfter);
  if (!Number.isInteger(retryAfter) || retryAfter < 1 || retryAfter > WINDOW_SECONDS) {
    throw new Error(`${label} Retry-After is outside 1..${WINDOW_SECONDS} seconds.`);
  }
  const body = await readJson(response, label);
  if (
    body.ok !== false ||
    !isRecord(body.error) ||
    body.error.code !== 'RATE_LIMITED' ||
    body.error.retryable !== false
  ) {
    throw new Error(`${label} did not return the governed RATE_LIMITED envelope.`);
  }
  return retryAfter;
}

async function firstCleanPreLimitResponse(endpoint) {
  let startedAt = Date.now();
  let response = await send(endpoint);
  if (response.status === 429) {
    const retryAfter = await readRateLimit(response, `${endpoint.action} preexisting bucket`);
    await sleep((retryAfter + 2) * 1000);
    startedAt = Date.now();
    response = await send(endpoint);
  }
  await assertPreLimitResponse(response, endpoint, 1);
  return startedAt;
}

async function runEndpointCanary(endpoint) {
  const startedAt = await firstCleanPreLimitResponse(endpoint);

  for (let attempt = 2; attempt <= REQUEST_LIMIT; attempt += 1) {
    const response = await send(endpoint);
    await assertPreLimitResponse(response, endpoint, attempt);
  }

  const allowedElapsedMs = Date.now() - startedAt;
  if (allowedElapsedMs >= 45_000) {
    throw new Error(
      `${endpoint.action} first ${REQUEST_LIMIT} requests took ${allowedElapsedMs}ms and cannot prove one anchored 60-second bucket.`,
    );
  }

  const blocked = await send(endpoint);
  const retryAfter = await readRateLimit(
    blocked,
    `${endpoint.action} attempt ${REQUEST_LIMIT + 1}`,
  );

  return Object.freeze({
    action: endpoint.action,
    allowedElapsedMs,
    retryAfter,
  });
}

if (requireEnv('MYEONGHA_MEMBER_AUTH_RATE_LIMIT_CANARY_CONFIRM') !== EXPECTED_CONFIRM) {
  throw new Error('Production Member Auth rate-limit canary confirmation is invalid.');
}
if (requireEnv('MYEONGHA_WATCHTOWER_TRACK') !== 'ops') {
  throw new Error('Production Member Auth rate-limit canary requires Watchtower track ops.');
}

const results = [];
for (const endpoint of endpoints) {
  results.push(await runEndpointCanary(endpoint));
}

const signOut = await fetch(`${PRODUCTION_ORIGIN}/api/auth/sign-out`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  },
  body: '{}',
  redirect: 'error',
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
requireNoStore(signOut, 'sign-out exclusion probe');
if (signOut.status !== 401) {
  throw new Error(`sign-out exclusion probe expected HTTP 401, received ${signOut.status}.`);
}
const signOutBody = await readJson(signOut, 'sign-out exclusion probe');
if (
  signOutBody.ok !== false ||
  !isRecord(signOutBody.error) ||
  signOutBody.error.code !== 'AUTH_REQUIRED'
) {
  throw new Error('sign-out exclusion probe did not preserve AUTH_REQUIRED behavior.');
}

console.log('member_auth_rate_limit_canary=pass');
for (const result of results) {
  console.log(`${result.action}_allowed_pre_limit_requests=${REQUEST_LIMIT}`);
  console.log(`${result.action}_first_rate_limited_attempt=${REQUEST_LIMIT + 1}`);
  console.log(`${result.action}_retry_after_seconds=${result.retryAfter}`);
}
console.log('endpoint_bucket_independence=pass');
console.log('sign_out_rate_limit_excluded=pass');
console.log('probe_payloads=local_non_mutating_only');
console.log('raw_network_identifiers_emitted=false');
console.log('credential_material_emitted=false');
