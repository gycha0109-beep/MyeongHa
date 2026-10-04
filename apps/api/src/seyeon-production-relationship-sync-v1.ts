import {
  admitSeyeonProductionRelationshipEventV1,
  deriveSeyeonProductionRelationshipDedupeKeyV1,
  evaluateProductionRelationshipHistoryV1,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipHistoryRecordV1,
  type ProductionRelationshipProjectionV1,
  type SeyeonEventAuthorityDecisionV1,
  type SeyeonRelationshipEventV2,
  type SeyeonProductionRelationshipAdmissionV1,
  type SeyeonProductionRelationshipCausalBindingV1,
} from '../../../packages/domain/src/index.js';
import {
  applyProductionRelationshipEventV1,
  type ApplyProductionRelationshipEventResultV1,
  type ProductionRelationshipApplyCommitPortV1,
  type ProductionRelationshipApplyContextPortV1,
  type ProductionRelationshipApplyIdPortV1,
} from './production-relationship-event-apply-command-v1.js';
import type {
  SeyeonProductionRelationshipSyncOutboxPortV1,
} from './seyeon-production-relationship-outbox-v1.js';

type Awaitable<T> = T | Promise<T>;

export const SEYEON_PRODUCTION_RELATIONSHIP_SYNC_VERSION_V1 =
  'seyeon-production-relationship-sync-v1' as const;

export const SEYEON_PRODUCTION_RELATIONSHIP_MODES_V1 = Object.freeze([
  'OFF',
  'SHADOW',
  'WRITE_DARK',
  'BEHAVIOR_SHADOW',
  'LIVE',
] as const);

export type SeyeonProductionRelationshipModeV1 =
  (typeof SEYEON_PRODUCTION_RELATIONSHIP_MODES_V1)[number];

export interface SeyeonProductionRelationshipSyncIdPortV1
  extends ProductionRelationshipApplyIdPortV1 {
  nextProductionEventId(): Awaitable<string>;
}

export interface SyncSeyeonProductionRelationshipEventV1Input {
  readonly mode: SeyeonProductionRelationshipModeV1;
  readonly resolvedSubjectId: string;
  readonly expectedRevision: number;
  readonly experimentalEvent: SeyeonRelationshipEventV2;
  readonly authorityDecision: SeyeonEventAuthorityDecisionV1;
  readonly activeExperimentalEvents: readonly SeyeonRelationshipEventV2[];
  readonly productionHistoryRecords: readonly ProductionRelationshipHistoryRecordV1[];
  readonly committedTurn: Readonly<{
    readonly turnId: string;
    readonly assistantMessageRef: string;
    readonly occurredAt: string;
  }>;
  readonly productionAuthorityRef: string;
  readonly idPort: SeyeonProductionRelationshipSyncIdPortV1;
  readonly contextPort: ProductionRelationshipApplyContextPortV1;
  readonly commitPort: ProductionRelationshipApplyCommitPortV1;
  readonly durableSync?: Readonly<{
    readonly outboxEventId: string;
    readonly outboxPort: SeyeonProductionRelationshipSyncOutboxPortV1;
  }>;
}

export type SyncSeyeonProductionRelationshipEventV1Result =
  | Readonly<{
      readonly version: typeof SEYEON_PRODUCTION_RELATIONSHIP_SYNC_VERSION_V1;
      readonly mode: 'OFF';
      readonly status: 'disabled';
    }>
  | Readonly<{
      readonly version: typeof SEYEON_PRODUCTION_RELATIONSHIP_SYNC_VERSION_V1;
      readonly mode: 'SHADOW';
      readonly status: 'shadow';
      readonly admission: SeyeonProductionRelationshipAdmissionV1;
      readonly projectedRelationship: ProductionRelationshipProjectionV1;
      readonly revisionBefore: number;
      readonly revisionAfter: number;
    }>
  | Readonly<{
      readonly version: typeof SEYEON_PRODUCTION_RELATIONSHIP_SYNC_VERSION_V1;
      readonly mode: 'WRITE_DARK' | 'BEHAVIOR_SHADOW' | 'LIVE';
      readonly status: 'committed';
      readonly admission: SeyeonProductionRelationshipAdmissionV1;
      readonly durableOutboxEnqueue: null | Readonly<{
        readonly outboxEventId: string;
        readonly status: string;
        readonly replayed: boolean;
      }>;
      readonly applyResult: ApplyProductionRelationshipEventResultV1;
    }>;

export class SeyeonProductionRelationshipSyncErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonProductionRelationshipSyncErrorV1';
  }
}

function activeExperimentalById(
  events: readonly SeyeonRelationshipEventV2[],
): ReadonlyMap<string, SeyeonRelationshipEventV2> {
  const result = new Map<string, SeyeonRelationshipEventV2>();
  for (const event of events) {
    if (result.has(event.eventId)) {
      throw new SeyeonProductionRelationshipSyncErrorV1(
        'Active experimental relationship events contain a duplicate eventId.',
      );
    }
    result.set(event.eventId, event);
  }
  return result;
}

function resolveCausalBindings(input: {
  readonly subjectId: string;
  readonly event: SeyeonRelationshipEventV2;
  readonly activeExperimentalEvents: readonly SeyeonRelationshipEventV2[];
  readonly productionHistoryRecords: readonly ProductionRelationshipHistoryRecordV1[];
}): readonly SeyeonProductionRelationshipCausalBindingV1[] {
  if (input.event.causalPredecessorEventIds.length === 0) {
    return Object.freeze([]);
  }

  const experimental = activeExperimentalById(input.activeExperimentalEvents);
  const replay = replayProductionRelationshipHistoryV1(
    input.productionHistoryRecords,
  );
  const byDedupe = new Map(
    replay.activeEvents.map((event) => [event.dedupeKey, event] as const),
  );

  return Object.freeze(
    input.event.causalPredecessorEventIds.map((experimentalEventId) => {
      const predecessor = experimental.get(experimentalEventId);
      if (predecessor === undefined) {
        throw new SeyeonProductionRelationshipSyncErrorV1(
          'Experimental causal predecessor is not active in the Se-yeon ledger.',
        );
      }

      const dedupeKey = deriveSeyeonProductionRelationshipDedupeKeyV1({
        subjectId: input.subjectId,
        experimentalEvent: predecessor,
      });
      const productionEvent = byDedupe.get(dedupeKey);
      if (productionEvent === undefined) {
        throw new SeyeonProductionRelationshipSyncErrorV1(
          'Experimental causal predecessor has no active Production relationship Event binding.',
        );
      }

      return Object.freeze({
        experimentalEventId,
        productionEvent,
      });
    }),
  );
}

export async function syncSeyeonProductionRelationshipEventV1(
  input: SyncSeyeonProductionRelationshipEventV1Input,
): Promise<SyncSeyeonProductionRelationshipEventV1Result> {
  if (!SEYEON_PRODUCTION_RELATIONSHIP_MODES_V1.includes(input.mode)) {
    throw new SeyeonProductionRelationshipSyncErrorV1(
      'Unknown Se-yeon Production relationship mode.',
    );
  }
  if (input.mode === 'OFF') {
    return Object.freeze({
      version: SEYEON_PRODUCTION_RELATIONSHIP_SYNC_VERSION_V1,
      mode: 'OFF' as const,
      status: 'disabled' as const,
    });
  }

  const historyReplay = replayProductionRelationshipHistoryV1(
    input.productionHistoryRecords,
  );
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    historyReplay.physicalRevision !== input.expectedRevision
  ) {
    throw new SeyeonProductionRelationshipSyncErrorV1(
      'Se-yeon Production relationship sync history is stale.',
    );
  }

  const admission = admitSeyeonProductionRelationshipEventV1({
    subjectId: input.resolvedSubjectId,
    productionEventId: await input.idPort.nextProductionEventId(),
    productionAuthorityRef: input.productionAuthorityRef,
    committedTurnId: input.committedTurn.turnId,
    committedAssistantMessageRef: input.committedTurn.assistantMessageRef,
    authoritativeOccurredAt: input.committedTurn.occurredAt,
    experimentalEvent: input.experimentalEvent,
    authorityDecision: input.authorityDecision,
    causalBindings: resolveCausalBindings({
      subjectId: input.resolvedSubjectId,
      event: input.experimentalEvent,
      activeExperimentalEvents: input.activeExperimentalEvents,
      productionHistoryRecords: input.productionHistoryRecords,
    }),
  });

  if (input.mode === 'SHADOW') {
    const projectedRelationship = evaluateProductionRelationshipHistoryV1(
      [...historyReplay.activeEvents, admission.event],
      { physicalRevision: input.expectedRevision + 1 },
    );
    return Object.freeze({
      version: SEYEON_PRODUCTION_RELATIONSHIP_SYNC_VERSION_V1,
      mode: input.mode,
      status: 'shadow' as const,
      admission,
      projectedRelationship,
      revisionBefore: input.expectedRevision,
      revisionAfter: input.expectedRevision + 1,
    });
  }

  const durableOutboxEnqueue =
    input.durableSync === undefined
      ? null
      : (() => input.durableSync)();

  let durableReceipt: null | Readonly<{
    outboxEventId: string;
    status: string;
    replayed: boolean;
  }> = null;

  if (durableOutboxEnqueue !== null) {
    const rows = await durableOutboxEnqueue.outboxPort.enqueue({
      subjectId: input.resolvedSubjectId,
      outboxEventId: durableOutboxEnqueue.outboxEventId,
      turnId: input.committedTurn.turnId,
      productionEvent: admission.event,
    });
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new SeyeonProductionRelationshipSyncErrorV1(
        'Durable Se-yeon relationship sync enqueue must return exactly one row.',
      );
    }
    const row = rows[0];
    if (
      row.outboxEventId.trim().length === 0 ||
      row.status.trim().length === 0
    ) {
      throw new SeyeonProductionRelationshipSyncErrorV1(
        'Durable Se-yeon relationship sync enqueue returned invalid authority material.',
      );
    }
    durableReceipt = Object.freeze({
      outboxEventId: row.outboxEventId,
      status: row.status,
      replayed: row.replayed,
    });
  }

  const applyResult = await applyProductionRelationshipEventV1({
    resolvedSubjectId: input.resolvedSubjectId,
    expectedRevision: input.expectedRevision,
    event: admission.event,
    idPort: input.idPort,
    contextPort: input.contextPort,
    commitPort: input.commitPort,
  });

  return Object.freeze({
    version: SEYEON_PRODUCTION_RELATIONSHIP_SYNC_VERSION_V1,
    mode: input.mode,
    status: 'committed' as const,
    admission,
    durableOutboxEnqueue: durableReceipt,
    applyResult,
  });
}
