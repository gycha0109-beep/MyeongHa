const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const BIRTH_PROFILES_URL = `${PRODUCTION_ORIGIN}/api/birth-profiles`;
const REQUEST_TIMEOUT_MS = 15_000;
const SMOKE_LABEL = 'production-birth-smoke-v1';
const SMOKE_INPUT = Object.freeze({
  calendarType: 'solar',
  birthDate: '2000-01-01',
  birthTime: '00:00:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
});

function requireSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required for the production authenticated Birth create/read smoke.`);
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
  const directives = (response.headers.get('cache-control') ?? '')
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

async function fetchCanonical(url, init) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function requireApiContract(body, label) {
  if (!isRecord(body.meta) || body.meta.apiContractVersion !== 'v0.9') {
    throw new Error(`${label} did not return API contract v0.9.`);
  }
}

const bearer = requireSecret('MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER');
const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID'),
);
const authorization = { Authorization: `Bearer ${bearer}` };

const member = await fetchCanonical(MEMBER_ME_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(member, 'Authenticated Birth smoke Member /api/me');
if (member.status !== 200) {
  throw new Error(`Authenticated Birth smoke Member /api/me expected HTTP 200, received ${member.status}.`);
}
const memberBody = await readJsonWithoutLogging(member, 'Authenticated Birth smoke Member /api/me');
requireApiContract(memberBody, 'Authenticated Birth smoke Member /api/me');
if (memberBody.ok !== true || !isRecord(memberBody.data)) {
  throw new Error('Authenticated Birth smoke Member /api/me did not return an ok data envelope.');
}
if (memberBody.data.subjectKind !== 'member') {
  throw new Error('Authenticated Birth smoke credential resolved a non-Member subject.');
}
if (memberBody.data.subjectId !== expectedSubjectId) {
  throw new Error('Authenticated Birth smoke credential resolved a different canonical subject than expected.');
}
if (memberBody.data.subjectStatus !== 'active') {
  throw new Error('Authenticated Birth smoke Member subject must be active before the persistent write smoke.');
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
requireNoStore(create, 'Authenticated Birth Profile create');
if (create.status !== 201) {
  throw new Error(
    `Authenticated Birth Profile create expected HTTP 201, received ${create.status}. The dedicated smoke Member must not already own an active self Birth Profile.`,
  );
}
const createBody = await readJsonWithoutLogging(create, 'Authenticated Birth Profile create');
requireApiContract(createBody, 'Authenticated Birth Profile create');
if (createBody.ok !== true || !isRecord(createBody.data)) {
  throw new Error('Authenticated Birth Profile create did not return an ok data envelope.');
}
const birthProfileId = requireUuid('Created Birth Profile id', createBody.data.birthProfileId);
const revisionId = requireUuid('Created Birth revision id', createBody.data.revisionId);
if (createBody.data.revisionNo !== 1) {
  throw new Error('Authenticated Birth Profile create did not create revision 1.');
}

const read = await fetchCanonical(`${BIRTH_PROFILES_URL}/${birthProfileId}`, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(read, 'Authenticated Birth Profile read-after-create');
if (read.status !== 200) {
  throw new Error(`Authenticated Birth Profile read-after-create expected HTTP 200, received ${read.status}.`);
}
const readBody = await readJsonWithoutLogging(read, 'Authenticated Birth Profile read-after-create');
requireApiContract(readBody, 'Authenticated Birth Profile read-after-create');
if (readBody.ok !== true || !isRecord(readBody.data)) {
  throw new Error('Authenticated Birth Profile read-after-create did not return an ok data envelope.');
}
const data = readBody.data;
if (data.birthProfileId !== birthProfileId) {
  throw new Error('Birth Profile read-after-create returned a different profile id.');
}
if (data.profileKind !== 'self' || data.label !== SMOKE_LABEL || data.archivedAt !== null) {
  throw new Error('Birth Profile read-after-create returned an unexpected self-profile projection.');
}
if (!isRecord(data.currentRevision)) {
  throw new Error('Birth Profile read-after-create omitted the current revision.');
}
if (data.currentRevision.revisionId !== revisionId || data.currentRevision.revisionNo !== 1) {
  throw new Error('Birth Profile read-after-create current revision identity does not match create output.');
}
if (!isRecord(data.currentRevision.input)) {
  throw new Error('Birth Profile read-after-create omitted current Birth input.');
}
for (const [key, expected] of Object.entries(SMOKE_INPUT)) {
  if (data.currentRevision.input[key] !== expected) {
    throw new Error(`Birth Profile read-after-create current input mismatch for ${key}.`);
  }
}
if (!Array.isArray(data.revisions) || data.revisions.length !== 1) {
  throw new Error('Birth Profile read-after-create expected exactly one revision summary.');
}
const revision = data.revisions[0];
if (
  !isRecord(revision) ||
  revision.revisionId !== revisionId ||
  revision.revisionNo !== 1 ||
  revision.isCurrent !== true
) {
  throw new Error('Birth Profile read-after-create revision summary does not match create output.');
}

console.log(
  'MyeongHa production authenticated Birth create/read smoke passed: memberSubjectMatch=true, create=201 revision1, read=200 owner-scoped, projectionMatch=true, cacheControl=no-store.',
);
