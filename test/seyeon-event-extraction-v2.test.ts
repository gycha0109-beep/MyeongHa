import { describe, expect, it } from 'vitest';

import {
  SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
  guardSeyeonEventExtractionCandidateV2,
  materializeSeyeonEventCandidateV2,
  rankSeyeonEventRetrievalV2,
  type SeyeonEventExtractionContextV2,
} from '../packages/domain/src/seyeon-event-extraction-v2.js';
import {
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  type SeyeonRelationshipEventV2,
  type SeyeonRelationshipProjectionV2,
} from '../packages/domain/src/seyeon-event-ledger-v2.js';

function relationshipBefore(): SeyeonRelationshipProjectionV2 {
  return {
    schemaVersion: 'seyeon-relationship-projection-exp-v2',
    authority: 'derived_experimental_projection',
    characterId: 'seyeon',
    policyVersion: 'seyeon-relationship-evidence-policy-exp-v0.1',
    revision: 0,
    evidence: {
      familiarity: 0,
      trust: 0,
      reciprocity: 0,
      disclosure: 0,
      agencyRespect: 0,
    },
    conflictState: 'none',
    repairState: 'none',
    causalEventIds: {
      familiarity: [],
      trust: [],
      reciprocity: [],
      disclosure: [],
      agencyRespect: [],
      conflict: [],
      repair: [],
    },
    lastMeaningfulEventAt: null,
  };
}

function extractionContext(): SeyeonEventExtractionContextV2 {
  return {
    turnId: 'turn-current',
    messages: [
      {
        messageId: 'user-current',
        role: 'user',
        text: '전에 세연님이 A 좋아한다고 한 거 기억하고 있었어요.',
      },
      {
        messageId: 'assistant-current',
        role: 'assistant',
        text: '그걸 기억하고 계셨네요. 조금 의외인데요.',
      },
    ],
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: 'remembered_seyeon_detail',
      notice: {
        summary: '사용자가 세연의 이전 취향을 직접 기억해 언급했다.',
        evidenceRefs: ['user-current'],
      },
      immediateWant: {
        key: 'continue_promise',
        summary: '기억한 사실을 과장하지 않고 현재 대화에 반영한다.',
      },
      tension: {
        key: 'remember_vs_memory_showoff',
        summary: '관계 의미는 느끼되 과장하지 않는다.',
      },
      chosenAction: {
        key: 'remember_naturally',
        rationale: '현재 장면에 필요한 만큼만 반응한다.',
      },
      expressionState: 'embarrassed',
      reveal: {
        level: 'familiar',
        triggerRef: 'user-current',
        supportingHistoryRefs: [],
      },
      memoryRefsUsed: [],
    },
    envelope: {
      schemaVersion: 'seyeon-dialogue-envelope-v2',
      utterance: '그걸 기억하고 계셨네요. 조금 의외인데요.',
      expressionState: 'embarrassed',
      revealLevel: 'familiar',
      memoryRefsMentioned: [],
      disclosureSliceIds: [],
      interpretationSchemaVersion: 'seyeon-turn-interpretation-v2',
      semanticReviewHash: 'sha256:v1:test',
    },
    relationshipBefore: relationshipBefore(),
  };
}

function retrievalEvent(input: {
  id: string;
  kind: SeyeonRelationshipEventV2['eventKind'];
  occurredAt: string;
  salience: number;
}): SeyeonRelationshipEventV2 {
  return {
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event',
    eventId: input.id,
    dedupeKey: `dedupe-${input.id}`,
    characterId: 'seyeon',
    eventKind: input.kind,
    occurredAt: input.occurredAt,
    sourceTurnId: `turn-${input.id}`,
    sourceMessageRefs: [`message-${input.id}`],
    facts: [
      {
        factKey: 'fact',
        statement: `fact for ${input.id}`,
        sourceRefs: [`message-${input.id}`],
      },
    ],
    characterInterpretation: null,
    salience: input.salience,
    confidence: 0.95,
  };
}

describe('Se-yeon event extraction and retrieval v2', () => {
  it('accepts a source-backed Character-conditioned event candidate', () => {
    const candidate = guardSeyeonEventExtractionCandidateV2({
      context: extractionContext(),
      rawOutput: {
        schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
        decision: 'event',
        reason: '세연에게 작은 행동을 정확히 기억해 준 것은 R12상 관계 salience가 높다.',
        eventKind: 'USER_REMEMBERED_SEYEON_DETAIL',
        sourceMessageRefs: ['user-current', 'assistant-current'],
        facts: [
          {
            factKey: 'user_remembered_seyeon_detail',
            statement: '사용자가 세연의 이전 취향 A를 기억해 직접 언급했다.',
            sourceRefs: ['user-current'],
          },
        ],
        characterInterpretation: {
          statement: '세연은 자기 말을 기억해 준 사실을 관계적으로 의미 있게 받아들였다.',
          confidence: 0.8,
          sourceRefs: ['user-current', 'assistant-current'],
        },
        salience: 0.85,
        confidence: 0.95,
        dedupeBasis: 'turn-current:user_remembered_seyeon_detail',
      },
    });

    expect(candidate.decision).toBe('event');
    if (candidate.decision !== 'event') throw new Error('Expected event candidate.');
    expect(candidate.facts[0]?.statement).toContain('사용자가');
    expect(candidate.characterInterpretation?.statement).toContain('세연은');
  });

  it('allows an explicit none decision for ordinary small talk', () => {
    const candidate = guardSeyeonEventExtractionCandidateV2({
      context: extractionContext(),
      rawOutput: {
        schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
        decision: 'none',
        reason: '관계적으로 지속할 사건이 아니다.',
      },
    });

    expect(candidate).toEqual({
      schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
      decision: 'none',
      reason: '관계적으로 지속할 사건이 아니다.',
    });
  });

  it('rejects invented source refs instead of allowing unsupported memory facts', () => {
    expect(() =>
      guardSeyeonEventExtractionCandidateV2({
        context: extractionContext(),
        rawOutput: {
          schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
          decision: 'event',
          reason: 'bad provenance',
          eventKind: 'PROMISE_MADE',
          sourceMessageRefs: ['message-does-not-exist'],
          facts: [
            {
              factKey: 'promise',
              statement: '근거 없는 약속',
              sourceRefs: ['message-does-not-exist'],
            },
          ],
          characterInterpretation: null,
          salience: 0.8,
          confidence: 0.9,
          dedupeBasis: 'bad',
        },
      }),
    ).toThrow(/absent from the extraction context/);
  });

  it('rejects low-salience candidates rather than filling the ledger with trivia', () => {
    expect(() =>
      guardSeyeonEventExtractionCandidateV2({
        context: extractionContext(),
        rawOutput: {
          schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
          decision: 'event',
          reason: '메뉴를 한 번 골랐다.',
          eventKind: 'PROMISE_MADE',
          sourceMessageRefs: ['user-current'],
          facts: [
            {
              factKey: 'trivia',
              statement: '사용자가 메뉴를 골랐다.',
              sourceRefs: ['user-current'],
            },
          ],
          characterInterpretation: null,
          salience: 0.1,
          confidence: 0.9,
          dedupeBasis: 'trivia',
        },
      }),
    ).toThrow(/minimum salience/);
  });

  it('materializes server-owned identity separately from provider-authored event meaning', () => {
    const context = extractionContext();
    const candidate = guardSeyeonEventExtractionCandidateV2({
      context,
      rawOutput: {
        schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
        decision: 'event',
        reason: '관계적으로 의미 있는 기억 확인.',
        eventKind: 'USER_REMEMBERED_SEYEON_DETAIL',
        sourceMessageRefs: ['user-current'],
        facts: [
          {
            factKey: 'remembered_detail',
            statement: '사용자가 세연의 취향을 기억했다.',
            sourceRefs: ['user-current'],
          },
        ],
        characterInterpretation: null,
        salience: 0.8,
        confidence: 0.9,
        dedupeBasis: 'provider-suggestion-only',
      },
    });

    const event = materializeSeyeonEventCandidateV2({
      candidate,
      context,
      eventId: 'server-event-id',
      dedupeKey: 'server-dedupe-key',
      occurredAt: '2026-09-25T03:00:00.000Z',
    });

    expect(event?.eventId).toBe('server-event-id');
    expect(event?.dedupeKey).toBe('server-dedupe-key');
    expect(event?.sourceTurnId).toBe('turn-current');
  });

  it('lets an old unresolved conflict outrank a newer weakly relevant event when the current query needs it', () => {
    const oldConflict = retrievalEvent({
      id: 'old-conflict',
      kind: 'SPECIALNESS_INVALIDATED',
      occurredAt: '2026-05-01T00:00:00.000Z',
      salience: 0.95,
    });
    const recentReturn = retrievalEvent({
      id: 'recent-return',
      kind: 'RETURNED_AFTER_ABSENCE',
      occurredAt: '2026-09-24T00:00:00.000Z',
      salience: 0.6,
    });

    const ranked = rankSeyeonEventRetrievalV2({
      events: [recentReturn, oldConflict],
      semanticRelevanceByEventId: {
        'old-conflict': 0.9,
        'recent-return': 0.45,
      },
      unresolvedConflictEventIds: ['old-conflict'],
      now: '2026-09-25T00:00:00.000Z',
      limit: 2,
    });

    expect(ranked[0]?.event.eventId).toBe('old-conflict');
    expect(ranked[0]?.unresolvedConflictBonus).toBe(1);
  });

  it('penalizes repeatedly mentioned memories so retrieval does not become memory-showoff behavior', () => {
    const repeated = retrievalEvent({
      id: 'repeated',
      kind: 'USER_REMEMBERED_SEYEON_DETAIL',
      occurredAt: '2026-09-20T00:00:00.000Z',
      salience: 0.9,
    });
    const alternative = retrievalEvent({
      id: 'alternative',
      kind: 'PROMISE_KEPT',
      occurredAt: '2026-09-10T00:00:00.000Z',
      salience: 0.85,
    });

    const ranked = rankSeyeonEventRetrievalV2({
      events: [repeated, alternative],
      semanticRelevanceByEventId: {
        repeated: 0.8,
        alternative: 0.8,
      },
      recentlyMentionedEventIds: ['repeated'],
      now: '2026-09-25T00:00:00.000Z',
      limit: 2,
    });

    expect(ranked[0]?.event.eventId).toBe('alternative');
    expect(ranked.find((item) => item.event.eventId === 'repeated')?.repetitionPenalty).toBe(1);
  });

  it('keeps retrieval bounded even with hundreds of durable events', () => {
    const events = Array.from({ length: 400 }, (_, index) =>
      retrievalEvent({
        id: `event-${index}`,
        kind: index % 2 === 0 ? 'PROMISE_KEPT' : 'USER_REMEMBERED_SEYEON_DETAIL',
        occurredAt: new Date(Date.UTC(2026, 0, 1 + (index % 240))).toISOString(),
        salience: 0.5 + (index % 5) * 0.1,
      }),
    );
    const semanticRelevanceByEventId = Object.fromEntries(
      events.map((item, index) => [item.eventId, (index % 10) / 10]),
    );

    const ranked = rankSeyeonEventRetrievalV2({
      events,
      semanticRelevanceByEventId,
      now: '2026-09-25T00:00:00.000Z',
    });

    expect(ranked).toHaveLength(8);
    expect(ranked[0]!.finalScore).toBeGreaterThanOrEqual(ranked[7]!.finalScore);
  });
});
