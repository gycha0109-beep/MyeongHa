import type {
  CharacterDialogueMessageShadowV1,
  CharacterThreadSnapshotShadowPortV1,
} from '../../../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import { CHARACTER_THREAD_SNAPSHOT_SHADOW_VERSION_V1 } from
  '../../../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';

export const POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_VERSION_V1 =
  'postgres-character-thread-snapshot-shadow-v1' as const;

/**
 * Reuse the existing subject-authorized runtime-binding function inside the
 * caller's resolved-subject PostgreSQL transaction. Do not create a new
 * auth path or query a caller-supplied transcript.
 *
 * One PostgreSQL statement observes the full message count, exclusions and
 * the most recent 12 identities/roles/EXACT texts in one statement snapshot.
 * Counting includes redacted/system/historical rows; no partial result may
 * be treated as a complete thread. It is still not a commit/reveal lock.
 */
export const POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1 = `
with authorized_thread as materialized (
  select thread_id, status, participant_character_ids,
    active_content_release_id, active_content_bundle_id, content_revision
  from public.qry_chat_thread_runtime_binding_v1($1::uuid, $2::uuid)
),
all_messages as materialized (
  select
    m.id::text as "messageId",
    m.sequence_no as "sequenceNo",
    m.sender_type as "senderType",
    p.character_id as "characterId",
    m.body_text as "bodyText",
    (m.redacted_at is not null) as "redacted"
  from public.conversation_messages m
  join authorized_thread t on t.thread_id = m.thread_id
  left join public.conversation_thread_characters p
    on p.id = m.thread_character_id and p.thread_id = m.thread_id
  where m.subject_id = $1::uuid
    and m.thread_id = $2::uuid
),
tail as materialized (
  select * from all_messages order by "sequenceNo" desc limit 12
)
select
  t.status as "threadStatus",
  t.participant_character_ids as "participantCharacterIds",
  t.active_content_release_id::text as "activeContentReleaseId",
  t.active_content_bundle_id::text as "activeContentBundleId",
  t.content_revision::text as "contentRevision",
  (select count(*)::text from all_messages) as "messageCount",
  (select count(*)::text from all_messages m
   where m."redacted"
      or m."bodyText" is null
      or m."senderType" not in ('user', 'character')
      or (m."senderType" = 'character'
          and (m."characterId" is distinct from $3::text))
      or (m."senderType" = 'user'
          and m."characterId" is not null)
  ) as "ineligibleMessageCount",
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'messageId', m."messageId",
      'sequenceNo', m."sequenceNo",
      'senderType', m."senderType",
      'characterId', m."characterId",
      'bodyText', m."bodyText",
      'redacted', m."redacted"
    ) order by m."sequenceNo" asc)
    from tail m
  ), '[]'::jsonb) as "tailRows"
from authorized_thread t
`.trim();

export class PostgresCharacterThreadSnapshotShadowHoldV1 extends Error {
  readonly code = 'CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE' as const;
  constructor() {
    super('CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE');
    this.name = 'PostgresCharacterThreadSnapshotShadowHoldV1';
  }
}

type SnapshotRowV1 = Readonly<{
  threadStatus: unknown;
  participantCharacterIds: unknown;
  activeContentReleaseId: unknown;
  activeContentBundleId: unknown;
  contentRevision: unknown;
  messageCount: unknown;
  ineligibleMessageCount: unknown;
  tailRows: unknown;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const fail = (): never => { throw new PostgresCharacterThreadSnapshotShadowHoldV1(); };
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 &&
  value.length <= 256 && value.trim() === value;

function boundedCount(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) fail();
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) fail();
  return count;
}

function validMessages(
  messages: readonly CharacterDialogueMessageShadowV1[],
): boolean {
  return Array.isArray(messages) && messages.length >= 3 &&
    messages.length <= 12 &&
    messages[0]?.role === 'user' &&
    messages[messages.length - 1]?.role === 'user' &&
    messages.slice(0, -1).some((message) => message.role === 'assistant') &&
    new Set(messages.map((message) => message.messageId)).size === messages.length &&
    messages.every((message) =>
      validId(message.messageId) &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.text === 'string' &&
      message.text.trim().length > 0 && message.text.length <= 8000);
}

export interface CharacterThreadVerifiedContentBindingShadowV1 {
  readonly activeContentReleaseId: string;
  readonly activeContentBundleId: string;
  readonly contentRevision: number;
}
export interface PostgresCharacterThreadSnapshotPortShadowV1
  extends CharacterThreadSnapshotShadowPortV1 {
  readVerifiedContentBinding(): CharacterThreadVerifiedContentBindingShadowV1;
}

function validatedTail(input: Readonly<{
  row: SnapshotRowV1;
  expectedContentBundleId: string;
  characterId: string;
  currentUserMessageId: string;
  expected: readonly CharacterDialogueMessageShadowV1[];
}>): Readonly<{ messageCount: number; contentBinding: CharacterThreadVerifiedContentBindingShadowV1 }> {
  const { row, expectedContentBundleId, characterId, currentUserMessageId, expected } = input;
  if (
    row.threadStatus !== 'active' ||
    !Array.isArray(row.participantCharacterIds) ||
    row.participantCharacterIds.length !== 1 ||
    row.participantCharacterIds[0] !== characterId ||
    boundedCount(row.ineligibleMessageCount) !== 0
  ) fail();
  if (!validId(row.activeContentReleaseId) ||
      !validId(row.activeContentBundleId) ||
      row.activeContentBundleId !== expectedContentBundleId ||
      typeof row.contentRevision !== 'string') fail();
  const contentRevision = boundedCount(row.contentRevision);
  const contentBinding = Object.freeze({
    activeContentReleaseId: row.activeContentReleaseId,
    activeContentBundleId: row.activeContentBundleId,
    contentRevision,
  }) as CharacterThreadVerifiedContentBindingShadowV1;
  const count = boundedCount(row.messageCount);
  const tailRows = row.tailRows;
  if (count < expected.length || !Array.isArray(tailRows) ||
      (tailRows as readonly unknown[]).length !== Math.min(count, 12)) fail();
  const checkedTail = tailRows as readonly unknown[];

  let sequence = 0;
  const ids = new Set<string>();
  for (const raw of checkedTail) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
    const message = raw as Record<string, unknown>;
    if (Object.keys(message).length !== 6 ||
        !validId(message.messageId) ||
        !Number.isSafeInteger(message.sequenceNo) ||
        (message.sequenceNo as number) <= sequence ||
        ids.has(message.messageId) ||
        message.redacted !== false ||
        typeof message.bodyText !== 'string' ||
        message.bodyText.trim().length === 0 ||
        (message.senderType !== 'user' && message.senderType !== 'character') ||
        (message.senderType === 'user' && message.characterId !== null) ||
        (message.senderType === 'character' &&
          message.characterId !== characterId)) fail();
    sequence = message.sequenceNo as number;
    ids.add(message.messageId as string);
  }
  const last = checkedTail[checkedTail.length - 1] as Record<string, unknown>;
  if (last.messageId !== currentUserMessageId || last.senderType !== 'user') fail();

  // Verify exact DB-owned text, identity, sender and order. Matching IDs alone
  // would allow a caller to replace previous lines in the generated context.
  const suffix = checkedTail.slice(-expected.length) as Record<string, unknown>[];
  for (let index = 0; index < expected.length; index++) {
    const stored = suffix[index]!;
    const supplied = expected[index]!;
    if (
      stored.messageId !== supplied.messageId ||
      stored.senderType !== (supplied.role === 'assistant' ? 'character' : 'user') ||
      stored.bodyText !== supplied.text
    ) fail();
  }
  return Object.freeze({ messageCount: count, contentBinding });
}

/**
 * Server-side, read-only research port. A trusted caller supplies the existing
 * verified subject execution scope and governed recent context. No production
 * route uses this function; the returned evidence is a one-statement snapshot,
 * NOT a lock or permission for a model invocation or HTTP reveal.
 */
export function createPostgresCharacterThreadSnapshotShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  threadId: string;
  characterId: string;
  recentConversation: readonly CharacterDialogueMessageShadowV1[];
  expectedContentBundleId: string;
}>): PostgresCharacterThreadSnapshotPortShadowV1 {
  const subjectId = input.scope?.resolvedSubject?.subjectId;
  const client = input.scope?.client;
  if (!UUID.test(subjectId ?? '') || !UUID.test(input.threadId) ||
      !validId(input.characterId) ||
      !validId(input.expectedContentBundleId) ||
      !validMessages(input.recentConversation) ||
      !client || typeof client.query !== 'function' ||
      !['member', 'guest'].includes(input.scope.resolvedSubject.subjectKind)) fail();

  const { characterId, threadId, expectedContentBundleId } = input;
  let verifiedContentBinding: CharacterThreadVerifiedContentBindingShadowV1 | null = null;
  const expected = Object.freeze(input.recentConversation.map(
    (message) => Object.freeze({ ...message }),
  ));
  return Object.freeze({
    characterId,
    subjectId: subjectId!,
    threadId,
    readVerifiedContentBinding() {
      const binding = verifiedContentBinding;
      if (binding === null) return fail();
      return binding;
    },
    async readThreadSnapshot(request: Readonly<{
      characterId: string;
      subjectId: string;
      threadId: string;
      currentUserMessageId: string;
    }>): Promise<unknown> {
      verifiedContentBinding = null;
      if (!request || request.characterId !== characterId ||
          request.subjectId !== subjectId || request.threadId !== threadId ||
          !UUID.test(request.currentUserMessageId) ||
          request.currentUserMessageId !== expected[expected.length - 1]?.messageId) fail();
      let rows: readonly SnapshotRowV1[] = [];
      try {
        const result = await client.query<SnapshotRowV1>(
          POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1,
          [subjectId, threadId, characterId],
        );
        rows = result.rows;
      } catch {
        fail();
      }
      if (rows.length !== 1 || !rows[0]) fail();
      const { messageCount, contentBinding } = validatedTail({
        row: rows[0]!, expectedContentBundleId, characterId,
        currentUserMessageId: request.currentUserMessageId,
        expected,
      });
      verifiedContentBinding = contentBinding;
      return Object.freeze({
        schemaVersion: CHARACTER_THREAD_SNAPSHOT_SHADOW_VERSION_V1,
        characterId,
        subjectId,
        threadId,
        currentUserMessageId: request.currentUserMessageId,
        messageCount,
        latestSenderType: 'user' as const,
        tailMessageRefs: Object.freeze(expected.map((message) => message.messageId)),
        complete: true as const,
      });
    },
  });
}
