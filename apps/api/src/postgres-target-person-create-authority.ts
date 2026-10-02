import {
  TargetPersonCreateAuthorityPortErrorV1,
  type TargetPersonCreateAuthorityPortV1,
  type TargetPersonCreateAuthorityRowV1,
} from './target-person-create-command.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const POSTGRES_TARGET_PERSON_CREATE_AUTHORITY_BINDING_V1 =
  'public.cmd_create_target_person_runtime_v1' as const;

type TargetPersonCreateQueryRowV1 = Readonly<{
  targetPersonId: unknown;
  birthProfileId: unknown;
  revisionId: unknown;
  revisionNo: unknown;
}>;

const CREATE_TARGET_PERSON_SQL = `
select
  target_person_id::text as "targetPersonId",
  birth_profile_id::text as "birthProfileId",
  revision_id::text as "revisionId",
  revision_no as "revisionNo"
from public.cmd_create_target_person_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text,
  $7::text,
  $8::date,
  $9::time,
  $10::boolean,
  $11::boolean,
  $12::text,
  $13::text
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
    throw new Error(`Target Person create PostgreSQL authority ${name} is invalid.`);
  }
  return value;
}

function requireRevisionNo(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Target Person create PostgreSQL authority revision number is invalid.');
  }
  return value;
}

function mapRows(
  rows: readonly TargetPersonCreateQueryRowV1[],
): readonly TargetPersonCreateAuthorityRowV1[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    targetPersonId: requireTrustedString('target person id', row.targetPersonId),
    birthProfileId: requireTrustedString('birth profile id', row.birthProfileId),
    revisionId: requireTrustedString('revision id', row.revisionId),
    revisionNo: requireRevisionNo(row.revisionNo),
  })));
}

function mapPostgresError(error: unknown): never {
  const constraint = postgresConstraint(error);

  if (constraint === 'cmd_target_person_create_subject_not_found') {
    throw new TargetPersonCreateAuthorityPortErrorV1(
      'SUBJECT_NOT_FOUND',
      'Target Person create subject was not found.',
    );
  }
  if (constraint === 'cmd_target_person_create_subject_not_canonical') {
    throw new TargetPersonCreateAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'Target Person create subject is not current and canonical.',
    );
  }
  if (
    constraint === 'target_person_create_runtime_input_hash_format' ||
    constraint === 'cmd_target_person_create_input_hash_required'
  ) {
    throw new TargetPersonCreateAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Target Person Birth input fingerprint was rejected.',
    );
  }
  if (constraint === 'cmd_target_person_create_ids_required') {
    throw new TargetPersonCreateAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'Target Person server-owned identity was rejected.',
    );
  }

  const code = postgresCode(error);
  if (code === '22007' || code === '22008' || code === '23514') {
    throw new TargetPersonCreateAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Target Person create input was rejected.',
    );
  }
  if (code === '23505') {
    throw new TargetPersonCreateAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'Target Person create server-owned identity conflicted with existing data.',
    );
  }

  throw error;
}

class PostgresTargetPersonCreateAuthorityPortV1
  implements TargetPersonCreateAuthorityPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async createTargetPerson(
    input: Parameters<TargetPersonCreateAuthorityPortV1['createTargetPerson']>[0],
  ): Promise<readonly TargetPersonCreateAuthorityRowV1[]> {
    try {
      const result = await this.client.query<TargetPersonCreateQueryRowV1>(
        CREATE_TARGET_PERSON_SQL,
        [
          input.subjectId,
          input.targetPersonId,
          input.birthProfileId,
          input.revisionId,
          input.displayLabel,
          input.relationshipLabel,
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

export function createPostgresTargetPersonCreateAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): TargetPersonCreateAuthorityPortV1 {
  return new PostgresTargetPersonCreateAuthorityPortV1(client);
}
