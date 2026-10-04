import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  SeyeonProductionContextReadAuthorityPortErrorV1,
  type SeyeonProductionContextReadAuthorityPortV1,
  type SeyeonProductionPersonalRecordAuthorityRowV1,
  type SeyeonProductionRecentMessageAuthorityRowV1,
} from './seyeon-production-context-read-v1.js';
import type {
  ProductionRelationshipHistoryRecordV1,
} from '../../../packages/domain/src/relationship-policy-reference-replay-v1.js';

type Row = Readonly<Record<string, unknown>>;

export const POSTGRES_SEYEON_PRODUCTION_PERSONAL_RECORD_CONTEXT_BINDING_V1 =
  'public.qry_seyeon_production_personal_record_context_v1' as const;
export const POSTGRES_PRODUCTION_RELATIONSHIP_HISTORY_RUNTIME_BINDING_V1 =
  'public.qry_production_relationship_history_runtime_v1' as const;
export const POSTGRES_SEYEON_PRODUCTION_RECENT_MESSAGES_BINDING_V1 =
  'public.qry_reader_context_recent_messages_v1' as const;

const PERSONAL_SQL = [
  'select',
  ' record_kind as "recordKind", record_id::text as "recordId",',
  ' record_type as "recordType", schema_version as "schemaVersion",',
  ' record_payload_jsonb as "payload", grant_id::text as "grantId",',
  ' grant_reason as "grantReason", granted_at::text as "grantedAt"',
  'from public.qry_seyeon_production_personal_record_context_v1($1::uuid,$2::text)',
].join('\n');

const HISTORY_SQL = [
  'select history_records_jsonb as "historyRecordsJsonb"',
  'from public.qry_production_relationship_history_runtime_v1($1::uuid,$2::text,$3::bigint)',
].join('\n');

const RECENT_SQL = [
  'select message_id::text as "messageId", sequence_no::text as "sequenceNo",',
  ' sender_type as "senderType", character_id as "characterId",',
  ' body_text as "text", created_at::text as "createdAt"',
  'from public.qry_reader_context_recent_messages_v1($1::uuid,$2::uuid,$3::integer)',
].join('\n');

function constraintOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function mapPostgresError(error: unknown): never {
  switch (constraintOf(error)) {
    case 'qry_seyeon_production_personal_record_identity_required':
    case 'qry_production_relationship_history_runtime_input_invalid':
    case 'qry_reader_context_recent_messages_input_required':
      throw new SeyeonProductionContextReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Se-yeon Production context input was rejected.',
      );
    case 'myeongha_subject_context_mismatch':
    case 'myeongha_subject_context_required':
    case 'qry_seyeon_production_personal_record_subject_ineligible':
    case 'qry_production_relationship_history_runtime_subject_ineligible':
      throw new SeyeonProductionContextReadAuthorityPortErrorV1(
        'SUBJECT_INELIGIBLE',
        'Se-yeon Production context Subject is unavailable.',
      );
    case 'qry_reader_context_recent_messages_thread_unavailable':
      throw new SeyeonProductionContextReadAuthorityPortErrorV1(
        'THREAD_UNAVAILABLE',
        'Se-yeon Production context thread is unavailable.',
      );
    case 'qry_production_relationship_history_runtime_revision_mismatch':
      throw new SeyeonProductionContextReadAuthorityPortErrorV1(
        'RELATIONSHIP_REVISION_MISMATCH',
        'Se-yeon Production relationship history revision is unavailable.',
      );
    default:
      throw error;
  }
}

function str(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Se-yeon Production context PostgreSQL ' + name + ' is invalid.');
  }
  return value.trim();
}

function nullableString(name: string, value: unknown): string | null {
  return value === null ? null : str(name, value);
}

function int(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Se-yeon Production context PostgreSQL ' + name + ' is invalid.');
  }
  return parsed;
}

function timestamp(name: string, value: unknown): string {
  const raw = str(name, value);
  if (!Number.isFinite(Date.parse(raw))) {
    throw new Error('Se-yeon Production context PostgreSQL ' + name + ' is invalid.');
  }
  return new Date(Date.parse(raw)).toISOString();
}

function recordKind(
  value: unknown,
): SeyeonProductionPersonalRecordAuthorityRowV1['recordKind'] {
  if (value === 'life_fact' || value === 'memory') return value;
  throw new Error('Se-yeon Production personal record kind is invalid.');
}

function history(value: unknown): readonly ProductionRelationshipHistoryRecordV1[] {
  if (!Array.isArray(value)) {
    throw new Error('Se-yeon Production relationship history is invalid.');
  }
  for (const record of value) {
    const action =
      typeof record === 'object' && record !== null && 'action' in record
        ? (record as { action?: unknown }).action
        : null;
    if (action !== 'record' && action !== 'correct' && action !== 'retract') {
      throw new Error('Se-yeon Production relationship history action is invalid.');
    }
  }
  return Object.freeze([
    ...(value as ProductionRelationshipHistoryRecordV1[]),
  ]);
}

class PostgresSeyeonProductionContextReadAuthorityPortV1
implements SeyeonProductionContextReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readPersonalRecords(input: {
    readonly subjectId: string;
    readonly characterId: 'seyeon';
  }): Promise<readonly SeyeonProductionPersonalRecordAuthorityRowV1[]> {
    try {
      const result = await this.client.query<Row>(PERSONAL_SQL, [
        input.subjectId,
        input.characterId,
      ]);
      return Object.freeze(result.rows.map((row) => Object.freeze({
        recordKind: recordKind(row.recordKind),
        recordId: str('personal record id', row.recordId),
        recordType: str('personal record type', row.recordType),
        schemaVersion: str('personal record schema version', row.schemaVersion),
        payload: row.payload,
        grantId: str('personal record grant id', row.grantId),
        grantReason: str('personal record grant reason', row.grantReason),
        grantedAt: timestamp('personal record granted timestamp', row.grantedAt),
      })));
    } catch (error) {
      return mapPostgresError(error);
    }
  }

  async readRelationshipHistory(input: {
    readonly subjectId: string;
    readonly characterId: 'seyeon';
    readonly throughRevision: number;
  }): Promise<readonly ProductionRelationshipHistoryRecordV1[]> {
    try {
      const result = await this.client.query<Row>(HISTORY_SQL, [
        input.subjectId,
        input.characterId,
        input.throughRevision,
      ]);
      if (result.rows.length !== 1 || result.rows[0] === undefined) {
        throw new Error(
          'Se-yeon Production relationship history query must return exactly one row.',
        );
      }
      return history(result.rows[0].historyRecordsJsonb);
    } catch (error) {
      return mapPostgresError(error);
    }
  }

  async readRecentMessages(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly limit: number;
  }): Promise<readonly SeyeonProductionRecentMessageAuthorityRowV1[]> {
    try {
      const result = await this.client.query<Row>(RECENT_SQL, [
        input.subjectId,
        input.threadId,
        input.limit,
      ]);
      return Object.freeze(result.rows.map((row) => Object.freeze({
        messageId: str('recent message id', row.messageId),
        sequenceNo: int('recent message sequence', row.sequenceNo),
        senderType: str('recent message sender type', row.senderType),
        characterId: nullableString('recent message Character id', row.characterId),
        text: str('recent message text', row.text),
        createdAt: timestamp('recent message timestamp', row.createdAt),
      })));
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresSeyeonProductionContextReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): SeyeonProductionContextReadAuthorityPortV1 {
  return new PostgresSeyeonProductionContextReadAuthorityPortV1(client);
}
