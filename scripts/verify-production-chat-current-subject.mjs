import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
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
    throw new Error(`${name} is required for the production Chat current-subject smoke.`);
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

function requireSafeInteger(name, value) {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer.`);
  return value;
}

function requireNonNegativeInteger(name, value) {
  const integer = requireSafeInteger(name, value);
  if (integer < 0) throw new Error(`${name} must be non-negative.`);
  return integer;
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

function requireNullableString(name, value) {
  if (value === null) return null;
  return requireNonEmptyString(name, value);
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

async function verifyUnauthenticatedFailClosed(url) {
  const response = await fetchCanonical(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  requireNoStore(response, 'Production Chat unauthenticated');
  requireJsonContentType(response, 'Production Chat unauthenticated');
  if (response.status !== 401) {
    throw new Error(`Production Chat unauthenticated expected HTTP 401, received ${response.status}.`);
  }
  const body = await readJsonWithoutLogging(response, 'Production Chat unauthenticated');
  requireApiContract(body, 'Production Chat unauthenticated');
  if (body.ok !== false) throw new Error('Production Chat unauthenticated did not return ok=false.');
  const error = requireRecord('Production Chat unauthenticated error', body.error);
  if (error.code !== 'AUTH_REQUIRED') {
    throw new Error('Production Chat unauthenticated did not fail with AUTH_REQUIRED.');
  }
  return body;
}

function validateMessages(value, expectedCharacterId) {
  const messages = requireArray('Production Chat messages', value);
  let previousSequenceNo = 0;

  for (const [index, rawMessage] of messages.entries()) {
    const message = requireRecord(`Production Chat message ${index}`, rawMessage);
    requireUuid(`Production Chat message ${index} id`, message.messageId);
    const sequenceNo = requireNonNegativeInteger(`Production Chat message ${index} sequence`, message.sequenceNo);
    if (sequenceNo <= previousSequenceNo) {
      throw new Error('Production Chat messages must be strictly sequence ordered.');
    }
    previousSequenceNo = sequenceNo;

    const senderType = requireNonEmptyString(`Production Chat message ${index} sender type`, message.senderType);
    if (!['user', 'character', 'system'].includes(senderType)) {
      throw new Error(`Production Chat message ${index} sender type is unsupported.`);
    }
    const characterId = requireNullableString(`Production Chat message ${index} character identity`, message.characterId);
    if (senderType === 'character' && characterId !== expectedCharacterId) {
      throw new Error('Production Chat character message does not match the canonical primary character.');
    }
    if (message.bodyText !== null && typeof message.bodyText !== 'string') {
      throw new Error(`Production Chat message ${index} body must be string or null.`);
    }
    if (message.messagePayloadJsonb === undefined) {
      throw new Error(`Production Chat message ${index} payload must be present.`);
    }
    requireNullableString(`Production Chat message ${index} schema version`, message.messageSchemaVersion);
    requireTimestamp(`Production Chat message ${index} timestamp`, message.createdAt);
    if (typeof message.redacted !== 'boolean') {
      throw new Error(`Production Chat message ${index} redacted flag must be boolean.`);
    }
    requireNullableTimestamp(`Production Chat message ${index} redacted timestamp`, message.redactedAt);
  }

  return { count: messages.length, lastSequenceNo: previousSequenceNo };
}

function validateRelationship(value, expectedCharacterId) {
  if (value === null) return;
  const relationship = requireRecord('Production Chat relationship', value);
  requireUuid('Production Chat relationship state id', relationship.stateId);
  if (relationship.characterId !== expectedCharacterId) {
    throw new Error('Production Chat relationship does not match the canonical primary character.');
  }
  for (const key of ['closeness', 'trust', 'friction']) {
    requireSafeInteger(`Production Chat relationship ${key}`, relationship[key]);
  }
  requireNonNegativeInteger('Production Chat relationship revision', relationship.revision);
  requireNonEmptyString('Production Chat relationship stage', relationship.relationshipStage);
  requireNonEmptyString('Production Chat relationship policy version', relationship.policyVersion);
  requireNullableTimestamp('Production Chat relationship last interaction', relationship.lastInteractionAt);
  requireTimestamp('Production Chat relationship updated timestamp', relationship.updatedAt);
}

const expectedSubjectId = requireUuid(
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID'),
);
const expectedThreadId = requireUuid(
  'MYEONGHA_PRODUCTION_CHAT_THREAD_ID',
  requireSecret('MYEONGHA_PRODUCTION_CHAT_THREAD_ID'),
);
const expectedCharacterId = requireNonEmptyString(
  'MYEONGHA_PRODUCTION_CHAT_EXPECTED_CHARACTER_ID',
  requireSecret('MYEONGHA_PRODUCTION_CHAT_EXPECTED_CHARACTER_ID'),
);
const expectedReleaseId = requireUuid(
  'MYEONGHA_PRODUCTION_CHAT_EXPECTED_RELEASE_ID',
  requireSecret('MYEONGHA_PRODUCTION_CHAT_EXPECTED_RELEASE_ID'),
);
const expectedBundleId = requireUuid(
  'MYEONGHA_PRODUCTION_CHAT_EXPECTED_BUNDLE_ID',
  requireSecret('MYEONGHA_PRODUCTION_CHAT_EXPECTED_BUNDLE_ID'),
);

const chatUrl = `${PRODUCTION_ORIGIN}/api/chat/${encodeURIComponent(expectedThreadId)}`;
const session = await acquireProductionMemberSmokeSession();
const authorization = {
  Accept: 'application/json',
  Authorization: `Bearer ${session.accessToken}`,
};

const memberResponse = await fetchCanonical(MEMBER_ME_URL, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(memberResponse, 'Production Chat smoke Member /api/me');
requireJsonContentType(memberResponse, 'Production Chat smoke Member /api/me');
if (memberResponse.status !== 200) {
  throw new Error(`Production Chat smoke Member /api/me expected HTTP 200, received ${memberResponse.status}.`);
}
const memberBody = await readJsonWithoutLogging(memberResponse, 'Production Chat smoke Member /api/me');
requireApiContract(memberBody, 'Production Chat smoke Member /api/me');
if (memberBody.ok !== true) throw new Error('Production Chat smoke Member /api/me did not return ok=true.');
const memberData = requireRecord('Production Chat smoke Member data', memberBody.data);
if (memberData.subjectKind !== 'member') throw new Error('Production Chat smoke resolved a non-Member subject.');
if (memberData.subjectStatus !== 'active') throw new Error('Production Chat smoke Member subject must be active.');
if (memberData.subjectId !== expectedSubjectId) {
  throw new Error('Production Chat smoke resolved a different canonical subject than expected.');
}

const unauthenticatedBody = await verifyUnauthenticatedFailClosed(chatUrl);

const chatResponse = await fetchCanonical(chatUrl, {
  method: 'GET',
  headers: authorization,
});
requireNoStore(chatResponse, 'Production Chat');
requireJsonContentType(chatResponse, 'Production Chat');
if (chatResponse.status !== 200) {
  throw new Error(`Production Chat expected HTTP 200, received ${chatResponse.status}.`);
}
const chatBody = await readJsonWithoutLogging(chatResponse, 'Production Chat');
requireApiContract(chatBody, 'Production Chat');
if (chatBody.ok !== true) throw new Error('Production Chat did not return ok=true.');
const data = requireRecord('Production Chat data', chatBody.data);

if (data.threadId !== expectedThreadId) {
  throw new Error('Production Chat returned a different owned thread than the read-only discovery binding.');
}
if (data.characterId !== expectedCharacterId) {
  throw new Error('Production Chat returned a different canonical character than the read-only discovery binding.');
}
if (data.contentReleaseId !== expectedReleaseId) {
  throw new Error('Production Chat returned a different pinned release than the read-only discovery binding.');
}
if (data.contentBundleId !== expectedBundleId) {
  throw new Error('Production Chat returned a different pinned bundle than the read-only discovery binding.');
}
requireNonNegativeInteger('Production Chat content revision', data.contentRevision);
if (data.afterSequenceNo !== 0) {
  throw new Error('Production Chat initial stream cursor must start after sequence zero.');
}
const reportedLastSequenceNo = requireNonNegativeInteger('Production Chat last sequence', data.lastSequenceNo);
const messageSummary = validateMessages(data.messages, expectedCharacterId);
if (messageSummary.count > 0 && messageSummary.lastSequenceNo !== reportedLastSequenceNo) {
  throw new Error('Production Chat last sequence does not match the returned stream tail.');
}
if (messageSummary.count === 0 && reportedLastSequenceNo !== 0) {
  throw new Error('Production Chat empty stream must report last sequence zero for an initial read.');
}
validateRelationship(data.relationship, expectedCharacterId);

requireNoTokenReflection(
  session.accessToken,
  [memberBody, unauthenticatedBody, chatBody],
  'Production Chat current-subject smoke',
);

console.log(
  `MyeongHa production Member Chat smoke passed: memberSignIn=200, memberSubjectMatch=true, ownedThread=true, chatUnauthenticated=401, chat=200, characterBindingMatch=true, releaseBindingMatch=true, bundleBindingMatch=true, streamReadable=true, messageCount=${messageSummary.count}, cacheControl=no-store.`,
);
