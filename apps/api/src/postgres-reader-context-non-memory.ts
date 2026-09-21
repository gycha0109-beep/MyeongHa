import {
  ReaderContextNonMemoryReadAuthorityPortErrorV1,
  type ReaderContextNonMemoryReadAuthorityPortV1,
  type ReaderGrantedLifeFactAuthorityRowV1,
  type ReaderRecentMessageAuthorityRowV1,
  type ReaderRelationshipEventAuthorityRowV1,
} from './reader-context-non-memory-read.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type LifeFactQueryRowV1 = Readonly<{
  factId: unknown;
  factType: unknown;
  schemaVersion: unknown;
  value: unknown;
  grantId: unknown;
  granteeCharacterId: unknown;
}>;

type RelationshipEventQueryRowV1 = Readonly<{
  eventType: unknown;
  eventSchemaVersion: unknown;
  stateRevisionAfter: unknown;
  policyVersion: unknown;
  appliedAt: unknown;
}>;

type RecentMessageQueryRowV1 = Readonly<{
  messageId: unknown;
  sequenceNo: unknown;
  senderType: unknown;
  characterId: unknown;
  text: unknown;
  createdAt: unknown;
}>;

const READ_GRANTED_LIFE_FACTS_SQL = `
select
  fact_id::text as "factId",
  fact_type as "factType",
  schema_version as "schemaVersion",
  value_jsonb as "value",
  grant_id::text as "grantId",
  grantee_character_id as "granteeCharacterId"
from public.qry_reader_context_granted_life_facts_v1(
  $1::uuid,
  $2::text
)
`.trim();

const READ_RELATIONSHIP_EVENTS_SQL = `
select
  event_type as "eventType",
  event_schema_version as "eventSchemaVersion",
  state_revision_after as "stateRevisionAfter",
  policy_version as "policyVersion",
  applied_at::text as "appliedAt"
from public.qry_reader_context_relationship_events_v1(
  $1::uuid,
  $2::text,
  $3::bigint,
  $4::integer
)
`.trim();

const READ_RECENT_MESSAGES_SQL = `
select
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  sender_type as "senderType",
  character_id as "characterId",
  body_text as "text",
  created_at::text as "createdAt"
from public.qry_reader_context_recent_messages_v1(
  $1::uuid,
  $2::uuid,
  $3::integer
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reader non-Memory PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function requireNullableString(name: string, value: unknown): string | null {
  return value === null ? null : requireString(name, value);
}

function requireInteger(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Reader non-Memory PostgreSQL ${name} is invalid.`);
  }
  return parsed;
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Reader non-Memory PostgreSQL ${name} is invalid.`);
  }
  return stored;
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_reader_context_life_facts_input_required':
    case 'qry_reader_context_relationship_events_input_required':
    case 'qry_reader_context_recent_messages_input_required':
      throw new ReaderContextNonMemoryReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Reader non-Memory context input was rejected.',
      );
    case 'myeongha_subject_context_mismatch':
    case 'myeongha_subject_context_required':
      throw new ReaderContextNonMemoryReadAuthorityPortErrorV1(
        'SUBJECT_INELIGIBLE',
        'Reader non-Memory context subject is unavailable.',
      );
    case 'qry_reader_context_recent_messages_thread_unavailable':
      throw new ReaderContextNonMemoryReadAuthorityPortErrorV1(
        'THREAD_UNAVAILABLE',
        'Reader recent-message thread is unavailable.',
      );
    default:
      throw error;
  }
}

class PostgresReaderContextNonMemoryReadAuthorityPortV1
implements ReaderContextNonMemoryReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readGrantedLifeFacts(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): Promise<readonly ReaderGrantedLifeFactAuthorityRowV1[]> {
    try {
      const result = await this.client.query<LifeFactQueryRowV1>(
        READ_GRANTED_LIFE_FACTS_SQL,
        [input.subjectId, input.characterId],
      );
      return Object.freeze(result.rows.map((row) => Object.freeze({
        factId: requireString('Life Fact id', row.factId),
        factType: requireString('Life Fact type', row.factType),
        schemaVersion: requireString('Life Fact schema version', row.schemaVersion),
        value: row.value,
        grantId: requireString('Life Fact grant id', row.grantId),
        granteeCharacterId: requireString(
          'Life Fact grantee Character id',
          row.granteeCharacterId,
        ),
      })));
    } catch (error) {
      return mapPostgresError(error);
    }
  }

  async readRelationshipEvents(input: {
    readonly subjectId: string;
    readonly characterId: string;
    readonly beforeRevision: number;
    readonly limit: number;
  }): Promise<readonly ReaderRelationshipEventAuthorityRowV1[]> {
    try {
      const result = await this.client.query<RelationshipEventQueryRowV1>(
        READ_RELATIONSHIP_EVENTS_SQL,
        [
          input.subjectId,
          input.characterId,
          input.beforeRevision,
          input.limit,
        ],
      );
      return Object.freeze(result.rows.map((row) => Object.freeze({
        eventType: requireString('relationship event type', row.eventType),
        eventSchemaVersion: requireString(
          'relationship event schema version',
          row.eventSchemaVersion,
        ),
        stateRevisionAfter: requireInteger(
          'relationship event revision',
          row.stateRevisionAfter,
        ),
        policyVersion: requireString(
          'relationship event policy version',
          row.policyVersion,
        ),
        appliedAt: requireTimestamp(
          'relationship event applied timestamp',
          row.appliedAt,
        ),
      })));
    } catch (error) {
      return mapPostgresError(error);
    }
  }

  async readRecentMessages(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly limit: number;
  }): Promise<readonly ReaderRecentMessageAuthorityRowV1[]> {
    try {
      const result = await this.client.query<RecentMessageQueryRowV1>(
        READ_RECENT_MESSAGES_SQL,
        [input.subjectId, input.threadId, input.limit],
      );
      return Object.freeze(result.rows.map((row) => Object.freeze({
        messageId: requireString('message id', row.messageId),
        sequenceNo: requireInteger('message sequence', row.sequenceNo),
        senderType: requireString('message sender type', row.senderType),
        characterId: requireNullableString(
          'message Character id',
          row.characterId,
        ),
        text: requireString('message text', row.text),
        createdAt: requireTimestamp('message created timestamp', row.createdAt),
      })));
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresReaderContextNonMemoryReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): ReaderContextNonMemoryReadAuthorityPortV1 {
  return new PostgresReaderContextNonMemoryReadAuthorityPortV1(client);
}
