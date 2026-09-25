import { describe, expect, it } from 'vitest';

import {
  runSeyeonPostTurnRelationshipV2,
  type SeyeonEventLedgerPortV2,
} from '../apps/api/src/seyeon-post-turn-relationship-v2.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  InMemorySeyeonEventLedgerV2,
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
} from '../packages/domain/src/index.js';

function event(input: {
  id: string;
  kind: SeyeonExperimentalEventKindV2;
  occurredAt: string;
  causalPredecessorEventIds?: readonly string[];
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
    causalPredecessorEventIds: input.causalPredecessorEventIds ?? [],
    facts: [
      {
        factKey: 'observed_interaction',
        statement: `fact for ${input.id}`,
        sourceRefs: [sourceRef],
      },
    ],
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.95,
  };
}

function turn() {
  return {
    turnId: 'turn-current',
    messages: [
      {
        messageId: 'user-current',
        role: 'user' as const,
        text: '그때 약속했던 거, 오늘 지켰어요.',
      },
      {
        messageId: 'assistant-current',
        role: 'assistant' as const,
        text: '말로만 끝내지 않았네요.',
      },
    ],
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2' as const,
      userMove: 'promise_followup' as const,
      notice: {
        summary: '사용자가 이전 약속의 이행을 현재 발화에서 확인했다.',
        evidenceRefs: ['user-current'],
      },
      immediateWant: {
        key: 'continue_promise' as const,
        summary: '행동으로 이어진 약속을 관계 맥락에서 받아들인다.',
      },
      tension: {
        key: 'none_material' as const,
        summary: '말보다 실제 행동의 무게를 본다.',
      },
      chosenAction: {
        key: 'remember_naturally' as const,
        rationale: '이전 약속과 현재 이행을 자연스럽게 연결한다.',
      },
      expressionState: 'baseline' as const,
      reveal: {
        level: 'familiar' as const,
        triggerRef: 'user-current',
        supportingHistoryRefs: [],
      },
      memoryRefsUsed: [],
    },
    envelope: {
      schemaVersion: 'seyeon-dialogue-envelope-v2' as const,
      utterance: '말로만 끝내지 않았네요.',
      expressionState: 'baseline' as const,
      revealLevel: 'familiar' as const,
      memoryRefsMentioned: [],
      disclosureSliceIds: [],
      interpretationSchemaVersion: 'seyeon-turn-interpretation-v2' as const,
      semanticReviewHash: 'sha256:v1:test',
    },
  };
}

function identity() {
  return {
    eventId: 'event-current',
    eventDedupeKey: 'dedupe-current',
    ledgerEntryId: 'entry-current',
    occurredAt: '2026-09-25T03:00:00.000Z',
    recordedAt: '2026-09-25T03:00:01.000Z',
  };
}

describe('Se-yeon post-turn relationship runtime v2', () => {
  it('fails closed before extraction when a production relationship ledger is bound prematurely', async () => {
    let providerCalled = false;
    const inMemory = new InMemorySeyeonEventLedgerV2();
    const forbiddenLedger = {
      authority: 'production_relationship_events',
      activeEvents: () => inMemory.activeEvents(),
      appendEvent: (input: Parameters<typeof inMemory.appendEvent>[0]) =>
        inMemory.appendEvent(input),
      projectRelationship: () => inMemory.projectRelationship(),
    } as unknown as SeyeonEventLedgerPortV2;
    const provider: SeyeonStructuredProviderPortV2 = {
      providerKey: 'must-not-run',
      modelKey: 'must-not-run',
      generate() {
        providerCalled = true;
        throw new Error('provider must not be called');
      },
    };

    await expect(
      runSeyeonPostTurnRelationshipV2({
        ...turn(),
        ledger: forbiddenLedger,
        extractorProvider: provider,
        semanticRelevanceByEventId: {},
        identity: identity(),
      }),
    ).rejects.toThrow(/experimental-only until SRC-22 is resolved/);

    expect(providerCalled).toBe(false);
    expect(inMemory.entries).toHaveLength(0);
  });

  it('does not mutate relationship state when extractor returns none', async () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const provider: SeyeonStructuredProviderPortV2 = {
      providerKey: 'mock-extractor',
      modelKey: 'cheap-structured',
      generate() {
        return {
          schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
          decision: 'none',
          reason: 'durable relationship Event가 아니다.',
        };
      },
    };

    const result = await runSeyeonPostTurnRelationshipV2({
      ...turn(),
      ledger,
      extractorProvider: provider,
      semanticRelevanceByEventId: {},
      identity: identity(),
    });

    expect(result.decision).toBe('none');
    expect(ledger.entries).toHaveLength(0);
    expect(result.relationshipAfter).toBe(result.relationshipBefore);
    expect(result.relationshipAfter.revision).toBe(0);
  });

  it('retrieves the prior promise, commits PROMISE_KEPT, and derives relationship AFTER from the ledger', async () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const promise = event({
      id: 'promise-made-prior',
      kind: 'PROMISE_MADE',
      occurredAt: '2026-09-20T00:00:00.000Z',
    });
    ledger.appendEvent({
      ledgerEntryId: 'entry-prior',
      recordedAt: '2026-09-20T00:00:01.000Z',
      event: promise,
    });

    const requests: SeyeonStructuredProviderRequestV2[] = [];
    const provider: SeyeonStructuredProviderPortV2 = {
      providerKey: 'mock-extractor',
      modelKey: 'cheap-structured',
      generate(request) {
        requests.push(request);
        return {
          schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
          decision: 'event',
          reason: '현재 발화가 기존 약속의 실제 이행을 확인한다.',
          eventKind: 'PROMISE_KEPT',
          sourceMessageRefs: ['user-current'],
          causalPredecessorEventIds: [promise.eventId],
          facts: [
            {
              factKey: 'promise_outcome',
              statement: '사용자가 이전 약속을 오늘 지켰다고 직접 말했다.',
              sourceRefs: ['user-current'],
            },
          ],
          characterInterpretation: {
            statement: '세연은 말보다 행동으로 이어진 점을 관계적으로 의미 있게 본다.',
            confidence: 0.85,
            sourceRefs: ['user-current', 'assistant-current'],
          },
          salience: 0.95,
          confidence: 0.95,
          dedupeBasis: 'turn-current:promise-kept',
        };
      },
    };

    const result = await runSeyeonPostTurnRelationshipV2({
      ...turn(),
      ledger,
      extractorProvider: provider,
      semanticRelevanceByEventId: {
        [promise.eventId]: 0.96,
      },
      identity: identity(),
    });

    expect(result.decision).toBe('event');
    if (result.decision !== 'event') throw new Error('Expected event result.');
    expect(result.priorCausalEventIds).toContain(promise.eventId);
    expect(result.event.causalPredecessorEventIds).toEqual([promise.eventId]);
    expect(result.relationshipBefore.evidence.trust).toBe(0);
    expect(result.relationshipAfter.evidence.trust).toBe(2);
    expect(ledger.entries).toHaveLength(2);

    const requestInput = requests[0]?.input as {
      context: { priorEvents: readonly SeyeonRelationshipEventV2[] };
    };
    expect(requestInput.context.priorEvents.map((item) => item.eventId)).toContain(
      promise.eventId,
    );
  });

  it('fails closed when extractor invents a causal predecessor and leaves the ledger unchanged', async () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const provider: SeyeonStructuredProviderPortV2 = {
      providerKey: 'mock-extractor',
      modelKey: 'bad',
      generate() {
        return {
          schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
          decision: 'event',
          reason: 'invented predecessor',
          eventKind: 'PROMISE_KEPT',
          sourceMessageRefs: ['user-current'],
          causalPredecessorEventIds: ['event-never-retrieved'],
          facts: [
            {
              factKey: 'promise_outcome',
              statement: '사용자가 약속을 지켰다고 말했다.',
              sourceRefs: ['user-current'],
            },
          ],
          characterInterpretation: null,
          salience: 0.9,
          confidence: 0.9,
          dedupeBasis: 'bad',
        };
      },
    };

    await expect(
      runSeyeonPostTurnRelationshipV2({
        ...turn(),
        ledger,
        extractorProvider: provider,
        semanticRelevanceByEventId: {},
        identity: identity(),
      }),
    ).rejects.toThrow(/absent from prior Event context/);

    expect(ledger.entries).toHaveLength(0);
    expect(ledger.projectRelationship().revision).toBe(0);
  });

  it('always supplies unresolved conflict as causal context even when semantic similarity is low', async () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const conflict = event({
      id: 'open-conflict',
      kind: 'SPECIALNESS_INVALIDATED',
      occurredAt: '2026-03-01T00:00:00.000Z',
    });
    ledger.appendEvent({
      ledgerEntryId: 'entry-conflict',
      recordedAt: '2026-03-01T00:00:01.000Z',
      event: conflict,
    });

    const requests: SeyeonStructuredProviderRequestV2[] = [];
    const provider: SeyeonStructuredProviderPortV2 = {
      providerKey: 'mock-extractor',
      modelKey: 'cheap-structured',
      generate(request) {
        requests.push(request);
        return {
          schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
          decision: 'none',
          reason: '현재 turn 자체는 새로운 durable Event가 아니다.',
        };
      },
    };

    const result = await runSeyeonPostTurnRelationshipV2({
      ...turn(),
      ledger,
      extractorProvider: provider,
      semanticRelevanceByEventId: {
        [conflict.eventId]: 0,
      },
      identity: identity(),
    });

    expect(result.priorCausalEventIds).toContain(conflict.eventId);
    const requestInput = requests[0]?.input as {
      context: { priorEvents: readonly SeyeonRelationshipEventV2[] };
    };
    expect(requestInput.context.priorEvents.map((item) => item.eventId)).toEqual([
      conflict.eventId,
    ]);
  });
});