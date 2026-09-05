import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const REQUEST_TIMEOUT_MS = 15_000;

function requireSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required for the production Member /api/me smoke.`);
  }
  return value.trim();
}

function requireUuid(name, value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
}

function requireNoStore(response, label) {
  const cacheControl = response.headers.get('cache-control') ?? '';
  const directives = cacheControl
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);

  if (!directives.includes('no-store')) {
    throw new Error(`${label} must return Cache-Control containing no-store.`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

async function fetchCanonical(init) {
  return fetch(MEMBER_ME_URL, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID'),
);

const unauthenticated = await fetchCanonical({ method: 'GET' });
requireNoStore(unauthenticated, 'Unauthenticated /api/me');
if (unauthenticated.status !== 401) {
  throw new Error(`Unauthenticated /api/me expected HTTP 401, received ${unauthenticated.status}.`);
}
const unauthenticatedBody = await readJsonWithoutLogging(
  unauthenticated,
  'Unauthenticated /api/me',
);
if (
  unauthenticatedBody.ok !== false ||
  !isRecord(unauthenticatedBody.error) ||
  unauthenticatedBody.error.code !== 'AUTH_REQUIRED'
) {
  throw new Error('Unauthenticated /api/me did not return AUTH_REQUIRED.');
}

const { accessToken } = await acquireProductionMemberSmokeSession();
const authenticated = await fetchCanonical({
  method: 'GET',
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
requireNoStore(authenticated, 'Authenticated Member /api/me');
if (authenticated.status !== 200) {
  throw new Error(`Authenticated Member /api/me expected HTTP 200, received ${authenticated.status}.`);
}
const authenticatedBody = await readJsonWithoutLogging(
  authenticated,
  'Authenticated Member /api/me',
);
if (authenticatedBody.ok !== true || !isRecord(authenticatedBody.data)) {
  throw new Error('Authenticated Member /api/me did not return an ok data envelope.');
}

const data = authenticatedBody.data;
if (data.subjectKind !== 'member') {
  throw new Error('Authenticated /api/me resolved a non-Member subject.');
}
if (data.subjectId !== expectedSubjectId) {
  throw new Error('Authenticated /api/me resolved a different canonical subject than expected.');
}
if (data.subjectStatus !== 'active' && data.subjectStatus !== 'deletion_pending') {
  throw new Error('Authenticated Member /api/me returned an unsupported subject status.');
}
if (JSON.stringify(authenticatedBody).includes(accessToken)) {
  throw new Error('Authenticated Member /api/me reflected the fresh access token.');
}

console.log(
  'MyeongHa production Member /api/me smoke passed: freshSession=true, unauthenticated=401 AUTH_REQUIRED, authenticated=200 member, expectedSubjectMatch=true, cacheControl=no-store.',
);
