import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const LIFE_RECORD_URL = `${PRODUCTION_ORIGIN}/api/life-record`;
const MEMORIES_URL = `${PRODUCTION_ORIGIN}/api/memories`;
const REQUEST_TIMEOUT_MS = 20_000;

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
    throw new Error(`${name} is required for the production Records current-subject smoke.`);
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

function requireNullableTimestamp(name, value) {
  if (value === null) return null;
  return requireTimestamp(name, value);
}

function requireNullableUuid(name, value) {
  if (value === null) return null;
  return requireUuid(name, value);
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
  return meta;
}

function requireNoTokenReflection(accessToken, values, label) {
  for (const value of values) {
    if (JSON.stringify(value).includes(accessToken)) {
      throw new Error(`${label} reflected a fresh Member access token.`);
    }
  }
}

async function verifyUnauthenticatedFailClosed(url, label) {
  const response = await fetchCanonical(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  requireNoStore(response, `${label} unauthenticated`);
  requireJsonContentType(response, `${label} unauthenticated`);
  if (response.status !== 401) {
    throw new Error(`${label} unauthenticated expected HTTP 401, received ${response.status}.`);
  }
  const body = await readJsonWithoutLogging(response, `${label} unauthenticated`);
  requireApiContract(body, `${label} unauthenticated`);
  if (body.ok !== false) throw new Error(`${label} unauthenticated did not return ok=false.`);
  const error = requireRecord(`${label} unauthenticated error`, body.error);
  if (error.code !== 'AUTH_REQUIRED') {
    throw new Error(`${label} unauthenticated did not fail with AUTH_REQUIRED.`);
  }
}

function validateLifeRecordData(value) {
  const data = requireRecord('Production Life Record data', value);
  const facts = requireArray('Production Life Record facts', data.facts);
  const seenIds = new Set();

  for (const [index, rawFact] of facts.entries()) {
    const fact = requireRecord(`Production Life Record fact ${index}`, rawFact);
    const lifeFactId = requireUuid(`Production Life Record fact ${index} id`, fact.lifeFactId);
    if (seenIds.has(lifeFactId)) {
      throw new Error('Production Life Record returned a duplicate Life Fact identity.');
    }
    seenIds.add(lifeFactId);
    requireNonEmptyString(`Production Life Record fact ${index} type`, fact.factType);
    requireNonEmptyString(`Production Life Record fact ${index} schema version`, fact.schemaVersion);
    requireNonEmptyString(`Production Life Record fact ${index} source kind`, fact.sourceKind);
    if (fact.valueJsonb === undefined) {
      throw new Error(`Production Life Record fact ${index} value must be present.`);
    }
    requireNullableTimestamp(`Production Life Record fact ${index} valid-from`, fact.validFrom);
    requireNullableTimestamp(`Production Life Record fact ${index} valid-to`, fact.validTo);
    requireTimestamp(`Production Life Record fact ${index} confirmed-at`, fact.confirmedAt);
    requireNullableTimestamp(`Production Life Record fact ${index} revoked-at`, fact.revokedAt);
    requireTimestamp(`Production Life Record fact ${index} created-at`, fact.createdAt);
    requireNullableUuid(`Production Life Record fact ${index} source message id`, fact.sourceMessageId);
    requireNullableUuid(`Production Life Record fact ${index} source merge action id`, fact.sourceMergeActionId);
    requireNullableUuid(`Production Life Record fact ${index} supersedes fact id`, fact.supersedesFactId);
  }

  return facts.length;
}

function validateMemoriesData(value) {
  const data = requireRecord('Production Memories data', value);
  const memories = requireArray('Production Memories items', data.memories);
  const seenIds = new Set();

  for (const [index, rawMemory] of memories.entries()) {
    const memory = requireRecord(`Production Memory ${index}`, rawMemory);
    const memoryItemId = requireUuid(`Production Memory ${index} id`, memory.memoryItemId);
    if (seenIds.has(memoryItemId)) {
      throw new Error('Production Memories returned a duplicate Memory Item identity.');
    }
    seenIds.add(memoryItemId);
    requireNonEmptyString(`Production Memory ${index} type`, memory.memoryType);
    requireNonEmptyString(`Production Memory ${index} schema version`, memory.schemaVersion);
    if (memory.contentJsonb === undefined) {
      throw new Error(`Production Memory ${index} content must be present.`);
    }
    requireNullableUuid(`Production Memory ${index} creator character id`, memory.createdByCharacterId);
    requireTimestamp(`Production Memory ${index} created-at`, memory.createdAt);
  }

  return memories.length;
}

const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID'),
);

const session = await acquireProductionMemberSmokeSession();
const authorization = {
  Accept: 'application/json',
  Authorization: `Bearer ${session.accessToken}`,
};

const memberResponse = await fetchCanonical(MEMBER_ME_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(memberResponse, 'Production Records smoke Member /api/me');
requireJsonContentType(memberResponse, 'Production Records smoke Member /api/me');
if (memberResponse.status !== 200) {
  throw new Error(`Production Records smoke Member /api/me expected HTTP 200, received ${memberResponse.status}.`);
}
const memberBody = await readJsonWithoutLogging(memberResponse, 'Production Records smoke Member /api/me');
requireApiContract(memberBody, 'Production Records smoke Member /api/me');
if (memberBody.ok !== true) throw new Error('Production Records smoke Member /api/me did not return ok=true.');
const memberData = requireRecord('Production Records smoke Member data', memberBody.data);
if (memberData.subjectKind !== 'member') throw new Error('Production Records smoke resolved a non-Member subject.');
if (memberData.subjectStatus !== 'active') throw new Error('Production Records smoke Member subject must be active.');
if (memberData.subjectId !== expectedSubjectId) {
  throw new Error('Production Records smoke resolved a different canonical subject than expected.');
}

await verifyUnauthenticatedFailClosed(LIFE_RECORD_URL, 'Production Life Record');
await verifyUnauthenticatedFailClosed(MEMORIES_URL, 'Production Memories');

const lifeRecordResponse = await fetchCanonical(LIFE_RECORD_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(lifeRecordResponse, 'Production Life Record');
requireJsonContentType(lifeRecordResponse, 'Production Life Record');
if (lifeRecordResponse.status !== 200) {
  throw new Error(`Production Life Record expected HTTP 200, received ${lifeRecordResponse.status}.`);
}
const lifeRecordBody = await readJsonWithoutLogging(lifeRecordResponse, 'Production Life Record');
requireApiContract(lifeRecordBody, 'Production Life Record');
if (lifeRecordBody.ok !== true) throw new Error('Production Life Record did not return ok=true.');
const lifeFactCount = validateLifeRecordData(lifeRecordBody.data);

const memoriesResponse = await fetchCanonical(MEMORIES_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(memoriesResponse, 'Production Memories');
requireJsonContentType(memoriesResponse, 'Production Memories');
if (memoriesResponse.status !== 200) {
  throw new Error(`Production Memories expected HTTP 200, received ${memoriesResponse.status}.`);
}
const memoriesBody = await readJsonWithoutLogging(memoriesResponse, 'Production Memories');
requireApiContract(memoriesBody, 'Production Memories');
if (memoriesBody.ok !== true) throw new Error('Production Memories did not return ok=true.');
const memoryCount = validateMemoriesData(memoriesBody.data);

requireNoTokenReflection(
  session.accessToken,
  [memberBody, lifeRecordBody, memoriesBody],
  'Production Records current-subject smoke',
);

console.log(
  `MyeongHa production Records current-subject smoke passed: memberSignIn=200, memberSubjectMatch=true, lifeRecordUnauthenticated=401, memoriesUnauthenticated=401, lifeRecord=200, memories=200, lifeFactCount=${lifeFactCount}, memoryCount=${memoryCount}, cacheControl=no-store.`,
);
