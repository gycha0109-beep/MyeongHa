import {
  ReadingCreateAuthorityPortErrorV1,
  type ReadingCreateAuthorityPortV1,
  type ReadingCreateAuthorityRowV1,
} from './reading-create-command.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const POSTGRES_READING_CREATE_AUTHORITY_BINDING_V1 =
  'public.cmd_create_reading_session_runtime_v1' as const;

type ReadingCreateQueryRowV1 = Readonly<{
  readingSessionId: unknown;
  readingId: unknown;
  attemptNo: unknown;
  sourceBirthRevisionId: unknown;
  targetBirthRevisionId: unknown;
  domainCapabilityVersion: unknown;
  replayed: unknown;
}>;

const CREATE_READING_SESSION_SQL = `
select
  reading_session_id::text as "readingSessionId",
  reading_id::text as "readingId",
  attempt_no as "attemptNo",
  source_birth_revision_id::text as "sourceBirthRevisionId",
  target_birth_revision_id::text as "targetBirthRevisionId",
  domain_capability_version as "domainCapabilityVersion",
  replayed
from public.cmd_create_reading_session_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text,
  $5::text,
  $6::text,
  $7::jsonb,
  $8::text,
  $9::uuid,
  $10::uuid,
  $11::uuid,
  $12::uuid,
  $13::text,
  $14::uuid
)
`.trim();

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function postgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reading create PostgreSQL authority ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  return value === null ? null : requireString(name, value);
}

function requireAttemptNo(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Reading create PostgreSQL authority attempt number is invalid.');
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Reading create PostgreSQL authority ${name} is invalid.`);
  }
  return value;
}

function mapRows(rows: readonly ReadingCreateQueryRowV1[]): readonly ReadingCreateAuthorityRowV1[] {
  return Object.freeze(
    rows.map((row) => Object.freeze({
      readingSessionId: requireString('reading session id', row.readingSessionId),
      readingId: requireString('reading id', row.readingId),
      attemptNo: requireAttemptNo(row.attemptNo),
      sourceBirthRevisionId: requireString('source Birth revision id', row.sourceBirthRevisionId),
      targetBirthRevisionId: requireNullableString('target Birth revision id', row.targetBirthRevisionId),
      domainCapabilityVersion: requireString('domain capability version', row.domainCapabilityVersion),
      replayed: requireBoolean('replay marker', row.replayed),
    })),
  );
}

function mapPostgresError(error: unknown): never {
  const constraint = postgresConstraint(error);

  if (constraint === 'cmd_reading_create_source_profile_not_found') {
    throw new ReadingCreateAuthorityPortErrorV1(
      'SOURCE_PROFILE_NOT_FOUND',
      'Reading source Birth Profile was not found.',
    );
  }
  if (constraint === 'cmd_reading_create_source_profile_not_ready') {
    throw new ReadingCreateAuthorityPortErrorV1(
      'SOURCE_PROFILE_NOT_READY',
      'Reading source Birth Profile has no current revision.',
    );
  }
  if (constraint === 'ct_reading_session_profile_cardinality') {
    throw new ReadingCreateAuthorityPortErrorV1(
      'PROFILE_CARDINALITY_INVALID',
      'Reading Birth Profile cardinality was rejected.',
    );
  }
  if (constraint === 'ct_reading_session_domain_available') {
    throw new ReadingCreateAuthorityPortErrorV1(
      'DOMAIN_UNAVAILABLE',
      'Reading Saju domain is unavailable.',
    );
  }
  if (constraint === 'cmd_reading_create_idempotency_conflict') {
    throw new ReadingCreateAuthorityPortErrorV1(
      'IDEMPOTENCY_CONFLICT',
      'Reading idempotency key conflicts with an existing request.',
    );
  }
  if (constraint === 'cmd_reading_create_ids_required') {
    throw new ReadingCreateAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'Reading server-owned identity was rejected.',
    );
  }
  if (
    constraint === 'cmd_reading_create_idempotency_required' ||
    constraint === 'cmd_reading_create_request_hash_required' ||
    constraint === 'cmd_reading_create_request_snapshot_required' ||
    constraint === 'cmd_reading_create_domain_source_required' ||
    constraint === 'cmd_reading_create_character_pair' ||
    constraint === 'cmd_reading_create_participation_shape'
  ) {
    throw new ReadingCreateAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Reading create input was rejected.',
    );
  }

  if (postgresCode(error) === '23505') {
    throw new ReadingCreateAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'Reading server-owned identity conflicted with existing data.',
    );
  }

  throw error;
}

class PostgresReadingCreateAuthorityPortV1 implements ReadingCreateAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async createReadingSession(
    input: Parameters<ReadingCreateAuthorityPortV1['createReadingSession']>[0],
  ): Promise<readonly ReadingCreateAuthorityRowV1[]> {
    try {
      const result = await this.client.query<ReadingCreateQueryRowV1>(
        CREATE_READING_SESSION_SQL,
        [
          input.subjectId,
          input.readingSessionId,
          input.readingId,
          input.requestIdempotencyKey,
          input.requestHash,
          input.requestContractVersion,
          JSON.stringify(input.requestSnapshotJsonb),
          input.sajuDomain,
          input.sourceBirthProfileId,
          input.targetBirthProfileId,
          input.sourceTurnId,
          input.requestedThreadCharacterId,
          input.requestedCharacterId,
          input.requestedCharacterContentBundleId,
        ],
      );
      return mapRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresReadingCreateAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): ReadingCreateAuthorityPortV1 {
  return new PostgresReadingCreateAuthorityPortV1(client);
}
