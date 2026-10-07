import { randomUUID } from 'node:crypto';
import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const CHAT_OPEN_URL = `${PRODUCTION_ORIGIN}/api/chat`;
const TURN_TEXT = '운영 연결 확인이야. 짧게 한마디만 답해줘.';
const REQUEST_TIMEOUT_MS = 20_000;
const TURN_TIMEOUT_MS = 120_000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireRecord(name, value) {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
}
function requireString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be non-empty.`);
  return value;
}
function requireUuid(name, value) {
  const uuid = requireString(name, value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(uuid)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return uuid;
}
function requireInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer.`);
  return value;
}
function requireNoStore(response, label) {
  const values = (response.headers.get('cache-control') ?? '').split(',').map((v) => v.trim().toLowerCase());
  if (!values.includes('no-store')) throw new Error(`${label} must return no-store.`);
}
function requireJson(response, label) {
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new Error(`${label} must return JSON.`);
  }
}
async function readJson(response, label) {
  let value;
  try { value = await response.json(); } catch { throw new Error(`${label} returned invalid JSON.`); }
  return requireRecord(label, value);
}
function requireApiContract(body, label) {
  const meta = requireRecord(`${label} meta`, body.meta);
  if (meta.apiContractVersion !== 'v0.9') throw new Error(`${label} contract mismatch.`);
  requireString(`${label} requestId`, meta.requestId);
}
function requireNoTokenReflection(token, value, label) {
  if (JSON.stringify(value).includes(token)) throw new Error(`${label} reflected a Member token.`);
}
function authorization(token) {
  return { Accept: 'application/json', Authorization: `Bearer ${token}` };
}
async function fetchCanonical(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
}

async function verifyCanonicalMember(token, expectedSubjectId, label) {
  const response = await fetchCanonical(MEMBER_ME_URL, { method: 'GET', headers: authorization(token) });
  requireNoStore(response, label);
  requireJson(response, label);
  const body = await readJson(response, label);
  requireApiContract(body, label);
  requireNoTokenReflection(token, body, label);
  if (response.status !== 200 || body.ok !== true) throw new Error(`${label} expected HTTP 200.`);
  const data = requireRecord(`${label} data`, body.data);
  if (data.subjectKind !== 'member' || data.subjectStatus !== 'active' || data.subjectId !== expectedSubjectId) {
    throw new Error(`${label} canonical Member mismatch.`);
  }
}

async function openSeyeonThread(token) {
  const label = 'Production Seyeon Chat open';
  const response = await fetchCanonical(CHAT_OPEN_URL, {
    method: 'POST',
    headers: { ...authorization(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId: 'seyeon' }),
  });
  requireNoStore(response, label);
  requireJson(response, label);
  const body = await readJson(response, label);
  requireApiContract(body, label);
  requireNoTokenReflection(token, body, label);
  if (response.status !== 200 || body.ok !== true) {
    const code = isRecord(body.error) && typeof body.error.code === 'string' ? body.error.code : 'UNKNOWN';
    throw new Error(`${label} failed: HTTP ${response.status} (${code}).`);
  }
  const data = requireRecord(`${label} data`, body.data);
  const threadId = requireUuid(`${label} threadId`, data.threadId);
  if (data.characterId !== 'seyeon' || typeof data.created !== 'boolean') throw new Error(`${label} Character mismatch.`);
  return Object.freeze({ threadId, created: data.created });
}

async function sendTurn(token, threadId, clientTurnId, text, label) {
  const response = await fetchCanonical(
    `${PRODUCTION_ORIGIN}/api/chat/${encodeURIComponent(threadId)}/turns`,
    {
      method: 'POST',
      headers: { ...authorization(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientTurnId, text }),
    },
    TURN_TIMEOUT_MS,
  );
  requireNoStore(response, label);
  requireJson(response, label);
  const body = await readJson(response, label);
  requireApiContract(body, label);
  requireNoTokenReflection(token, body, label);
  if (response.status !== 200 || body.ok !== true) {
    const code = isRecord(body.error) && typeof body.error.code === 'string' ? body.error.code : 'UNKNOWN';
    throw new Error(`${label} failed: HTTP ${response.status} (${code}).`);
  }
  const data = requireRecord(`${label} data`, body.data);
  return Object.freeze({
    turnId: requireUuid(`${label} turnId`, data.turnId),
    assistantMessageId: requireUuid(`${label} assistantMessageId`, data.assistantMessageId),
    assistantText: requireString(`${label} assistantText`, data.assistantText),
    sequenceNo: requireInteger(`${label} sequenceNo`, data.sequenceNo),
    replayed: data.replayed === true,
  });
}

async function readThread(token, threadId, afterSequenceNo, label) {
  const url = new URL(`${PRODUCTION_ORIGIN}/api/chat/${encodeURIComponent(threadId)}`);
  url.searchParams.set('afterSequenceNo', String(afterSequenceNo));
  const response = await fetchCanonical(url, { method: 'GET', headers: authorization(token) });
  requireNoStore(response, label);
  requireJson(response, label);
  const body = await readJson(response, label);
  requireApiContract(body, label);
  requireNoTokenReflection(token, body, label);
  if (response.status !== 200 || body.ok !== true) throw new Error(`${label} expected HTTP 200.`);
  const data = requireRecord(`${label} data`, body.data);
  if (data.threadId !== threadId || data.characterId !== 'seyeon' || !Array.isArray(data.messages)) {
    throw new Error(`${label} thread authority mismatch.`);
  }
  return data.messages;
}

function assertCommittedTurn(messages, result, text, label) {
  const assistant = messages.find((message) => isRecord(message) && message.messageId === result.assistantMessageId);
  if (!assistant) throw new Error(`${label} missing assistant commit.`);
  if (
    assistant.senderType !== 'character' ||
    assistant.characterId !== 'seyeon' ||
    assistant.sequenceNo !== result.sequenceNo ||
    assistant.bodyText !== result.assistantText ||
    assistant.redacted !== false
  ) throw new Error(`${label} assistant commit mismatch.`);

  const hasUser = messages.some((message) =>
    isRecord(message) &&
    message.senderType === 'user' &&
    message.bodyText === text &&
    Number.isSafeInteger(message.sequenceNo) &&
    message.sequenceNo < result.sequenceNo
  );
  if (!hasUser) throw new Error(`${label} missing user commit.`);
}

const expectedSubjectId = requireUuid(
  'expected subject',
  process.env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID,
);

const firstSession = await acquireProductionMemberSmokeSession();
await verifyCanonicalMember(firstSession.accessToken, expectedSubjectId, 'Production Seyeon first /api/me');
const opened = await openSeyeonThread(firstSession.accessToken);
const clientTurnId = randomUUID();
const first = await sendTurn(firstSession.accessToken, opened.threadId, clientTurnId, TURN_TEXT, 'Production Seyeon first turn');
if (first.replayed) throw new Error('Production Seyeon first turn unexpectedly replayed.');

const cursor = Math.max(0, first.sequenceNo - 3);
const firstRead = await readThread(firstSession.accessToken, opened.threadId, cursor, 'Production Seyeon authoritative reread');
assertCommittedTurn(firstRead, first, TURN_TEXT, 'Production Seyeon authoritative reread');

const replay = await sendTurn(firstSession.accessToken, opened.threadId, clientTurnId, TURN_TEXT, 'Production Seyeon replay');
if (
  !replay.replayed ||
  replay.turnId !== first.turnId ||
  replay.assistantMessageId !== first.assistantMessageId ||
  replay.assistantText !== first.assistantText ||
  replay.sequenceNo !== first.sequenceNo
) throw new Error('Production Seyeon replay mismatch.');

const secondSession = await acquireProductionMemberSmokeSession();
await verifyCanonicalMember(secondSession.accessToken, expectedSubjectId, 'Production Seyeon re-auth /api/me');
const secondRead = await readThread(secondSession.accessToken, opened.threadId, cursor, 'Production Seyeon re-auth reread');
assertCommittedTurn(secondRead, first, TURN_TEXT, 'Production Seyeon re-auth reread');

console.log(
  `MyeongHa Production Seyeon turn smoke passed: memberSignIn=true, threadOpen=200, threadCreated=${opened.created}, firstTurn=200, authoritativeReread=true, exactReplay=true, replayed=true, persistedAfterReauth=true, assistantContentLogged=false.`,
);
