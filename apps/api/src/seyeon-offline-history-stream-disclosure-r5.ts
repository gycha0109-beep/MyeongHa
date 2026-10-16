import type { SeyeonChatHistoryDisclosurePortV1 } from './chat-read-http.js';
import type { SeyeonChatTurnControlledDisclosurePortV1 } from './chat-turn-send-http.js';
import type { ChatThreadStreamReadAuthorityPortV1 } from './chat-thread-stream-read.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

/**
 * OFFLINE/DISPOSABLE-DB CANDIDATE ONLY. The corresponding Owner SQL lives in
 * test/db/seyeon_g3_history_stream_api_disclosure_candidate_r5.sql.
 * Do not import from a Production composition root or publicly mount it.
 * No DB schema, ACL, authenticated HTTP or Provider gets enabled here.
 *
 * The SQL Owner query validates the CURRENT Original Grant for EACH stored
 * Se-yeon message and fails the entire page if one cannot be disclosed.
 * This adapter cannot use generic qry_chat_thread_stream_v2 as fallback.
 */
export const SEYEON_OFFLINE_R5_DISPATCH_MODE = 'OFFLINE_HOLD_PRODUCTION' as const;

type PageInput = Readonly<{
  client: PostgresTransactionQueryV1;
  subjectId: string;
  threadId: string;
  afterSequenceNo: number;
  pageSize: number;
  characterId: 'seyeon';
}>;

type OwnerPageRow = Readonly<{
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

const READ_OWNER_PAGE_SQL = `
select
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  sender_type as "senderType",
  character_id as "characterId",
  body_text as "bodyText",
  message_payload_jsonb as "messagePayloadJsonb",
  message_schema_version as "messageSchemaVersion",
  created_at as "createdAt",
  redacted as "redacted",
  redacted_at as "redactedAt"
from seyeon_positive_candidate.read_authorized_page_r5(
  $1::uuid,$2::uuid,$3::bigint,$4::integer
)
`.trim();

const READ_OWNER_HTTP_SQL = `
select seyeon_positive_candidate.reveal_http_r5(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid
) as "assistantText"
`.trim();

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.trim() === value;
}

function number(value: unknown): number {
  const parsed = typeof value === 'string' || typeof value === 'number'
    ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Seyeon R5 Owner returned invalid sequence.');
  }
  return parsed;
}

function checkedOwnerPage(rows: readonly OwnerPageRow[], input: PageInput) {
  if (!Array.isArray(rows) || rows.length > input.pageSize + 1) {
    throw new Error('Se-yeon R5 Owner page size is invalid.');
  }
  let previous = input.afterSequenceNo;
  const seen = new Set<string>();
  const answer = rows.map((row) => {
    if (!nonblank(row.messageId) || seen.has(row.messageId)) {
      throw new Error('Se-yeon R5 Owner message id is invalid.');
    }
    seen.add(row.messageId);
    const sequenceNo = number(row.sequenceNo);
    if (sequenceNo <= previous) {
      throw new Error('Se-yeon R5 Owner sequence was repeated.');
    }
    previous = sequenceNo;
    if (row.redacted !== true && row.redacted !== false) {
      throw new Error('Se-yeon R5 Owner redaction shape is invalid.');
    }
    if (row.messagePayloadJsonb !== null) {
      throw new Error('Se-yeon R5 Owner returned unreviewed payload.');
    }
    if (row.senderType !== 'user' && row.senderType !== 'character') {
      throw new Error('Se-yeon R5 Owner returned unreviewed sender.');
    }
    if ((row.senderType === 'character' && row.characterId !== 'seyeon') ||
        (row.senderType === 'user' && row.characterId !== null)) {
      throw new Error('Se-yeon R5 Owner character scope is invalid.');
    }
    if (row.redacted && (row.bodyText !== null || row.redactedAt === null)) {
      throw new Error('Se-yeon R5 Owner redaction was not masked.');
    }
    if (!row.redacted && (row.bodyText === null || row.redactedAt !== null)) {
      throw new Error('Se-yeon R5 Owner disclosed an incomplete record.');
    }
    if (typeof row.bodyText !== 'string' && row.bodyText !== null) {
      throw new Error('Se-yeon R5 Owner returned untyped message.');
    }
    if (typeof row.messageSchemaVersion !== 'string' &&
        row.messageSchemaVersion !== null) {
      throw new Error('Se-yeon R5 Owner message schema is invalid.');
    }
    if (typeof row.createdAt !== 'string' && !(row.createdAt instanceof Date)) {
      throw new Error('Se-yeon R5 Owner createdAt is invalid.');
    }
    if (row.redactedAt !== null && typeof row.redactedAt !== 'string' &&
        !(row.redactedAt instanceof Date)) {
      throw new Error('Se-yeon R5 Owner redactedAt is invalid.');
    }
    return Object.freeze({
      messageId: row.messageId,
      sequenceNo,
      senderType: row.senderType,
      characterId: row.characterId,
      bodyText: row.bodyText,
      messagePayloadJsonb: null,
      messageSchemaVersion: row.messageSchemaVersion,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString() : row.createdAt,
      redacted: row.redacted,
      redactedAt: row.redactedAt instanceof Date
        ? row.redactedAt.toISOString() : row.redactedAt,
    });
  });
  return Object.freeze(answer);
}

/**
 * Consumed by the existing GET /api/chat/:threadId owner injection seam.
 * Does not authorize Production installation: see constant above.
 */
export function createSeyeonOfflineHistoryDisclosurePortR5():
    SeyeonChatHistoryDisclosurePortV1 {
  return Object.freeze({
    async readAuthorizedPage(input: Parameters<SeyeonChatHistoryDisclosurePortV1['readAuthorizedPage']>[0]) {
      if (input.characterId !== 'seyeon' ||
          !nonblank(input.subjectId) || !nonblank(input.threadId) ||
          !Number.isSafeInteger(input.afterSequenceNo) ||
          input.afterSequenceNo < 0 ||
          !Number.isSafeInteger(input.pageSize) ||
          input.pageSize < 1 || input.pageSize > 50) {
        throw new Error('Se-yeon R5 invalid Owner page request.');
      }
      const result = await input.client.query<OwnerPageRow>(
        READ_OWNER_PAGE_SQL,[
          input.subjectId,input.threadId,
          input.afterSequenceNo,input.pageSize,
        ],
      );
      return checkedOwnerPage(result.rows,input);
    },
  });
}

/**
 * Separate bounded sequence stream consumer; every chunk is an Owner-checked
 * page, not raw database rows. Never cache rows, stream a token early, or
 * reuse a previous authorization after the PostgreSQL transaction ends.
 */
export function createSeyeonOfflineStreamDisclosurePortR5(
  client: PostgresTransactionQueryV1,
): ChatThreadStreamReadAuthorityPortV1 {
  const history = createSeyeonOfflineHistoryDisclosurePortR5();
  return Object.freeze({
    async readStream(input: Parameters<ChatThreadStreamReadAuthorityPortV1['readStream']>[0]) {
      const messages = await history.readAuthorizedPage({
        client,subjectId:input.subjectId,threadId:input.threadId,
        afterSequenceNo:input.afterSequenceNo,pageSize:50,
        characterId:'seyeon',
      });
      // Same shape, and only bytes validated by the current-rights Owner.
      return Object.freeze(messages.slice(0,50).map((row) =>
        Object.freeze({
          ...row,
          createdAt: row.createdAt instanceof Date
            ? row.createdAt.toISOString() : row.createdAt,
          redactedAt: row.redactedAt instanceof Date
            ? row.redactedAt.toISOString() : row.redactedAt,
        }),
      )) as Awaited<ReturnType<ChatThreadStreamReadAuthorityPortV1['readStream']>>;
    },
  });
}

/**
 * Server-only exact first/replay controlled disclosure for POST turn responses.
 * Resolve the canonical member Subject from verified request evidence INSIDE
 * a fresh PostgreSQL transaction. Never trust a runtime-supplied Subject ID
 * or assistantText as authority. No fallback to stored/raw transport text.
 */
export function createSeyeonOfflineTurnDisclosurePortR5(
  pool: PostgresSubjectPoolV1,
): SeyeonChatTurnControlledDisclosurePortV1 {
  return Object.freeze({
    async reveal(input: Parameters<SeyeonChatTurnControlledDisclosurePortV1['reveal']>[0]) {
      if (!nonblank(input.subjectId) || !nonblank(input.threadId) ||
          !nonblank(input.turnId) || !nonblank(input.attemptId) ||
          !nonblank(input.assistantMessageId) ||
          (input.disposition !== 'executed' &&
           input.disposition !== 'committed_replay') ||
          input.verifiedEvidence?.kind !== 'member') {
        return Object.freeze({state:'held' as const});
      }
      return executePostgresSubjectTransactionV1({
        pool,verifiedEvidence:input.verifiedEvidence,
        execute: async ({resolvedSubject,client}) => {
          if (resolvedSubject.subjectId !== input.subjectId ||
              resolvedSubject.subjectKind !== 'member') {
            return Object.freeze({state:'held' as const});
          }
          const result = await client.query<{assistantText:unknown}>(
            READ_OWNER_HTTP_SQL,[
              resolvedSubject.subjectId,input.threadId,
              input.turnId,input.attemptId,input.assistantMessageId,
            ],
          );
          const assistantText = result.rows[0]?.assistantText;
          if (result.rows.length !== 1 ||
              !nonblank(assistantText) ||
              assistantText.length > 8000) {
            return Object.freeze({state:'held' as const});
          }
          return Object.freeze({
            state:'authorized' as const,
            assistantText,
          });
        },
      });
    },
  });
}
