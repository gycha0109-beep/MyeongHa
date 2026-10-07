import {
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
  type SeyeonEventExtractionPriorEventV2,
  type SeyeonProductionRelationshipCausalBindingV1,
} from '../../../packages/domain/src/index.js';
import {
  resolveSeyeonExperimentalEvidenceKindForProductionEventV1,
} from '../../../packages/domain/src/seyeon-relationship-event-bindings-v1.js';

export const SEYEON_PRODUCTION_CAUSAL_CONTEXT_VERSION_V1 =
  'seyeon-production-causal-context-v1' as const;

export interface SeyeonProductionCausalContextV1 {
  readonly version:
    typeof SEYEON_PRODUCTION_CAUSAL_CONTEXT_VERSION_V1;
  readonly priorEvents: readonly SeyeonEventExtractionPriorEventV2[];
  readonly causalBindings:
    readonly SeyeonProductionRelationshipCausalBindingV1[];
}

function activeOpenCausalRoots(
  events: readonly ProductionRelationshipEventV1[],
): readonly ProductionRelationshipEventV1[] {
  const commitmentRootsClosed = new Set(
    events
      .filter(
        (event) =>
          event.eventKind === 'COMMITMENT_KEPT' ||
          event.eventKind === 'COMMITMENT_BROKEN',
      )
      .flatMap((event) => event.causalPredecessorEventIds),
  );
  const conflictRootsClosed = new Set(
    events
      .filter((event) => event.eventKind === 'RECONCILIATION')
      .flatMap((event) => event.causalPredecessorEventIds),
  );

  return Object.freeze(
    events.filter((event) => {
      switch (event.eventKind) {
        case 'COMMITMENT_MADE':
          return !commitmentRootsClosed.has(event.eventId);
        case 'COMMITMENT_BROKEN':
        case 'CONFLICT_OPENED':
        case 'RELATIONAL_EXPECTATION_INVALIDATED':
          return !conflictRootsClosed.has(event.eventId);
        default:
          return false;
      }
    }),
  );
}

function priorEventView(
  event: ProductionRelationshipEventV1,
): SeyeonEventExtractionPriorEventV2 {
  if (event.characterId !== 'seyeon') {
    throw new TypeError(
      'Se-yeon Production causal context cannot contain another Character Event.',
    );
  }

  return Object.freeze({
    authority:
      'authorized_production_relationship_event_v1' as const,
    eventId: event.eventId,
    characterId: 'seyeon' as const,
    eventKind:
      resolveSeyeonExperimentalEvidenceKindForProductionEventV1(
        event.eventKind,
      ),
    occurredAt: event.occurredAt,
    causalPredecessorEventIds:
      Object.freeze([...event.causalPredecessorEventIds]),
    facts: Object.freeze(
      event.facts.map((fact) =>
        Object.freeze({
          factKey: fact.factKey,
          statement: fact.statement,
          sourceRefs: Object.freeze([...fact.sourceRefs]),
        }),
      ),
    ),
  });
}

export function snapshotSeyeonProductionHistoryCausalContextV1(
  historyRecords: readonly ProductionRelationshipHistoryRecordV1[],
): SeyeonProductionCausalContextV1 {
  const replay = replayProductionRelationshipHistoryV1(
    historyRecords,
  );
  const selected = [...activeOpenCausalRoots(replay.activeEvents)]
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        left.eventId.localeCompare(right.eventId),
    )
    .slice(0, 8);

  const priorEvents = Object.freeze(selected.map(priorEventView));
  const causalBindings = Object.freeze(
    selected.map((productionEvent) =>
      Object.freeze({
        causalEventRef: productionEvent.eventId,
        bindingAuthority:
          'authorized_production_history' as const,
        productionEvent,
      }),
    ),
  );

  return Object.freeze({
    version: SEYEON_PRODUCTION_CAUSAL_CONTEXT_VERSION_V1,
    priorEvents,
    causalBindings,
  });
}
