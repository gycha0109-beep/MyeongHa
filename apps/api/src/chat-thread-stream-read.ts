import { ApiCommandError } from './chat-receive.js';

export const CHAT_THREAD_STREAM_READ_AUTHORITY_BINDING_V1 =
  'public.qry_chat_thread_stream_v1' as const;

export interface ChatThreadStreamAuthorityRowV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly senderType: string;
  readonly characterId: string | null;
  readonly bodyText: string | null;
  readonly messagePayloadJsonb: unknown | null;
  readonly messageSchemaVersion: string | null;
  readonly createdAt: string;
  readonly redacted: boolean;
  readonly redactedAt: string | null;
}

export type ChatThreadStreamReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'THREAD_UNAVAILABLE'
  | 'INVALID_INPUT';

export class ChatThreadStreamReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ChatThreadStreamReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ChatThreadStreamReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-authorized chat sequence stream query.
 *
 * A production adapter may bind this to `qry_chat_thread_stream_v1`.
 * PostgreSQL execution identity is deliberately outside this contract while
 * P0-AUTH-01 remains unresolved.
 */
export interface ChatThreadStreamReadAuthorityPortV1 {
  readStream(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly afterSequenceNo: number;
  }): Awaitable<readonly ChatThreadStreamAuthorityRowV1[]>;
}

export interface ChatThreadStreamMessageV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly senderType: string;
  readonly characterId: string | null;
  readonly bodyText: string | null;
  readonly messagePayloadJsonb: unknown | null;
  readonly messageSchemaVersion: string | null;
  readonly createdAt: string;
  readonly redacted: boolean;
  readonly redactedAt: string | null;
}

export interface ChatThreadStreamReadResponseV1 {
  readonly threadId: string;
  readonly afterSequenceNo: number;
  readonly messages: readonly ChatThreadStreamMessageV1[];
}

export interface GetChatThreadStreamInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly afterSequenceNo: unknown;
  readonly authorityPort: ChatThreadStreamReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireThreadId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'threadId must be a non-empty string.');
  }
  return value;
}

function requireAfterSequenceNo(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'afterSequenceNo must be a non-negative safe integer.',
    );
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ChatThreadStreamReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'THREAD_UNAVAILABLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Chat thread is unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireNonEmptyStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Chat stream authority returned an invalid ${name}.`);
  }
  return value;
}

function requireNullableStoredString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Chat stream authority returned an invalid ${name}.`);
  }
  return value;
}

function projectRows(
  afterSequenceNo: number,
  rows: readonly ChatThreadStreamAuthorityRowV1[],
): readonly ChatThreadStreamMessageV1[] {
  let previousSequenceNo = afterSequenceNo;
  const seenMessageIds = new Set<string>();

  const messages = rows.map((row) => {
    const messageId = requireNonEmptyStoredString('message identity', row.messageId);
    const senderType = requireNonEmptyStoredString('sender type', row.senderType);
    const characterId = requireNullableStoredString('character identity', row.characterId);
    const bodyText = requireNullableStoredString('message body', row.bodyText);
    const messageSchemaVersion = requireNullableStoredString(
      'message schema version',
      row.messageSchemaVersion,
    );
    const createdAt = requireNonEmptyStoredString('created timestamp', row.createdAt);
    const redactedAt = requireNullableStoredString('redacted timestamp', row.redactedAt);

    if (!Number.isSafeInteger(row.sequenceNo) || row.sequenceNo <= afterSequenceNo) {
      throw new Error('Chat stream authority returned a sequence outside the requested cursor.');
    }
    if (row.sequenceNo <= previousSequenceNo) {
      throw new Error('Chat stream authority returned a non-increasing sequence stream.');
    }
    if (seenMessageIds.has(messageId)) {
      throw new Error('Chat stream authority returned a duplicate message identity.');
    }
    if (typeof row.redacted !== 'boolean') {
      throw new Error('Chat stream authority returned an invalid redaction marker.');
    }
    if (row.messagePayloadJsonb === undefined) {
      throw new Error('Chat stream authority returned an undefined message payload.');
    }

    if (row.redacted) {
      if (redactedAt === null || redactedAt.trim().length === 0) {
        throw new Error('Chat stream authority returned a redacted tombstone without redactedAt.');
      }
      if (bodyText !== null || row.messagePayloadJsonb !== null) {
        throw new Error('Chat stream authority exposed content for a redacted tombstone.');
      }
    } else if (redactedAt !== null) {
      throw new Error('Chat stream authority returned redactedAt for visible content.');
    }

    previousSequenceNo = row.sequenceNo;
    seenMessageIds.add(messageId);

    return Object.freeze({
      messageId,
      sequenceNo: row.sequenceNo,
      senderType,
      characterId,
      bodyText,
      messagePayloadJsonb: row.messagePayloadJsonb,
      messageSchemaVersion,
      createdAt,
      redacted: row.redacted,
      redactedAt,
    });
  });

  return Object.freeze(messages);
}

export async function getChatThreadStream(
  input: GetChatThreadStreamInputV1,
): Promise<ChatThreadStreamReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const threadId = requireThreadId(input.threadId);
  const afterSequenceNo = requireAfterSequenceNo(input.afterSequenceNo);

  try {
    const rows = await input.authorityPort.readStream({
      subjectId,
      threadId,
      afterSequenceNo,
    });

    return Object.freeze({
      threadId,
      afterSequenceNo,
      messages: projectRows(afterSequenceNo, rows),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
