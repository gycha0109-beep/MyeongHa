import {
  validateProductionRelationshipEventV1,
  type ProductionRelationshipEventV1,
} from '../../../packages/domain/src/index.js';
import {
  applyProductionRelationshipEventV1,
  type ApplyProductionRelationshipEventResultV1,
  type ProductionRelationshipApplyCommitPortV1,
  type ProductionRelationshipApplyContextPortV1,
  type ProductionRelationshipApplyIdPortV1,
} from './production-relationship-event-apply-command-v1.js';

type Awaitable<T> = T | Promise<T>;

export const SEYEON_PRODUCTION_RELATIONSHIP_SYNC_OUTBOX_VERSION_V1 =
  'seyeon-production-relationship-sync-outbox-v1' as const;

export interface SeyeonProductionRelationshipSyncOutboxPortV1 {
  enqueue(input: {
    readonly subjectId: string;
    readonly outboxEventId: string;
    readonly turnId: string;
    readonly productionEvent: ProductionRelationshipEventV1;
  }): Awaitable<
    readonly Readonly<{
      readonly outboxEventId: string;
      readonly status: string;
      readonly replayed: boolean;
    }>[]
  >;

  claim(input: {
    readonly subjectId: string;
    readonly outboxEventId: string;
    readonly lockOwner: string;
    readonly leaseExpiresAt: string;
  }): Awaitable<
    readonly Readonly<{
      readonly outboxEventId: string;
      readonly productionEventJsonb: unknown;
      readonly status: string;
      readonly lockOwner: string;
      readonly leaseExpiresAt: string;
      readonly reclaimed: boolean;
    }>[]
  >;

  complete(input: {
    readonly subjectId: string;
    readonly outboxEventId: string;
    readonly lockOwner: string;
  }): Awaitable<
    readonly Readonly<{
      readonly outboxEventId: string;
      readonly status: string;
      readonly processedAt: string;
      readonly replayed: boolean;
    }>[]
  >;
}

export interface ProcessSeyeonProductionRelationshipSyncOutboxInputV1 {
  readonly subjectId: string;
  readonly outboxEventId: string;
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
  readonly outboxPort: SeyeonProductionRelationshipSyncOutboxPortV1;
  readonly idPort: ProductionRelationshipApplyIdPortV1;
  readonly contextPort: ProductionRelationshipApplyContextPortV1;
  readonly commitPort: ProductionRelationshipApplyCommitPortV1;
}

export interface ProcessSeyeonProductionRelationshipSyncOutboxResultV1 {
  readonly version:
    typeof SEYEON_PRODUCTION_RELATIONSHIP_SYNC_OUTBOX_VERSION_V1;
  readonly outboxEventId: string;
  readonly reclaimed: boolean;
  readonly applyResult: ApplyProductionRelationshipEventResultV1;
  readonly processedAt: string;
  readonly completionReplayed: boolean;
}

export class SeyeonProductionRelationshipSyncOutboxErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonProductionRelationshipSyncOutboxErrorV1';
  }
}

function one<T>(rows: readonly T[], label: string): T {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new SeyeonProductionRelationshipSyncOutboxErrorV1(
      label + ' must return exactly one row.',
    );
  }
  return rows[0];
}

export async function processSeyeonProductionRelationshipSyncOutboxV1(
  input: ProcessSeyeonProductionRelationshipSyncOutboxInputV1,
): Promise<ProcessSeyeonProductionRelationshipSyncOutboxResultV1> {
  const claimed = one(
    await input.outboxPort.claim({
      subjectId: input.subjectId,
      outboxEventId: input.outboxEventId,
      lockOwner: input.lockOwner,
      leaseExpiresAt: input.leaseExpiresAt,
    }),
    'Se-yeon relationship sync claim',
  );

  const event = validateProductionRelationshipEventV1(
    claimed.productionEventJsonb as ProductionRelationshipEventV1,
  );
  if (
    event.subjectId !== input.subjectId ||
    event.characterId !== 'seyeon'
  ) {
    throw new SeyeonProductionRelationshipSyncOutboxErrorV1(
      'Claimed Production relationship Event does not belong to this Subject and Se-yeon.',
    );
  }

  // Load once under the same PostgreSQL transaction so the worker always
  // evaluates the admitted Event against the latest serialized relationship
  // revision. applyProductionRelationshipEventV1 locks/validates again before
  // commit and handles response-loss dedupe replay before stale rejection.
  const current = await input.contextPort.lockAndLoad({
    subjectId: input.subjectId,
    stateId: await input.idPort.nextStateId(),
    characterId: 'seyeon',
    sourceKind: event.source.sourceKind,
    sourceRef: event.source.sourceRef,
    sourceMessageRefs: event.source.sourceMessageRefs,
    eventOccurredAt: event.occurredAt,
  });

  const applyResult = await applyProductionRelationshipEventV1({
    resolvedSubjectId: input.subjectId,
    expectedRevision: current.revision,
    event,
    idPort: input.idPort,
    contextPort: input.contextPort,
    commitPort: input.commitPort,
  });

  const completed = one(
    await input.outboxPort.complete({
      subjectId: input.subjectId,
      outboxEventId: claimed.outboxEventId,
      lockOwner: input.lockOwner,
    }),
    'Se-yeon relationship sync completion',
  );

  if (
    completed.outboxEventId !== claimed.outboxEventId ||
    completed.status !== 'processed'
  ) {
    throw new SeyeonProductionRelationshipSyncOutboxErrorV1(
      'Se-yeon relationship sync outbox did not reach processed state.',
    );
  }

  return Object.freeze({
    version: SEYEON_PRODUCTION_RELATIONSHIP_SYNC_OUTBOX_VERSION_V1,
    outboxEventId: claimed.outboxEventId,
    reclaimed: claimed.reclaimed,
    applyResult,
    processedAt: completed.processedAt,
    completionReplayed: completed.replayed,
  });
}
