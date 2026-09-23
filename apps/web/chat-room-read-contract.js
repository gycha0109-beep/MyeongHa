const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function fail(message) {
  throw new Error(`Character Room read contract rejected response: ${message}`);
}

function nonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${name} is invalid`);
  return value;
}

function nullableString(name, value) {
  if (value === null) return null;
  return nonEmptyString(name, value);
}

function safeSequence(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${name} is invalid`);
  return value;
}

function timestamp(name, value) {
  const raw = nonEmptyString(name, value);
  if (!Number.isFinite(new Date(raw).getTime())) fail(`${name} is invalid`);
  return raw;
}

export function parseChatThreadIdV1(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return UUID_V1.test(normalized) ? normalized : null;
}

export function parseChatThreadRouteV1(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(search || '');
  const values = params.getAll('threadId');

  if (values.length === 0) {
    return Object.freeze({ state: 'none', threadId: null });
  }
  if (values.length !== 1) {
    return Object.freeze({ state: 'invalid', threadId: null });
  }

  const threadId = parseChatThreadIdV1(values[0]);
  return threadId === null
    ? Object.freeze({ state: 'invalid', threadId: null })
    : Object.freeze({ state: 'ready', threadId });
}

function parseMessage(message, previousSequenceNo, seenMessageIds) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    fail('message is invalid');
  }

  const messageId = nonEmptyString('messageId', message.messageId);
  if (seenMessageIds.has(messageId)) fail('messageId is duplicated');

  const sequenceNo = safeSequence('sequenceNo', message.sequenceNo);
  if (sequenceNo <= previousSequenceNo) fail('message sequence is not strictly increasing');

  const senderType = nonEmptyString('senderType', message.senderType);
  const characterId = nullableString('message characterId', message.characterId);
  const bodyText = nullableString('message bodyText', message.bodyText);
  const createdAt = timestamp('message createdAt', message.createdAt);

  if (typeof message.redacted !== 'boolean') fail('message redacted flag is invalid');
  const redactedAt = message.redactedAt === null
    ? null
    : timestamp('message redactedAt', message.redactedAt);

  if (message.redacted) {
    if (redactedAt === null) fail('redacted message is missing redactedAt');
    if (bodyText !== null || message.messagePayloadJsonb !== null) {
      fail('redacted message exposed content');
    }
  } else if (redactedAt !== null) {
    fail('visible message contains redactedAt');
  }

  seenMessageIds.add(messageId);
  return Object.freeze({
    messageId,
    sequenceNo,
    senderType,
    characterId,
    bodyText,
    createdAt,
    redacted: message.redacted,
    redactedAt,
  });
}

export function parseChatRoomReadPayloadV1(payload, options) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('payload is invalid');
  }

  const expectedThreadId = parseChatThreadIdV1(options?.expectedThreadId);
  if (expectedThreadId === null) fail('expected threadId is invalid');

  const threadId = parseChatThreadIdV1(payload.threadId);
  if (threadId === null || threadId !== expectedThreadId) {
    fail('threadId does not match the requested thread');
  }

  const characterId = nonEmptyString('characterId', payload.characterId);
  const expectedAfterSequenceNo = safeSequence(
    'expected afterSequenceNo',
    options?.expectedAfterSequenceNo ?? 0,
  );
  const afterSequenceNo = safeSequence('afterSequenceNo', payload.afterSequenceNo);
  if (afterSequenceNo !== expectedAfterSequenceNo) {
    fail('afterSequenceNo does not match the requested cursor');
  }

  if (!Array.isArray(payload.messages)) fail('messages is invalid');

  let previousSequenceNo = afterSequenceNo;
  const seenMessageIds = new Set();
  const messages = payload.messages.map((message) => {
    const parsed = parseMessage(message, previousSequenceNo, seenMessageIds);
    previousSequenceNo = parsed.sequenceNo;
    return parsed;
  });

  const lastSequenceNo = safeSequence('lastSequenceNo', payload.lastSequenceNo);
  if (lastSequenceNo !== previousSequenceNo) {
    fail('lastSequenceNo does not match the authoritative stream');
  }

  return Object.freeze({
    threadId,
    characterId,
    afterSequenceNo,
    lastSequenceNo,
    messages: Object.freeze(messages),
  });
}
