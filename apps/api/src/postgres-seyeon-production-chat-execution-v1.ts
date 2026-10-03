import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type {
  SeyeonProductionChatAttemptV1,
  SeyeonProductionChatCommitReceiptV1,
  SeyeonProductionChatPersistencePortV1,
  SeyeonProductionChatReceivedTurnV1,
} from './seyeon-production-chat-execution-v1.js';

type Row = Readonly<Record<string, unknown>>;

export const POSTGRES_SEYEON_CHAT_RECEIVE_RUNTIME_BINDING_V1 =
  'public.cmd_receive_seyeon_chat_turn_runtime_v1' as const;
export const POSTGRES_SEYEON_CHAT_ATTEMPT_RUNTIME_BINDING_V1 =
  'public.cmd_allocate_seyeon_chat_attempt_runtime_v1' as const;
export const POSTGRES_SEYEON_CHAT_CONTEXT_READY_RUNTIME_BINDING_V1 =
  'public.cmd_mark_seyeon_chat_context_ready_runtime_v1' as const;
export const POSTGRES_SEYEON_CHAT_GENERATED_RUNTIME_BINDING_V1 =
  'public.cmd_persist_seyeon_chat_generated_runtime_v1' as const;
export const POSTGRES_SEYEON_CHAT_VALIDATED_RUNTIME_BINDING_V1 =
  'public.cmd_persist_seyeon_chat_validated_runtime_v1' as const;
export const POSTGRES_SEYEON_CHAT_COMMIT_RUNTIME_BINDING_V1 =
  'public.cmd_commit_seyeon_chat_turn_runtime_v1' as const;

const RECEIVE_SQL = `
select
  turn_id::text as "turnId",
  user_message_id::text as "userMessageId",
  user_text as "userText",
  thread_character_id::text as "threadCharacterId",
  content_release_id::text as "contentReleaseId",
  content_bundle_id::text as "contentBundleId",
  replayed
from public.cmd_receive_seyeon_chat_turn_runtime_v1(
  $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
  $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::text
)
`.trim();

const ALLOCATE_SQL = `
select
  attempt_id::text as "attemptId",
  attempt_no as "attemptNo",
  replayed
from public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text
)
`.trim();

const CONTEXT_READY_SQL = `
select public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid
) as replayed
`.trim();

const GENERATED_SQL = `
select public.cmd_persist_seyeon_chat_generated_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
  $6::text,$7::text,$8::text,$9::text,$10::jsonb,
  $11::text,$12::text,$13::jsonb
) as replayed
`.trim();

const VALIDATED_SQL = `
select public.cmd_persist_seyeon_chat_validated_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,
  $5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::jsonb
) as replayed
`.trim();

const COMMIT_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  assistant_message_id::text as "assistantMessageId",
  sequence_no as "sequenceNo",
  committed_at::text as "committedAt",
  replayed
from public.cmd_commit_seyeon_chat_turn_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid
)
`.trim();

function text(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Se-yeon Production Chat PostgreSQL ' + name + ' is invalid.');
  }
  return value.trim();
}

function integer(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Se-yeon Production Chat PostgreSQL ' + name + ' is invalid.');
  }
  return parsed;
}

function bool(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Se-yeon Production Chat PostgreSQL ' + name + ' is invalid.');
  }
  return value;
}

function timestamp(name: string, value: unknown): string {
  const raw = text(name, value);
  const epoch = Date.parse(raw);
  if (!Number.isFinite(epoch)) {
    throw new Error('Se-yeon Production Chat PostgreSQL ' + name + ' is invalid.');
  }
  return new Date(epoch).toISOString();
}

function one(rows: readonly Row[], label: string): Row {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(
      'Se-yeon Production Chat PostgreSQL ' + label + ' must return exactly one row.',
    );
  }
  return rows[0];
}

class PostgresSeyeonProductionChatPersistencePortV1
implements SeyeonProductionChatPersistencePortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async receiveTurn(
    input: Parameters<SeyeonProductionChatPersistencePortV1['receiveTurn']>[0],
  ): Promise<SeyeonProductionChatReceivedTurnV1> {
    const result = await this.client.query<Row>(RECEIVE_SQL, [
      input.subjectId,
      input.threadId,
      input.clientTurnId,
      input.requestHash,
      input.requestContractVersion,
      input.requestSnapshot,
      input.resolvedContentReleaseId,
      input.resolvedContentBundleId,
      input.turnId,
      input.userMessageId,
      input.userText,
      input.userContentHash,
    ]);
    const row = one(result.rows, 'receive');
    return Object.freeze({
      turnId: text('turn id', row.turnId),
      userMessageId: text('user message id', row.userMessageId),
      userText: text('user text', row.userText),
      threadCharacterId: text('thread Character id', row.threadCharacterId),
      contentReleaseId: text('content release id', row.contentReleaseId),
      contentBundleId: text('content bundle id', row.contentBundleId),
      replayed: bool('receive replay flag', row.replayed),
    });
  }

  async allocateAttempt(
    input: Parameters<SeyeonProductionChatPersistencePortV1['allocateAttempt']>[0],
  ): Promise<SeyeonProductionChatAttemptV1> {
    const result = await this.client.query<Row>(ALLOCATE_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      input.plannerVersion,
    ]);
    const row = one(result.rows, 'attempt allocation');
    return Object.freeze({
      attemptId: text('attempt id', row.attemptId),
      attemptNo: integer('attempt number', row.attemptNo),
      replayed: bool('attempt replay flag', row.replayed),
    });
  }

  async markContextReady(
    input: Parameters<SeyeonProductionChatPersistencePortV1['markContextReady']>[0],
  ): Promise<void> {
    await this.client.query<Row>(CONTEXT_READY_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
    ]);
  }

  async persistGenerated(
    input: Parameters<SeyeonProductionChatPersistencePortV1['persistGenerated']>[0],
  ): Promise<void> {
    await this.client.query<Row>(GENERATED_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      input.threadCharacterId,
      input.aiExecutionLogId,
      input.providerKey,
      input.modelKey,
      input.rendererVersion,
      input.bodyText,
      input.messagePayload,
      input.messageSchemaVersion,
      input.contentHash,
      input.groundingRefs,
    ]);
  }

  async persistValidated(
    input: Parameters<SeyeonProductionChatPersistencePortV1['persistValidated']>[0],
  ): Promise<void> {
    await this.client.query<Row>(VALIDATED_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      input.aiExecutionLogId,
      input.providerKey,
      input.modelKey,
      input.outputGuardVersion,
      input.generatedContentHash,
      input.validationResult,
      input.groundingRefs,
    ]);
  }

  async commitTurn(
    input: Parameters<SeyeonProductionChatPersistencePortV1['commitTurn']>[0],
  ): Promise<SeyeonProductionChatCommitReceiptV1> {
    const result = await this.client.query<Row>(COMMIT_SQL, [
      input.subjectId,
      input.threadId,
      input.turnId,
      input.attemptId,
      input.assistantMessageId,
      input.outboxEventId,
    ]);
    const row = one(result.rows, 'commit');
    return Object.freeze({
      turnId: text('committed turn id', row.turnId),
      attemptId: text('committed attempt id', row.attemptId),
      assistantMessageId: text(
        'committed assistant message id',
        row.assistantMessageId,
      ),
      sequenceNo: integer('assistant message sequence', row.sequenceNo),
      committedAt: timestamp('commit timestamp', row.committedAt),
      replayed: bool('commit replay flag', row.replayed),
    });
  }
}

export function createPostgresSeyeonProductionChatPersistencePortV1(
  client: PostgresTransactionQueryV1,
): SeyeonProductionChatPersistencePortV1 {
  return new PostgresSeyeonProductionChatPersistencePortV1(client);
}
