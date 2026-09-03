const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const BOOTSTRAP_URL = `${PRODUCTION_ORIGIN}/api/session/bootstrap`;
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const BIRTH_PROFILES_URL = `${PRODUCTION_ORIGIN}/api/birth-profiles`;
const REQUEST_TIMEOUT_MS = 15_000;
const SMOKE_LABEL = 'production-guest-birth-smoke-v1';
const SMOKE_INPUT = Object.freeze({
  calendarType: 'solar',
  birthDate: '2000-01-01',
  birthTime: '00:00:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireUuid(name, value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
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

const bootstrap = await fetchCanonical(BOOTSTRAP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
requireNoStore(bootstrap, 'Guest bootstrap');
if (bootstrap.status !== 200) {
  throw new Error(`Guest bootstrap expected HTTP 200, received ${bootstrap.status}.`);
}
const bootstrapBody = await readJsonWithoutLogging(bootstrap, 'Guest bootstrap');
requireApiContract(bootstrapBody, 'Guest bootstrap');
if (bootstrapBody.ok !== true || !isRecord(bootstrapBody.data)) {
  throw new Error('Guest bootstrap did not return an ok data envelope.');
}
const bootstrapData = bootstrapBody.data;
if (bootstrapData.kind !== 'guest') {
  throw new Error('Fresh unauthenticated bootstrap did not create a Guest identity.');
}
const subjectId = requireUuid('Guest bootstrap subjectId', bootstrapData.subjectId);
if (!isRecord(bootstrapData.guestSession)) {
  throw new Error('Fresh Guest bootstrap omitted guestSession.');
}
const guestSessionId = requireUuid(
  'Guest bootstrap guestSessionId',
  bootstrapData.guestSession.guestSessionId,
);
const expiresAt = requireTimestamp(
  'Guest bootstrap expiresAt',
  bootstrapData.guestSession.expiresAt,
);
if (Date.parse(expiresAt) <= Date.now()) {
  throw new Error('Fresh Guest bootstrap returned an already-expired session.');
}
const bearer = requireNonEmptyString(
  'Guest bootstrap bearerToken',
  bootstrapData.guestSession.bearerToken,
);
if (guestSessionId === subjectId) {
  throw new Error('Guest bootstrap session and subject identities must be distinct.');
}

const authorization = { Authorization: `Bearer ${bearer}` };
const currentSubject = await fetchCanonical(MEMBER_ME_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(currentSubject, 'Guest /api/me');
if (currentSubject.status !== 200) {
  throw new Error(`Guest /api/me expected HTTP 200, received ${currentSubject.status}.`);
}
const currentSubjectBody = await readJsonWithoutLogging(currentSubject, 'Guest /api/me');
requireApiContract(currentSubjectBody, 'Guest /api/me');
if (currentSubjectBody.ok !== true || !isRecord(currentSubjectBody.data)) {
  throw new Error('Guest /api/me did not return an ok data envelope.');
}
if (currentSubjectBody.data.subjectKind !== 'guest') {
  throw new Error('Fresh Guest bearer resolved a non-Guest canonical subject.');
}
if (currentSubjectBody.data.subjectId !== subjectId) {
  throw new Error('Fresh Guest bearer resolved a different canonical subject than bootstrap.');
}
if (currentSubjectBody.data.subjectStatus !== 'active') {
  throw new Error('Fresh Guest canonical subject must be active before Birth create.');
}

const create = await fetchCanonical(BIRTH_PROFILES_URL, {
  method: 'POST',
  headers: {
    ...authorization,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    label: SMOKE_LABEL,
    input: SMOKE_INPUT,
  }),
});
requireNoStore(create, 'Guest Birth Profile create');
if (create.status !== 201) {
  throw new Error(`Guest Birth Profile create expected HTTP 201, received ${create.status}.`);
}
const createBody = await readJsonWithoutLogging(create, 'Guest Birth Profile create');
requireApiContract(createBody, 'Guest Birth Profile create');
if (createBody.ok !== true || !isRecord(createBody.data)) {
  throw new Error('Guest Birth Profile create did not return an ok data envelope.');
}
const birthProfileId = requireUuid('Created Birth Profile id', createBody.data.birthProfileId);
const revisionId = requireUuid('Created Birth revision id', createBody.data.revisionId);
if (createBody.data.revisionNo !== 1) {
  throw new Error('Guest Birth Profile create did not create revision 1.');
}

const read = await fetchCanonical(`${BIRTH_PROFILES_URL}/${birthProfileId}`, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(read, 'Guest Birth Profile read-after-create');
if (read.status !== 200) {
  throw new Error(`Guest Birth Profile read-after-create expected HTTP 200, received ${read.status}.`);
}
const readBody = await readJsonWithoutLogging(read, 'Guest Birth Profile read-after-create');
requireApiContract(readBody, 'Guest Birth Profile read-after-create');
if (readBody.ok !== true || !isRecord(readBody.data)) {
  throw new Error('Guest Birth Profile read-after-create did not return an ok data envelope.');
}
const data = readBody.data;
if (data.birthProfileId !== birthProfileId) {
  throw new Error('Guest Birth Profile read-after-create returned a different profile id.');
}
if (data.profileKind !== 'self' || data.label !== SMOKE_LABEL || data.archivedAt !== null) {
  throw new Error('Guest Birth Profile read-after-create returned an unexpected self-profile projection.');
}
if (!isRecord(data.currentRevision)) {
  throw new Error('Guest Birth Profile read-after-create omitted currentRevision.');
}
if (data.currentRevision.revisionId !== revisionId || data.currentRevision.revisionNo !== 1) {
  throw new Error('Guest Birth Profile read-after-create current revision identity does not match create output.');
}
if (!isRecord(data.currentRevision.input)) {
  throw new Error('Guest Birth Profile read-after-create omitted current Birth input.');
}
for (const [key, expected] of Object.entries(SMOKE_INPUT)) {
  if (data.currentRevision.input[key] !== expected) {
    throw new Error(`Guest Birth Profile read-after-create current input mismatch for ${key}.`);
  }
}
if (!Array.isArray(data.revisions) || data.revisions.length !== 1) {
  throw new Error('Guest Birth Profile read-after-create expected exactly one revision summary.');
}
const revision = data.revisions[0];
if (
  !isRecord(revision) ||
  revision.revisionId !== revisionId ||
  revision.revisionNo !== 1 ||
  revision.isCurrent !== true
) {
  throw new Error('Guest Birth Profile read-after-create revision summary does not match create output.');
}

console.log(
  'MyeongHa production Guest Birth create/read smoke passed: bootstrap=200 guest, apiMe=200 canonicalGuest, create=201 revision1, read=200 owner-scoped, projectionMatch=true, cacheControl=no-store.',
);
