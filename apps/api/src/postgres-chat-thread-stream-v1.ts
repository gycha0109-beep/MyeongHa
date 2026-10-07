import {
  ChatThreadStreamReadAuthorityPortErrorV1,
  type ChatThreadStreamAuthorityRowV1,
  type ChatThreadStreamReadAuthorityPortV1,
} from './chat-thread-stream-read.js';
import type {
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

type RowV1 = Readonly<{
  messageId: unknown;
  sequenceNo: unknown;
  senderType: unknown;
  characterId: unknown;
  bodyText: unknown;
  messagePayloadJsonb: unknown;
  messageSchemaVersion: unknown;
  createdAt: unknown;
  redacted: unknown;
  redactedAt: unknown;
}>;

const READ_CHAT_THREAD_STREAM_SQL_V1 = `
select
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  sender_type as "senderType",
  character_id as "characterId",
  body_text as "bodyText",
  message_payload_jsonb as "messagePayloadJsonb",
  message_schema_version as "messageSchemaVersion",
  created_at::text as "createdAt",
  redacted,
  redacted_at::text as "redactedAt"
from public.qry_chat_thread_stream_v1(
  $1::uuid,
  $2::uuid,
  $3::bigint
)
`.trim();

function text(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      'Chat thread stream PostgreSQL ' + name + ' is invalid.',
    );
  }
  return value.trim();
}

function nullableText(name: string, value: unknown): string | null {
  return value === null ? null : text(name, value);
}

function integer(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      'Chat thread stream PostgreSQL ' + name + ' is invalid.',
    );
  }
  return parsed;
}

function bool(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(
      'Chat thread stream PostgreSQL ' + name + ' is invalid.',
    );
  }
  return value;
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_chat_thread_stream_subject_required':
    case 'qry_chat_thread_stream_thread_required':
    case 'qry_chat_thread_stream_cursor_valid':
      throw new ChatThreadStreamReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Chat thread stream input was rejected.',
      );
    case 'qry_chat_thread_stream_subject_ineligible':
      throw new ChatThreadStreamReadAuthorityPortErrorV1(
        'SUBJECT_INELIGIBLE',
        'Chat thread stream Subject is unavailable.',
      );
    case 'qry_chat_thread_stream_thread_unavailable':
      throw new ChatThreadStreamReadAuthorityPortErrorV1(
        'THREAD_UNAVAILABLE',
        'Chat thread stream is unavailable.',
      );
    default:
      throw error;
  }
}

export function createPostgresChatThreadStreamReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): ChatThreadStreamReadAuthorityPortV1 {
  return Object.freeze({
    async readStream(
      input: Parameters<ChatThreadStreamReadAuthorityPortV1['readStream']>[0],
    ) {
      try {
        const result = await client.query<RowV1>(
          READ_CHAT_THREAD_STREAM_SQL_V1,
          [
            input.subjectId,
            input.threadId,
            input.afterSequenceNo,
          ],
        );
        return Object.freeze(
          result.rows.map((row): ChatThreadStreamAuthorityRowV1 =>
            Object.freeze({
              messageId: text('message id', row.messageId),
              sequenceNo: integer('sequence number', row.sequenceNo),
              senderType: text('sender type', row.senderType),
              characterId: nullableText(
                'Character id',
                row.characterId,
              ),
              bodyText: nullableText('body text', row.bodyText),
              messagePayloadJsonb: (() => {
                if (row.messagePayloadJsonb === undefined) {
                  throw new Error(
                    'Chat thread stream PostgreSQL message payload is invalid.',
                  );
                }
                return row.messagePayloadJsonb;
              })(),
              messageSchemaVersion: nullableText(
                'message schema version',
                row.messageSchemaVersion,
              ),
              createdAt: text('created timestamp', row.createdAt),
              redacted: bool('redacted marker', row.redacted),
              redactedAt: nullableText(
                'redacted timestamp',
                row.redactedAt,
              ),
            }),
          ),
        );
      } catch (error) {
        return mapPostgresError(error);
      }
    },
  });
}
