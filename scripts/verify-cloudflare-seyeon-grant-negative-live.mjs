// Watchtower-Track: security
// Controlled S0 negative-only Member HTTP smoke. Never log token, Subject,
// source ids, private records, HTTP response bodies or request credentials.
import { randomUUID } from 'node:crypto';
import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const ORIGIN = 'https://myeongha.gycha0109.workers.dev';
const EXPECTED_VERSION = process.env.CLOUDFLARE_EXPECTED_WORKER_VERSION;
const EXPECTED_SUBJECT = process.env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function requireCondition(value, label) {
  if (!value) throw new Error(label);
}
function object(value) {
  requireCondition(value !== null && typeof value === 'object' &&
    !Array.isArray(value), 'INVALID_JSON_ENVELOPE');
  return value;
}
async function fetchChecked(path, token, { allowSubject = false } = {}) {
  requireCondition(path.startsWith('/') && !path.startsWith('//') &&
    !path.includes('?') && !path.includes('#'), 'INVALID_CANONICAL_PATH');
  const response = await fetch(ORIGIN + path, {
    method: 'GET',
    headers: { Accept: 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  requireCondition(response.headers.get('x-myeongha-worker-version') ===
    EXPECTED_VERSION, 'WORKER_VERSION_CHANGED');
  requireCondition((response.headers.get('cache-control') ?? '').toLowerCase()
    .split(',').some(x => x.trim() === 'no-store'), 'NO_STORE_MISSING');
  requireCondition((response.headers.get('content-type') ?? '').toLowerCase()
    .includes('application/json'), 'NON_JSON_RESPONSE');
  requireCondition(!response.headers.has('set-cookie'), 'UNEXPECTED_COOKIE');
  const bodyText = await response.text();
  requireCondition(bodyText.length <= 16384, 'OVERSIZE_RESPONSE');
  let envelope;
  try { envelope = JSON.parse(bodyText); }
  catch { throw new Error('INVALID_JSON_RESPONSE'); }
  requireCondition(!token || !bodyText.includes(token), 'AUTH_TOKEN_REFLECTED');
  requireCondition(allowSubject || !bodyText.includes(EXPECTED_SUBJECT), 'SUBJECT_REFLECTED');
  return { status: response.status, body: object(envelope) };
}

requireCondition(typeof EXPECTED_VERSION === 'string' &&
  UUID.test(EXPECTED_VERSION), 'EXPECTED_WORKER_VERSION_REQUIRED');
requireCondition(typeof EXPECTED_SUBJECT === 'string' &&
  UUID.test(EXPECTED_SUBJECT), 'EXPECTED_MEMBER_SUBJECT_REQUIRED');

const health = await fetchChecked('/api/health');
requireCondition(health.status === 200 && health.body.status === 'ok',
  'WORKER_HEALTH_FAILED');
const session = await acquireProductionMemberSmokeSession({
  origin: ORIGIN, expectedCloudflareVersion: EXPECTED_VERSION,
});
const token = session.accessToken;
const me = await fetchChecked('/api/me', token, { allowSubject: true });
requireCondition(me.status === 200 && me.body.ok === true &&
  me.body.data?.subjectId === EXPECTED_SUBJECT &&
  me.body.data?.subjectKind === 'member' &&
  me.body.data?.subjectStatus === 'active',
  'CURRENT_MEMBER_AUTHORITY_FAILED');

// Fresh, unowned UUID. This tests BOLA denial, not a real Memory revoke.
// No original record or Grant may be created or read on this route.
const unknownMemoryId = randomUUID();
const path = '/api/memories/' + unknownMemoryId + '/grants/seyeon';
const anonymous = await fetchChecked(path);
requireCondition(anonymous.status === 401 && anonymous.body.ok === false &&
  anonymous.body.error?.code === 'AUTH_REQUIRED',
  'ANONYMOUS_MEMORY_STATUS_NOT_DENIED');
const member = await fetchChecked(path, token);
requireCondition(member.status === 404 && member.body.ok === false &&
  member.body.error?.code === 'NOT_FOUND',
  'UNKNOWN_MEMORY_STATUS_NOT_DENIED');

console.log('SEYEON_MEMBER_NEGATIVE_HTTP_E2E_PASS; currentMember=true; ' +
  'anonymousDenied=true; unknownMemoryDenied=true; modelNotCalled=true; ' +
  'ownedLifecycleNotVerified=true; sourceContentLogged=false');
