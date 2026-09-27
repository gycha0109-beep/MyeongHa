import { describe, expect, it } from 'vitest';

import {
  runSeyeonPostTurnRelationshipV2,
} from '../apps/api/src/seyeon-post-turn-relationship-v2.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  InMemorySeyeonEventLedgerV2,
  type SeyeonRelationshipEventV2,
} from '../packages/domain/src/index.js';

class Provider implements SeyeonStructuredProviderPortV2 {
  readonly providerKey = 'src22-hold-probe';
  readonly modelKey = 'deterministic-fixture';
  constructor(private readonly output: unknown) {}
  generate(_request: SeyeonStructuredProviderRequestV2): unknown {
    return this.output;
  }
}

function turn(turnId: string, userText: string) {
  const userRef = `user-${turnId}`;
  const assistantRef = `assistant-${turnId}`;
  return {
    turnId,
    userRef,
    messages: [
      { messageId: userRef, role: 'user' as const, text: userText },
      {
        messageId: assistantRef,
        role: 'assistant' as const,
        text: '지금 일어난 일만 기준으로 볼게요.',
      },
    ],
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2' as const,
      userMove: 'neutral_or_other' as const,
      notice: {
        summary: '현재 관계 상호작용을 본다.',
        evidenceRefs: [userRef],
      },
      immediateWant: {
        key: 'break_awkwardness' as const,
        summary: '현재 상호작용에 반응한다.',
      },
      tension: {
        key: 'none_material' as const,
        summary: '과거와 현재를 분리한다.',
      },
      chosenAction: {
        key: 'remember_naturally' as const,
        rationale: '검증된 인과만 사용한다.',
      },
      expressionState: 'baseline' as const,
      reveal: {
        level: 'public' as const,
        triggerRef: userRef,
        supportingHistoryRefs: [],
      },
      memoryRefsUsed: [],
    },
    envelope: {
      schemaVersion: 'seyeon-dialogue-envelope-v2' as const,
      utterance: '지금 일어난 일만 기준으로 볼게요.',
      expressionState: 'baseline' as const,
      revealLevel: 'public' as const,
      memoryRefsMentioned: [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
      interpretationSchemaVersion: 'seyeon-turn-interpretation-v2' as const,
      semanticReviewHash: `sha256:${turnId}`,
    },
  };
}

function candidate(input: {
  eventKind: 'CONFLICT_EVENT' | 'RECONCILIATION_EVENT';
  sourceRef: string;
  predecessorIds?: readonly string[];
}) {
  return {
    schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
    decision: 'event',
    reason: 'SRC-22 observational probe',
    eventKind: input.eventKind,
    sourceMessageRefs: [input.sourceRef],
    causalPredecessorEventIds: input.predecessorIds ?? [],
    facts: [
      {
        factKey: 'observed_interaction',
        statement: '현재 상호작용에서 갈등 또는 수습 신호가 있었다.',
        sourceRefs: [input.sourceRef],
      },
    ],
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.9,
    dedupeBasis: `probe:${input.eventKind}`,
  } as const;
}

async function runEvent(input: {
  ledger: InMemorySeyeonEventLedgerV2;
  turnId: string;
  eventId: string;
  eventKind: 'CONFLICT_EVENT' | 'RECONCILIATION_EVENT';
  predecessorIds?: readonly string[];
  semanticRelevanceByEventId?: Readonly<Record<string, number>>;
}) {
  const payload = turn(input.turnId, '지금 관계에서 중요한 일이 있었어요.');
  return runSeyeonPostTurnRelationshipV2({
    turnId: payload.turnId,
    messages: payload.messages,
    interpretation: payload.interpretation,
    envelope: payload.envelope,
    ledger: input.ledger,
    extractorProvider: new Provider(
      candidate({
        eventKind: input.eventKind,
        sourceRef: payload.userRef,
        ...(input.predecessorIds === undefined
          ? {}
          : { predecessorIds: input.predecessorIds }),
      }),
    ),
    eventAuthorityEvidence: { integrityDecisions: [] },
    semanticRelevanceByEventId: input.semanticRelevanceByEventId ?? {},
    identity: {
      eventId: input.eventId,
      eventDedupeKey: `dedupe-${input.eventId}`,
      ledgerEntryId: `entry-${input.eventId}`,
      occurredAt: '2026-09-26T12:00:00.000Z',
      recordedAt: '2026-09-26T12:00:01.000Z',
    },
  });
}

describe('Se-yeon SRC-22 relationship authority hold probe', () => {
  it('keeps repeated repair behavior observational and never upgrades it to production authority', async () => {
    const ledger = new InMemorySeyeonEventLedgerV2();

    const conflict = await runEvent({
      ledger,
      turnId: 'conflict',
      eventId: 'event-conflict',
      eventKind: 'CONFLICT_EVENT',
    });
    expect(conflict.decision).toBe('event');

    const repair = await runEvent({
      ledger,
      turnId: 'repair-1',
      eventId: 'event-repair-1',
      eventKind: 'RECONCILIATION_EVENT',
      predecessorIds: ['event-conflict'],
      semanticRelevanceByEventId: { 'event-conflict': 1 },
    });
    expect(repair.decision).toBe('event');

    const repeatedRepair = await runEvent({
      ledger,
      turnId: 'repair-2',
      eventId: 'event-repair-2',
      eventKind: 'RECONCILIATION_EVENT',
      predecessorIds: ['event-conflict'],
      semanticRelevanceByEventId: { 'event-conflict': 1 },
    });

    const productionReadiness = 'HOLD_SRC22' as const;
    expect(productionReadiness).toBe('HOLD_SRC22');

    if (repeatedRepair.decision === 'event') {
      expect(
        repeatedRepair.authorityDecision.constraints
          .mayAppendProductionRelationshipEvent,
      ).toBe(false);
      expect(
        repeatedRepair.authorityDecision.constraints
          .mayMutateProductionRelationshipState,
      ).toBe(false);
      expect(repeatedRepair.event.authority).toBe(
        'experimental_non_canonical_event',
      );
    }

    const active: readonly SeyeonRelationshipEventV2[] = ledger.activeEvents();
    expect(
      active.every(
        (event) => event.authority === 'experimental_non_canonical_event',
      ),
    ).toBe(true);
  });
});
