import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1,
  PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
  canonicalJson,
  replayProductionRelationshipHistoryV1,
  validateProductionRelationshipEventV1,
  type ProductionRelationshipEventDecisionV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
  type ProductionRelationshipProjectionV1,
} from '../../../packages/domain/src/index.js';
import {
  PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1,
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipApplyContextPortV1,
  type ProductionRelationshipApplyCommitRowV1,
  type ProductionRelationshipPolicyStateV1,
} from './production-relationship-event-apply-command-v1.js';

type Awaitable<T> = T | Promise<T>;

export const PRODUCTION_RELATIONSHIP_RELIABILITY_VERSION_V1 =
  'production-relationship-reliability-v1' as const;

export type ProductionRelationshipReliabilityFailureCodeV1 =
  | 'INVALID_ADJUSTMENT'
  | 'STALE_RELATIONSHIP_REVISION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CAUSAL_HISTORY_INVALID'
  | 'POLICY_AUTHORITY_MISMATCH'
  | 'PROJECTION_INTEGRITY_MISMATCH'
  | 'COMMIT_RESULT_MISMATCH';

export class ProductionRelationshipReliabilityErrorV1 extends Error {
  constructor(
    readonly code: ProductionRelationshipReliabilityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ProductionRelationshipReliabilityErrorV1';
  }
}

export type ProductionRelationshipReliabilityHistoryRecordV1 =
  ProductionRelationshipHistoryRecordV1 &
    Readonly<{
      adjustmentId?: string;
      reasonCode?: string;
      authorityRef?: string;
    }>;

export interface ProductionRelationshipHistoryContextV1 {
  readonly stateId: string;
  readonly revision: number;
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly relationshipStage: string;
  readonly attainedStage: ProductionRelationshipProjectionV1['attainedStage'];
  readonly currentCandidateStage: ProductionRelationshipProjectionV1['currentCandidateStage'];
  readonly currentCondition: ProductionRelationshipProjectionV1['currentCondition'];
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly policyStateSchemaVersion: string;
  readonly policyStateJsonb: unknown;
  readonly lastInteractionAt: string | null;
  readonly activePolicyVersion: string;
  readonly activePolicyContentHash: string;
  readonly activePolicyArtifactSchemaVersion: string;
  readonly activePolicyArtifactJsonb: unknown;
  readonly serverNow: string;
  readonly historyRecords: readonly ProductionRelationshipReliabilityHistoryRecordV1[];
}

export interface ProductionRelationshipHistoryContextPortV1 {
  lockAndLoad(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): Awaitable<ProductionRelationshipHistoryContextV1>;
}

export type ProductionRelationshipAdjustmentOperationV1 =
  | Readonly<{
      readonly action: 'retract';
      readonly dedupeKey: string;
      readonly targetEventId: string;
      readonly reasonCode: string;
      readonly reason: string;
      readonly authorityRef: string;
    }>
  | Readonly<{
      readonly action: 'correct';
      readonly dedupeKey: string;
      readonly targetEventId: string;
      readonly replacementEvent: ProductionRelationshipEventV1;
      readonly reasonCode: string;
      readonly reason: string;
      readonly authorityRef: string;
    }>;

export interface ProductionRelationshipAdjustmentIdPortV1 {
  nextHistoryEntryId(): Awaitable<string>;
  nextAdjustmentId(): Awaitable<string>;
  nextProvenanceRefId(): Awaitable<string>;
}

export interface ProductionRelationshipAdjustmentAppendPortV1 {
  appendRetraction(input: {
    readonly subjectId: string;
    readonly characterId: string;
    readonly expectedBaseRevision: number;
    readonly ordinal: number;
    readonly historyEntryId: string;
    readonly historyDedupeKey: string;
    readonly adjustmentId: string;
    readonly targetEventId: string;
    readonly reasonCode: string;
    readonly reason: string;
    readonly authorityRef: string;
  }): Awaitable<void>;

  appendCorrection(input: {
    readonly subjectId: string;
    readonly characterId: string;
    readonly expectedBaseRevision: number;
    readonly ordinal: number;
    readonly historyEntryId: string;
    readonly historyDedupeKey: string;
    readonly adjustmentId: string;
    readonly targetEventId: string;
    readonly reasonCode: string;
    readonly reason: string;
    readonly authorityRef: string;
    readonly replacementEvent: ProductionRelationshipEventV1;
    readonly provenanceRefIds: readonly string[];
    readonly decision: ProductionRelationshipEventDecisionV1;
  }): Awaitable<void>;

  commitProjection(input: {
    readonly subjectId: string;
    readonly characterId: string;
    readonly expectedBaseRevision: number;
    readonly projection: ProductionRelationshipProjectionV1;
    readonly policyState: ProductionRelationshipPolicyStateV1;
  }): Awaitable<readonly ProductionRelationshipApplyCommitRowV1[]>;
}

export interface ApplyProductionRelationshipAdjustmentBatchInputV1 {
  readonly resolvedSubjectId: string;
  readonly characterId: string;
  readonly expectedRevision: number;
  readonly operations: readonly ProductionRelationshipAdjustmentOperationV1[];
  readonly idPort: ProductionRelationshipAdjustmentIdPortV1;
  readonly contextPort: ProductionRelationshipHistoryContextPortV1;
  readonly replacementSourcePort: ProductionRelationshipApplyContextPortV1;
  readonly commitPort: ProductionRelationshipAdjustmentAppendPortV1;
}

export interface ApplyProductionRelationshipAdjustmentBatchResultV1 {
  readonly reliabilityVersion: typeof PRODUCTION_RELATIONSHIP_RELIABILITY_VERSION_V1;
  readonly applied: boolean;
  readonly replayed: boolean;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly projection: ProductionRelationshipProjectionV1;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textValue(name: string, value: unknown, max = 1200): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > max
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'INVALID_ADJUSTMENT',
      name + ' is invalid.',
    );
  }
  return value.trim();
}

function uuidValue(name: string, value: unknown): string {
  const valueText = textValue(name, value, 64);
  if (!UUID.test(valueText)) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'INVALID_ADJUSTMENT',
      name + ' must be a canonical UUID.',
    );
  }
  return valueText.toLowerCase();
}

function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function eventRetryMaterial(event: ProductionRelationshipEventV1): unknown {
  const validated = validateProductionRelationshipEventV1(event);
  const { eventId: _eventId, ...rest } = validated;
  return rest;
}

function assertPolicy(context: ProductionRelationshipHistoryContextV1): void {
  const artifact = PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1;
  if (
    context.activePolicyVersion !== PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1 ||
    context.activePolicyContentHash !== artifact.contentHash ||
    context.activePolicyArtifactSchemaVersion !==
      PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1 ||
    !sameJson(context.activePolicyArtifactJsonb, artifact.payload) ||
    context.policyVersion !== PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1 ||
    context.policyContentHash !== artifact.contentHash
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'POLICY_AUTHORITY_MISMATCH',
      'Persisted relationship policy does not match compiled Production V1.',
    );
  }
}

function replayOrThrow(
  records: readonly ProductionRelationshipHistoryRecordV1[],
) {
  try {
    return replayProductionRelationshipHistoryV1(records);
  } catch (error) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'CAUSAL_HISTORY_INVALID',
      error instanceof Error ? error.message : 'Relationship replay failed.',
    );
  }
}

function assertProjectionMatchesContext(
  context: ProductionRelationshipHistoryContextV1,
): ProductionRelationshipProjectionV1 {
  const replay = replayOrThrow(context.historyRecords);
  const policyState = projectProductionRelationshipPolicyStateV1(
    replay.projection,
  );
  if (
    replay.physicalRevision !== context.revision ||
    replay.projection.revision !== context.revision ||
    replay.projection.scores.closeness !== context.closeness ||
    replay.projection.scores.trust !== context.trust ||
    replay.projection.scores.friction !== context.friction ||
    replay.projection.attainedStage !== context.attainedStage ||
    replay.projection.currentCandidateStage !==
      context.currentCandidateStage ||
    replay.projection.currentCondition !== context.currentCondition ||
    replay.projection.policyVersion !== context.policyVersion ||
    replay.projection.policyContentHash !== context.policyContentHash ||
    context.policyStateSchemaVersion !==
      PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1 ||
    !sameJson(context.policyStateJsonb, policyState)
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'PROJECTION_INTEGRITY_MISMATCH',
      'Stored relationship projection differs from authoritative replay.',
    );
  }
  return replay.projection;
}

function operationExistingMatch(
  record: ProductionRelationshipReliabilityHistoryRecordV1,
  operation: ProductionRelationshipAdjustmentOperationV1,
): boolean {
  if (
    record.dedupeKey !== operation.dedupeKey ||
    record.targetEventId !== operation.targetEventId ||
    record.reason !== operation.reason ||
    record.reasonCode !== operation.reasonCode ||
    record.authorityRef !== operation.authorityRef
  ) {
    return false;
  }
  if (operation.action === 'retract') return record.action === 'retract';
  return (
    record.action === 'correct' &&
    sameJson(
      eventRetryMaterial(record.replacementEvent),
      eventRetryMaterial(operation.replacementEvent),
    )
  );
}

function existingOperationState(
  records: readonly ProductionRelationshipReliabilityHistoryRecordV1[],
  operations: readonly ProductionRelationshipAdjustmentOperationV1[],
): 'none' | 'all' | 'partial' | 'conflict' {
  let matched = 0;
  let present = 0;
  for (const operation of operations) {
    const record = records.find((item) => item.dedupeKey === operation.dedupeKey);
    if (record === undefined) continue;
    present += 1;
    if (operationExistingMatch(record, operation)) matched += 1;
  }
  if (present === 0) return 'none';
  if (matched === operations.length && present === operations.length) return 'all';
  if (matched === present) return 'partial';
  return 'conflict';
}

function decisionForEvent(
  projection: ProductionRelationshipProjectionV1,
  eventId: string,
): ProductionRelationshipEventDecisionV1 {
  const decision = projection.decisions.find((item) => item.eventId === eventId);
  if (
    decision === undefined ||
    decision.applied !== true ||
    decision.duplicateRetry !== false ||
    decision.effectDisposition === null
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'INVALID_ADJUSTMENT',
      'Correction replacement Event did not produce one applicable decision.',
    );
  }
  return decision;
}

function requireOneCommitRow(
  rows: readonly ProductionRelationshipApplyCommitRowV1[],
): ProductionRelationshipApplyCommitRowV1 {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Relationship replay projection commit must return exactly one row.',
    );
  }
  return rows[0];
}

export async function applyProductionRelationshipAdjustmentBatchV1(
  input: ApplyProductionRelationshipAdjustmentBatchInputV1,
): Promise<ApplyProductionRelationshipAdjustmentBatchResultV1> {
  const subjectId = uuidValue('resolved Subject id', input.resolvedSubjectId);
  const characterId = textValue('Character id', input.characterId, 120);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.operations.length < 1 ||
    input.operations.length > 16
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'INVALID_ADJUSTMENT',
      'Relationship adjustment batch shape is invalid.',
    );
  }

  const dedupes = input.operations.map((operation) =>
    textValue('adjustment dedupe key', operation.dedupeKey, 256),
  );
  if (new Set(dedupes).size !== dedupes.length) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'INVALID_ADJUSTMENT',
      'Relationship adjustment batch dedupe keys must be unique.',
    );
  }

  const context = await input.contextPort.lockAndLoad({
    subjectId,
    characterId,
  });
  assertPolicy(context);
  const currentProjection = assertProjectionMatchesContext(context);

  const existingState = existingOperationState(
    context.historyRecords,
    input.operations,
  );
  if (existingState === 'all') {
    return Object.freeze({
      reliabilityVersion: PRODUCTION_RELATIONSHIP_RELIABILITY_VERSION_V1,
      applied: false,
      replayed: true,
      revisionBefore: context.revision,
      revisionAfter: context.revision,
      projection: currentProjection,
    });
  }
  if (existingState !== 'none') {
    throw new ProductionRelationshipReliabilityErrorV1(
      'IDEMPOTENCY_CONFLICT',
      'Relationship adjustment batch partially exists or differs semantically.',
    );
  }
  if (context.revision !== input.expectedRevision) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'STALE_RELATIONSHIP_REVISION',
      'Relationship adjustment expected revision is stale.',
    );
  }

  const simulated: ProductionRelationshipReliabilityHistoryRecordV1[] = [
    ...context.historyRecords,
  ];
  const persistence: Array<
    Readonly<{
      operation: ProductionRelationshipAdjustmentOperationV1;
      ordinal: number;
      historyEntryId: string;
      adjustmentId: string;
      provenanceRefIds: readonly string[];
      decision: ProductionRelationshipEventDecisionV1 | null;
    }>
  > = [];

  for (let index = 0; index < input.operations.length; index += 1) {
    const operation = input.operations[index]!;
    const ordinal = index + 1;
    const historyEntryId = uuidValue(
      'history entry id',
      await input.idPort.nextHistoryEntryId(),
    );
    const adjustmentId = uuidValue(
      'adjustment id',
      await input.idPort.nextAdjustmentId(),
    );
    const reason = textValue('adjustment reason', operation.reason, 1200);
    textValue('adjustment reason code', operation.reasonCode, 128);
    textValue('adjustment authority ref', operation.authorityRef, 512);
    uuidValue('adjustment target Event id', operation.targetEventId);

    if (operation.action === 'retract') {
      simulated.push(
        Object.freeze({
          action: 'retract' as const,
          ledgerEntryId: historyEntryId,
          dedupeKey: operation.dedupeKey,
          recordedAt: context.serverNow,
          targetEventId: operation.targetEventId,
          reason,
          adjustmentId,
          reasonCode: operation.reasonCode,
          authorityRef: operation.authorityRef,
        }),
      );
      replayOrThrow(simulated);
      persistence.push(
        Object.freeze({
          operation,
          ordinal,
          historyEntryId,
          adjustmentId,
          provenanceRefIds: Object.freeze([]),
          decision: null,
        }),
      );
      continue;
    }

    const replacementEvent = validateProductionRelationshipEventV1(
      operation.replacementEvent,
    );
    if (
      replacementEvent.subjectId.toLowerCase() !== subjectId ||
      replacementEvent.characterId !== characterId
    ) {
      throw new ProductionRelationshipReliabilityErrorV1(
        'INVALID_ADJUSTMENT',
        'Correction replacement must stay in the same Subject-Character relationship.',
      );
    }

    const sourceContext = await input.replacementSourcePort.lockAndLoad({
      subjectId,
      stateId: context.stateId,
      characterId,
      sourceKind: replacementEvent.source.sourceKind,
      sourceRef: replacementEvent.source.sourceRef,
      sourceMessageRefs: replacementEvent.source.sourceMessageRefs,
      eventOccurredAt: replacementEvent.occurredAt,
    });
    assertPolicy({
      ...context,
      activePolicyVersion: sourceContext.activePolicyVersion,
      activePolicyContentHash: sourceContext.activePolicyContentHash,
      activePolicyArtifactSchemaVersion:
        sourceContext.activePolicyArtifactSchemaVersion,
      activePolicyArtifactJsonb: sourceContext.activePolicyArtifactJsonb,
    });
    if (
      new Date(sourceContext.canonicalOccurredAt).toISOString() !==
      replacementEvent.occurredAt
    ) {
      throw new ProductionRelationshipReliabilityErrorV1(
        'INVALID_ADJUSTMENT',
        'Correction replacement occurrence time differs from authoritative source time.',
      );
    }

    const provenanceRefIds: string[] = [];
    const provenanceCount =
      replacementEvent.source.sourceMessageRefs.length +
      replacementEvent.source.authorityRefs.length;
    for (let provenanceIndex = 0; provenanceIndex < provenanceCount; provenanceIndex += 1) {
      provenanceRefIds.push(
        uuidValue(
          'replacement provenance ref id',
          await input.idPort.nextProvenanceRefId(),
        ),
      );
    }

    simulated.push(
      Object.freeze({
        action: 'correct' as const,
        ledgerEntryId: historyEntryId,
        dedupeKey: operation.dedupeKey,
        recordedAt: context.serverNow,
        targetEventId: operation.targetEventId,
        replacementEvent,
        reason,
        adjustmentId,
        reasonCode: operation.reasonCode,
        authorityRef: operation.authorityRef,
      }),
    );
    const replay = replayOrThrow(simulated);
    persistence.push(
      Object.freeze({
        operation,
        ordinal,
        historyEntryId,
        adjustmentId,
        provenanceRefIds: Object.freeze(provenanceRefIds),
        decision: decisionForEvent(replay.projection, replacementEvent.eventId),
      }),
    );
  }

  const finalReplay = replayOrThrow(simulated);
  const finalProjection = finalReplay.projection;
  if (
    finalReplay.physicalRevision !==
    context.revision + input.operations.length
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'CAUSAL_HISTORY_INVALID',
      'Adjustment batch did not consume exactly one physical revision per operation.',
    );
  }

  for (const item of persistence) {
    const operation = item.operation;
    if (operation.action === 'retract') {
      await input.commitPort.appendRetraction({
        subjectId,
        characterId,
        expectedBaseRevision: context.revision,
        ordinal: item.ordinal,
        historyEntryId: item.historyEntryId,
        historyDedupeKey: operation.dedupeKey,
        adjustmentId: item.adjustmentId,
        targetEventId: operation.targetEventId,
        reasonCode: operation.reasonCode,
        reason: operation.reason,
        authorityRef: operation.authorityRef,
      });
    } else {
      await input.commitPort.appendCorrection({
        subjectId,
        characterId,
        expectedBaseRevision: context.revision,
        ordinal: item.ordinal,
        historyEntryId: item.historyEntryId,
        historyDedupeKey: operation.dedupeKey,
        adjustmentId: item.adjustmentId,
        targetEventId: operation.targetEventId,
        reasonCode: operation.reasonCode,
        reason: operation.reason,
        authorityRef: operation.authorityRef,
        replacementEvent: operation.replacementEvent,
        provenanceRefIds: item.provenanceRefIds,
        decision: item.decision!,
      });
    }
  }

  const rows = await input.commitPort.commitProjection({
    subjectId,
    characterId,
    expectedBaseRevision: context.revision,
    projection: finalProjection,
    policyState: projectProductionRelationshipPolicyStateV1(finalProjection),
  });
  const row = requireOneCommitRow(rows);
  if (
    row.revisionAfter !== finalProjection.revision ||
    row.closeness !== finalProjection.scores.closeness ||
    row.trust !== finalProjection.scores.trust ||
    row.friction !== finalProjection.scores.friction ||
    row.attainedStage !== finalProjection.attainedStage ||
    row.currentCandidateStage !== finalProjection.currentCandidateStage ||
    row.currentCondition !== finalProjection.currentCondition ||
    row.policyVersion !== finalProjection.policyVersion ||
    row.policyContentHash !== finalProjection.policyContentHash
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Adjustment batch DB projection differs from deterministic replay.',
    );
  }

  return Object.freeze({
    reliabilityVersion: PRODUCTION_RELATIONSHIP_RELIABILITY_VERSION_V1,
    applied: true,
    replayed: false,
    revisionBefore: context.revision,
    revisionAfter: finalProjection.revision,
    projection: finalProjection,
  });
}
