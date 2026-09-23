import pg from 'pg';

const { Client } = pg;

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const BOOTSTRAP_URL = `${PRODUCTION_ORIGIN}/api/session/bootstrap`;
const ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const SUPABASE_PROJECT_ID = 'cnsfpcdiyofqvhpcegfc';
const REQUEST_LIMIT = 30;
const WINDOW_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10_000;
const EXPECTED_CONFIRM = 'VERIFY_GUEST_BOOTSTRAP_RATE_LIMIT_CANARY_V1';

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

function requireUuid(name, value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
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

async function readJsonWithoutLogging(response, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
  if (!isRecord(body)) {
    throw new Error(`${label} returned a non-object JSON body.`);
  }
  return body;
}

async function fetchCanonical(url, init) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function readGuestCounts(client) {
  const result = await client.query(`
    select
      (select count(*)::text from public.subjects where kind = 'guest') as "guestSubjects",
      (select count(*)::text from public.guest_sessions) as "guestSessions"
  `);
  const row = result.rows[0];
  if (!row || !/^\d+$/.test(row.guestSubjects) || !/^\d+$/.test(row.guestSessions)) {
    throw new Error('Production Guest aggregate count query returned an invalid result.');
  }
  return Object.freeze({
    guestSubjects: BigInt(row.guestSubjects),
    guestSessions: BigInt(row.guestSessions),
  });
}

function requireSameCounts(before, after, label) {
  if (
    before.guestSubjects !== after.guestSubjects ||
    before.guestSessions !== after.guestSessions
  ) {
    throw new Error(`${label} changed durable Guest row counts.`);
  }
}

function requireCountDelta(before, after, expected, label) {
  const subjectDelta = after.guestSubjects - before.guestSubjects;
  const sessionDelta = after.guestSessions - before.guestSessions;
  if (subjectDelta !== expected || sessionDelta !== expected) {
    throw new Error(
      `${label} expected Guest subject/session delta ${expected}, received ${subjectDelta}/${sessionDelta}.`,
    );
  }
}

async function assertInvalidRequestResponse(response, attempt) {
  if (response.status !== 400) {
    throw new Error(
      `Invalid bootstrap probe ${attempt} expected HTTP 400 before the rate limit, received ${response.status}.`,
    );
  }
  requireNoStore(response, `Invalid bootstrap probe ${attempt}`);
  const body = await readJsonWithoutLogging(response, `Invalid bootstrap probe ${attempt}`);
  if (
    body.ok !== false ||
    !isRecord(body.error) ||
    body.error.code !== 'INVALID_REQUEST' ||
    !isRecord(body.meta) ||
    body.meta.apiContractVersion !== 'v0.9'
  ) {
    throw new Error(`Invalid bootstrap probe ${attempt} did not return INVALID_REQUEST v0.9.`);
  }
}

async function sendInvalidProbe(attempt) {
  const response = await fetchCanonical(BOOTSTRAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: '{"probe":true}',
  });
  return response;
}

async function alignNearStartOfMinute() {
  const elapsed = Date.now() % (WINDOW_SECONDS * 1000);
  if (elapsed <= 3000) return;
  const waitMs = WINDOW_SECONDS * 1000 - elapsed + 1500;
  await sleep(waitMs);
}

const confirmation = requireEnv('MYEONGHA_GUEST_BOOTSTRAP_CANARY_CONFIRM');
if (confirmation !== EXPECTED_CONFIRM) {
  throw new Error('Production Guest bootstrap rate-limit canary confirmation is invalid.');
}
if (requireEnv('MYEONGHA_WATCHTOWER_TRACK') !== 'ops') {
  throw new Error('Production Guest bootstrap rate-limit canary requires Watchtower track ops.');
}

const poolerHost = requireEnv('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(poolerHost)) {
  throw new Error('SUPABASE_PRODUCTION_SESSION_POOLER_HOST must be a bare *.pooler.supabase.com host.');
}
const databasePassword = requireEnv('SUPABASE_DB_PASSWORD');

const client = new Client({
  host: poolerHost,
  port: 5432,
  database: 'postgres',
  user: `postgres.${SUPABASE_PROJECT_ID}`,
  password: databasePassword,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
  query_timeout: 10_000,
  statement_timeout: 10_000,
});

await client.connect();

try {
  const beforeInvalid = await readGuestCounts(client);

  // Give the activated Firewall configuration time to reach the edge, then avoid
  // straddling the ordinary 60-second wall-clock boundary during the probe burst.
  await sleep(15_000);
  await alignNearStartOfMinute();

  const burstStartedAt = Date.now();
  for (let attempt = 1; attempt <= REQUEST_LIMIT; attempt += 1) {
    const response = await sendInvalidProbe(attempt);
    await assertInvalidRequestResponse(response, attempt);
  }
  const allowedBurstElapsedMs = Date.now() - burstStartedAt;
  if (allowedBurstElapsedMs >= 45_000) {
    throw new Error(
      `The first ${REQUEST_LIMIT} probes took ${allowedBurstElapsedMs}ms and cannot prove one 60-second bucket.`,
    );
  }

  let firstRateLimitedAttempt = null;
  for (let attempt = REQUEST_LIMIT + 1; attempt <= REQUEST_LIMIT + 5; attempt += 1) {
    const response = await sendInvalidProbe(attempt);
    if (response.status === 429) {
      firstRateLimitedAttempt = attempt;
      break;
    }
    await assertInvalidRequestResponse(response, attempt);
  }
  if (firstRateLimitedAttempt === null) {
    throw new Error('Vercel edge did not return HTTP 429 within five requests after the governed limit.');
  }

  const afterInvalid = await readGuestCounts(client);
  requireSameCounts(beforeInvalid, afterInvalid, 'Invalid-body rate-limit canary');

  // Clear the governed bucket before proving one real bootstrap plus reusable
  // identity continuity. This intentionally creates exactly one Guest subject/session.
  await sleep((WINDOW_SECONDS + 5) * 1000);

  const fresh = await fetchCanonical(BOOTSTRAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  requireNoStore(fresh, 'Fresh Guest bootstrap');
  if (fresh.status !== 200) {
    throw new Error(`Fresh Guest bootstrap expected HTTP 200, received ${fresh.status}.`);
  }
  const freshBody = await readJsonWithoutLogging(fresh, 'Fresh Guest bootstrap');
  if (freshBody.ok !== true || !isRecord(freshBody.data) || freshBody.data.kind !== 'guest') {
    throw new Error('Fresh Guest bootstrap did not return a Guest success envelope.');
  }
  const subjectId = requireUuid('Fresh Guest subjectId', freshBody.data.subjectId);
  if (!isRecord(freshBody.data.guestSession)) {
    throw new Error('Fresh Guest bootstrap omitted guestSession.');
  }
  const guestSessionId = requireUuid(
    'Fresh Guest guestSessionId',
    freshBody.data.guestSession.guestSessionId,
  );
  const bearerToken = freshBody.data.guestSession.bearerToken;
  if (typeof bearerToken !== 'string' || bearerToken.length === 0) {
    throw new Error('Fresh Guest bootstrap omitted its one-time bearer credential.');
  }

  const afterFresh = await readGuestCounts(client);
  requireCountDelta(afterInvalid, afterFresh, 1n, 'Fresh Guest bootstrap');

  const authorization = { Authorization: `Bearer ${bearerToken}` };

  const current = await fetchCanonical(ME_URL, {
    method: 'GET',
    headers: authorization,
  });
  requireNoStore(current, 'Guest /api/me continuity');
  if (current.status !== 200) {
    throw new Error(`Guest /api/me expected HTTP 200, received ${current.status}.`);
  }
  const currentBody = await readJsonWithoutLogging(current, 'Guest /api/me continuity');
  if (
    currentBody.ok !== true ||
    !isRecord(currentBody.data) ||
    currentBody.data.subjectKind !== 'guest' ||
    currentBody.data.subjectId !== subjectId
  ) {
    throw new Error('Guest /api/me did not preserve the freshly bootstrapped canonical subject.');
  }

  const reused = await fetchCanonical(BOOTSTRAP_URL, {
    method: 'POST',
    headers: {
      ...authorization,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  requireNoStore(reused, 'Reusable Guest bootstrap');
  if (reused.status !== 200) {
    throw new Error(`Reusable Guest bootstrap expected HTTP 200, received ${reused.status}.`);
  }
  const reusedBody = await readJsonWithoutLogging(reused, 'Reusable Guest bootstrap');
  if (
    reusedBody.ok !== true ||
    !isRecord(reusedBody.data) ||
    reusedBody.data.kind !== 'guest' ||
    reusedBody.data.subjectId !== subjectId ||
    !isRecord(reusedBody.data.guestSession) ||
    reusedBody.data.guestSession.guestSessionId !== guestSessionId ||
    reusedBody.data.guestSession.bearerToken !== null
  ) {
    throw new Error('Reusable Guest bootstrap did not preserve the existing canonical Guest identity.');
  }

  const afterReuse = await readGuestCounts(client);
  requireSameCounts(afterFresh, afterReuse, 'Reusable Guest bootstrap');

  console.log('guest_bootstrap_rate_limit_canary=pass');
  console.log(`allowed_invalid_requests=${REQUEST_LIMIT}`);
  console.log(`first_rate_limited_attempt=${firstRateLimitedAttempt}`);
  console.log('rate_limited_status=429');
  console.log('invalid_probe_guest_row_delta=0');
  console.log('fresh_bootstrap_guest_subject_delta=1');
  console.log('fresh_bootstrap_guest_session_delta=1');
  console.log('reused_bootstrap_guest_row_delta=0');
  console.log('api_me_continuity=pass');
  console.log('bearer_material_logged=false');
} finally {
  await client.end().catch(() => undefined);
}
