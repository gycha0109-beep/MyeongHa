import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export interface ChatReadPageOptionsV1 {
  readonly afterSequenceNo?: number;
  readonly pageSize?: number;
}

export type ChatSenderTypeV1 = 'user' | 'character' | 'system';

export interface ChatMessageV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly senderType: ChatSenderTypeV1;
  readonly characterId: string | null;
  readonly bodyText: string | null;
  readonly messagePayloadJsonb: unknown;
  readonly messageSchemaVersion: string | null;
  readonly createdAt: string;
  readonly redacted: boolean;
  readonly redactedAt: string | null;
}

export interface ChatRelationshipV1 {
  readonly stateId: string;
  readonly characterId: string;
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly relationshipStage: string;
  readonly policyVersion: string;
  readonly revision: number;
  readonly lastInteractionAt: string | null;
  readonly updatedAt: string;
}

export interface ChatReadPaginationV1 {
  readonly pageSize: number;
  readonly hasMore: boolean;
  readonly nextAfterSequenceNo: number | null;
}

export interface ChatThreadPageV1 {
  readonly threadId: string;
  readonly characterId: string;
  readonly contentReleaseId: string;
  readonly contentBundleId: string;
  readonly contentRevision: number;
  readonly afterSequenceNo: number;
  readonly lastSequenceNo: number;
  readonly messages: readonly ChatMessageV1[];
  readonly pagination: ChatReadPaginationV1;
  readonly latestCharacterMessage: ChatMessageV1 | null;
  readonly relationship: ChatRelationshipV1 | null;
}

function invalid(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_CHAT_RESPONSE_INVALID',
    message,
  );
}

function clientInvalid(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'CLIENT_CHAT_READ_INVALID',
    message,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalid(`Chat ${name} is invalid.`);
  }
  return value;
}

function nullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  return stringValue(name, value);
}

function integerValue(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalid(`Chat ${name} is invalid.`);
  }
  return value;
}

function timestampValue(name: string, value: unknown): string {
  const stored = stringValue(name, value);
  if (!Number.isFinite(Date.parse(stored))) {
    return invalid(`Chat ${name} is invalid.`);
  }
  return stored;
}

function nullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  return timestampValue(name, value);
}

function senderTypeValue(value: unknown): ChatSenderTypeV1 {
  if (value === 'user' || value === 'character' || value === 'system') return value;
  return invalid('senderType is unsupported.');
}

export function parseChatThreadIdV1(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    return clientInvalid('Chat threadId must be a UUID.');
  }
  return value;
}

function parseMessage(value: unknown): ChatMessageV1 {
  if (!isRecord(value)) return invalid('message is invalid.');
  const senderType = senderTypeValue(value.senderType);
  const characterId = nullableString('message characterId', value.characterId);
  if (senderType === 'character' && characterId === null) {
    return invalid('Character message requires characterId.');
  }
  if (senderType !== 'character' && characterId !== null) {
    return invalid('Non-Character message cannot expose characterId.');
  }
  if (typeof value.redacted !== 'boolean') {
    return invalid('message redacted flag is invalid.');
  }
  const bodyText = nullableString('message bodyText', value.bodyText);
  const redactedAt = nullableTimestamp('message redactedAt', value.redactedAt);
  if (value.redacted && redactedAt === null) {
    return invalid('Redacted message requires redactedAt.');
  }
  if (!value.redacted && redactedAt !== null) {
    return invalid('Non-redacted message cannot expose redactedAt.');
  }

  return Object.freeze({
    messageId: stringValue('messageId', value.messageId),
    sequenceNo: integerValue('message sequenceNo', value.sequenceNo),
    senderType,
    characterId,
    bodyText,
    messagePayloadJsonb: value.messagePayloadJsonb === undefined ? null : value.messagePayloadJsonb,
    messageSchemaVersion: nullableString('message schemaVersion', value.messageSchemaVersion),
    createdAt: timestampValue('message createdAt', value.createdAt),
    redacted: value.redacted,
    redactedAt,
  });
}

function parseRelationship(value: unknown, characterId: string): ChatRelationshipV1 | null {
  if (value === null) return null;
  if (!isRecord(value)) return invalid('relationship is invalid.');
  const returnedCharacterId = stringValue('relationship characterId', value.characterId);
  if (returnedCharacterId !== characterId) {
    return invalid('relationship characterId does not match thread characterId.');
  }
  return Object.freeze({
    stateId: stringValue('relationship stateId', value.stateId),
    characterId: returnedCharacterId,
    closeness: integerValue('relationship closeness', value.closeness),
    trust: integerValue('relationship trust', value.trust),
    friction: integerValue('relationship friction', value.friction),
    relationshipStage: stringValue('relationship stage', value.relationshipStage),
    policyVersion: stringValue('relationship policyVersion', value.policyVersion),
    revision: integerValue('relationship revision', value.revision),
    lastInteractionAt: nullableTimestamp('relationship lastInteractionAt', value.lastInteractionAt),
    updatedAt: timestampValue('relationship updatedAt', value.updatedAt),
  });
}

function normalizeOptions(options: ChatReadPageOptionsV1 = {}) {
  const afterSequenceNo = options.afterSequenceNo ?? 0;
  const pageSize = options.pageSize ?? 30;
  if (!Number.isSafeInteger(afterSequenceNo) || afterSequenceNo < 0) {
    return clientInvalid('Chat afterSequenceNo must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return clientInvalid('Chat pageSize must be between 1 and 50.');
  }
  return Object.freeze({ afterSequenceNo, pageSize });
}

function parsePagination(
  value: unknown,
  pageSize: number,
  lastSequenceNo: number,
): ChatReadPaginationV1 {
  if (!isRecord(value)) return invalid('pagination is invalid.');
  if (value.pageSize !== pageSize) return invalid('pagination pageSize changed.');
  if (typeof value.hasMore !== 'boolean') return invalid('pagination hasMore is invalid.');
  if (value.hasMore) {
    const nextAfterSequenceNo = integerValue(
      'pagination nextAfterSequenceNo',
      value.nextAfterSequenceNo,
    );
    if (nextAfterSequenceNo !== lastSequenceNo) {
      return invalid('pagination cursor does not match lastSequenceNo.');
    }
    return Object.freeze({ pageSize, hasMore: true, nextAfterSequenceNo });
  }
  if (value.nextAfterSequenceNo !== null) {
    return invalid('terminal pagination must expose null nextAfterSequenceNo.');
  }
  return Object.freeze({ pageSize, hasMore: false, nextAfterSequenceNo: null });
}

function parseThreadPage(
  data: unknown,
  requestedThreadId: string,
  requestedAfterSequenceNo: number,
  requestedPageSize: number,
): ChatThreadPageV1 {
  if (!isRecord(data)) return invalid('thread response is invalid.');

  const threadId = stringValue('threadId', data.threadId);
  if (threadId !== requestedThreadId) return invalid('threadId changed in response.');
  const characterId = stringValue('characterId', data.characterId);
  const afterSequenceNo = integerValue('afterSequenceNo', data.afterSequenceNo);
  const lastSequenceNo = integerValue('lastSequenceNo', data.lastSequenceNo);
  if (afterSequenceNo !== requestedAfterSequenceNo) {
    return invalid('afterSequenceNo changed in response.');
  }
  if (lastSequenceNo < afterSequenceNo) {
    return invalid('lastSequenceNo precedes afterSequenceNo.');
  }

  if (!Array.isArray(data.messages)) return invalid('messages collection is invalid.');
  const seenIds = new Set<string>();
  let priorSequence = afterSequenceNo;
  const messages = data.messages.map((raw) => {
    const message = parseMessage(raw);
    if (seenIds.has(message.messageId)) {
      return invalid('messages contain duplicate messageId.');
    }
    if (message.sequenceNo <= priorSequence) {
      return invalid('message sequence is not strictly increasing.');
    }
    seenIds.add(message.messageId);
    priorSequence = message.sequenceNo;
    return message;
  });
  if (messages.length > requestedPageSize) {
    return invalid('messages exceed requested pageSize.');
  }
  if (messages.length === 0) {
    if (lastSequenceNo !== afterSequenceNo) {
      return invalid('empty page lastSequenceNo is inconsistent.');
    }
  } else if (messages[messages.length - 1]?.sequenceNo !== lastSequenceNo) {
    return invalid('lastSequenceNo does not match final message.');
  }

  const pagination = parsePagination(data.pagination, requestedPageSize, lastSequenceNo);
  const latestCharacterMessage =
    data.latestCharacterMessage === null ? null : parseMessage(data.latestCharacterMessage);
  if (latestCharacterMessage !== null) {
    if (
      latestCharacterMessage.senderType !== 'character' ||
      latestCharacterMessage.characterId !== characterId ||
      latestCharacterMessage.redacted ||
      latestCharacterMessage.bodyText === null ||
      !messages.some((message) => message.messageId === latestCharacterMessage.messageId)
    ) {
      return invalid('latestCharacterMessage is inconsistent with current page.');
    }
  }

  return Object.freeze({
    threadId,
    characterId,
    contentReleaseId: stringValue('contentReleaseId', data.contentReleaseId),
    contentBundleId: stringValue('contentBundleId', data.contentBundleId),
    contentRevision: integerValue('contentRevision', data.contentRevision),
    afterSequenceNo,
    lastSequenceNo,
    messages: Object.freeze(messages),
    pagination,
    latestCharacterMessage,
    relationship: parseRelationship(data.relationship, characterId),
  });
}

export async function readChatThreadPageV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  threadIdInput: unknown,
  options: ChatReadPageOptionsV1 = {},
): Promise<ChatThreadPageV1> {
  const threadId = parseChatThreadIdV1(threadIdInput);
  const normalized = normalizeOptions(options);
  const search = new URLSearchParams({
    afterSequenceNo: String(normalized.afterSequenceNo),
    pageSize: String(normalized.pageSize),
  });
  const data = await client.requestData({
    method: 'GET',
    path: `/api/chat/${encodeURIComponent(threadId)}?${search.toString()}`,
    bearer,
  });
  return parseThreadPage(
    data,
    threadId,
    normalized.afterSequenceNo,
    normalized.pageSize,
  );
}
