import {
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
} from '../../packages/domain/src/seyeon-event-ledger-v2.js';

export function seyeonEventFixture(input: {
  readonly id: string;
  readonly kind: SeyeonExperimentalEventKindV2;
  readonly day: number;
  readonly causalPredecessorEventIds?: readonly string[];
  readonly sourceMessageRefs?: readonly string[];
}): SeyeonRelationshipEventV2 {
  const refs = input.sourceMessageRefs ?? [`message-${input.id}`];
  return {
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event',
    eventId: input.id,
    dedupeKey: `dedupe-${input.id}`,
    characterId: 'seyeon',
    eventKind: input.kind,
    occurredAt: new Date(
      Date.UTC(2026, 0, Math.max(1, input.day), 12, 0, 0),
    ).toISOString(),
    sourceTurnId: `turn-${input.id}`,
    sourceMessageRefs: refs,
    causalPredecessorEventIds: input.causalPredecessorEventIds ?? [],
    facts: [
      {
        factKey: 'observed_interaction',
        statement: `source-backed fact for ${input.id}`,
        sourceRefs: refs,
      },
    ],
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.95,
  };
}
