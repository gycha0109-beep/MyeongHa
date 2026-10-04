import { describe, expect, it } from 'vitest';

import {
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  admitSeyeonProductionRelationshipEventV1,
  deriveSeyeonProductionRelationshipDedupeKeyV1,
  type SeyeonEventAuthorityDecisionV1,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
} from '../packages/domain/src/index.js';
import {
  snapshotSeyeonProductionHistoryCausalContextV1,
} from '../apps/api/src/seyeon-production-causal-context-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const TURN_1 = '22222222-2222-4222-8222-222222222221';
const TURN_2 = '22222222-2222-4222-8222-222222222222';
const USER_1 = '33333333-3333-4333-8333-333333333331';
const ASSISTANT_1 = '33333333-3333-4333-8333-333333333332';
const USER_2 = '33333333-3333-4333-8333-333333333333';
const ASSISTANT_2 = '33333333-3333-4333-8333-333333333334';

function experimentalEvent(input: {
  readonly id: string;
  readonly dedupe: string;
  readonly kind: SeyeonExperimentalEventKindV2;
  readonly turnId: string;
  readonly messageRefs: readonly string[];
  readonly occurredAt: string;
  readonly predecessors?: readonly string[];
}): SeyeonRelationshipEventV2 {
  return Object.freeze({
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event',
    eventId: input.id,
    dedupeKey: input.dedupe,
    characterId: 'seyeon',
    eventKind: input.kind,
    occurredAt: input.occurredAt,
    sourceTurnId: input.turnId,
    sourceMessageRefs: Object.freeze([...input.messageRefs]),
    causalPredecessorEventIds: Object.freeze([...(input.predecessors ?? [])]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'observed_interaction',
        statement: 'Current interaction was observed.',
        sourceRefs: Object.freeze([input.messageRefs[0] ?? USER_1]),
      }),
    ]),
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.95,
  });
}

function authority(input: {
  readonly kind: SeyeonExperimentalEventKindV2;
  readonly turnId: string;
  readonly messageRefs: readonly string[];
  readonly factRefs?: readonly string[];
  readonly guardedAssistantRef?: string | null;
  readonly authorityRefs?: readonly string[];
  readonly serverObservationRefs?: readonly string[];
  readonly predecessors?: readonly string[];
}): SeyeonEventAuthorityDecisionV1 {
  return Object.freeze({
    schemaVersion: 'seyeon-event-authority-v1',
    authority:
      'experimental_event_admission_not_production_relationship_authority' as const,
    decision: 'ADMIT_EXPERIMENTAL' as const,
    eventKind: input.kind,
    reasonCodes: Object.freeze(['OBSERVED_CURRENT_TURN_INTERACTION'] as const),
    evidence: Object.freeze({
      currentTurnId: input.turnId,
      observedMessageRefs: Object.freeze([...input.messageRefs]),
      verifiedClaimIds: Object.freeze([]),
      authorityRefs: Object.freeze([...(input.authorityRefs ?? [])]),
      causalPredecessorEventIds: Object.freeze([
        ...(input.predecessors ?? []),
      ]),
      guardedCharacterOutputRef: input.guardedAssistantRef ?? null,
      serverObservationRefs: Object.freeze([
        ...(input.serverObservationRefs ?? []),
      ]),
      riskCausality: null,
    }),
    candidateSignal: Object.freeze({
      salience: 0.9,
      confidence: 0.95,
    }),
    admittedFacts: Object.freeze([
      Object.freeze({
        factKey: 'admitted_fact',
        statement: 'Authority-bound relationship occurrence.',
        sourceRefs: Object.freeze([
          ...(input.factRefs ?? [input.messageRefs[0] ?? USER_1]),
        ]),
      }),
    ]),
    characterInterpretation: null,
    constraints: Object.freeze({
      mayAppendExperimentalLedger: true,
      mayAppendProductionRelationshipEvent: false as const,
      mayMutateProductionRelationshipState: false as const,
      mayCreateDurableMemory: false as const,
      mayGrantTruthAuthority: false as const,
      mayOverrideIntegrity: false as const,
      mayOverrideDisclosure: false as const,
    }),
  });
}

describe('Se-yeon Production relationship admission bridge V1', () => {
  it('promotes guarded accepted-help output only through the generic Production registry', () => {
    const occurredAt = '2026-09-28T03:00:00.000Z';
    const event = experimentalEvent({
      id: 'experimental-help-1',
      dedupe: 'turn-1:accepted-help',
      kind: 'SEYEON_ACCEPTED_HELP',
      turnId: TURN_1,
      messageRefs: [USER_1, ASSISTANT_1],
      occurredAt,
    });

    const admission = admitSeyeonProductionRelationshipEventV1({
      subjectId: SUBJECT_ID,
      productionEventId: '44444444-4444-4444-8444-444444444441',
      productionAuthorityRef: 'seyeon-prod-authority:turn-1:accepted-help',
      committedTurnId: TURN_1,
      committedAssistantMessageRef: ASSISTANT_1,
      authoritativeOccurredAt: occurredAt,
      experimentalEvent: event,
      authorityDecision: authority({
        kind: event.eventKind,
        turnId: TURN_1,
        messageRefs: event.sourceMessageRefs,
        guardedAssistantRef: ASSISTANT_1,
      }),
      causalBindings: [],
    });

    expect(admission.decision).toBe('ADMIT_PRODUCTION');
    expect(admission.event.eventKind).toBe('CARE_ACCEPTED_BY_CHARACTER');
    expect(admission.event.characterBehaviorKey).toBe('seyeon.accepted_help');
    expect(admission.event.source.sourceKind).toBe('conversation_turn');
    expect(admission.event.source.sourceRef).toBe(TURN_1);
    expect(admission.event.source.sourceMessageRefs).toEqual([
      USER_1,
      ASSISTANT_1,
    ]);
    expect(admission.event.payload).toHaveProperty('careKey');
    expect(admission.constraints).toEqual({
      mayAppendProductionRelationshipEvent: true,
      mayMutateProductionRelationshipStateViaPolicyOnly: true,
      mayCreateGeneralDurableMemory: false,
      mayGrantFactAuthority: false,
      mayOverrideIntegrity: false as const,
      mayOverrideDisclosure: false as const,
    });
  });

  it('inherits the exact commitment key and Production predecessor for a kept promise', () => {
    const madeAt = '2026-09-20T03:00:00.000Z';
    const madeExperimental = experimentalEvent({
      id: 'experimental-promise-made',
      dedupe: 'promise:made:meet-saturday',
      kind: 'PROMISE_MADE',
      turnId: TURN_1,
      messageRefs: [USER_1],
      occurredAt: madeAt,
    });
    const madeAdmission = admitSeyeonProductionRelationshipEventV1({
      subjectId: SUBJECT_ID,
      productionEventId: '44444444-4444-4444-8444-444444444451',
      productionAuthorityRef: 'seyeon-prod-authority:promise-made',
      committedTurnId: TURN_1,
      committedAssistantMessageRef: ASSISTANT_1,
      authoritativeOccurredAt: madeAt,
      experimentalEvent: madeExperimental,
      authorityDecision: authority({
        kind: 'PROMISE_MADE',
        turnId: TURN_1,
        messageRefs: [USER_1],
      }),
      causalBindings: [],
    });

    const keptAt = '2026-09-27T03:00:00.000Z';
    const keptExperimental = experimentalEvent({
      id: 'experimental-promise-kept',
      dedupe: 'promise:kept:meet-saturday',
      kind: 'PROMISE_KEPT',
      turnId: TURN_2,
      messageRefs: [USER_2],
      occurredAt: keptAt,
      predecessors: [madeExperimental.eventId],
    });
    const keptAdmission = admitSeyeonProductionRelationshipEventV1({
      subjectId: SUBJECT_ID,
      productionEventId: '44444444-4444-4444-8444-444444444452',
      productionAuthorityRef: 'seyeon-prod-authority:promise-kept',
      committedTurnId: TURN_2,
      committedAssistantMessageRef: ASSISTANT_2,
      authoritativeOccurredAt: keptAt,
      experimentalEvent: keptExperimental,
      authorityDecision: authority({
        kind: 'PROMISE_KEPT',
        turnId: TURN_2,
        messageRefs: [USER_2],
        authorityRefs: ['world:event:promise-kept'],
        factRefs: [USER_2, 'world:event:promise-kept'],
        predecessors: [madeExperimental.eventId],
      }),
      causalBindings: [
        {
          experimentalEventId: madeExperimental.eventId,
          productionEvent: madeAdmission.event,
        },
      ],
    });

    expect(keptAdmission.event.eventKind).toBe('COMMITMENT_KEPT');
    expect(keptAdmission.event.causalPredecessorEventIds).toEqual([
      madeAdmission.event.eventId,
    ]);
    expect(keptAdmission.event.payload.commitmentKey).toBe(
      madeAdmission.event.payload.commitmentKey,
    );

    const openCausal =
      snapshotSeyeonProductionHistoryCausalContextV1([
        Object.freeze({
          action: 'record' as const,
          ledgerEntryId:
            '55555555-5555-4555-8555-555555555551',
          dedupeKey: 'history:promise-made',
          recordedAt: madeAt,
          event: madeAdmission.event,
        }),
      ]);
    expect(openCausal.priorEvents).toEqual([
      expect.objectContaining({
        authority:
          'authorized_production_relationship_event_v1',
        eventId: madeAdmission.event.eventId,
        eventKind: 'PROMISE_MADE',
      }),
    ]);
    expect(openCausal.causalBindings).toEqual([
      expect.objectContaining({
        causalEventRef: madeAdmission.event.eventId,
        bindingAuthority: 'authorized_production_history',
        productionEvent: madeAdmission.event,
      }),
    ]);

    const closedCausal =
      snapshotSeyeonProductionHistoryCausalContextV1([
        Object.freeze({
          action: 'record' as const,
          ledgerEntryId:
            '55555555-5555-4555-8555-555555555551',
          dedupeKey: 'history:promise-made',
          recordedAt: madeAt,
          event: madeAdmission.event,
        }),
        Object.freeze({
          action: 'record' as const,
          ledgerEntryId:
            '55555555-5555-4555-8555-555555555552',
          dedupeKey: 'history:promise-kept',
          recordedAt: keptAt,
          event: keptAdmission.event,
        }),
      ]);
    expect(closedCausal.priorEvents).toEqual([]);
    expect(closedCausal.causalBindings).toEqual([]);

    const keptFromProductionHistory = experimentalEvent({
      id: 'experimental-promise-kept-direct-production',
      dedupe: 'promise:kept:meet-saturday:direct-production',
      kind: 'PROMISE_KEPT',
      turnId: TURN_2,
      messageRefs: [USER_2],
      occurredAt: keptAt,
      predecessors: [madeAdmission.event.eventId],
    });
    const directAdmission =
      admitSeyeonProductionRelationshipEventV1({
        subjectId: SUBJECT_ID,
        productionEventId:
          '44444444-4444-4444-8444-444444444453',
        productionAuthorityRef:
          'seyeon-prod-authority:promise-kept-direct',
        committedTurnId: TURN_2,
        committedAssistantMessageRef: ASSISTANT_2,
        authoritativeOccurredAt: keptAt,
        experimentalEvent: keptFromProductionHistory,
        authorityDecision: authority({
          kind: 'PROMISE_KEPT',
          turnId: TURN_2,
          messageRefs: [USER_2],
          authorityRefs: ['world:event:promise-kept'],
          factRefs: [USER_2, 'world:event:promise-kept'],
          predecessors: [madeAdmission.event.eventId],
        }),
        causalBindings: [
          {
            causalEventRef: madeAdmission.event.eventId,
            bindingAuthority:
              'authorized_production_history',
            productionEvent: madeAdmission.event,
          },
        ],
      });

    expect(
      directAdmission.event.causalPredecessorEventIds,
    ).toEqual([madeAdmission.event.eventId]);
    expect(directAdmission.event.payload.commitmentKey).toBe(
      madeAdmission.event.payload.commitmentKey,
    );
  });

  it('fails closed when a character-output Event is not bound to the committed guarded assistant message', () => {
    const occurredAt = '2026-09-28T04:00:00.000Z';
    const event = experimentalEvent({
      id: 'experimental-disclosure',
      dedupe: 'turn-2:self-disclosure',
      kind: 'SEYEON_SELF_DISCLOSED',
      turnId: TURN_2,
      messageRefs: [USER_2, ASSISTANT_2],
      occurredAt,
    });

    expect(() =>
      admitSeyeonProductionRelationshipEventV1({
        subjectId: SUBJECT_ID,
        productionEventId: '44444444-4444-4444-8444-444444444461',
        productionAuthorityRef: 'seyeon-prod-authority:disclosure',
        committedTurnId: TURN_2,
        committedAssistantMessageRef: ASSISTANT_2,
        authoritativeOccurredAt: occurredAt,
        experimentalEvent: event,
        authorityDecision: authority({
          kind: event.eventKind,
          turnId: TURN_2,
          messageRefs: event.sourceMessageRefs,
          guardedAssistantRef: ASSISTANT_1,
        }),
        causalBindings: [],
      }),
    ).toThrow(/exact committed guarded assistant message/i);
  });

  it('uses a server observation source for returned-after-absence without laundering message refs', () => {
    const occurredAt = '2026-09-28T05:00:00.000Z';
    const event = experimentalEvent({
      id: 'experimental-return',
      dedupe: 'return:2026-09-28',
      kind: 'RETURNED_AFTER_ABSENCE',
      turnId: TURN_2,
      messageRefs: [USER_2],
      occurredAt,
    });
    const admission = admitSeyeonProductionRelationshipEventV1({
      subjectId: SUBJECT_ID,
      productionEventId: '44444444-4444-4444-8444-444444444471',
      productionAuthorityRef: 'seyeon-prod-authority:return',
      committedTurnId: TURN_2,
      committedAssistantMessageRef: ASSISTANT_2,
      authoritativeOccurredAt: occurredAt,
      experimentalEvent: event,
      authorityDecision: authority({
        kind: event.eventKind,
        turnId: TURN_2,
        messageRefs: [USER_2],
        factRefs: ['server:observation:return-1'],
        serverObservationRefs: ['server:observation:return-1'],
      }),
      causalBindings: [],
    });

    expect(admission.event.source).toMatchObject({
      sourceKind: 'server_observation',
      sourceRef: 'server:observation:return-1',
      sourceMessageRefs: [],
    });
    expect(admission.event.source.authorityRefs).toContain(
      'server:observation:return-1',
    );
  });

  it('derives one stable Production dedupe key independent of retry eventId', () => {
    const event = experimentalEvent({
      id: 'experimental-stable-dedupe',
      dedupe: 'stable:logical-event',
      kind: 'CONFLICT_EVENT',
      turnId: TURN_1,
      messageRefs: [USER_1],
      occurredAt: '2026-09-28T06:00:00.000Z',
    });

    expect(
      deriveSeyeonProductionRelationshipDedupeKeyV1({
        subjectId: SUBJECT_ID,
        experimentalEvent: event,
      }),
    ).toBe(
      deriveSeyeonProductionRelationshipDedupeKeyV1({
        subjectId: SUBJECT_ID,
        experimentalEvent: {
          eventKind: event.eventKind,
          dedupeKey: event.dedupeKey,
        },
      }),
    );
  });
});
