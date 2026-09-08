import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const CHAT_OPEN_URL = `${PRODUCTION_ORIGIN}/api/chat`;
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const REQUEST_TIMEOUT_MS = 20_000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(name, value) {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
}

function requireSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required for the production Member Chat open/reuse smoke.`);
  }
  return value.trim();
}

function requireNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function requireUuid(name, value) {
  const uuid = requireNonEmptyString(name, value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(uuid)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return uuid;
}

function requireBoolean(name, value) {
  if (typeof value !== 'boolean') throw new Error(`${name} must be boolean.`);
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

function requireJsonContentType(response, label) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${label} must return application/json.`);
  }
}

async function readJsonWithoutLogging(response, label) {
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
  return requireRecord(label, value);
}

function requireApiContract(body, label) {
  const meta = requireRecord(`${label} meta`, body.meta);
  if (meta.apiContractVersion !== 'v0.9') {
    throw new Error(`${label} did not return API contract v0.9.`);
  }
  requireNonEmptyString(`${label} request id`, meta.requestId);
}

function requireNoTokenReflection(accessToken, values, label) {
  for (const value of values) {
    if (JSON.stringify(value).includes(accessToken)) {
      throw new Error(`${label} reflected a fresh Member access token.`);
    }
  }
}

async function fetchCanonical(url, init = {}) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function authorization(accessToken) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

async function verifyCanonicalMember(accessToken, expectedSubjectId, label) {
  const response = await fetchCanonical(MEMBER_ME_URL, {
    method: 'GET',
    headers: authorization(accessToken),
  });
  requireNoStore(response, label);
  requireJsonContentType(response, label);
  if (response.status !== 200) {
    throw new Error(`${label} expected HTTP 200, received ${response.status}.`);
  }

  const body = await readJsonWithoutLogging(response, label);
  requireApiContract(body, label);
  if (body.ok !== true) throw new Error(`${label} did not return ok=true.`);
  const data = requireRecord(`${label} data`, body.data);
  if (data.subjectKind !== 'member') throw new Error(`${label} resolved a non-Member subject.`);
  if (data.subjectStatus !== 'active') throw new Error(`${label} Member subject must be active.`);
  if (data.subjectId !== expectedSubjectId) throw new Error(`${label} resolved a different canonical subject.`);
  requireNoTokenReflection(accessToken, [body], label);
  return body;
}

async function verifyUnauthenticatedFailClosed(characterId) {
  const response = await fetchCanonical(CHAT_OPEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ characterId }),
  });
  requireNoStore(response, 'Production Member Chat open unauthenticated');
  requireJsonContentType(response, 'Production Member Chat open unauthenticated');
  if (response.status !== 401) {
    throw new Error(`Production Member Chat open unauthenticated expected HTTP 401, received ${response.status}.`);
  }
  const body = await readJsonWithoutLogging(response, 'Production Member Chat open unauthenticated');
  requireApiContract(body, 'Production Member Chat open unauthenticated');
  if (body.ok !== false) throw new Error('Production Member Chat open unauthenticated did not return ok=false.');
  const error = requireRecord('Production Member Chat open unauthenticated error', body.error);
  if (error.code !== 'AUTH_REQUIRED') {
    throw new Error('Production Member Chat open unauthenticated did not fail with AUTH_REQUIRED.');
  }
  return body;
}

async function openCharacterThread(accessToken, characterId, expectedSubjectId, label) {
  const response = await fetchCanonical(CHAT_OPEN_URL, {
    method: 'POST',
    headers: {
      ...authorization(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ characterId }),
  });
  requireNoStore(response, label);
  requireJsonContentType(response, label);

  const body = await readJsonWithoutLogging(response, label);
  requireApiContract(body, label);
  requireNoTokenReflection(accessToken, [body], label);
  if (response.status !== 200) {
    const error = isRecord(body.error) ? body.error : null;
    const safeCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    throw new Error(`${label} expected HTTP 200 but received ${response.status} (${safeCode}); Production Character/content may still be unavailable.`);
  }
  if (body.ok !== true) throw new Error(`${label} did not return ok=true.`);

  const data = requireRecord(`${label} data`, body.data);
  const keys = Object.keys(data).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['characterId', 'created', 'threadId'])) {
    throw new Error(`${label} exposed an unexpected Chat open data surface.`);
  }
  const threadId = requireUuid(`${label} thread id`, data.threadId);
  if (data.characterId !== characterId) throw new Error(`${label} returned a different canonical Character.`);
  const created = requireBoolean(`${label} created flag`, data.created);
  if (JSON.stringify(body).includes(expectedSubjectId)) {
    throw new Error(`${label} exposed the canonical Member subject id.`);
  }
  for (const forbiddenKey of ['activeContentReleaseId', 'activeContentBundleId', 'contentReleaseId', 'contentBundleId']) {
    if (JSON.stringify(body).includes(forbiddenKey)) {
      throw new Error(`${label} exposed internal content pinning metadata.`);
    }
  }
  return Object.freeze({ threadId, characterId, created, body });
}

const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID'),
);
const characterId = requireNonEmptyString(
  'MYEONGHA_PRODUCTION_CHAT_OPEN_CHARACTER_ID',
  requireSecret('MYEONGHA_PRODUCTION_CHAT_OPEN_CHARACTER_ID'),
);

const firstSession = await acquireProductionMemberSmokeSession();
const firstMemberBody = await verifyCanonicalMember(
  firstSession.accessToken,
  expectedSubjectId,
  'Production Member Chat open/reuse first /api/me',
);
const unauthenticatedBody = await verifyUnauthenticatedFailClosed(characterId);
const first = await openCharacterThread(
  firstSession.accessToken,
  characterId,
  expectedSubjectId,
  'Production Member Chat open first',
);
const second = await openCharacterThread(
  firstSession.accessToken,
  characterId,
  expectedSubjectId,
  'Production Member Chat open second',
);

if (second.threadId !== first.threadId) {
  throw new Error('Production Member Chat second open did not reuse the first logical thread.');
}
if (second.created !== false) {
  throw new Error('Production Member Chat second open must report created=false.');
}

const secondSession = await acquireProductionMemberSmokeSession();
const secondMemberBody = await verifyCanonicalMember(
  secondSession.accessToken,
  expectedSubjectId,
  'Production Member Chat open/reuse re-auth /api/me',
);
const third = await openCharacterThread(
  secondSession.accessToken,
  characterId,
  expectedSubjectId,
  'Production Member Chat open after re-auth',
);
if (third.threadId !== first.threadId) {
  throw new Error('Production Member Chat re-auth open did not preserve the logical thread.');
}
if (third.created !== false) {
  throw new Error('Production Member Chat re-auth open must report created=false.');
}

requireNoTokenReflection(
  firstSession.accessToken,
  [firstMemberBody, unauthenticatedBody, first.body, second.body, secondMemberBody, third.body],
  'Production Member Chat open/reuse first session',
);
requireNoTokenReflection(
  secondSession.accessToken,
  [firstMemberBody, unauthenticatedBody, first.body, second.body, secondMemberBody, third.body],
  'Production Member Chat open/reuse re-auth session',
);

console.log(
  `MyeongHa production Member Chat open/reuse smoke passed: memberSignIn=true, canonicalSubjectMatch=true, unauthenticatedOpen=401, firstOpen=200, firstCreated=${first.created}, secondOpen=200, secondCreated=false, sameThreadReuse=true, reauthSignIn=true, reauthOpen=200, reauthCreated=false, reauthThreadContinuity=true, contentPinMetadataHidden=true, cacheControl=no-store.`,
);
