import {
  CharacterRelationshipReadAuthorityPortErrorV1,
  type CharacterRelationshipCurrentAuthorityRowV1,
  type CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type RelationshipQueryRowV1 = Readonly<{
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
  last_interaction_at::text as "lastInteractionAt",
  updated_at::text as "updatedAt"
from public.qry_character_relationship_v1(
  $1::uuid,
  $2::text
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reader relationship PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function requireInteger(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Reader relationship PostgreSQL ${name} is invalid.`);
  }
  return parsed;
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Reader relationship PostgreSQL ${name} is invalid.`);
  }
  return stored;
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  return value === null ? null : requireTimestamp(name, value);
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_character_relationship_identity_required':
      throw new CharacterRelationshipReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Reader relationship identity input was rejected.',
      );
    case 'qry_character_relationship_subject_ineligible':
      throw new CharacterRelationshipReadAuthorityPortErrorV1(
        'SUBJECT_INELIGIBLE',
        'Reader relationship subject is unavailable.',
      );
    case 'qry_character_relationship_character_not_found':
      throw new CharacterRelationshipReadAuthorityPortErrorV1(
        'CHARACTER_UNAVAILABLE',
        'Reader relationship Character is unavailable.',
      );
    default:
      throw error;
  }
}

class PostgresCharacterRelationshipReadAuthorityPortV1
implements CharacterRelationshipReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readCurrentRelationship(
    input: Parameters<CharacterRelationshipReadAuthorityPortV1['readCurrentRelationship']>[0],
  ): Promise<readonly CharacterRelationshipCurrentAuthorityRowV1[]> {
    try {
      const result = await this.client.query<RelationshipQueryRowV1>(
        READ_RELATIONSHIP_SQL,
        [input.subjectId, input.characterId],
      );
      return Object.freeze(result.rows.map((row) => Object.freeze({
        stateId: requireString('state id', row.stateId),
        characterId: requireString('Character id', row.characterId),
        closeness: requireInteger('closeness', row.closeness),
        trust: requireInteger('trust', row.trust),
        friction: requireInteger('friction', row.friction),
        relationshipStage: requireString('relationship stage', row.relationshipStage),
        policyVersion: requireString('policy version', row.policyVersion),
        revision: requireInteger('revision', row.revision),
        lastInteractionAt: requireNullableTimestamp(
          'last interaction timestamp',
          row.lastInteractionAt,
        ),
        updatedAt: requireTimestamp('updated timestamp', row.updatedAt),
      })));
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresCharacterRelationshipReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): CharacterRelationshipReadAuthorityPortV1 {
  return new PostgresCharacterRelationshipReadAuthorityPortV1(client);
}
