import {
  ChatThreadRuntimeBindingReadAuthorityPortErrorV1,
  type ChatThreadRuntimeBindingAuthorityRowV1,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type ThreadBindingQueryRowV1 = Readonly<{
  threadId: unknown;
  status: unknown;
  activeContentReleaseId: unknown;
  activeContentBundleId: unknown;
  contentRevision: unknown;
  participantCharacterIds: unknown;
}>;

const READ_THREAD_BINDING_SQL = `
select
  thread_id::text as "threadId",
  status,
  active_content_release_id::text as "activeContentReleaseId",
  active_content_bundle_id::text as "activeContentBundleId",
  content_revision as "contentRevision",
  participant_character_ids as "participantCharacterIds"
from public.qry_chat_thread_runtime_binding_v1(
  $1::uuid,
  $2::uuid
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Chat thread runtime PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function requireRevision(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Chat thread runtime PostgreSQL content revision is invalid.');
  }
  return parsed;
}

function requireParticipants(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Chat thread runtime PostgreSQL participants are invalid.');
  }
  const participants = value.map((entry) =>
    requireString('participant Character id', entry),
  );
  if (new Set(participants).size !== participants.length) {
    throw new Error('Chat thread runtime PostgreSQL participants contain duplicates.');
  }
  return Object.freeze(participants);
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_chat_thread_runtime_binding_input_required':
      throw new ChatThreadRuntimeBindingReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Chat thread runtime binding input was rejected.',
      );
    case 'qry_chat_thread_runtime_binding_subject_ineligible':
      throw new ChatThreadRuntimeBindingReadAuthorityPortErrorV1(
        'SUBJECT_INELIGIBLE',
        'Chat thread runtime subject is unavailable.',
      );
    case 'qry_chat_thread_runtime_binding_thread_unavailable':
    case 'qry_chat_thread_runtime_binding_participants_unavailable':
      throw new ChatThreadRuntimeBindingReadAuthorityPortErrorV1(
        'THREAD_UNAVAILABLE',
        'Chat thread runtime binding is unavailable.',
      );
    default:
      throw error;
  }
}

function mapRows(
  rows: readonly ThreadBindingQueryRowV1[],
): readonly ChatThreadRuntimeBindingAuthorityRowV1[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        threadId: requireString('thread id', row.threadId),
        status: requireString('status', row.status),
        activeContentReleaseId:
          row.activeContentReleaseId === null
            ? null
            : requireString('content release id', row.activeContentReleaseId),
        activeContentBundleId:
          row.activeContentBundleId === null
            ? null
            : requireString('content bundle id', row.activeContentBundleId),
        contentRevision: requireRevision(row.contentRevision),
        participantCharacterIds: requireParticipants(row.participantCharacterIds),
      }),
    ),
  );
}

class PostgresChatThreadRuntimeBindingAuthorityPortV1
implements ChatThreadRuntimeBindingReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readRuntimeBinding(
    input: Parameters<ChatThreadRuntimeBindingReadAuthorityPortV1['readRuntimeBinding']>[0],
  ): Promise<readonly ChatThreadRuntimeBindingAuthorityRowV1[]> {
    try {
      const result = await this.client.query<ThreadBindingQueryRowV1>(
        READ_THREAD_BINDING_SQL,
        [input.subjectId, input.threadId],
      );
      return mapRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresChatThreadRuntimeBindingAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): ChatThreadRuntimeBindingReadAuthorityPortV1 {
  return new PostgresChatThreadRuntimeBindingAuthorityPortV1(client);
}
