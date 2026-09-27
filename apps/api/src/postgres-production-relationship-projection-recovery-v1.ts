import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  ProductionRelationshipReliabilityErrorV1,
  type ProductionRelationshipReplayProjectionCommitRowV1,
} from './production-relationship-reliability-v1.js';
import type {
  ProductionRelationshipProjectionRebuildPortV1,
} from './production-relationship-projection-recovery-v1.js';

export const POSTGRES_RELATIONSHIP_PROJECTION_REBUILD_BINDING_V1 =
  'public.cmd_rebuild_relationship_projection_runtime_v1' as const;

type Row = Readonly<Record<string, unknown>>;

const REBUILD_SQL = [
  'select',
  '  state_id::text as "stateId",',
  '  revision::text as "revisionAfter",',
  '  closeness, trust, friction,',
  '  attained_stage as "attainedStage",',
  '  current_candidate_stage as "currentCandidateStage",',
  '  current_condition as "currentCondition",',
  '  policy_version as "policyVersion",',
  '  policy_content_hash as "policyContentHash",',
  '  last_interaction_at::text as "lastInteractionAt"',
  'from public.cmd_rebuild_relationship_projection_runtime_v1(',
  '  $1::uuid,$2::text,$3::bigint,$4::integer,$5::integer,$6::integer,',
  '  $7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::jsonb,',
  '  $14::text,$15::text',
  ')',
].join('\n');

function constraintOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : null;
}

function mapError(error: unknown): never {
  switch (constraintOf(error)) {
    case 'relationship_projection_rebuild_stale_revision':
    case 'relationship_projection_rebuild_update_race':
      throw new ProductionRelationshipReliabilityErrorV1(
        'STALE_RELATIONSHIP_REVISION',
        'Relationship projection rebuild revision changed.',
      );
    case 'relationship_projection_rebuild_input_invalid':
      throw new ProductionRelationshipReliabilityErrorV1(
        'INVALID_ADJUSTMENT',
        'Relationship projection rebuild input was rejected.',
      );
    default:
      break;
  }
  if (codeOf(error) === '40001') {
    throw new ProductionRelationshipReliabilityErrorV1(
      'STALE_RELATIONSHIP_REVISION',
      'Relationship projection rebuild serialization failed.',
    );
  }
  throw error;
}

function str(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Relationship rebuild PostgreSQL ' + name + ' is invalid.');
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
    throw new Error('Relationship rebuild PostgreSQL ' + name + ' is invalid.');
  }
  return parsed;
}

function stage(value: unknown): ProductionRelationshipReplayProjectionCommitRowV1['attainedStage'] {
  if (
    value === 'S0_FIRST_MEETING' ||
    value === 'S1_FAMILIAR' ||
    value === 'S2_REGULAR' ||
    value === 'S3_OPENED' ||
    value === 'S4_SPECIAL'
  ) return value;
  throw new Error('Relationship rebuild PostgreSQL stage is invalid.');
}

function condition(value: unknown): ProductionRelationshipReplayProjectionCommitRowV1['currentCondition'] {
  if (
    value === 'STABLE' ||
    value === 'OPEN_CONFLICT' ||
    value === 'RESOLVED_RECENTLY'
  ) return value;
  throw new Error('Relationship rebuild PostgreSQL condition is invalid.');
}

function timestampOrNull(value: unknown): string | null {
  if (value === null) return null;
  const raw = str('last interaction', value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error('Relationship rebuild PostgreSQL last interaction is invalid.');
  }
  return new Date(parsed).toISOString();
}

function rows(
  values: readonly Row[],
): readonly ProductionRelationshipReplayProjectionCommitRowV1[] {
  return Object.freeze(
    values.map((row) =>
      Object.freeze({
        stateId: str('state id', row.stateId),
        revisionAfter: int('revision', row.revisionAfter),
        closeness: int('closeness', row.closeness),
        trust: int('trust', row.trust),
        friction: int('friction', row.friction),
        attainedStage: stage(row.attainedStage),
        currentCandidateStage: stage(row.currentCandidateStage),
        currentCondition: condition(row.currentCondition),
        policyVersion: str('policy version', row.policyVersion),
        policyContentHash: str('policy hash', row.policyContentHash),
        lastInteractionAt: timestampOrNull(row.lastInteractionAt),
      }),
    ),
  );
}

class PostgresProductionRelationshipProjectionRebuildPortV1
  implements ProductionRelationshipProjectionRebuildPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async rebuildProjection(
    input: Parameters<ProductionRelationshipProjectionRebuildPortV1['rebuildProjection']>[0],
  ): Promise<readonly ProductionRelationshipReplayProjectionCommitRowV1[]> {
    try {
      const result = await this.client.query<Row>(REBUILD_SQL, [
        input.subjectId,
        input.characterId,
        input.expectedRevision,
        input.projection.scores.closeness,
        input.projection.scores.trust,
        input.projection.scores.friction,
        input.projection.attainedStage,
        input.projection.currentCandidateStage,
        input.projection.currentCondition,
        input.projection.policyVersion,
        input.projection.policyContentHash,
        'relationship-policy-state-v1',
        JSON.stringify(input.policyState),
        input.authorityRef,
        input.reason,
      ]);
      return rows(result.rows);
    } catch (error) {
      return mapError(error);
    }
  }
}

export function createPostgresProductionRelationshipProjectionRebuildPortV1(
  client: PostgresTransactionQueryV1,
): ProductionRelationshipProjectionRebuildPortV1 {
  return new PostgresProductionRelationshipProjectionRebuildPortV1(client);
}
