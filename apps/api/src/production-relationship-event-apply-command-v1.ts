import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1,
  PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
  canonicalJson,
  evaluateProductionRelationshipHistoryV1,
  replayProductionRelationshipHistoryV1,
  validateProductionRelationshipEventV1,
  type ProductionRelationshipEffectDispositionV1,
  type ProductionRelationshipEventDecisionV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
  type ProductionRelationshipMilestoneKindV1,
  type ProductionRelationshipProjectionV1,
  type ProductionRelationshipStageV1,
  type ProductionRelationshipConditionV1,
} from '../../../packages/domain/src/index.js';

type Awaitable<T> = T | Promise<T>;

export const PRODUCTION_RELATIONSHIP_EVENT_APPLY_VERSION_V1 =
  'production-relationship-event-apply-v1' as const;

export const PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1 =
  'relationship-policy-state-v1' as const;

export type ProductionRelationshipApplyFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'CHARACTER_UNAVAILABLE'
  | 'INVALID_EVENT'
  | 'SOURCE_AUTHORITY_INVALID'
  | 'POLICY_UNAVAILABLE'
  | 'POLICY_AUTHORITY_MISMATCH'
  | 'STALE_RELATIONSHIP_REVISION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CAUSAL_HISTORY_INVALID'
  | 'PROJECTION_INTEGRITY_MISMATCH'
  | 'LEGACY_STATE_REQUIRES_MIGRATION'
  | 'SERVER_ID_CONFLICT'
  | 'COMMIT_RESULT_MISMATCH';

export class ProductionRelationshipApplyErrorV1 extends Error {
  constructor(
    readonly code: ProductionRelationshipApplyFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ProductionRelationshipApplyErrorV1';
  }
}

export interface ProductionRelationshipPolicyStateV1 {
  readonly evaluatedEventCount: number;
  readonly behaviorAccess: string;
  readonly episodeProfile: Readonly<{
    readonly familyCounts: Readonly<Record<string, number>>;
    readonly creditedPositiveEpisodes: number;
    readonly suppressedPositiveEpisodes: number;
    readonly distinctPositiveDays: number;
    readonly distinctPositiveWeeks: number;
    readonly distinctPositiveFamilies: number;
    readonly milestoneCount: number;
  }>;
  readonly unresolvedConflictCount: number;
}

export interface ProductionRelationshipLockedContextV1 {
  readonly stateId: string;
  readonly revision: number;
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly relationshipStage: string;
  readonly attainedStage: ProductionRelationshipStageV1;
  readonly currentCandidateStage: ProductionRelationshipStageV1;
  readonly currentCondition: ProductionRelationshipConditionV1;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly policyStateSchemaVersion: string;
  readonly policyStateJsonb: unknown;
  readonly lastInteractionAt: string | null;
  readonly activePolicyVersion: string;
  readonly activePolicyContentHash: string;
  readonly activePolicyArtifactSchemaVersion: string;
  readonly activePolicyArtifactJsonb: unknown;
  readonly canonicalOccurredAt: string;
  readonly interactionCommittedAt: string | null;
  readonly historyRecords: readonly ProductionRelationshipHistoryRecordV1[];
}

export interface ProductionRelationshipApplyContextPortV1 {
  lockAndLoad(input: {
    readonly subjectId: string;
    readonly stateId: string;
    readonly characterId: string;
    readonly sourceKind: ProductionRelationshipEventV1['source']['sourceKind'];
    readonly sourceRef: string;
    readonly sourceMessageRefs: readonly string[];
    readonly eventOccurredAt: string;
  }): Awaitable<ProductionRelationshipLockedContextV1>;
}

export interface ProductionRelationshipApplyCommitRowV1 {
  readonly stateId: string;
  readonly historyEntryId: string;
  readonly eventId: string;
  readonly applied: boolean;
  readonly replayed: boolean;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly attainedStage: ProductionRelationshipStageV1;
  readonly currentCandidateStage: ProductionRelationshipStageV1;
  readonly currentCondition: ProductionRelationshipConditionV1;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly lastInteractionAt: string | null;
}

export interface ProductionRelationshipApplyCommitPortV1 {
  commitEvent(input: {
    readonly subjectId: string;
    readonly stateId: string;
    readonly historyEntryId: string;
    readonly expectedRevision: number;
    readonly historyDedupeKey: string;
    readonly event: ProductionRelationshipEventV1;
    readonly provenanceRefIds: readonly string[];
    readonly decision: ProductionRelationshipEventDecisionV1;
    readonly projection: ProductionRelationshipProjectionV1;
    readonly policyState: ProductionRelationshipPolicyStateV1;
  }): Awaitable<readonly ProductionRelationshipApplyCommitRowV1[]>;
}

export interface ProductionRelationshipApplyIdPortV1 {
  nextStateId(): Awaitable<string>;
  nextHistoryEntryId(): Awaitable<string>;
  nextProvenanceRefId(): Awaitable<string>;
}

export interface ApplyProductionRelationshipEventInputV1 {
  readonly resolvedSubjectId: string;
  readonly expectedRevision: number;
  readonly event: ProductionRelationshipEventV1;
  readonly idPort: ProductionRelationshipApplyIdPortV1;
  readonly contextPort: ProductionRelationshipApplyContextPortV1;
  readonly commitPort: ProductionRelationshipApplyCommitPortV1;
}

export interface ApplyProductionRelationshipEventResultV1 {
  readonly applyVersion: typeof PRODUCTION_RELATIONSHIP_EVENT_APPLY_VERSION_V1;
  readonly stateId: string;
  readonly historyEntryId: string;
  readonly eventId: string;
  readonly applied: boolean;
  readonly replayed: boolean;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly relationship: Readonly<{
    readonly closeness: number;
    readonly trust: number;
    readonly friction: number;
    readonly attainedStage: ProductionRelationshipStageV1;
    readonly currentCandidateStage: ProductionRelationshipStageV1;
    readonly currentCondition: ProductionRelationshipConditionV1;
    readonly policyVersion: string;
    readonly policyContentHash: string;
    readonly lastInteractionAt: string | null;
  }>;
}

const UUID_V1 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireNonEmpty(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProductionRelationshipApplyErrorV1(
      'INVALID_EVENT',
      'Production relationship ' + name + ' is required.',
    );
  }
  return value.trim();
}

function requireUuid(name: string, value: unknown): string {
  const normalized = requireNonEmpty(name, value);
  if (!UUID_V1.test(normalized)) {
    throw new ProductionRelationshipApplyErrorV1(
      'INVALID_EVENT',
      'Production relationship ' + name + ' must be a canonical UUID.',
    );
  }
  return normalized.toLowerCase();
}

function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ProductionRelationshipApplyErrorV1(
      'STALE_RELATIONSHIP_REVISION',
      'Expected relationship revision must be a non-negative safe integer.',
    );
  }
  return value as number;
}

function normalizeInstant(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ProductionRelationshipApplyErrorV1(
      'SOURCE_AUTHORITY_INVALID',
      'Relationship Event occurrence time is invalid.',
    );
  }
  return new Date(timestamp).toISOString();
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function retryMaterial(
  event: ProductionRelationshipEventV1,
): Readonly<Record<string, unknown>> {
  const validated = validateProductionRelationshipEventV1(event);
  const { eventId: _eventId, ...material } = validated;
  return Object.freeze(material);
}

function historicalEventByDedupe(
  records: readonly ProductionRelationshipHistoryRecordV1[],
  dedupeKey: string,
): Readonly<{
  historyEntryId: string;
  event: ProductionRelationshipEventV1;
}> | null {
  for (const record of records) {
    if (record.action === 'record' && record.event.dedupeKey === dedupeKey) {
      return Object.freeze({
        historyEntryId: record.ledgerEntryId,
        event: record.event,
      });
    }
    if (
      record.action === 'correct' &&
      record.replacementEvent.dedupeKey === dedupeKey
    ) {
      return Object.freeze({
        historyEntryId: record.ledgerEntryId,
        event: record.replacementEvent,
      });
    }
  }
  return null;
}

export function projectProductionRelationshipPolicyStateV1(
  projection: ProductionRelationshipProjectionV1,
): ProductionRelationshipPolicyStateV1 {
  return Object.freeze({
    evaluatedEventCount: projection.evaluatedEventCount,
    behaviorAccess: projection.behaviorAccess,
    episodeProfile: Object.freeze({
      familyCounts: Object.freeze({
        ...projection.episodeProfile.familyCounts,
      }),
      creditedPositiveEpisodes:
        projection.episodeProfile.creditedPositiveEpisodes,
      suppressedPositiveEpisodes:
        projection.episodeProfile.suppressedPositiveEpisodes,
      distinctPositiveDays: projection.episodeProfile.distinctPositiveDays,
      distinctPositiveWeeks: projection.episodeProfile.distinctPositiveWeeks,
      distinctPositiveFamilies:
        projection.episodeProfile.distinctPositiveFamilies,
      milestoneCount: projection.episodeProfile.milestoneCount,
    }),
    unresolvedConflictCount: projection.unresolvedConflictEventIds.length,
  });
}

function assertLockedPolicyAuthority(
  context: ProductionRelationshipLockedContextV1,
): void {
  const artifact = PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1;
  if (
    context.activePolicyVersion !== PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1 ||
    context.activePolicyContentHash !== artifact.contentHash ||
    context.activePolicyArtifactSchemaVersion !==
      PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1 ||
    !sameJson(context.activePolicyArtifactJsonb, artifact.payload)
  ) {
    throw new ProductionRelationshipApplyErrorV1(
      'POLICY_AUTHORITY_MISMATCH',
      'Locked database policy does not match the compiled Production relationship policy artifact.',
    );
  }
}

function assertProjectionIntegrity(
  context: ProductionRelationshipLockedContextV1,
  replayProjection: ProductionRelationshipProjectionV1,
  physicalRevision: number,
): void {
  const expectedPolicyState =
    projectProductionRelationshipPolicyStateV1(replayProjection);

  if (
    context.revision !== physicalRevision ||
    replayProjection.revision !== physicalRevision ||
    context.closeness !== replayProjection.scores.closeness ||
    context.trust !== replayProjection.scores.trust ||
    context.friction !== replayProjection.scores.friction ||
    context.relationshipStage !== replayProjection.attainedStage ||
    context.attainedStage !== replayProjection.attainedStage ||
    context.currentCandidateStage !== replayProjection.currentCandidateStage ||
    context.currentCondition !== replayProjection.currentCondition ||
    context.policyVersion !== replayProjection.policyVersion ||
    context.policyContentHash !== replayProjection.policyContentHash ||
    context.policyStateSchemaVersion !==
      PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1 ||
    !sameJson(context.policyStateJsonb, expectedPolicyState)
  ) {
    throw new ProductionRelationshipApplyErrorV1(
      'PROJECTION_INTEGRITY_MISMATCH',
      'Stored relationship projection does not match deterministic replay of authoritative history.',
    );
  }
}

function resultFromCurrentContext(input: {
  readonly context: ProductionRelationshipLockedContextV1;
  readonly historyEntryId: string;
  readonly eventId: string;
}): ApplyProductionRelationshipEventResultV1 {
  return Object.freeze({
    applyVersion: PRODUCTION_RELATIONSHIP_EVENT_APPLY_VERSION_V1,
    stateId: input.context.stateId,
    historyEntryId: input.historyEntryId,
    eventId: input.eventId,
    applied: false,
    replayed: true,
    revisionBefore: input.context.revision,
    revisionAfter: input.context.revision,
    relationship: Object.freeze({
      closeness: input.context.closeness,
      trust: input.context.trust,
      friction: input.context.friction,
      attainedStage: input.context.attainedStage,
      currentCandidateStage: input.context.currentCandidateStage,
      currentCondition: input.context.currentCondition,
      policyVersion: input.context.policyVersion,
      policyContentHash: input.context.policyContentHash,
      lastInteractionAt: input.context.lastInteractionAt,
    }),
  });
}

function requireCommitRow(
  rows: readonly ProductionRelationshipApplyCommitRowV1[],
): ProductionRelationshipApplyCommitRowV1 {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new ProductionRelationshipApplyErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Relationship apply PostgreSQL authority must return exactly one commit row.',
    );
  }
  return rows[0];
}

function assertCommitMatchesProjection(input: {
  readonly row: ProductionRelationshipApplyCommitRowV1;
  readonly context: ProductionRelationshipLockedContextV1;
  readonly historyEntryId: string;
  readonly event: ProductionRelationshipEventV1;
  readonly projection: ProductionRelationshipProjectionV1;
}): void {
  const { row, context, projection } = input;
  if (
    row.stateId !== context.stateId ||
    row.historyEntryId !== input.historyEntryId ||
    row.eventId !== input.event.eventId ||
    row.applied !== true ||
    row.replayed !== false ||
    row.revisionBefore !== context.revision ||
    row.revisionAfter !== projection.revision ||
    row.closeness !== projection.scores.closeness ||
    row.trust !== projection.scores.trust ||
    row.friction !== projection.scores.friction ||
    row.attainedStage !== projection.attainedStage ||
    row.currentCandidateStage !== projection.currentCandidateStage ||
    row.currentCondition !== projection.currentCondition ||
    row.policyVersion !== projection.policyVersion ||
    row.policyContentHash !== projection.policyContentHash
  ) {
    throw new ProductionRelationshipApplyErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Relationship apply PostgreSQL result differs from the deterministic Production policy result.',
    );
  }
}

function resultFromCommit(
  row: ProductionRelationshipApplyCommitRowV1,
): ApplyProductionRelationshipEventResultV1 {
  return Object.freeze({
    applyVersion: PRODUCTION_RELATIONSHIP_EVENT_APPLY_VERSION_V1,
    stateId: row.stateId,
    historyEntryId: row.historyEntryId,
    eventId: row.eventId,
    applied: row.applied,
    replayed: row.replayed,
    revisionBefore: row.revisionBefore,
    revisionAfter: row.revisionAfter,
    relationship: Object.freeze({
      closeness: row.closeness,
      trust: row.trust,
      friction: row.friction,
      attainedStage: row.attainedStage,
      currentCandidateStage: row.currentCandidateStage,
      currentCondition: row.currentCondition,
      policyVersion: row.policyVersion,
      policyContentHash: row.policyContentHash,
      lastInteractionAt: row.lastInteractionAt,
    }),
  });
}

export async function applyProductionRelationshipEventV1(
  input: ApplyProductionRelationshipEventInputV1,
): Promise<ApplyProductionRelationshipEventResultV1> {
  const subjectId = requireUuid('resolved Subject id', input.resolvedSubjectId);
  const expectedRevision = requireRevision(input.expectedRevision);

  let event: ProductionRelationshipEventV1;
  try {
    event = validateProductionRelationshipEventV1(input.event);
  } catch (error) {
    throw new ProductionRelationshipApplyErrorV1(
      'INVALID_EVENT',
      error instanceof Error
        ? error.message
        : 'Production relationship Event validation failed.',
    );
  }

  if (event.subjectId.toLowerCase() !== subjectId) {
    throw new ProductionRelationshipApplyErrorV1(
      'INVALID_EVENT',
      'Production relationship Event Subject does not match the resolved Subject.',
    );
  }

  requireUuid('Event id', event.eventId);
  for (const predecessorId of event.causalPredecessorEventIds) {
    requireUuid('causal predecessor Event id', predecessorId);
  }
  if (event.source.sourceKind !== 'server_observation') {
    requireUuid('source ref', event.source.sourceRef);
  }
  for (const messageRef of event.source.sourceMessageRefs) {
    requireUuid('source message ref', messageRef);
  }

  const stateIdCandidate = requireUuid(
    'generated state id',
    await input.idPort.nextStateId(),
  );

  const context = await input.contextPort.lockAndLoad({
    subjectId,
    stateId: stateIdCandidate,
    characterId: event.characterId,
    sourceKind: event.source.sourceKind,
    sourceRef: event.source.sourceRef,
    sourceMessageRefs: event.source.sourceMessageRefs,
    eventOccurredAt: event.occurredAt,
  });

  if (normalizeInstant(context.canonicalOccurredAt) !== event.occurredAt) {
    throw new ProductionRelationshipApplyErrorV1(
      'SOURCE_AUTHORITY_INVALID',
      'Production relationship Event occurrence time differs from the locked authoritative source time.',
    );
  }

  assertLockedPolicyAuthority(context);

  let replay;
  try {
    replay = replayProductionRelationshipHistoryV1(context.historyRecords);
  } catch (error) {
    throw new ProductionRelationshipApplyErrorV1(
      'CAUSAL_HISTORY_INVALID',
      error instanceof Error
        ? error.message
        : 'Authoritative relationship history replay failed.',
    );
  }

  assertProjectionIntegrity(context, replay.projection, replay.physicalRevision);

  const existing = historicalEventByDedupe(
    context.historyRecords,
    event.dedupeKey,
  );
  if (existing !== null) {
    const storedEvent = validateProductionRelationshipEventV1(existing.event);
    if (!sameJson(retryMaterial(storedEvent), retryMaterial(event))) {
      throw new ProductionRelationshipApplyErrorV1(
        'IDEMPOTENCY_CONFLICT',
        'Relationship Event dedupe key already exists with different semantic material.',
      );
    }

    return resultFromCurrentContext({
      context,
      historyEntryId: existing.historyEntryId,
      eventId: storedEvent.eventId,
    });
  }

  if (context.revision !== expectedRevision) {
    throw new ProductionRelationshipApplyErrorV1(
      'STALE_RELATIONSHIP_REVISION',
      'Relationship Event was evaluated against a stale relationship revision.',
    );
  }

  let projection: ProductionRelationshipProjectionV1;
  try {
    projection = evaluateProductionRelationshipHistoryV1(
      [...replay.activeEvents, event],
      { physicalRevision: context.revision + 1 },
    );
  } catch (error) {
    throw new ProductionRelationshipApplyErrorV1(
      'CAUSAL_HISTORY_INVALID',
      error instanceof Error
        ? error.message
        : 'Production relationship policy evaluation failed.',
    );
  }

  const decision = projection.decisions.at(-1);
  if (
    decision === undefined ||
    decision.eventId !== event.eventId ||
    decision.applied !== true ||
    decision.duplicateRetry !== false ||
    decision.effectDisposition === null
  ) {
    throw new ProductionRelationshipApplyErrorV1(
      'INVALID_EVENT',
      'New Production relationship Event did not produce one applicable policy decision.',
    );
  }

  const historyEntryId = requireUuid(
    'generated history entry id',
    await input.idPort.nextHistoryEntryId(),
  );

  const provenanceCount =
    event.source.sourceMessageRefs.length + event.source.authorityRefs.length;
  const provenanceRefIds: string[] = [];
  for (let index = 0; index < provenanceCount; index += 1) {
    provenanceRefIds.push(
      requireUuid(
        'generated provenance ref id',
        await input.idPort.nextProvenanceRefId(),
      ),
    );
  }
  if (new Set(provenanceRefIds).size !== provenanceRefIds.length) {
    throw new ProductionRelationshipApplyErrorV1(
      'SERVER_ID_CONFLICT',
      'Generated relationship provenance identities are not unique.',
    );
  }

  const policyState = projectProductionRelationshipPolicyStateV1(projection);
  const rows = await input.commitPort.commitEvent({
    subjectId,
    stateId: context.stateId,
    historyEntryId,
    expectedRevision: context.revision,
    historyDedupeKey: 'event:' + event.dedupeKey,
    event,
    provenanceRefIds: Object.freeze(provenanceRefIds),
    decision,
    projection,
    policyState,
  });

  const row = requireCommitRow(rows);
  assertCommitMatchesProjection({
    row,
    context,
    historyEntryId,
    event,
    projection,
  });
  return resultFromCommit(row);
}

export type {
  ProductionRelationshipEffectDispositionV1,
  ProductionRelationshipMilestoneKindV1,
};
