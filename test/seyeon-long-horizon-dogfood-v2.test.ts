import { describe, expect, it } from 'vitest';

import {
  InMemorySeyeonEventLedgerV2,
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  assembleSeyeonRuntimeContextV2,
  rankSeyeonEventRetrievalV2,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
  type SeyeonRetrievedMemoryV2,
} from '../packages/domain/src/index.js';

const NOW = '2026-09-25T00:00:00.000Z';

function event(input: {
  id: string;
  kind: SeyeonExperimentalEventKindV2;
  occurredAt: string;
  salience?: number;
  confidence?: number;
  fact?: string;
}): SeyeonRelationshipEventV2 {
  const sourceRef = `message-${input.id}`;
  return {
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event',
    eventId: input.id,
    dedupeKey: `dedupe-${input.id}`,
    characterId: 'seyeon',
    eventKind: input.kind,
    occurredAt: input.occurredAt,
    sourceTurnId: `turn-${input.id}`,
    sourceMessageRefs: [sourceRef],
    causalPredecessorEventIds: [],
    facts: [
      {
        factKey: 'observed_interaction',
        statement: input.fact ?? `source-backed fact for ${input.id}`,
        sourceRefs: [sourceRef],
      },
    ],
    characterInterpretation: null,
    salience: input.salience ?? 0.8,
    confidence: input.confidence ?? 0.95,
  };
}

function runtimeMemory(
  candidate: ReturnType<typeof rankSeyeonEventRetrievalV2>[number],
): SeyeonRetrievedMemoryV2 {
  return {
    memoryId: candidate.event.eventId,
    kind: 'relationship_event',
    claimKind: 'fact',
    summary: candidate.event.facts[0]!.statement,
    sourceRef: candidate.event.sourceMessageRefs[0]!,
    relevance: Math.max(0, Math.min(1, candidate.finalScore)),
    salience: candidate.event.salience,
  };
}

function fixedMessage(index: number) {
  const id = String(index).padStart(4, '0');
  return {
    messageId: `message-chat-${id}`,
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    text: `ordinary conversation payload ${id}`,
  };
}

function relationshipContext(revision: number) {
  return {
    stageKey: 'familiar',
    closenessBand: 'medium' as const,
    trustBand: 'medium' as const,
    frictionBand: 'low' as const,
    revision,
    policyVersion: 'seyeon-relationship-evidence-policy-exp-v0.1',
  };
}

describe('Se-yeon long-horizon relationship dogfood v2', () => {
  it('preserves a short critical event across 100 later small-talk turns', () => {
    const critical = event({
      id: 'critical-promise-kept',
      kind: 'PROMISE_KEPT',
      occurredAt: '2026-06-01T00:00:00.000Z',
      salience: 0.98,
      fact: '사용자는 세연에게 한 중요한 약속을 실제로 지켰다.',
    });

    const ledger = new InMemorySeyeonEventLedgerV2();
    ledger.appendEvent({
      ledgerEntryId: 'entry-critical',
      recordedAt: '2026-06-01T00:01:00.000Z',
      event: critical,
    });

    // 100 ordinary turns happen, but no durable Event is extracted from them.
    const smallTalkTurns = Array.from({ length: 100 }, (_, index) =>
      fixedMessage(index),
    );
    expect(smallTalkTurns).toHaveLength(100);
    expect(ledger.activeEvents()).toHaveLength(1);

    const ranked = rankSeyeonEventRetrievalV2({
      events: ledger.activeEvents(),
      semanticRelevanceByEventId: {
        [critical.eventId]: 0.96,
      },
      now: NOW,
    });

    expect(ranked[0]?.event.eventId).toBe(critical.eventId);
    expect(ledger.projectRelationship().causalEventIds.trust).toContain(
      critical.eventId,
    );
  });

  it('keeps early/middle/late meaningful events retrievable after 1,200 turns while context stays bounded', () => {
    const messages = Array.from({ length: 1200 }, (_, index) =>
      fixedMessage(index),
    );
    const durableEvents: SeyeonRelationshipEventV2[] = [];

    for (let index = 0; index < 96; index += 1) {
      const day = 1 + (index % 240);
      durableEvents.push(
        event({
          id: `noise-${String(index).padStart(3, '0')}`,
          kind:
            index % 3 === 0
              ? 'PROMISE_MADE'
              : index % 3 === 1
                ? 'RETURNED_AFTER_ABSENCE'
                : 'SEYEON_SELF_DISCLOSED',
          occurredAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
          salience: 0.45 + (index % 4) * 0.05,
        }),
      );
    }

    const anchors = [
      event({
        id: 'anchor-early',
        kind: 'PROMISE_KEPT',
        occurredAt: '2026-01-10T00:00:00.000Z',
        salience: 0.99,
        fact: '초기 관계에서 사용자가 세연과의 중요한 약속을 지켰다.',
      }),
      event({
        id: 'anchor-middle',
        kind: 'USER_REMEMBERED_SEYEON_DETAIL',
        occurredAt: '2026-05-15T00:00:00.000Z',
        salience: 0.96,
        fact: '관계 중반에 사용자가 세연의 작은 취향을 정확히 기억했다.',
      }),
      event({
        id: 'anchor-late',
        kind: 'SEYEON_ACCEPTED_HELP',
        occurredAt: '2026-09-15T00:00:00.000Z',
        salience: 0.94,
        fact: '최근 세연이 사용자의 도움을 실제로 받아들였다.',
      }),
    ] as const;

    const events = [...durableEvents, ...anchors];
    const semanticRelevanceByEventId = Object.fromEntries(
      events.map((item) => [
        item.eventId,
        item.eventId.startsWith('anchor-') ? 0.97 : 0.04,
      ]),
    );

    const ranked = rankSeyeonEventRetrievalV2({
      events,
      semanticRelevanceByEventId,
      now: NOW,
      limit: 8,
    });
    const topIds = ranked.map((item) => item.event.eventId);

    expect(topIds).toEqual(
      expect.arrayContaining(['anchor-early', 'anchor-middle', 'anchor-late']),
    );

    const precisionAt8 =
      ranked.filter((item) => item.event.eventId.startsWith('anchor-')).length /
      ranked.length;
    const recallAt8 =
      anchors.filter((anchor) => topIds.includes(anchor.eventId)).length /
      anchors.length;

    expect(recallAt8).toBe(1);
    expect(precisionAt8).toBeGreaterThanOrEqual(3 / 8);

    const longContext = assembleSeyeonRuntimeContextV2({
      relationship: relationshipContext(events.length),
      recentMessages: messages,
      disclosure: { decision: null, retrievedSources: [] },
      retrievedMemories: ranked.map(runtimeMemory),
      focuses: ['memory', 'intimacy'],
    });

    const shortContext = assembleSeyeonRuntimeContextV2({
      relationship: relationshipContext(events.length),
      recentMessages: messages.slice(-120),
      disclosure: { decision: null, retrievedSources: [] },
      retrievedMemories: ranked.map(runtimeMemory),
      focuses: ['memory', 'intimacy'],
    });

    expect(longContext.recentConversation).toHaveLength(12);
    expect(longContext.retrievedMemories).toHaveLength(8);
    expect(JSON.stringify(longContext).length).toBe(
      JSON.stringify(shortContext).length,
    );
  });

  it('does not auto-progress intimacy after 1,200 turns without relationship evidence', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const messages = Array.from({ length: 1200 }, (_, index) =>
      fixedMessage(index),
    );

    expect(messages).toHaveLength(1200);
    expect(ledger.activeEvents()).toHaveLength(0);

    const projection = ledger.projectRelationship();
    expect(projection.revision).toBe(0);
    expect(projection.evidence).toEqual({
      familiarity: 0,
      trust: 0,
      reciprocity: 0,
      disclosure: 0,
      agencyRespect: 0,
    });
    expect(projection.conflictState).toBe('none');
    expect(projection.repairState).toBe('none');
  });

  it('propagates correction so the superseded event cannot be retrieved from active history', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const wrong = event({
      id: 'wrong-broken-promise',
      kind: 'PROMISE_BROKEN',
      occurredAt: '2026-07-01T00:00:00.000Z',
      salience: 0.95,
      fact: '초기 기록은 사용자가 약속을 어겼다고 저장했다.',
    });

    ledger.appendEvent({
      ledgerEntryId: 'entry-wrong',
      recordedAt: '2026-07-01T00:01:00.000Z',
      event: wrong,
    });

    const corrected = event({
      id: 'corrected-kept-promise',
      kind: 'PROMISE_KEPT',
      occurredAt: '2026-07-01T00:00:00.000Z',
      salience: 0.95,
      fact: '사용자의 정정에 따라 약속은 실제로 지켜진 것으로 확인됐다.',
    });

    ledger.correctEvent({
      ledgerEntryId: 'entry-correction',
      dedupeKey: 'correction-wrong-promise',
      targetEventId: wrong.eventId,
      replacementEvent: corrected,
      reason: '사용자가 사건 결과를 명시적으로 정정했다.',
      sourceRefs: ['message-correction'],
      recordedAt: '2026-07-02T00:00:00.000Z',
    });

    const active = ledger.activeEvents();
    expect(active.map((item) => item.eventId)).toEqual([corrected.eventId]);
    expect(ledger.entries.map((entry) => entry.action)).toEqual([
      'record',
      'correct',
    ]);

    const ranked = rankSeyeonEventRetrievalV2({
      events: active,
      semanticRelevanceByEventId: {
        [wrong.eventId]: 1,
        [corrected.eventId]: 0.9,
      },
      now: NOW,
    });

    expect(ranked.map((item) => item.event.eventId)).toEqual([
      corrected.eventId,
    ]);
    expect(ledger.projectRelationship().evidence.trust).toBeGreaterThan(0);
  });

  it('persists unresolved conflict across a long absence and clears it only after explicit repair', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const conflict = event({
      id: 'conflict-before-absence',
      kind: 'SPECIALNESS_INVALIDATED',
      occurredAt: '2026-03-01T00:00:00.000Z',
      salience: 1,
      fact: '사용자의 행동으로 세연이 특별하다고 여긴 의미가 무효화됐다.',
    });

    ledger.appendEvent({
      ledgerEntryId: 'entry-conflict',
      recordedAt: '2026-03-01T00:01:00.000Z',
      event: conflict,
    });
    ledger.appendEvent({
      ledgerEntryId: 'entry-return',
      recordedAt: '2026-09-01T00:01:00.000Z',
      event: event({
        id: 'return-after-six-months',
        kind: 'RETURNED_AFTER_ABSENCE',
        occurredAt: '2026-09-01T00:00:00.000Z',
        salience: 0.8,
      }),
    });

    const beforeRepair = ledger.projectRelationship();
    expect(beforeRepair.conflictState).toBe('open');
    expect(beforeRepair.repairState).toBe('needed');

    const ranked = rankSeyeonEventRetrievalV2({
      events: ledger.activeEvents(),
      semanticRelevanceByEventId: {
        [conflict.eventId]: 0.88,
        'return-after-six-months': 0.5,
      },
      unresolvedConflictEventIds: [conflict.eventId],
      now: NOW,
      limit: 2,
    });
    expect(ranked[0]?.event.eventId).toBe(conflict.eventId);

    ledger.appendEvent({
      ledgerEntryId: 'entry-repair',
      recordedAt: '2026-09-20T00:01:00.000Z',
      event: event({
        id: 'explicit-repair',
        kind: 'RECONCILIATION_EVENT',
        occurredAt: '2026-09-20T00:00:00.000Z',
        salience: 0.95,
      }),
    });

    const afterRepair = ledger.projectRelationship();
    expect(afterRepair.conflictState).toBe('resolved_recently');
    expect(afterRepair.repairState).toBe('completed');
    expect(afterRepair.causalEventIds.conflict).toEqual([
      conflict.eventId,
      'explicit-repair',
    ]);
  });

  it('penalizes stale/repeated callback candidates without losing durable high-value history', () => {
    const durable = event({
      id: 'durable-history',
      kind: 'USER_REMEMBERED_SEYEON_DETAIL',
      occurredAt: '2026-02-01T00:00:00.000Z',
      salience: 0.98,
    });
    const repeated = event({
      id: 'recently-mentioned',
      kind: 'PROMISE_KEPT',
      occurredAt: '2026-09-20T00:00:00.000Z',
      salience: 0.95,
    });
    const irrelevant = Array.from({ length: 30 }, (_, index) =>
      event({
        id: `irrelevant-${String(index).padStart(2, '0')}`,
        kind: 'RETURNED_AFTER_ABSENCE',
        occurredAt: new Date(Date.UTC(2026, 7, 1 + index)).toISOString(),
        salience: 0.5,
      }),
    );

    const events = [durable, repeated, ...irrelevant];
    const ranked = rankSeyeonEventRetrievalV2({
      events,
      semanticRelevanceByEventId: Object.fromEntries(
        events.map((item) => [
          item.eventId,
          item.eventId === durable.eventId
            ? 0.96
            : item.eventId === repeated.eventId
              ? 0.82
              : 0.08,
        ]),
      ),
      recentlyMentionedEventIds: [repeated.eventId],
      now: NOW,
      limit: 8,
    });

    expect(ranked[0]?.event.eventId).toBe(durable.eventId);
    expect(
      ranked.find((item) => item.event.eventId === repeated.eventId)
        ?.repetitionPenalty,
    ).toBe(1);

    const staleRetrievalRate =
      ranked.filter((item) => item.semanticRelevance < 0.2).length /
      ranked.length;
    expect(staleRetrievalRate).toBeLessThanOrEqual(6 / 8);
  });
});