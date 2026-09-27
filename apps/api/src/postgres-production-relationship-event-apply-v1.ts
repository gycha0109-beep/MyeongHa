import {
  ProductionRelationshipApplyErrorV1,
  PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1,
  type ProductionRelationshipApplyCommitPortV1,
  type ProductionRelationshipApplyCommitRowV1,
  type ProductionRelationshipApplyContextPortV1,
  type ProductionRelationshipHistoryRecordV1,
  type ProductionRelationshipLockedContextV1,
} from './production-relationship-event-apply-command-v1.js';
import type {
  ProductionRelationshipConditionV1,
  ProductionRelationshipStageV1,
} from '../../../packages/domain/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const POSTGRES_RELATIONSHIP_APPLY_CONTEXT_BINDING_V1 =
  'public.cmd_lock_relationship_apply_context_v1' as const;
export const POSTGRES_RELATIONSHIP_APPLY_COMMIT_BINDING_V1 =
  'public.cmd_apply_relationship_event_runtime_v1' as const;

type ContextQueryRowV1 = Readonly<{
  stateId: unknown;
  revision: unknown;
  closeness: unknown;
  trust: unknown;
  friction: unknown;
  relationshipStage: unknown;
  attainedStage: unknown;
  currentCandidateStage: unknown;
  currentCondition: unknown;
  policyVersion: unknown;
  policyContentHash: unknown;
  policyStateSchemaVersion: unknown;
  policyStateJsonb: unknown;
  lastInteractionAt: unknown;
  activePolicyVersion: unknown;
  activePolicyContentHash: unknown;
  activePolicyArtifactSchemaVersion: unknown;
  activePolicyArtifactJsonb: unknown;
  canonicalOccurredAt: unknown;
  interactionCommittedAt: unknown;
  historyRecordsJsonb: unknown;
}>;

type CommitQueryRowV1 = Readonly<{
  stateId: unknown;
  historyEntryId: unknown;
  eventId: unknown;
  applied: unknown;
  replayed: unknown;
  revisionBefore: unknown;
  revisionAfter: unknown;
  closeness: unknown;
  trust: unknown;
  friction: unknown;
  attainedStage: unknown;
  currentCandidateStage: unknown;
  currentCondition: unknown;
  policyVersion: unknown;
  policyContentHash: unknown;
  lastInteractionAt: unknown;
}>;

const LOCK_CONTEXT_SQL = `
select
  state_id::text as "stateId",
  revision::text as "revision",
  closeness,
  trust,
  friction,
  relationship_stage as "relationshipStage",
  attained_stage as "attainedStage",
  current_candidate_stage as "currentCandidateStage",
  current_condition as "currentCondition",
  policy_version as "policyVersion",
  policy_content_hash as "policyContentHash",
  policy_state_schema_version as "policyStateSchemaVersion",
  policy_state_jsonb as "policyStateJsonb",
  last_interaction_at::text as "lastInteractionAt",
  active_policy_version as "activePolicyVersion",
  active_policy_content_hash as "activePolicyContentHash",
  active_policy_artifact_schema_version as "activePolicyArtifactSchemaVersion",
  active_policy_artifact_jsonb as "activePolicyArtifactJsonb",
  canonical_occurred_at::text as "canonicalOccurredAt",
  interaction_committed_at::text as "interactionCommittedAt",
  history_records_jsonb as "historyRecordsJsonb"
from public.cmd_lock_relationship_apply_context_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::text,
  $5::text,
  $6::jsonb,
  $7::timestamptz
)
`.trim();

const COMMIT_EVENT_SQL = `
select
  state_id::text as "stateId",
  history_entry_id::text as "historyEntryId",
  event_id::text as "eventId",
  applied,
  replayed,
  revision_before::text as "revisionBefore",
  revision_after::text as "revisionAfter",
  closeness,
  trust,
  friction,
  attained_stage as "attainedStage",
  current_candidate_stage as "currentCandidateStage",
  current_condition as "currentCondition",
  policy_version as "policyVersion",
  policy_content_hash as "policyContentHash",
  last_interaction_at::text as "lastInteractionAt"
from public.cmd_apply_relationship_event_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::bigint,
  $5::text,
  $6::uuid,
  $7::text,
  $8::text,
  $9::text,
  $10::text,
  $11::text,
  $12::timestamptz,
  $13::text,
  $14::text,
  $15::jsonb,
  $16::jsonb,
  $17::jsonb,
  $18::jsonb,
  $19::jsonb,
  $20::jsonb,
  $21::jsonb,
  $22::text,
  $23::text,
  $24::boolean,
  $25::integer,
  $26::integer,
  $27::integer,
  $28::text,
  $29::text,
  $30::text,
  $31::text,
  $32::text,
  $33::text,
  $34::text,
  $35::jsonb
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

function mapPostgresError(error: unknown): never {
  const constraint = postgresConstraint(error);

  switch (constraint) {
    case 'cmd_relationship_apply_subject_ineligible':
      throw new ProductionRelationshipApplyErrorV1(
        'SUBJECT_INELIGIBLE',
        'Relationship apply Subject is unavailable.',
      );
    case 'cmd_relationship_apply_character_unavailable':
      throw new ProductionRelationshipApplyErrorV1(
        'CHARACTER_UNAVAILABLE',
        'Relationship apply Character is unavailable.',
      );
    case 'cmd_relationship_apply_policy_unavailable':
      throw new ProductionRelationshipApplyErrorV1(
        'POLICY_UNAVAILABLE',
        'No active Production relationship policy is available.',
      );
    case 'cmd_relationship_apply_policy_unsupported':
    case 'cmd_relationship_apply_projection_policy_mismatch':
    case 'cmd_relationship_apply_policy_mismatch':
      throw new ProductionRelationshipApplyErrorV1(
        'POLICY_AUTHORITY_MISMATCH',
        'Relationship apply policy authority does not match Production V1.',
      );
    case 'cmd_relationship_apply_legacy_state_requires_migration':
      throw new ProductionRelationshipApplyErrorV1(
        'LEGACY_STATE_REQUIRES_MIGRATION',
        'Legacy relationship state requires explicit migration authority.',
      );
    case 'cmd_relationship_apply_idempotency_conflict':
    case 'relationship_event_records_dedupe_unique':
      throw new ProductionRelationshipApplyErrorV1(
        'IDEMPOTENCY_CONFLICT',
        'Relationship Event dedupe key conflicts with stored semantic material.',
      );
    case 'cmd_relationship_apply_stale_revision':
    case 'cmd_relationship_apply_projection_update_race':
    case 'relationship_history_entries_revision_unique':
      throw new ProductionRelationshipApplyErrorV1(
        'STALE_RELATIONSHIP_REVISION',
        'Relationship revision changed before atomic apply.',
      );
    case 'ct_relationship_event_causal_shape_v1':
    case 'ct_relationship_event_causal_time_v1':
    case 'ct_relationship_event_commitment_cause_v1':
    case 'ct_relationship_event_reconciliation_cause_v1':
      throw new ProductionRelationshipApplyErrorV1(
        'CAUSAL_HISTORY_INVALID',
        'Relationship Event causal history was rejected.',
      );
    case 'cmd_relationship_apply_conversation_source_invalid':
    case 'cmd_relationship_apply_world_source_invalid':
    case 'cmd_relationship_apply_merge_source_invalid':
    case 'cmd_relationship_apply_server_observation_invalid':
    case 'cmd_relationship_apply_source_kind_invalid':
    case 'cmd_relationship_apply_source_ref_invalid':
    case 'cmd_relationship_apply_source_message_shape':
    case 'cmd_relationship_apply_occurrence_time_invalid':
    case 'ct_relationship_event_authority_provenance_v1':
    case 'ct_relationship_event_message_provenance_v1':
    case 'ct_relationship_event_message_turn_v1':
    case 'ct_relationship_event_merge_subject_v1':
      throw new ProductionRelationshipApplyErrorV1(
        'SOURCE_AUTHORITY_INVALID',
        'Relationship Event source authority was rejected.',
      );
    case 'cmd_relationship_apply_attained_stage_invalid':
    case 'cmd_relationship_apply_commit_input_invalid':
    case 'cmd_relationship_apply_commit_array_shape':
    case 'relationship_event_records_event_type_check':
    case 'relationship_event_records_schema_version_check':
    case 'relationship_event_records_family_mapping_check':
    case 'relationship_event_records_effect_shape_check':
    case 'relationship_event_records_progression_credit_check':
    case 'relationship_event_records_delta_check':
    case 'relationship_event_records_milestone_check':
    case 'ct_relationship_event_payload_v1':
    case 'ct_relationship_event_behavior_key_v1':
      throw new ProductionRelationshipApplyErrorV1(
        'INVALID_EVENT',
        'Relationship Event commit envelope was rejected.',
      );
    default:
      break;
  }

  if (postgresCode(error) === '40001') {
    throw new ProductionRelationshipApplyErrorV1(
      'STALE_RELATIONSHIP_REVISION',
      'Relationship apply serialization failed.',
    );
  }
  if (postgresCode(error) === '23505') {
    throw new ProductionRelationshipApplyErrorV1(
      'SERVER_ID_CONFLICT',
      'Server-owned relationship persistence identity conflicted with existing data.',
    );
  }
  if (postgresCode(error) === '22P02') {
    throw new ProductionRelationshipApplyErrorV1(
      'INVALID_EVENT',
      'Relationship apply contained a malformed server-owned identifier.',
    );
  }

  throw error;
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Relationship apply PostgreSQL ' + name + ' is invalid.');
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
    throw new Error('Relationship apply PostgreSQL ' + name + ' is invalid.');
  }
  return parsed;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Relationship apply PostgreSQL ' + name + ' is invalid.');
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  const raw = requireString(name, value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error('Relationship apply PostgreSQL ' + name + ' is invalid.');
  }
  return new Date(parsed).toISOString();
}

function requireNullableTimestamp(
  name: string,
  value: unknown,
): string | null {
  return value === null ? null : requireTimestamp(name, value);
}

function requireStage(value: unknown): ProductionRelationshipStageV1 {
  if (
    value === 'S0_FIRST_MEETING' ||
    value === 'S1_FAMILIAR' ||
    value === 'S2_REGULAR' ||
    value === 'S3_OPENED' ||
    value === 'S4_SPECIAL'
  ) {
    return value;
  }
  throw new Error('Relationship apply PostgreSQL stage is invalid.');
}

function requireCondition(value: unknown): ProductionRelationshipConditionV1 {
  if (
    value === 'STABLE' ||
    value === 'OPEN_CONFLICT' ||
    value === 'RESOLVED_RECENTLY'
  ) {
    return value;
  }
  throw new Error('Relationship apply PostgreSQL condition is invalid.');
}

function requireHistoryRecords(
  value: unknown,
): readonly ProductionRelationshipHistoryRecordV1[] {
  if (!Array.isArray(value)) {
    throw new Error('Relationship apply PostgreSQL history payload is invalid.');
  }
  for (const record of value) {
    if (
      typeof record !== 'object' ||
      record === null ||
      !('action' in record) ||
      !['record', 'correct', 'retract'].includes(
        (record as { action?: unknown }).action as string,
      )
    ) {
      throw new Error(
        'Relationship apply PostgreSQL history record action is invalid.',
      );
    }
  }
  return Object.freeze([
    ...(value as ProductionRelationshipHistoryRecordV1[]),
  ]);
}

function requireOneContextRow(
  rows: readonly ContextQueryRowV1[],
): ProductionRelationshipLockedContextV1 {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(
      'Relationship apply PostgreSQL context must return exactly one row.',
    );
  }
  const row = rows[0];
  return Object.freeze({
    stateId: requireString('state id', row.stateId),
    revision: requireInteger('revision', row.revision),
    closeness: requireInteger('closeness', row.closeness),
    trust: requireInteger('trust', row.trust),
    friction: requireInteger('friction', row.friction),
    relationshipStage: requireString(
      'relationship stage',
      row.relationshipStage,
    ),
    attainedStage: requireStage(row.attainedStage),
    currentCandidateStage: requireStage(row.currentCandidateStage),
    currentCondition: requireCondition(row.currentCondition),
    policyVersion: requireString('policy version', row.policyVersion),
    policyContentHash: requireString(
      'policy content hash',
      row.policyContentHash,
    ),
    policyStateSchemaVersion: requireString(
      'policy state schema version',
      row.policyStateSchemaVersion,
    ),
    policyStateJsonb: row.policyStateJsonb,
    lastInteractionAt: requireNullableTimestamp(
      'last interaction timestamp',
      row.lastInteractionAt,
    ),
    activePolicyVersion: requireString(
      'active policy version',
      row.activePolicyVersion,
    ),
    activePolicyContentHash: requireString(
      'active policy hash',
      row.activePolicyContentHash,
    ),
    activePolicyArtifactSchemaVersion: requireString(
      'active policy artifact schema version',
      row.activePolicyArtifactSchemaVersion,
    ),
    activePolicyArtifactJsonb: row.activePolicyArtifactJsonb,
    canonicalOccurredAt: requireTimestamp(
      'canonical occurrence timestamp',
      row.canonicalOccurredAt,
    ),
    interactionCommittedAt: requireNullableTimestamp(
      'interaction commit timestamp',
      row.interactionCommittedAt,
    ),
    historyRecords: requireHistoryRecords(row.historyRecordsJsonb),
  });
}

function mapCommitRows(
  rows: readonly CommitQueryRowV1[],
): readonly ProductionRelationshipApplyCommitRowV1[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        stateId: requireString('commit state id', row.stateId),
        historyEntryId: requireString(
          'commit history entry id',
          row.historyEntryId,
        ),
        eventId: requireString('commit Event id', row.eventId),
        applied: requireBoolean('commit applied marker', row.applied),
        replayed: requireBoolean('commit replay marker', row.replayed),
        revisionBefore: requireInteger(
          'commit revision before',
          row.revisionBefore,
        ),
        revisionAfter: requireInteger(
          'commit revision after',
          row.revisionAfter,
        ),
        closeness: requireInteger('commit closeness', row.closeness),
        trust: requireInteger('commit trust', row.trust),
        friction: requireInteger('commit friction', row.friction),
        attainedStage: requireStage(row.attainedStage),
        currentCandidateStage: requireStage(row.currentCandidateStage),
        currentCondition: requireCondition(row.currentCondition),
        policyVersion: requireString(
          'commit policy version',
          row.policyVersion,
        ),
        policyContentHash: requireString(
          'commit policy hash',
          row.policyContentHash,
        ),
        lastInteractionAt: requireNullableTimestamp(
          'commit last interaction timestamp',
          row.lastInteractionAt,
        ),
      }),
    ),
  );
}

class PostgresProductionRelationshipApplyPortV1
  implements
    ProductionRelationshipApplyContextPortV1,
    ProductionRelationshipApplyCommitPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async lockAndLoad(
    input: Parameters<ProductionRelationshipApplyContextPortV1['lockAndLoad']>[0],
  ): Promise<ProductionRelationshipLockedContextV1> {
    try {
      const result = await this.client.query<ContextQueryRowV1>(
        LOCK_CONTEXT_SQL,
        [
          input.subjectId,
          input.stateId,
          input.characterId,
          input.sourceKind,
          input.sourceRef,
          JSON.stringify(input.sourceMessageRefs),
          input.eventOccurredAt,
        ],
      );
      return requireOneContextRow(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }

  async commitEvent(
    input: Parameters<ProductionRelationshipApplyCommitPortV1['commitEvent']>[0],
  ): Promise<readonly ProductionRelationshipApplyCommitRowV1[]> {
    try {
      const result = await this.client.query<CommitQueryRowV1>(
        COMMIT_EVENT_SQL,
        [
          input.subjectId,
          input.stateId,
          input.historyEntryId,
          input.expectedRevision,
          input.historyDedupeKey,
          input.event.eventId,
          input.event.dedupeKey,
          input.event.characterId,
          input.event.eventKind,
          input.event.eventSchemaVersion,
          input.event.characterBehaviorKey,
          input.event.occurredAt,
          input.event.source.sourceKind,
          input.event.source.sourceRef,
          JSON.stringify(input.event.source.sourceMessageRefs),
          JSON.stringify(input.event.source.authorityRefs),
          JSON.stringify(input.provenanceRefIds),
          JSON.stringify(input.event.causalPredecessorEventIds),
          JSON.stringify(input.event.facts),
          input.event.characterInterpretation === null
            ? null
            : JSON.stringify(input.event.characterInterpretation),
          JSON.stringify(input.event.payload),
          input.decision.family,
          input.decision.effectDisposition,
          input.decision.creditedPositiveEpisode,
          input.decision.effectiveDelta.closeness,
          input.decision.effectiveDelta.trust,
          input.decision.effectiveDelta.friction,
          input.decision.milestoneKind,
          input.projection.policyVersion,
          input.projection.policyContentHash,
          input.projection.attainedStage,
          input.projection.currentCandidateStage,
          input.projection.currentCondition,
          PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1,
          JSON.stringify(input.policyState),
        ],
      );
      return mapCommitRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresProductionRelationshipApplyPortV1(
  client: PostgresTransactionQueryV1,
): ProductionRelationshipApplyContextPortV1 &
  ProductionRelationshipApplyCommitPortV1 {
  return new PostgresProductionRelationshipApplyPortV1(client);
}
