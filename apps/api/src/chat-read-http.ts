import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  CollectionReadPaginationInputErrorV1,
  parseCollectionPageSizeV1,
  requireAllowedQueryKeysV1,
} from './collection-read-pagination.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const GET_METHOD = 'GET' as const;
const ROUTE_PREFIX = '/api/chat/' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE = 'no-store' as const;

/** G3/S5: no DB-current-rights Reveal for historical Se-yeon material yet. */
class SeyeonChatHistoryRevealHoldV1 extends Error {
  constructor() {
    super('Se-yeon chat history Reveal requires current source authorization.');
    this.name = 'SeyeonChatHistoryRevealHoldV1';
  }
}

export const CHAT_READ_HTTP_BINDING_V1 = Object.freeze({
  method: GET_METHOD,
  route: '/api/chat/:threadId',
  threadBindingAuthority: 'public.qry_chat_thread_runtime_binding_v1',
  primaryCharacterAuthority: 'ordered-participant-character-ids[0]:v1',
  streamAuthority: 'public.qry_chat_thread_stream_v2',
  relationshipAuthority: 'public.qry_character_relationship_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleChatReadRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

type ParsedChatReadRequestV1 = Readonly<{
  threadId: string;
  afterSequenceNo: number;
  pageSize: number;
}>;

type ThreadBindingRow = Readonly<{
  threadId: unknown;
  status: unknown;
  activeContentReleaseId: unknown;
  activeContentBundleId: unknown;
  contentRevision: unknown;
  participantCharacterIds: unknown;
}>;

type StreamRow = Readonly<{
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

type RelationshipRow = Readonly<{
  stateId: unknown;
  characterId: unknown;
  closeness: unknown;
  trust: unknown;
  friction: unknown;
  relationshipStage: unknown;
  policyVersion: unknown;
  revision: unknown;
  lastInteractionAt: unknown;
  updatedAt: unknown;
}>;

const READ_THREAD_BINDING_SQL = `
select
  thread_id::text as "threadId",
  status,
  active_content_release_id::text as "activeContentReleaseId",
  active_content_bundle_id::text as "activeContentBundleId",
  content_revision as "contentRevision",
  participant_character_ids as "participantCharacterIds"
from public.qry_chat_thread_runtime_binding_v1($1::uuid, $2::uuid)
`.trim();

const READ_STREAM_SQL = `
select
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  sender_type as "senderType",
  character_id as "characterId",
  body_text as "bodyText",
  message_payload_jsonb as "messagePayloadJsonb",
  message_schema_version as "messageSchemaVersion",
  created_at as "createdAt",
  redacted,
  redacted_at as "redactedAt"
from public.qry_chat_thread_stream_v2($1::uuid, $2::uuid, $3::bigint, $4::integer)
`.trim();

// Owner-scoped metadata-only Se-yeon room shell: PostgreSQL returns a
// boolean, never the body/payload of an existing, protected message.
const SEYEON_HAS_MESSAGES_SQL = `
select exists (
  select 1 from public.qry_chat_thread_stream_v2(
    $1::uuid, $2::uuid, 0::bigint, 1::integer
  )
) as "hasMessages"
`.trim();

// Check every historical participant, not just the current active bundle or
// the paginated stream. The SQL definer is Member/Subject-owned metadata only.
// The owner-scoped SQL must exist or the entire transcript read is held.
// This guard alone cannot certify full G3 Reveal/Replay/streaming.
const SEYEON_HISTORY_GUARD_AVAILABLE_SQL = `
select to_regprocedure('public.qry_seyeon_thread_ever_involved_v1(uuid,uuid)')
  is not null as "installed"
`.trim();
const SEYEON_HISTORY_GUARD_SQL = `
select ever_involved as "everInvolved"
from public.qry_seyeon_thread_ever_involved_v1($1::uuid,$2::uuid)
`.trim();

const READ_RELATIONSHIP_SQL = `
select
  state_id::text as "stateId",
  character_id as "characterId",
  closeness,
  trust,
  friction,
  relationship_stage as "relationshipStage",
  policy_version as "policyVersion",
  revision,
  last_interaction_at as "lastInteractionAt",
  updated_at as "updatedAt"
from public.qry_character_relationship_v1($1::uuid, $2::text)
`.trim();

function stringValue(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Chat read ${name} is invalid.`);
  }
  return value;
}

function nullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  return stringValue(name, value);
}

type ChatReadSenderTypeV1 = 'user' | 'character' | 'system';

function senderTypeValue(value: unknown): ChatReadSenderTypeV1 {
  const senderType = stringValue('sender type', value);
  if (senderType !== 'user' && senderType !== 'character' && senderType !== 'system') {
    throw new Error('Chat read sender type is unsupported.');
  }
  return senderType;
}

function assertSenderCharacterShape(
  senderType: ChatReadSenderTypeV1,
  characterId: string | null,
): void {
  if (senderType === 'character' && characterId === null) {
    throw new Error('Chat read Character message is missing character identity.');
  }
  if (senderType !== 'character' && characterId !== null) {
    throw new Error('Chat read non-Character message exposed character identity.');
  }
}

function integerValue(name: string, value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Chat read ${name} is invalid.`);
  }
  return parsed;
}

function timestampValue(name: string, value: unknown): string {
  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;
  if (date === null || !Number.isFinite(date.getTime())) {
    throw new Error(`Chat read ${name} is invalid.`);
  }
  return date.toISOString();
}

function nullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  return timestampValue(name, value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function jsonError(status: number, code: string, messageKey: string, requestId: string): Response {
  return Response.json({
    ok: false,
    error: { code, messageKey, retryable: false },
    meta: { apiContractVersion: API_CONTRACT_VERSION, requestId },
  }, { status, headers: { 'Cache-Control': NO_STORE } });
}

function success(data: unknown, requestId: string, serverTime: string): Response {
  return Response.json({
    ok: true,
    data,
    meta: { apiContractVersion: API_CONTRACT_VERSION, requestId, serverTime },
  }, { headers: { 'Cache-Control': NO_STORE } });
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: GET_METHOD, 'Cache-Control': NO_STORE },
  });
}

function parseRequest(request: Request): ParsedChatReadRequestV1 | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ROUTE_PREFIX) || url.hash !== '') return null;

  const rawThreadId = url.pathname.slice(ROUTE_PREFIX.length);
  if (rawThreadId.length === 0 || rawThreadId.includes('/')) return null;

  let threadId: string;
  try {
    threadId = decodeURIComponent(rawThreadId);
  } catch {
    return null;
  }
  if (!isUuid(threadId)) return null;

  try {
    requireAllowedQueryKeysV1(url.searchParams, ['afterSequenceNo', 'pageSize']);
    const cursorValues = url.searchParams.getAll('afterSequenceNo');
    if (cursorValues.length > 1) return null;
    const rawCursor = cursorValues[0] ?? '0';
    if (!/^(0|[1-9][0-9]*)$/u.test(rawCursor)) return null;
    const afterSequenceNo = Number(rawCursor);
    if (!Number.isSafeInteger(afterSequenceNo)) return null;
    const pageSize = parseCollectionPageSizeV1(url.searchParams);
    return Object.freeze({ threadId, afterSequenceNo, pageSize });
  } catch (error) {
    if (error instanceof CollectionReadPaginationInputErrorV1) return null;
    throw error;
  }
}

function mapThreadBinding(row: ThreadBindingRow, threadId: string) {
  const returnedThreadId = stringValue('thread identity', row.threadId);
  if (returnedThreadId !== threadId || row.status !== 'active') {
    throw new Error('Chat read thread binding is inconsistent.');
  }
  if (!Array.isArray(row.participantCharacterIds) || row.participantCharacterIds.length === 0) {
    throw new Error('Chat read participant binding is invalid.');
  }
  const participantCharacterIds = row.participantCharacterIds.map((value) =>
    stringValue('participant identity', value));
  const primaryCharacterId = participantCharacterIds[0];
  if (primaryCharacterId === undefined) {
    throw new Error('Chat read primary participant binding is invalid.');
  }

  return Object.freeze({
    threadId: returnedThreadId,
    activeContentReleaseId: stringValue('content release identity', row.activeContentReleaseId),
    activeContentBundleId: stringValue('content bundle identity', row.activeContentBundleId),
    contentRevision: integerValue('content revision', row.contentRevision),
    participantCharacterIds: Object.freeze(participantCharacterIds),
    primaryCharacterId,
  });
}

function mapStreamRow(row: StreamRow) {
  if (typeof row.redacted !== 'boolean') {
    throw new Error('Chat read redaction flag is invalid.');
  }
  const senderType = senderTypeValue(row.senderType);
  const characterId = nullableString('message character identity', row.characterId);
  assertSenderCharacterShape(senderType, characterId);

  return Object.freeze({
    messageId: stringValue('message identity', row.messageId),
    sequenceNo: integerValue('message sequence', row.sequenceNo),
    senderType,
    characterId,
    bodyText: nullableString('message body', row.bodyText),
    messagePayloadJsonb: row.messagePayloadJsonb === undefined ? null : row.messagePayloadJsonb,
    messageSchemaVersion: nullableString('message schema version', row.messageSchemaVersion),
    createdAt: timestampValue('message timestamp', row.createdAt),
    redacted: row.redacted,
    redactedAt: nullableTimestamp('redaction timestamp', row.redactedAt),
  });
}

function mapRelationship(row: RelationshipRow, characterId: string) {
  const returnedCharacterId = stringValue('relationship character identity', row.characterId);
  if (returnedCharacterId !== characterId) {
    throw new Error('Chat read relationship identity is inconsistent.');
  }
  return Object.freeze({
    stateId: stringValue('relationship state identity', row.stateId),
    characterId: returnedCharacterId,
    closeness: integerValue('relationship closeness', row.closeness),
    trust: integerValue('relationship trust', row.trust),
    friction: integerValue('relationship friction', row.friction),
    relationshipStage: stringValue('relationship stage', row.relationshipStage),
    policyVersion: stringValue('relationship policy version', row.policyVersion),
    revision: integerValue('relationship revision', row.revision),
    lastInteractionAt: nullableTimestamp('relationship interaction timestamp', row.lastInteractionAt),
    updatedAt: timestampValue('relationship updated timestamp', row.updatedAt),
  });
}

async function readChatState(
  client: PostgresTransactionQueryV1,
  subjectId: string,
  parsed: ParsedChatReadRequestV1,
) {
  const bindingResult = await client.query<ThreadBindingRow>(READ_THREAD_BINDING_SQL, [
    subjectId,
    parsed.threadId,
  ]);
  if (bindingResult.rows.length !== 1 || bindingResult.rows[0] === undefined) {
    throw new Error('Chat read thread binding row count is invalid.');
  }
  const binding = mapThreadBinding(bindingResult.rows[0], parsed.threadId);

  // A single-participant Se-yeon GET is a metadata-only shell. The caller
  // is already owner-scoped; neither existing body text nor even a redacted
  // message row may cross this boundary before History/Replay approval.
  // Do not substitute a false "empty history": explicitly mark withheld data.
  if (binding.participantCharacterIds.length === 1 &&
      binding.primaryCharacterId === 'seyeon') {
    if (parsed.afterSequenceNo !== 0) throw new SeyeonChatHistoryRevealHoldV1();
    // The existence query is metadata-only, but its failure must not leak
    // DB details or downgrade the protected shell into an ordinary 500.
    // Keep all assistant/relationship bodies withheld on unknown results.
    let hasMessages: boolean;
    try {
      const existence = await client.query<{hasMessages:boolean}>(SEYEON_HAS_MESSAGES_SQL, [
        subjectId,parsed.threadId,
      ]);
      if (existence.rows.length !== 1 ||
          typeof existence.rows[0]?.hasMessages !== 'boolean') {
        throw new SeyeonChatHistoryRevealHoldV1();
      }
      hasMessages = existence.rows[0].hasMessages;
    } catch {
      throw new SeyeonChatHistoryRevealHoldV1();
    }
    return Object.freeze({
      threadId:binding.threadId,
      characterId:'seyeon',
      afterSequenceNo:0,
      lastSequenceNo:0,
      messages:Object.freeze([]),
      pagination:Object.freeze({
        pageSize:parsed.pageSize,
        hasMore:false,
        nextAfterSequenceNo:null,
      }),
      historyWithheld:hasMessages,
      latestCharacterMessage:null,
      relationship:null,
    });
  }
  if (binding.participantCharacterIds.includes('seyeon')) {
    throw new SeyeonChatHistoryRevealHoldV1();
  }
  // A former Se-yeon participant disappears from the active binding when
  // left_at is set or a new content bundle is selected. A page-local check
  // cannot prove that an earlier/later page is safe to replay.
  // PostgreSQL may throw when the catalog probe or owner-scoped history
  // function is unavailable (DDL/ACL drift, timeout or partial restore).
  // Such failures are NOT ordinary chat errors: always return the same
  // no-store 503 HOLD before reading body or relationship-derived material.
  try {
    const capability = await client.query<{ installed: boolean }>(
      SEYEON_HISTORY_GUARD_AVAILABLE_SQL,
    );
    if (capability.rows.length !== 1 ||
        typeof capability.rows[0]?.installed !== 'boolean' ||
        !capability.rows[0].installed) {
      throw new SeyeonChatHistoryRevealHoldV1();
    }
    const history = await client.query<{ everInvolved: boolean }>(
      SEYEON_HISTORY_GUARD_SQL, [subjectId, parsed.threadId],
    );
    if (history.rows.length !== 1 ||
        typeof history.rows[0]?.everInvolved !== 'boolean' ||
        history.rows[0].everInvolved) {
      throw new SeyeonChatHistoryRevealHoldV1();
    }
  } catch {
    throw new SeyeonChatHistoryRevealHoldV1();
  }

  const streamResult = await client.query<StreamRow>(READ_STREAM_SQL, [
    subjectId,
    parsed.threadId,
    parsed.afterSequenceNo,
    parsed.pageSize,
  ]);
  // A current participant set is not proof about the entire history.
  // A formerly participating Se-yeon can still own a committed message
  // after the thread is reconfigured to contain other Characters only.
  // Check the full bounded stream page (including the extra cursor row)
  // BEFORE retrieving relationship state or serializing any message body.
  if (streamResult.rows.some((row) => row.characterId === 'seyeon')) {
    throw new SeyeonChatHistoryRevealHoldV1();
  }
  const relationshipResult = await client.query<RelationshipRow>(READ_RELATIONSHIP_SQL, [
    subjectId,
    binding.primaryCharacterId,
  ]);

  const hasMore = streamResult.rows.length > parsed.pageSize;
  const pageRows = hasMore ? streamResult.rows.slice(0, parsed.pageSize) : streamResult.rows;
  const messages = Object.freeze(pageRows.map(mapStreamRow));
  const latestCharacterMessage = [...messages].reverse().find((message) =>
    !message.redacted &&
    message.senderType === 'character' &&
    message.characterId === binding.primaryCharacterId &&
    typeof message.bodyText === 'string' &&
    message.bodyText.trim().length > 0
  ) ?? null;
  const lastSequenceNo = messages.length === 0
    ? parsed.afterSequenceNo
    : messages[messages.length - 1]?.sequenceNo ?? parsed.afterSequenceNo;

  if (relationshipResult.rows.length > 1) {
    throw new Error('Chat read relationship row count is invalid.');
  }
  const relationshipRow = relationshipResult.rows[0];

  return Object.freeze({
    threadId: binding.threadId,
    characterId: binding.primaryCharacterId,
    contentReleaseId: binding.activeContentReleaseId,
    contentBundleId: binding.activeContentBundleId,
    contentRevision: binding.contentRevision,
    afterSequenceNo: parsed.afterSequenceNo,
    lastSequenceNo,
    messages,
    pagination: Object.freeze({
      pageSize: parsed.pageSize,
      hasMore,
      nextAfterSequenceNo: hasMore ? lastSequenceNo : null,
    }),
    latestCharacterMessage,
    relationship: relationshipRow === undefined
      ? null
      : mapRelationship(relationshipRow, binding.primaryCharacterId),
  });
}

export async function handleChatReadRequestV1(
  input: HandleChatReadRequestInputV1,
): Promise<Response> {
  if (input.request.method !== GET_METHOD) return methodNotAllowed();

  const parsed = parseRequest(input.request);
  if (parsed === null) {
    return jsonError(400, 'INVALID_REQUEST', 'request.invalid', input.requestId);
  }

  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (verifiedEvidence === null) {
    return jsonError(401, 'AUTH_REQUIRED', 'auth.required', input.requestId);
  }

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject, client }) =>
        readChatState(client, resolvedSubject.subjectId, parsed),
    });
    return success(
      data,
      stringValue('request id', input.requestId),
      stringValue('server time', input.serverTime),
    );
  } catch (error) {
    if (error instanceof SeyeonChatHistoryRevealHoldV1) {
      return jsonError(503, 'SEYEON_HISTORY_REVEAL_HOLD', 'chat.unavailable', input.requestId);
    }
    const constraint = postgresConstraint(error);
    if (constraint !== null && (
      constraint.includes('subject_ineligible') ||
      constraint.includes('thread_unavailable') ||
      constraint.includes('participants_unavailable') ||
      constraint.includes('character_not_found')
    )) {
      return jsonError(404, 'NOT_FOUND', 'chat.not_found', input.requestId);
    }
    if (constraint !== null && (
      constraint.includes('_required') ||
      constraint.includes('_valid')
    )) {
      return jsonError(400, 'INVALID_REQUEST', 'request.invalid', input.requestId);
    }
    throw error;
  }
}
