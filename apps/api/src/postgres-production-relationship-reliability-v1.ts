import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
  type ProductionRelationshipConditionV1,
  type ProductionRelationshipStageV1,
} from '../../../packages/domain/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  ProductionRelationshipReliabilityErrorV1,
  type ProductionRelationshipAdjustmentAppendPortV1,
  type ProductionRelationshipHistoryContextPortV1,
  type ProductionRelationshipHistoryContextV1,
  type ProductionRelationshipReliabilityHistoryRecordV1,
  type ProductionRelationshipReplayProjectionCommitRowV1,
} from './production-relationship-reliability-v1.js';

export const POSTGRES_RELATIONSHIP_HISTORY_CONTEXT_BINDING_V1 =
  'public.cmd_lock_relationship_history_context_v1' as const;
export const POSTGRES_RELATIONSHIP_CORRECTION_BINDING_V1 =
  'public.cmd_append_relationship_correction_runtime_v1' as const;
export const POSTGRES_RELATIONSHIP_RETRACTION_BINDING_V1 =
  'public.cmd_append_relationship_retraction_runtime_v1' as const;
export const POSTGRES_RELATIONSHIP_REPLAY_PROJECTION_BINDING_V1 =
  'public.cmd_commit_relationship_replay_projection_v1' as const;

type Row = Readonly<Record<string, unknown>>;

const LOCK_HISTORY_SQL = [
  'select',
  '  state_id::text as "stateId",',
  '  revision::text as "revision",',
  '  closeness, trust, friction,',
  '  relationship_stage as "relationshipStage",',
  '  attained_stage as "attainedStage",',
  '  current_candidate_stage as "currentCandidateStage",',
  '  current_condition as "currentCondition",',
  '  policy_version as "policyVersion",',
  '  policy_content_hash as "policyContentHash",',
  '  policy_state_schema_version as "policyStateSchemaVersion",',
  '  policy_state_jsonb as "policyStateJsonb",',
  '  last_interaction_at::text as "lastInteractionAt",',
  '  active_policy_version as "activePolicyVersion",',
  '  active_policy_content_hash as "activePolicyContentHash",',
  '  active_policy_artifact_schema_version as "activePolicyArtifactSchemaVersion",',
  '  active_policy_artifact_jsonb as "activePolicyArtifactJsonb",',
  '  server_now::text as "serverNow",',
  '  history_records_jsonb as "historyRecordsJsonb"',
  'from public.cmd_lock_relationship_history_context_v1($1::uuid,$2::text)',
].join('\n');

const APPEND_RETRACTION_SQL = [
  'select * from public.cmd_append_relationship_retraction_runtime_v1(',
  '  $1::uuid,$2::text,$3::bigint,$4::integer,$5::uuid,$6::text,',
  '  $7::uuid,$8::uuid,$9::text,$10::text,$11::text',
  ')',
].join('\n');

const APPEND_CORRECTION_SQL = [
  'select * from public.cmd_append_relationship_correction_runtime_v1(',
  '  $1::uuid,$2::text,$3::bigint,$4::integer,$5::uuid,$6::text,',
  '  $7::uuid,$8::uuid,$9::text,$10::text,$11::text,$12::uuid,',
  '  $13::text,$14::text,$15::text,$16::text,$17::timestamptz,',
  '  $18::text,$19::text,$20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,',
  '  $24::jsonb,$25::jsonb,$26::jsonb,$27::text,$28::text,$29::boolean,',
  '  $30::integer,$31::integer,$32::integer,$33::text,$34::text,$35::text',
  ')',
].join('\n');

const COMMIT_REPLAY_PROJECTION_SQL = [
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
  'from public.cmd_commit_relationship_replay_projection_v1(',
  '  $1::uuid,$2::text,$3::bigint,$4::bigint,$5::integer,$6::integer,',
  '  $7::integer,$8::text,$9::text,$10::text,$11::text,$12::text,',
  '  $13::text,$14::jsonb',
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

function mapReliabilityError(error: unknown): never {
  switch (constraintOf(error)) {
    case 'relationship_adjustment_stale_revision':
    case 'relationship_adjustment_sequence_conflict':
    case 'relationship_replay_projection_stale_revision':
    case 'relationship_replay_projection_update_race':
      throw new ProductionRelationshipReliabilityErrorV1(
        'STALE_RELATIONSHIP_REVISION',
        'Relationship reliability revision changed during the transaction.',
      );
    case 'relationship_history_entries_dedupe_unique':
    case 'relationship_event_records_dedupe_unique':
      throw new ProductionRelationshipReliabilityErrorV1(
        'IDEMPOTENCY_CONFLICT',
        'Relationship reliability dedupe identity already exists.',
      );
    case 'cmd_relationship_history_policy_mismatch':
      throw new ProductionRelationshipReliabilityErrorV1(
        'POLICY_AUTHORITY_MISMATCH',
        'Relationship reliability DB policy differs from Production V1.',
      );
    case 'ct_relationship_event_causal_shape_v1':
    case 'ct_relationship_event_causal_time_v1':
    case 'ct_relationship_event_commitment_cause_v1':
    case 'ct_relationship_event_reconciliation_cause_v1':
      throw new ProductionRelationshipReliabilityErrorV1(
        'CAUSAL_HISTORY_INVALID',
        'Relationship adjustment would create invalid causal history.',
      );
    default:
      break;
  }
  if (codeOf(error) === '40001') {
    throw new ProductionRelationshipReliabilityErrorV1(
      'STALE_RELATIONSHIP_REVISION',
      'Relationship reliability serialization failed.',
    );
  }
  if (codeOf(error) === '23505') {
    throw new ProductionRelationshipReliabilityErrorV1(
      'IDEMPOTENCY_CONFLICT',
      'Relationship reliability persistence identity conflicted.',
    );
  }
  if (codeOf(error) === '23514' || codeOf(error) === '22P02') {
    throw new ProductionRelationshipReliabilityErrorV1(
      'INVALID_ADJUSTMENT',
      'Relationship adjustment persistence contract was rejected.',
    );
  }
  throw error;
}

function str(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Relationship reliability PostgreSQL ' + name + ' is invalid.');
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
    throw new Error('Relationship reliability PostgreSQL ' + name + ' is invalid.');
  }
  return parsed;
}

function timestamp(name: string, value: unknown): string {
  const raw = str(name, value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error('Relationship reliability PostgreSQL ' + name + ' is invalid.');
  }
  return new Date(parsed).toISOString();
}

function nullableTimestamp(name: string, value: unknown): string | null {
  return value === null ? null : timestamp(name, value);
}

function stage(value: unknown): ProductionRelationshipStageV1 {
  if (
    value === 'S0_FIRST_MEETING' ||
    value === 'S1_FAMILIAR' ||
    value === 'S2_REGULAR' ||
    value === 'S3_OPENED' ||
    value === 'S4_SPECIAL'
  ) return value;
  throw new Error('Relationship reliability PostgreSQL stage is invalid.');
}

function condition(value: unknown): ProductionRelationshipConditionV1 {
  if (
    value === 'STABLE' ||
    value === 'OPEN_CONFLICT' ||
    value === 'RESOLVED_RECENTLY'
  ) return value;
  throw new Error('Relationship reliability PostgreSQL condition is invalid.');
}

function history(value: unknown): readonly ProductionRelationshipReliabilityHistoryRecordV1[] {
  if (!Array.isArray(value)) {
    throw new Error('Relationship reliability PostgreSQL history is invalid.');
  }
  for (const record of value) {
    const action =
      typeof record === 'object' && record !== null && 'action' in record
        ? (record as { action?: unknown }).action
        : null;
    if (action !== 'record' && action !== 'correct' && action !== 'retract') {
      throw new Error('Relationship reliability PostgreSQL history action is invalid.');
    }
  }
  return Object.freeze([
    ...(value as ProductionRelationshipReliabilityHistoryRecordV1[]),
  ]);
}

function oneContext(rows: readonly Row[]): ProductionRelationshipHistoryContextV1 {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Relationship reliability context must return exactly one row.');
  }
  const row = rows[0];
  return Object.freeze({
    stateId: str('state id', row.stateId),
    revision: int('revision', row.revision),
    closeness: int('closeness', row.closeness),
    trust: int('trust', row.trust),
    friction: int('friction', row.friction),
    relationshipStage: str('relationship stage', row.relationshipStage),
    attainedStage: stage(row.attainedStage),
    currentCandidateStage: stage(row.currentCandidateStage),
    currentCondition: condition(row.currentCondition),
    policyVersion: str('policy version', row.policyVersion),
    policyContentHash: str('policy hash', row.policyContentHash),
    policyStateSchemaVersion: str(
      'policy state schema version',
      row.policyStateSchemaVersion,
    ),
    policyStateJsonb: row.policyStateJsonb,
    lastInteractionAt: nullableTimestamp('last interaction', row.lastInteractionAt),
    activePolicyVersion: str('active policy version', row.activePolicyVersion),
    activePolicyContentHash: str('active policy hash', row.activePolicyContentHash),
    activePolicyArtifactSchemaVersion: str(
      'active policy artifact schema',
      row.activePolicyArtifactSchemaVersion,
    ),
    activePolicyArtifactJsonb: row.activePolicyArtifactJsonb,
    serverNow: timestamp('server time', row.serverNow),
    historyRecords: history(row.historyRecordsJsonb),
  });
}

function projectionRows(
  rows: readonly Row[],
): readonly ProductionRelationshipReplayProjectionCommitRowV1[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        stateId: str('commit state id', row.stateId),
        revisionAfter: int('commit revision', row.revisionAfter),
        closeness: int('commit closeness', row.closeness),
        trust: int('commit trust', row.trust),
        friction: int('commit friction', row.friction),
        attainedStage: stage(row.attainedStage),
        currentCandidateStage: stage(row.currentCandidateStage),
        currentCondition: condition(row.currentCondition),
        policyVersion: str('commit policy version', row.policyVersion),
        policyContentHash: str('commit policy hash', row.policyContentHash),
        lastInteractionAt: nullableTimestamp(
          'commit last interaction',
          row.lastInteractionAt,
        ),
      }),
    ),
  );
}

class PostgresProductionRelationshipReliabilityPortV1
  implements
    ProductionRelationshipHistoryContextPortV1,
    ProductionRelationshipAdjustmentAppendPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async lockAndLoad(
    input: Parameters<ProductionRelationshipHistoryContextPortV1['lockAndLoad']>[0],
  ): Promise<ProductionRelationshipHistoryContextV1> {
    try {
      const result = await this.client.query<Row>(LOCK_HISTORY_SQL, [
        input.subjectId,
        input.characterId,
      ]);
      return oneContext(result.rows);
    } catch (error) {
      return mapReliabilityError(error);
    }
  }

  async appendRetraction(
    input: Parameters<ProductionRelationshipAdjustmentAppendPortV1['appendRetraction']>[0],
  ): Promise<void> {
    try {
      await this.client.query(APPEND_RETRACTION_SQL, [
        input.subjectId,
        input.characterId,
        input.expectedBaseRevision,
        input.ordinal,
        input.historyEntryId,
        input.historyDedupeKey,
        input.adjustmentId,
        input.targetEventId,
        input.reasonCode,
        input.reason,
        input.authorityRef,
      ]);
    } catch (error) {
      return mapReliabilityError(error);
    }
  }

  async appendCorrection(
    input: Parameters<ProductionRelationshipAdjustmentAppendPortV1['appendCorrection']>[0],
  ): Promise<void> {
    const event = input.replacementEvent;
    try {
      await this.client.query(APPEND_CORRECTION_SQL, [
        input.subjectId,
        input.characterId,
        input.expectedBaseRevision,
        input.ordinal,
        input.historyEntryId,
        input.historyDedupeKey,
        input.adjustmentId,
        input.targetEventId,
        input.reasonCode,
        input.reason,
        input.authorityRef,
        event.eventId,
        event.dedupeKey,
        event.eventKind,
        event.eventSchemaVersion,
        event.characterBehaviorKey,
        event.occurredAt,
        event.source.sourceKind,
        event.source.sourceRef,
        JSON.stringify(event.source.sourceMessageRefs),
        JSON.stringify(event.source.authorityRefs),
        JSON.stringify(input.provenanceRefIds),
        JSON.stringify(event.causalPredecessorEventIds),
        JSON.stringify(event.facts),
        event.characterInterpretation === null
          ? null
          : JSON.stringify(event.characterInterpretation),
        JSON.stringify(event.payload),
        input.decision.family,
        input.decision.effectDisposition,
        input.decision.creditedPositiveEpisode,
        input.decision.effectiveDelta.closeness,
        input.decision.effectiveDelta.trust,
        input.decision.effectiveDelta.friction,
        input.decision.milestoneKind,
        PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
        PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
      ]);
    } catch (error) {
      return mapReliabilityError(error);
    }
  }

  async commitProjection(
    input: Parameters<ProductionRelationshipAdjustmentAppendPortV1['commitProjection']>[0],
  ): Promise<readonly ProductionRelationshipReplayProjectionCommitRowV1[]> {
    try {
      const result = await this.client.query<Row>(
        COMMIT_REPLAY_PROJECTION_SQL,
        [
          input.subjectId,
          input.characterId,
          input.expectedBaseRevision,
          input.projection.revision,
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
        ],
      );
      return projectionRows(result.rows);
    } catch (error) {
      return mapReliabilityError(error);
    }
  }
}

export function createPostgresProductionRelationshipReliabilityPortV1(
  client: PostgresTransactionQueryV1,
): ProductionRelationshipHistoryContextPortV1 &
  ProductionRelationshipAdjustmentAppendPortV1 {
  return new PostgresProductionRelationshipReliabilityPortV1(client);
}
