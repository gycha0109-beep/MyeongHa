import {
  BirthProfileCreateAuthorityPortErrorV1,
  type BirthProfileCreateAuthorityPortV1,
  type BirthProfileCreateAuthorityRowV1,
} from './birth-profile-create-command.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const POSTGRES_BIRTH_PROFILE_CREATE_AUTHORITY_BINDING_V1 =
  'public.cmd_create_birth_profile_runtime_v1' as const;

type BirthProfileCreateQueryRowV1 = Readonly<{
  birthProfileId: unknown;
  revisionId: unknown;
  revisionNo: unknown;
}>;

const CREATE_SELF_BIRTH_PROFILE_SQL = `
select
  birth_profile_id::text as "birthProfileId",
  revision_id::text as "revisionId",
  revision_no as "revisionNo"
from public.cmd_create_birth_profile_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text,
  $5::text,
  $6::date,
  $7::time,
  $8::boolean,
  $9::boolean,
  $10::text,
  $11::text
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

function requireTrustedString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Birth Profile create PostgreSQL authority ${name} is invalid.`);
  }
  return value;
}

function requireRevisionNo(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Birth Profile create PostgreSQL authority revision number is invalid.');
  }
  return value;
}

function mapRows(
  rows: readonly BirthProfileCreateQueryRowV1[],
): readonly BirthProfileCreateAuthorityRowV1[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        birthProfileId: requireTrustedString('birth profile id', row.birthProfileId),
        revisionId: requireTrustedString('revision id', row.revisionId),
        revisionNo: requireRevisionNo(row.revisionNo),
      }),
    ),
  );
}

function mapPostgresError(error: unknown): never {
  const constraint = postgresConstraint(error);

  if (constraint === 'cmd_birth_profile_create_subject_not_found') {
    throw new BirthProfileCreateAuthorityPortErrorV1(
      'SUBJECT_NOT_FOUND',
      'Birth Profile create subject was not found.',
    );
  }
  if (constraint === 'cmd_birth_profile_create_subject_not_canonical') {
    throw new BirthProfileCreateAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'Birth Profile create subject is not current and canonical.',
    );
  }
  if (constraint === 'cmd_birth_profile_create_active_self_exists') {
    throw new BirthProfileCreateAuthorityPortErrorV1(
      'ACTIVE_SELF_EXISTS',
      'An active self Birth Profile already exists.',
    );
  }
  if (
    constraint === 'birth_profile_create_runtime_input_hash_format' ||
    constraint === 'cmd_birth_profile_create_input_hash_required'
  ) {
    throw new BirthProfileCreateAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Birth Profile create input fingerprint was rejected.',
    );
  }
  if (constraint === 'cmd_birth_profile_create_ids_required') {
    throw new BirthProfileCreateAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'Birth Profile create server-owned identity was rejected.',
    );
  }

  const code = postgresCode(error);
  if (code === '22007' || code === '22008') {
    throw new BirthProfileCreateAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Birth Profile date or time input was rejected.',
    );
  }
  if (code === '23505') {
    throw new BirthProfileCreateAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'Birth Profile create server-owned identity conflicted with existing data.',
    );
  }

  throw error;
}

class PostgresBirthProfileCreateAuthorityPortV1
  implements BirthProfileCreateAuthorityPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async createSelfBirthProfile(
    input: Parameters<BirthProfileCreateAuthorityPortV1['createSelfBirthProfile']>[0],
  ): Promise<readonly BirthProfileCreateAuthorityRowV1[]> {
    try {
      const result = await this.client.query<BirthProfileCreateQueryRowV1>(
        CREATE_SELF_BIRTH_PROFILE_SQL,
        [
          input.subjectId,
          input.birthProfileId,
          input.revisionId,
          input.label,
          input.calendarType,
          input.birthDate,
          input.birthTime,
          input.timeKnown,
          input.isLeapMonth,
          input.sex,
          input.inputHash,
        ],
      );
      return mapRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresBirthProfileCreateAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): BirthProfileCreateAuthorityPortV1 {
  return new PostgresBirthProfileCreateAuthorityPortV1(client);
}
