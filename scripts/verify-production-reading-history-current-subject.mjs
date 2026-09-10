import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const READINGS_URL = `${PRODUCTION_ORIGIN}/api/readings`;
const REQUEST_TIMEOUT_MS = 20_000;
const READING_KEYS = Object.freeze([
  'completedAt',
  'createdAt',
  'productResponseState',
  'readingContractVersion',
  'readingId',
  'readingSessionId',
  'sajuDomain',
]);
const FORBIDDEN_KEYS = new Set([
  'request_snapshot_jsonb',
  'requestSnapshotJsonb',
  'response_snapshot_jsonb',
  'responseSnapshotJsonb',
  'response_hash',
  'responseHash',
  'provider_payload',
  'providerPayload',
  'claim_graph',
  'claimGraph',
  'grounding',
  'groundingInternals',
]);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(name, value) {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
}

function requireArray(name, value) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value;
}

function requireSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required for the production Reading History current-subject smoke.`);
  }
  return value.trim();
}

function requireUuid(name, value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
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
  const timestamp = requireNonEmptyString(name, value);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${name} must be an ISO-compatible timestamp.`);
  }
  return timestamp;
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

async function fetchCanonical(url, init = {}) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function requireApiContract(body, label) {
  const meta = requireRecord(`${label} meta`, body.meta);
  if (meta.apiContractVersion !== 'v0.9') {
    throw new Error(`${label} did not return API contract v0.9.`);
  }
  requireNonEmptyString(`${label} request id`, meta.requestId);
}

function requireExactKeys(name, value, expected) {
  const actual = Object.keys(requireRecord(name, value)).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${name} exposed an unexpected field set: ${actual.join(',')}.`);
  }
}

function requireNoForbiddenKeys(value, path = 'response') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => requireNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`${path} exposed forbidden key ${key}.`);
    }
    requireNoForbiddenKeys(nested, `${path}.${key}`);
  }
}

async function verifyUnauthenticatedFailClosed() {
  const response = await fetchCanonical(READINGS_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  requireNoStore(response, 'Production Reading History unauthenticated');
  requireJsonContentType(response, 'Production Reading History unauthenticated');
  if (response.status !== 401) {
    throw new Error(`Production Reading History unauthenticated expected HTTP 401, received ${response.status}.`);
  }
  const body = await readJsonWithoutLogging(response, 'Production Reading History unauthenticated');
  requireApiContract(body, 'Production Reading History unauthenticated');
  if (body.ok !== false) throw new Error('Production Reading History unauthenticated did not return ok=false.');
  const error = requireRecord('Production Reading History unauthenticated error', body.error);
  if (error.code !== 'AUTH_REQUIRED') {
    throw new Error('Production Reading History unauthenticated did not fail with AUTH_REQUIRED.');
  }
}

function validateReadingsData(value) {
  requireExactKeys('Production Reading History data', value, ['readings']);
  const readings = requireArray('Production Reading History readings', value.readings);
  const seenIds = new Set();
  let previous = null;

  for (const [index, rawReading] of readings.entries()) {
    requireExactKeys(`Production Reading History item ${index}`, rawReading, READING_KEYS);
    const reading = requireRecord(`Production Reading History item ${index}`, rawReading);
    const readingId = requireUuid(`Production Reading History item ${index} reading id`, reading.readingId);
    if (seenIds.has(readingId)) throw new Error('Production Reading History returned a duplicate Reading identity.');
    seenIds.add(readingId);
    requireUuid(`Production Reading History item ${index} session id`, reading.readingSessionId);
    requireNonEmptyString(`Production Reading History item ${index} Saju domain`, reading.sajuDomain);
    requireNonEmptyString(`Production Reading History item ${index} contract version`, reading.readingContractVersion);
    requireNonEmptyString(`Production Reading History item ${index} product response state`, reading.productResponseState);
    const createdAt = requireTimestamp(`Production Reading History item ${index} created-at`, reading.createdAt);
    const completedAt = requireTimestamp(`Production Reading History item ${index} completed-at`, reading.completedAt);
    const order = [Date.parse(completedAt), Date.parse(createdAt), readingId];
    if (previous !== null) {
      const outOfOrder =
        order[0] > previous[0] ||
        (order[0] === previous[0] && order[1] > previous[1]) ||
        (order[0] === previous[0] && order[1] === previous[1] && order[2].localeCompare(previous[2]) > 0);
      if (outOfOrder) throw new Error('Production Reading History returned a non-deterministic history order.');
    }
    previous = order;
  }

  return readings.length;
}

const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID'),
);

await verifyUnauthenticatedFailClosed();

const session = await acquireProductionMemberSmokeSession();
const authorization = {
  Accept: 'application/json',
  Authorization: `Bearer ${session.accessToken}`,
};

const memberResponse = await fetchCanonical(MEMBER_ME_URL, { method: 'GET', headers: authorization });
requireNoStore(memberResponse, 'Production Reading History smoke Member /api/me');
requireJsonContentType(memberResponse, 'Production Reading History smoke Member /api/me');
if (memberResponse.status !== 200) {
  throw new Error(`Production Reading History smoke Member /api/me expected HTTP 200, received ${memberResponse.status}.`);
}
const memberBody = await readJsonWithoutLogging(memberResponse, 'Production Reading History smoke Member /api/me');
requireApiContract(memberBody, 'Production Reading History smoke Member /api/me');
if (memberBody.ok !== true) throw new Error('Production Reading History smoke Member /api/me did not return ok=true.');
const memberData = requireRecord('Production Reading History smoke Member data', memberBody.data);
if (memberData.subjectKind !== 'member' || memberData.subjectStatus !== 'active') {
  throw new Error('Production Reading History smoke did not resolve an active Member subject.');
}
if (memberData.subjectId !== expectedSubjectId) {
  throw new Error('Production Reading History smoke resolved a different canonical subject than expected.');
}

const readingsResponse = await fetchCanonical(READINGS_URL, { method: 'GET', headers: authorization });
requireNoStore(readingsResponse, 'Production Reading History');
requireJsonContentType(readingsResponse, 'Production Reading History');
if (readingsResponse.status !== 200) {
  throw new Error(`Production Reading History expected HTTP 200, received ${readingsResponse.status}.`);
}
const readingsBody = await readJsonWithoutLogging(readingsResponse, 'Production Reading History');
requireApiContract(readingsBody, 'Production Reading History');
if (readingsBody.ok !== true) throw new Error('Production Reading History did not return ok=true.');
requireNoForbiddenKeys(readingsBody);
const readingCount = validateReadingsData(readingsBody.data);

if (JSON.stringify([memberBody, readingsBody]).includes(session.accessToken)) {
  throw new Error('Production Reading History smoke reflected a fresh Member access token.');
}

console.log(
  `MyeongHa production Reading History current-subject smoke passed: memberSignIn=200, memberSubjectMatch=true, readingsUnauthenticated=401, readings=200, readingCount=${readingCount}, exactProjection=true, sensitiveFieldsAbsent=true, cacheControl=no-store.`,
);
