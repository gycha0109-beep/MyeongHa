// Watchtower-Track: security
// Exact approved production origin. Does not log response bodies, IDs, or tokens.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const ORIGIN = 'https://myeongha.gycha0109.workers.dev';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TIMEOUT = 15000;
const VERSION_HEADER = 'x-myeongha-worker-version';

function requireUuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error(`Missing or invalid production ${name}; no HTTP request made.`);
  }
  return value;
}

function requireResponse(response, expectedStatus, label) {
  if (!(response instanceof Response) || response.status !== expectedStatus) {
    throw new Error(`Production G3 ${label} did not return expected HTTP ${expectedStatus}.`);
  }
  if ((response.headers.get('cache-control') ?? '').split(',')
    .map(v => v.trim().toLowerCase()).includes('no-store') === false) {
    throw new Error(`Production G3 ${label} is not cache-disabled.`);
  }
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json') ||
      response.headers.has('set-cookie') || response.headers.has('location')) {
    throw new Error(`Production G3 ${label} response headers are not permitted.`);
  }
  return requireUuid(response.headers.get(VERSION_HEADER), 'Worker version');
}

async function bodyEnvelope(response, expectedOk, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Production G3 ${label} response is not JSON.`);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body) ||
      body.ok !== expectedOk) {
    throw new Error(`Production G3 ${label} response envelope invalid.`);
  }
  return body;
}

async function request(fetchImpl, path, accessToken) {
  return fetchImpl(`${ORIGIN}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(accessToken === undefined ? {} : {Authorization: `Bearer ${accessToken}`}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

/**
 * Read-only authenticated Member HTTP proof for an already owned, historically
 * Se-yeon-participated Thread. No fixture creation, no messages serialized.
 * A missing governed fixture is a failed prerequisite, not a skipped PASS.
 */
export async function verifyProductionSeyeonG3HistoryHttpV1({
  env = process.env,
  fetchImpl = fetch,
  acquireSession = acquireProductionMemberSmokeSession,
} = {}) {
  if (env.DISPATCH_CONFIRM !== 'VERIFY_SEYEON_G3_HISTORY_HOLD') {
    throw new Error('Production G3 HTTP proof requires explicit governed dispatch.');
  }
  const thread = requireUuid(env.MYEONGHA_PRODUCTION_G3_HISTORY_THREAD_ID, 'owned history Thread');
  const subject = requireUuid(env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID, 'Member Subject');
  const url = `/api/chat/${thread}?afterSequenceNo=400&pageSize=1`;

  const anonymous = await request(fetchImpl, url);
  const anonymousVersion = requireResponse(anonymous, 401, 'anonymous Chat GET');
  const unauthorized = await bodyEnvelope(anonymous, false, 'anonymous Chat GET');
  if (unauthorized.error?.code !== 'AUTH_REQUIRED') {
    throw new Error('Production G3 anonymous Chat GET did not deny unauthorized access.');
  }

  const session = await acquireSession();
  if (typeof session?.accessToken !== 'string' || !session.accessToken ||
      /[\s,]/u.test(session.accessToken)) {
    throw new Error('Production G3 Member session unavailable.');
  }
  const me = await request(fetchImpl, '/api/me', session.accessToken);
  const memberVersion = requireResponse(me, 200, 'authenticated Member');
  const meBody = await bodyEnvelope(me, true, 'authenticated Member');
  if (meBody.data?.subjectId !== subject ||
      meBody.data?.subjectKind !== 'member' ||
      meBody.data?.subjectStatus !== 'active') {
    throw new Error('Production G3 verified Member Subject does not match expected owner.');
  }

  const history = await request(fetchImpl, url, session.accessToken);
  const historyVersion = requireResponse(history, 503, 'owned historical Chat GET');
  const historyBody = await bodyEnvelope(history, false, 'owned historical Chat GET');
  if (historyBody.error?.code !== 'SEYEON_HISTORY_REVEAL_HOLD' ||
      historyBody.error?.retryable !== false) {
    throw new Error('Production G3 historical Chat GET was not denied by the G3 boundary.');
  }
  if (anonymousVersion !== memberVersion || memberVersion !== historyVersion) {
    throw new Error('Production G3 Worker version changed during the HTTP proof.');
  }
  return Object.freeze({
    anonymous: 401,
    member: 200,
    historicalGet: 503,
    error: 'SEYEON_HISTORY_REVEAL_HOLD',
    noStore: true,
    sameWorkerVersion: true,
    workerVersion: memberVersion,
    disclosureAuthorized: false,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyProductionSeyeonG3HistoryHttpV1();
    process.stdout.write(
      `G3_PRODUCTION_HTTP_HOLD_PASS anonymous=${result.anonymous} member=${result.member} historical=${result.historicalGet} code=${result.error} noStore=${result.noStore} sameWorkerVersion=${result.sameWorkerVersion} workerVersion=${result.workerVersion} disclosureAuthorized=false\n`,
    );
  } catch {
    process.stderr.write('G3_PRODUCTION_HTTP_HOLD_FAIL governed read-only boundary check did not pass; no response body logged.\n');
    process.exitCode = 1;
  }
}
