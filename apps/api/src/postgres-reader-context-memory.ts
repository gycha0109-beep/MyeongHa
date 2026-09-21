import {
  MemoryItemsReadAuthorityPortErrorV1,
  type MemoryItemCurrentAuthorityRowV1,
  type MemoryItemsReadAuthorityPortV1,
} from './memory-items-read.js';
import {
  MemoryGrantsReadAuthorityPortErrorV1,
  type MemoryGrantCurrentAuthorityRowV1,
  type MemoryGrantsReadAuthorityPortV1,
} from './memory-grants-read.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type MemoryItemQueryRowV1 = Readonly<{
  memoryItemId: unknown;
  memoryType: unknown;
  schemaVersion: unknown;
  contentJsonb: unknown;
  createdByCharacterId: unknown;
  createdAt: unknown;
}>;

type MemoryGrantQueryRowV1 = Readonly<{
  grantId: unknown;
  characterId: unknown;
  grantReason: unknown;
  grantedAt: unknown;
}>;

const READ_MEMORY_ITEMS_SQL = `
select
  memory_item_id::text as "memoryItemId",
  memory_type as "memoryType",
  schema_version as "schemaVersion",
  content_jsonb as "contentJsonb",
  created_by_character_id as "createdByCharacterId",
  created_at::text as "createdAt"
from public.qry_memory_items_v1($1::uuid)
`.trim();

const READ_MEMORY_GRANTS_SQL = `
select
  grant_id::text as "grantId",
  character_id as "characterId",
  grant_reason as "grantReason",
  granted_at::text as "grantedAt"
from public.qry_memory_active_grants_v1(
  $1::uuid,
  $2::uuid
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reader Memory PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireString(name, value);
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Reader Memory PostgreSQL ${name} is invalid.`);
  }
  return stored;
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapMemoryItemsError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_memory_items_subject_required':
      throw new MemoryItemsReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Reader Memory subject input was rejected.',
      );
    case 'qry_memory_items_subject_ineligible':
      throw new MemoryItemsReadAuthorityPortErrorV1(
        'SUBJECT_INELIGIBLE',
        'Reader Memory subject is unavailable.',
      );
    default:
      throw error;
  }
}

function mapMemoryGrantsError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_memory_active_grants_subject_required':
    case 'qry_memory_active_grants_memory_required':
      throw new MemoryGrantsReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Reader Memory grant input was rejected.',
      );
    case 'qry_memory_active_grants_subject_ineligible':
      throw new MemoryGrantsReadAuthorityPortErrorV1(
        'SUBJECT_INELIGIBLE',
        'Reader Memory grant subject is unavailable.',
      );
    case 'qry_memory_active_grants_memory_unavailable':
      throw new MemoryGrantsReadAuthorityPortErrorV1(
        'MEMORY_UNAVAILABLE',
        'Reader Memory grant is unavailable.',
      );
    default:
      throw error;
  }
}

class PostgresReaderContextMemoryItemsAuthorityPortV1
implements MemoryItemsReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readCurrentItems(
    input: Parameters<MemoryItemsReadAuthorityPortV1['readCurrentItems']>[0],
  ): Promise<readonly MemoryItemCurrentAuthorityRowV1[]> {
    try {
      const result = await this.client.query<MemoryItemQueryRowV1>(
        READ_MEMORY_ITEMS_SQL,
        [input.subjectId],
      );
      return Object.freeze(result.rows.map((row) => Object.freeze({
        memoryItemId: requireString('Memory Item id', row.memoryItemId),
        memoryType: requireString('Memory type', row.memoryType),
        schemaVersion: requireString('Memory schema version', row.schemaVersion),
        contentJsonb: row.contentJsonb,
        createdByCharacterId: requireNullableString(
          'Memory creator Character id',
          row.createdByCharacterId,
        ),
        createdAt: requireTimestamp('Memory created timestamp', row.createdAt),
      })));
    } catch (error) {
      return mapMemoryItemsError(error);
    }
  }
}

class PostgresReaderContextMemoryGrantsAuthorityPortV1
implements MemoryGrantsReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readActiveGrants(
    input: Parameters<MemoryGrantsReadAuthorityPortV1['readActiveGrants']>[0],
  ): Promise<readonly MemoryGrantCurrentAuthorityRowV1[]> {
    try {
      const result = await this.client.query<MemoryGrantQueryRowV1>(
        READ_MEMORY_GRANTS_SQL,
        [input.subjectId, input.memoryItemId],
      );
      return Object.freeze(result.rows.map((row) => Object.freeze({
        grantId: requireString('Memory grant id', row.grantId),
        characterId: requireString('Memory grant Character id', row.characterId),
        grantReason: requireString('Memory grant reason', row.grantReason),
        grantedAt: requireTimestamp('Memory grant timestamp', row.grantedAt),
      })));
    } catch (error) {
      return mapMemoryGrantsError(error);
    }
  }
}

export function createPostgresReaderContextMemoryItemsAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): MemoryItemsReadAuthorityPortV1 {
  return new PostgresReaderContextMemoryItemsAuthorityPortV1(client);
}

export function createPostgresReaderContextMemoryGrantsAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): MemoryGrantsReadAuthorityPortV1 {
  return new PostgresReaderContextMemoryGrantsAuthorityPortV1(client);
}
