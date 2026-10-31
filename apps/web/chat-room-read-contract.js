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

function senderType(value) {
  const normalized = nonEmptyString('senderType', value);
  if (normalized !== 'user' && normalized !== 'character' && normalized !== 'system') {
    fail('senderType is unsupported');
  }
  return normalized;
}

function assertSenderCharacterShape(sender, characterId) {
  if (sender === 'character' && characterId === null) {
    fail('character message is missing characterId');
  }
  if (sender !== 'character' && characterId !== null) {
    fail('non-character message exposed characterId');
  }
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

function serverPlannerMemoryProposal(message, roomCharacterId) {
  // A pending fact must be emitted by the server's Dialogue Planner, not
  // inferred from a user Message or constructed from a browser selection.
  if (!Object.prototype.hasOwnProperty.call(message, 'memoryProposal')) {
    if (Object.prototype.hasOwnProperty.call(message, 'memoryProposalOffer')) {
      fail('manual original-message Memory offer is unsupported');
    }
    return undefined;
  }
  const proposal = message.memoryProposal;
  if (proposal === null || typeof proposal !== 'object' || Array.isArray(proposal) ||
      Object.keys(proposal).length !== 6 ||
      !['sourceAuthority','characterId','proposalId','proposalKind','proposalState','summary']
        .every(key => Object.prototype.hasOwnProperty.call(proposal,key)) ||
      proposal.sourceAuthority !== 'server_dialogue_planner' ||
      proposal.characterId !== 'seyeon' || roomCharacterId !== 'seyeon' ||
      message.senderType !== 'character' || message.characterId !== 'seyeon' ||
      typeof message.bodyText !== 'string' || !message.bodyText.trim() ||
      message.redacted !== false ||
      proposal.proposalState !== 'pending' ||
      !['memory','life_fact'].includes(proposal.proposalKind) ||
      typeof proposal.proposalId !== 'string' || !UUID_V1.test(proposal.proposalId) ||
      typeof proposal.summary !== 'string' ||
      proposal.summary.trim() !== proposal.summary ||
      proposal.summary.length < 1 || proposal.summary.length > 4000) {
    fail('Memory proposal lacks exact server Dialogue Planner authority');
  }
  return Object.freeze({
    sourceAuthority: 'server_dialogue_planner',
    characterId: 'seyeon',
    proposalId: proposal.proposalId,
    proposalKind: proposal.proposalKind,
    proposalState: 'pending',
    summary: proposal.summary,
  });
}

function parseMessage(message, previousSequenceNo, seenMessageIds, threadId, roomCharacterId) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    fail('message is invalid');
  }

  const messageId = nonEmptyString('messageId', message.messageId);
  if (seenMessageIds.has(messageId)) fail('messageId is duplicated');

  const sequenceNo = safeSequence('sequenceNo', message.sequenceNo);
  if (sequenceNo <= previousSequenceNo) fail('message sequence is not strictly increasing');

  const sender = senderType(message.senderType);
  const characterId = nullableString('message characterId', message.characterId);
  assertSenderCharacterShape(sender, characterId);
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

  const memoryProposal = serverPlannerMemoryProposal(message, roomCharacterId);
  seenMessageIds.add(messageId);
  return Object.freeze({
    messageId,
    sequenceNo,
    senderType: sender,
    characterId,
    bodyText,
    createdAt,
    redacted: message.redacted,
    redactedAt,
    ...(memoryProposal === undefined ? {} : { memoryProposal }),
  });
}

function parsePagination(payload, lastSequenceNo, messageCount) {
  const pagination = payload.pagination;
  if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination)) {
    fail('pagination is invalid');
  }
  if (
    !Number.isSafeInteger(pagination.pageSize)
    || pagination.pageSize < 1
    || pagination.pageSize > 50
    || typeof pagination.hasMore !== 'boolean'
    || messageCount > pagination.pageSize
  ) {
    fail('pagination bound is invalid');
  }

  if (pagination.hasMore) {
    const nextAfterSequenceNo = safeSequence(
      'pagination nextAfterSequenceNo',
      pagination.nextAfterSequenceNo,
    );
    if (nextAfterSequenceNo !== lastSequenceNo) {
      fail('pagination cursor does not match the authoritative stream');
    }
    return Object.freeze({
      pageSize: pagination.pageSize,
      hasMore: true,
      nextAfterSequenceNo,
    });
  }

  if (pagination.nextAfterSequenceNo !== null) {
    fail('terminal pagination cursor must be null');
  }
  return Object.freeze({
    pageSize: pagination.pageSize,
    hasMore: false,
    nextAfterSequenceNo: null,
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
    const parsed = parseMessage(message, previousSequenceNo, seenMessageIds, threadId, characterId);
    previousSequenceNo = parsed.sequenceNo;
    return parsed;
  });

  const lastSequenceNo = safeSequence('lastSequenceNo', payload.lastSequenceNo);
  if (lastSequenceNo !== previousSequenceNo) {
    fail('lastSequenceNo does not match the authoritative stream');
  }

  const paginationState = parsePagination(payload, lastSequenceNo, messages.length);
  if (payload.historyWithheld !== undefined &&
      typeof payload.historyWithheld !== 'boolean') {
    fail('historyWithheld is invalid');
  }
  const historyWithheld = payload.historyWithheld === true;
  if (historyWithheld && (characterId !== 'seyeon' ||
      afterSequenceNo !== 0 || lastSequenceNo !== 0 ||
      messages.length !== 0 || paginationState.hasMore)) {
    fail('protected Se-yeon room shell must not include history');
  }

  return Object.freeze({
    threadId,
    characterId,
    afterSequenceNo,
    lastSequenceNo,
    messages: Object.freeze(messages),
    pagination: paginationState,
    historyWithheld,
  });
}
