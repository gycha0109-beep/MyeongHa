import type {
  SeyeonProductionRelationshipRuntimeStateV1,
} from '../../../packages/domain/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  SeyeonProductionRelationshipReadErrorV1,
  type SeyeonProductionRelationshipReadAuthorityPortV1,
} from './seyeon-production-relationship-read-v1.js';

export const POSTGRES_SEYEON_PRODUCTION_RELATIONSHIP_READ_BINDING_V1 =
  'public.qry_production_relationship_runtime_v1' as const;

type Row = Readonly<Record<string, unknown>>;

const READ_SQL = [
  'select',
  '  state_id::text as "stateId",',
  '  subject_id::text as "subjectId",',
  '  character_id as "characterId",',
  '  closeness, trust, friction,',
  '  attained_stage as "attainedStage",',
  '  current_candidate_stage as "currentCandidateStage",',
  '  current_condition as "currentCondition",',
  '  policy_version as "policyVersion",',
  '  policy_content_hash as "policyContentHash",',
  '  policy_state_schema_version as "policyStateSchemaVersion",',
  '  policy_state_jsonb as "policyStateJsonb",',
  '  revision::text as "revision",',
  '  last_interaction_at::text as "lastInteractionAt",',
  '  updated_at::text as "updatedAt"',
  'from public.qry_production_relationship_runtime_v1($1::uuid,$2::text)',
].join('\n');

function constraintOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function mapError(error: unknown): never {
  switch (constraintOf(error)) {
    case 'qry_production_relationship_runtime_identity_required':
      throw new SeyeonProductionRelationshipReadErrorV1(
        'Production relationship runtime identity was rejected.',
      );
    case 'qry_production_relationship_runtime_subject_ineligible':
      throw new SeyeonProductionRelationshipReadErrorV1(
        'Production relationship runtime Subject is unavailable.',
      );
    case 'qry_production_relationship_runtime_character_unavailable':
      throw new SeyeonProductionRelationshipReadErrorV1(
        'Se-yeon is unavailable to the Production relationship runtime.',
      );
    case 'qry_production_relationship_runtime_policy_mismatch':
      throw new SeyeonProductionRelationshipReadErrorV1(
        'Stored relationship projection is not valid Production V1 runtime state.',
      );
    default:
      throw error;
  }
}

function str(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      'PostgreSQL ' + name + ' is invalid.',
    );
  }
  return value.trim();
}

function int(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      'PostgreSQL ' + name + ' is invalid.',
    );
  }
  return parsed;
}

function instant(name: string, value: unknown): string {
  const raw = str(name, value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      'PostgreSQL ' + name + ' is invalid.',
    );
  }
  return new Date(parsed).toISOString();
}

function nullableInstant(name: string, value: unknown): string | null {
  return value === null ? null : instant(name, value);
}

function stage(value: unknown): SeyeonProductionRelationshipRuntimeStateV1['attainedStage'] {
  if (
    value === 'S0_FIRST_MEETING' ||
    value === 'S1_FAMILIAR' ||
    value === 'S2_REGULAR' ||
    value === 'S3_OPENED' ||
    value === 'S4_SPECIAL'
  ) return value;
  throw new SeyeonProductionRelationshipReadErrorV1(
    'PostgreSQL relationship stage is invalid.',
  );
}

function condition(
  value: unknown,
): SeyeonProductionRelationshipRuntimeStateV1['currentCondition'] {
  if (
    value === 'STABLE' ||
    value === 'OPEN_CONFLICT' ||
    value === 'RESOLVED_RECENTLY'
  ) return value;
  throw new SeyeonProductionRelationshipReadErrorV1(
    'PostgreSQL relationship condition is invalid.',
  );
}

class PostgresSeyeonProductionRelationshipReadAuthorityPortV1
  implements SeyeonProductionRelationshipReadAuthorityPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readCurrent(
    input: Parameters<SeyeonProductionRelationshipReadAuthorityPortV1['readCurrent']>[0],
  ): Promise<readonly SeyeonProductionRelationshipRuntimeStateV1[]> {
    try {
      const result = await this.client.query<Row>(READ_SQL, [
        input.subjectId,
        input.characterId,
      ]);
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            stateId: str('state id', row.stateId),
            subjectId: str('Subject id', row.subjectId),
            characterId: str('Character id', row.characterId) as 'seyeon',
            closeness: int('closeness', row.closeness),
            trust: int('trust', row.trust),
            friction: int('friction', row.friction),
            attainedStage: stage(row.attainedStage),
            currentCandidateStage: stage(row.currentCandidateStage),
            currentCondition: condition(row.currentCondition),
            policyVersion: str('policy version', row.policyVersion),
            policyContentHash: str('policy content hash', row.policyContentHash),
            policyStateSchemaVersion: str(
              'policy state schema version',
              row.policyStateSchemaVersion,
            ),
            policyStateJsonb: row.policyStateJsonb,
            revision: int('revision', row.revision),
            lastInteractionAt: nullableInstant(
              'last interaction timestamp',
              row.lastInteractionAt,
            ),
            updatedAt: instant('updated timestamp', row.updatedAt),
          }),
        ),
      );
    } catch (error) {
      return mapError(error);
    }
  }
}

export function createPostgresSeyeonProductionRelationshipReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): SeyeonProductionRelationshipReadAuthorityPortV1 {
  return new PostgresSeyeonProductionRelationshipReadAuthorityPortV1(client);
}
