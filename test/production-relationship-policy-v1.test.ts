import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_EVENT_KINDS_V1,
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
  SEYEON_PRODUCTION_RELATIONSHIP_EVENT_BINDINGS_V1,
  SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_BINDING_AUTHORIZED_V1,
  ProductionRelationshipEventValidationErrorV1,
  ProductionRelationshipReplayErrorV1,
  evaluateProductionRelationshipHistoryV1,
  replayProductionRelationshipHistoryV1,
  validateProductionRelationshipEventV1,
  type ProductionRelationshipEventKindV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
} from '../packages/domain/src/index.js';

const START = Date.parse('2026-01-01T00:00:00.000Z');

function payloadFor(
  kind: ProductionRelationshipEventKindV1,
  key: string,
): Readonly<Record<string, string>> {
  switch (kind) {
    case 'COMMITMENT_MADE':
    case 'COMMITMENT_KEPT':
    case 'COMMITMENT_BROKEN':
      return Object.freeze({ commitmentKey: key });
    case 'CHARACTER_DETAIL_REMEMBERED':
      return Object.freeze({ detailKey: key });
    case 'CARE_ACCEPTED_BY_CHARACTER':
    case 'CARE_REQUESTED_BY_CHARACTER':
      return Object.freeze({ careKey: key });
    case 'CHARACTER_SELF_DISCLOSURE':
    case 'CHARACTER_VULNERABILITY_REVEALED':
      return Object.freeze({ topicKey: key });
    case 'RELATIONAL_EXPECTATION_INVALIDATED':
      return Object.freeze({ expectationKey: key });
    case 'CONFLICT_OPENED':
      return Object.freeze({ conflictKey: key });
    case 'RECONCILIATION':
      return Object.freeze({ resolutionKey: key });
    case 'RETURN_AFTER_ABSENCE':
      return Object.freeze({ observationKey: key });
  }
}

function eventFixture(input: {
  readonly id: string;
  readonly kind: ProductionRelationshipEventKindV1;
  readonly day: number;
  readonly semanticKey?: string;
  readonly predecessorIds?: readonly string[];
  readonly dedupeKey?: string;
}): ProductionRelationshipEventV1 {
  const sourceRef = 'turn:' + input.id;
  return Object.freeze({
    schemaVersion: 'relationship-event-v1' as const,
    authority: 'authorized_relationship_event_v1' as const,
    eventId: input.id,
    dedupeKey: input.dedupeKey ?? 'dedupe:' + input.id,
    subjectId: 'subject-1',
    characterId: 'seyeon',
    eventKind: input.kind,
    eventSchemaVersion: '1' as const,
    characterBehaviorKey: null,
    occurredAt: new Date(START + (input.day - 1) * 24 * 60 * 60 * 1000).toISOString(),
    source: Object.freeze({
      sourceKind:
        input.kind === 'RETURN_AFTER_ABSENCE'
          ? ('server_observation' as const)
          : ('conversation_turn' as const),
      sourceRef,
      sourceMessageRefs:
        input.kind === 'RETURN_AFTER_ABSENCE'
          ? Object.freeze([])
          : Object.freeze(['message:' + input.id]),
      authorityRefs: Object.freeze(['authority:' + input.id]),
    }),
    causalPredecessorEventIds: Object.freeze([
      ...(input.predecessorIds ?? []),
    ]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'fact:' + input.id,
        statement: 'Authority-backed fact for ' + input.id,
        sourceRefs: Object.freeze([sourceRef]),
      }),
    ]),
    characterInterpretation: null,
    payload: payloadFor(
      input.kind,
      input.semanticKey ?? 'semantic:' + input.id,
    ),
  });
}

function sustainedNarrowRoute(weeks: number): ProductionRelationshipEventV1[] {
  const events: ProductionRelationshipEventV1[] = [];
  for (let week = 0; week < weeks; week += 1) {
    events.push(
      eventFixture({
        id: 'care-' + week,
        kind: 'CARE_ACCEPTED_BY_CHARACTER',
        day: week * 7 + 1,
      }),
      eventFixture({
        id: 'recognition-' + week,
        kind: 'CHARACTER_DETAIL_REMEMBERED',
        day: week * 7 + 2,
      }),
    );
  }
  return events;
}

function diverseOrganicRoute(weeks: number): ProductionRelationshipEventV1[] {
  const kinds: readonly ProductionRelationshipEventKindV1[] = [
    'CARE_ACCEPTED_BY_CHARACTER',
    'CHARACTER_DETAIL_REMEMBERED',
    'CHARACTER_SELF_DISCLOSURE',
    'CHARACTER_VULNERABILITY_REVEALED',
  ];
  const events: ProductionRelationshipEventV1[] = [];
  let sequence = 0;
  for (let week = 0; week < weeks; week += 1) {
    for (let slot = 0; slot < 2; slot += 1) {
      const kind = kinds[sequence % kinds.length]!;
      events.push(
        eventFixture({
          id: 'organic-' + sequence,
          kind,
          day: week * 7 + 1 + slot,
        }),
      );
      sequence += 1;
    }
  }
  return events;
}

function record(
  event: ProductionRelationshipEventV1,
): ProductionRelationshipHistoryRecordV1 {
  return Object.freeze({
    action: 'record' as const,
    ledgerEntryId: 'entry:' + event.eventId,
    dedupeKey: 'entry-dedupe:' + event.eventId,
    recordedAt: event.occurredAt,
    event,
  });
}

describe('Production relationship policy V1', () => {
  it('freezes one immutable policy artifact and the exact 12-kind registry', () => {
    expect(PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.key).toBe(
      'production-relationship-policy',
    );
    expect(PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.version).toBe(
      PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
    );
    expect(PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash).toMatch(
      /^sha256:v1:[0-9a-f]{64}$/,
    );
    expect(PRODUCTION_RELATIONSHIP_EVENT_KINDS_V1).toHaveLength(12);
    expect(
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.scores.positiveSoftCap,
    ).toBe('DISABLED');
    expect(
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.replay
        .zeroPositiveEffectEventConsumesRevision,
    ).toBe(true);
  });

  it('fails closed on unknown schema and arbitrary payload fields', () => {
    const valid = eventFixture({
      id: 'valid-care',
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 1,
    });

    expect(() =>
      validateProductionRelationshipEventV1({
        ...valid,
        eventSchemaVersion: '2',
      } as unknown as ProductionRelationshipEventV1),
    ).toThrow(ProductionRelationshipEventValidationErrorV1);

    expect(() =>
      validateProductionRelationshipEventV1({
        ...valid,
        payload: {
          careKey: 'care-1',
          callerChosenDelta: '999',
        },
      } as unknown as ProductionRelationshipEventV1),
    ).toThrow(ProductionRelationshipEventValidationErrorV1);
  });

  it('does not reward making a promise, but rewards one verified kept outcome', () => {
    const made = eventFixture({
      id: 'promise-made',
      kind: 'COMMITMENT_MADE',
      day: 1,
      semanticKey: 'promise-1',
    });
    const kept = eventFixture({
      id: 'promise-kept',
      kind: 'COMMITMENT_KEPT',
      day: 2,
      semanticKey: 'promise-1',
      predecessorIds: [made.eventId],
    });

    const result = evaluateProductionRelationshipHistoryV1([made, kept]);

    expect(result.scores).toEqual({
      closeness: 4,
      trust: 5,
      friction: 0,
    });
    expect(result.episodeProfile.familyCounts.commitment).toBe(1);
    expect(result.episodeProfile.creditedPositiveEpisodes).toBe(1);
    expect(result.episodeProfile.milestoneCount).toBe(1);
  });

  it('applies same-family rolling anti-farming before positive score gain', () => {
    const events = [1, 2, 3, 4].map((day) =>
      eventFixture({
        id: 'care-burst-' + day,
        kind: 'CARE_ACCEPTED_BY_CHARACTER',
        day,
      }),
    );

    const result = evaluateProductionRelationshipHistoryV1(events);

    expect(result.revision).toBe(4);
    expect(result.episodeProfile.creditedPositiveEpisodes).toBe(2);
    expect(result.episodeProfile.suppressedPositiveEpisodes).toBe(2);
    expect(result.scores).toEqual({
      closeness: 6,
      trust: 8,
      friction: 0,
    });
    expect(
      result.decisions.filter(
        (decision) =>
          decision.effectDisposition === 'SUPPRESSED_POSITIVE_CREDIT',
      ),
    ).toHaveLength(2);
  });

  it('keeps duplicate retries idempotent without consuming another revision', () => {
    const first = eventFixture({
      id: 'dedupe-first',
      kind: 'CHARACTER_DETAIL_REMEMBERED',
      day: 1,
      dedupeKey: 'same-logical-event',
    });
    const retry = eventFixture({
      id: 'dedupe-retry',
      kind: 'CHARACTER_DETAIL_REMEMBERED',
      day: 1,
      dedupeKey: 'same-logical-event',
    });

    const result = evaluateProductionRelationshipHistoryV1([first, retry]);

    expect(result.revision).toBe(1);
    expect(result.evaluatedEventCount).toBe(1);
    expect(result.decisions[1]).toMatchObject({
      applied: false,
      duplicateRetry: true,
      evaluationSequenceBefore: 1,
      evaluationSequenceAfter: 1,
    });
  });

  it('keeps 39-week narrow evidence below S4 and permits 40-week meaningful narrow evidence without disclosure', () => {
    const at39 = evaluateProductionRelationshipHistoryV1(
      sustainedNarrowRoute(39),
    );
    const at40 = evaluateProductionRelationshipHistoryV1(
      sustainedNarrowRoute(40),
    );

    expect(at39.attainedStage).not.toBe('S4_SPECIAL');
    expect(at40.attainedStage).toBe('S4_SPECIAL');
    expect(at40.episodeProfile.distinctPositiveFamilies).toBe(2);
    expect(at40.episodeProfile.distinctPositiveWeeks).toBe(40);
  });

  it('permits the diverse organic route to reach S4 at 20 positive weeks', () => {
    const result = evaluateProductionRelationshipHistoryV1(
      diverseOrganicRoute(20),
    );

    expect(result.attainedStage).toBe('S4_SPECIAL');
    expect(result.episodeProfile.distinctPositiveFamilies).toBe(4);
    expect(result.episodeProfile.distinctPositiveWeeks).toBe(20);
    expect(result.episodeProfile.creditedPositiveEpisodes).toBeGreaterThanOrEqual(
      32,
    );
  });

  it('preserves attained depth during conflict and makes repeated repair callbacks non-farming', () => {
    const established = sustainedNarrowRoute(40);
    const conflict = eventFixture({
      id: 'late-conflict',
      kind: 'CONFLICT_OPENED',
      day: 300,
    });
    const repairA = eventFixture({
      id: 'repair-a',
      kind: 'RECONCILIATION',
      day: 301,
      predecessorIds: [conflict.eventId],
    });
    const repairB = eventFixture({
      id: 'repair-b',
      kind: 'RECONCILIATION',
      day: 302,
      predecessorIds: [conflict.eventId],
    });

    const duringConflict = evaluateProductionRelationshipHistoryV1([
      ...established,
      conflict,
    ]);
    expect(duringConflict.attainedStage).toBe('S4_SPECIAL');
    expect(duringConflict.currentCondition).toBe('OPEN_CONFLICT');
    expect(duringConflict.behaviorAccess).toBe('RESTRICTED_BY_CONFLICT');

    const repaired = evaluateProductionRelationshipHistoryV1([
      ...established,
      conflict,
      repairA,
      repairB,
    ]);
    expect(repaired.attainedStage).toBe('S4_SPECIAL');
    expect(repaired.currentCondition).toBe('RESOLVED_RECENTLY');
    expect(repaired.decisions.at(-2)?.effectiveDelta.friction).toBe(-6);
    expect(repaired.decisions.at(-1)?.effectiveDelta.friction).toBe(0);
    expect(repaired.episodeProfile.milestoneKinds).not.toContain(
      'repair_resolution',
    );
  });

  it('returns to STABLE only after a later non-repair credited positive Episode', () => {
    const conflict = eventFixture({
      id: 'conflict',
      kind: 'CONFLICT_OPENED',
      day: 1,
    });
    const repair = eventFixture({
      id: 'repair',
      kind: 'RECONCILIATION',
      day: 2,
      predecessorIds: [conflict.eventId],
    });
    const care = eventFixture({
      id: 'post-repair-care',
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 3,
    });

    expect(
      evaluateProductionRelationshipHistoryV1([conflict, repair])
        .currentCondition,
    ).toBe('RESOLVED_RECENTLY');
    expect(
      evaluateProductionRelationshipHistoryV1([conflict, repair, care])
        .currentCondition,
    ).toBe('STABLE');
  });

  it('replays a correction from the original logical slot and can unsuppress a later Episode', () => {
    const careA = eventFixture({
      id: 'care-a',
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 1,
    });
    const careB = eventFixture({
      id: 'care-b',
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 2,
    });
    const careC = eventFixture({
      id: 'care-c',
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 3,
    });
    const before = evaluateProductionRelationshipHistoryV1([
      careA,
      careB,
      careC,
    ]);
    expect(before.suppressedEpisodeIds).toContain('episode:care-c');

    const replacement = eventFixture({
      id: 'disclosure-replacement',
      kind: 'CHARACTER_SELF_DISCLOSURE',
      day: 1,
    });
    const result = replayProductionRelationshipHistoryV1([
      record(careA),
      record(careB),
      record(careC),
      Object.freeze({
        action: 'correct' as const,
        ledgerEntryId: 'correction-entry',
        dedupeKey: 'correction-command',
        recordedAt: '2026-01-10T00:00:00.000Z',
        targetEventId: careA.eventId,
        replacementEvent: replacement,
        reason: 'Authority-backed historical correction.',
      }),
    ]);

    expect(result.physicalRevision).toBe(4);
    expect(result.projection.revision).toBe(4);
    expect(result.projection.evaluatedEventCount).toBe(3);
    expect(result.projection.creditedEpisodeIds).toContain('episode:care-c');
    expect(result.projection.suppressedEpisodeIds).not.toContain(
      'episode:care-c',
    );
  });

  it('fails closed when retraction leaves an active causal descendant orphaned', () => {
    const made = eventFixture({
      id: 'orphan-made',
      kind: 'COMMITMENT_MADE',
      day: 1,
      semanticKey: 'orphan-promise',
    });
    const kept = eventFixture({
      id: 'orphan-kept',
      kind: 'COMMITMENT_KEPT',
      day: 2,
      semanticKey: 'orphan-promise',
      predecessorIds: [made.eventId],
    });

    expect(() =>
      replayProductionRelationshipHistoryV1([
        record(made),
        record(kept),
        Object.freeze({
          action: 'retract' as const,
          ledgerEntryId: 'retract-root',
          dedupeKey: 'retract-root-command',
          recordedAt: '2026-01-05T00:00:00.000Z',
          targetEventId: made.eventId,
          reason: 'Root authority invalidated.',
        }),
      ]),
    ).toThrow(ProductionRelationshipReplayErrorV1);
  });

  it('keeps Se-yeon bindings explicit while runtime Production binding remains disabled in Phase K', () => {
    expect(SEYEON_PRODUCTION_RELATIONSHIP_EVENT_BINDINGS_V1).toHaveLength(12);
    expect(
      SEYEON_PRODUCTION_RELATIONSHIP_EVENT_BINDINGS_V1.find(
        (binding) =>
          binding.experimentalEvidenceKind === 'SEYEON_ADMITTED_WAITING',
      ),
    ).toMatchObject({
      productionEventKind: 'CHARACTER_VULNERABILITY_REVEALED',
      characterBehaviorKey: 'seyeon.admitted_waiting',
    });
    expect(
      SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_BINDING_AUTHORIZED_V1,
    ).toBe(false);
  });
});
