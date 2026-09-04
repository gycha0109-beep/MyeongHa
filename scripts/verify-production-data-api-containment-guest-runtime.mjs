import { chmod, readFile, writeFile } from 'node:fs/promises';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const BOOTSTRAP_URL = `${PRODUCTION_ORIGIN}/api/session/bootstrap`;
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const REQUEST_TIMEOUT_MS = 15_000;

const mode = process.env.CONTAINMENT_RUNTIME_SMOKE_MODE;
const statePath = process.env.RUNTIME_SMOKE_STATE_PATH;

if (mode !== 'bootstrap' && mode !== 'verify') {
  throw new Error('CONTAINMENT_RUNTIME_SMOKE_MODE must be bootstrap or verify.');
}
if (typeof statePath !== 'string' || statePath.length === 0) {
  throw new Error('RUNTIME_SMOKE_STATE_PATH is required.');
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

function requireNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function requireTimestamp(name, value) {
  requireNonEmptyString(name, value);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a timestamp.`);
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

function requireApiContract(body, label) {
  if (!isRecord(body.meta) || body.meta.apiContractVersion !== 'v0.9') {
    throw new Error(`${label} did not return API contract v0.9.`);
  }
}

async function fetchCanonical(url, init) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function verifyCanonicalGuest(subjectId, bearer) {
  const currentSubject = await fetchCanonical(MEMBER_ME_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearer}` },
  });
  requireNoStore(currentSubject, 'Guest /api/me');
  if (currentSubject.status !== 200) {
    throw new Error(`Guest /api/me expected HTTP 200, received ${currentSubject.status}.`);
  }

  const body = await readJsonWithoutLogging(currentSubject, 'Guest /api/me');
  requireApiContract(body, 'Guest /api/me');
  if (body.ok !== true || !isRecord(body.data)) {
    throw new Error('Guest /api/me did not return an ok data envelope.');
  }
  if (body.data.subjectKind !== 'guest') {
    throw new Error('Guest bearer resolved a non-Guest canonical subject.');
  }
  if (body.data.subjectId !== subjectId) {
    throw new Error('Guest bearer resolved a different canonical subject than bootstrap.');
  }
  if (body.data.subjectStatus !== 'active') {
    throw new Error('Guest canonical subject must be active.');
  }
}

if (mode === 'bootstrap') {
  const bootstrap = await fetchCanonical(BOOTSTRAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  requireNoStore(bootstrap, 'Guest bootstrap');
  if (bootstrap.status !== 200) {
    throw new Error(`Guest bootstrap expected HTTP 200, received ${bootstrap.status}.`);
  }

  const body = await readJsonWithoutLogging(bootstrap, 'Guest bootstrap');
  requireApiContract(body, 'Guest bootstrap');
  if (body.ok !== true || !isRecord(body.data)) {
    throw new Error('Guest bootstrap did not return an ok data envelope.');
  }
  if (body.data.kind !== 'guest') {
    throw new Error('Fresh unauthenticated bootstrap did not create a Guest identity.');
  }

  const subjectId = requireUuid('Guest bootstrap subjectId', body.data.subjectId);
  if (!isRecord(body.data.guestSession)) {
    throw new Error('Fresh Guest bootstrap omitted guestSession.');
  }
  const guestSessionId = requireUuid(
    'Guest bootstrap guestSessionId',
    body.data.guestSession.guestSessionId,
  );
  const expiresAt = requireTimestamp('Guest bootstrap expiresAt', body.data.guestSession.expiresAt);
  const bearer = requireNonEmptyString(
    'Guest bootstrap bearerToken',
    body.data.guestSession.bearerToken,
  );

  if (guestSessionId === subjectId) {
    throw new Error('Guest bootstrap session and subject identities must be distinct.');
  }
  if (Date.parse(expiresAt) <= Date.now()) {
    throw new Error('Fresh Guest bootstrap returned an already-expired session.');
  }

  await verifyCanonicalGuest(subjectId, bearer);

  await writeFile(
    statePath,
    JSON.stringify({ subjectId, bearerToken: bearer, expiresAt }),
    { encoding: 'utf8', mode: 0o600 },
  );
  await chmod(statePath, 0o600);

  console.log(
    'MyeongHa production containment runtime preflight passed: guestBootstrap=200, apiMe=200 canonicalGuest, cacheControl=no-store.',
  );
} else {
  let state;
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    throw new Error('Containment runtime smoke state could not be read.');
  }

  if (!isRecord(state)) {
    throw new Error('Containment runtime smoke state must be an object.');
  }
  const subjectId = requireUuid('Runtime smoke subjectId', state.subjectId);
  const bearer = requireNonEmptyString('Runtime smoke bearerToken', state.bearerToken);
  const expiresAt = requireTimestamp('Runtime smoke expiresAt', state.expiresAt);
  if (Date.parse(expiresAt) <= Date.now()) {
    throw new Error('Containment runtime smoke Guest session expired before post-transition verification.');
  }

  await verifyCanonicalGuest(subjectId, bearer);

  console.log(
    'MyeongHa production containment runtime post-transition smoke passed: apiMe=200 same canonicalGuest, cacheControl=no-store.',
  );
}
