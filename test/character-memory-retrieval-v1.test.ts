import { describe, expect, it, vi } from 'vitest';

import {
  buildCharacterWorkingMemoryProjectionV1,
  type CharacterWorkingMemoryRecordProjectorV1,
} from '../packages/domain/src/character-working-memory-projection-v1.js';
import {
  detectExplicitMemoryCallbackRequestedV1,
  retrieveCharacterWorkingMemoryV1,
} from '../packages/domain/src/character-memory-retrieval-v1.js';
import {
  CharacterWorkingMemoryRetrievalGateErrorV1,
  retrieveCharacterWorkingMemoryForTurnV1,
} from '../apps/api/src/character-working-memory-retrieval-v1.js';
import type {
  ReaderContextMemoryReadAuthorityPortV1,
} from '../apps/api/src/reader-context-memory-read.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
} from '../apps/api/src/reader-context-non-memory-read.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from '../apps/api/src/character-relationship-read.js';

const memoryProjector: CharacterWorkingMemoryRecordProjectorV1 = Object.freeze({
  recordKind: 'memory',
  recordType: 'conversation_recall',
  schemaVersion: 'v1',
  projectorVersion: 'test-conversation-recall-projector-v1',
  project: ({ payload }: Parameters<CharacterWorkingMemoryRecordProjectorV1['project']>[0]) => {
    const value = payload as { summary?: unknown; relevance?: unknown; salience?: unknown };
    if (typeof value.summary !== 'string') throw new TypeError('summary required');
    return {
      summary: value.summary,
      claimKind: 'character_interpretation' as const,
      relevance: typeof value.relevance === 'number' ? value.relevance : 0.5,
      salience: typeof value.salience === 'number' ? value.salience : 0.5,
    };
  },
});

const lifeFactProjector: CharacterWorkingMemoryRecordProjectorV1 = Object.freeze({
  recordKind: 'life_fact',
  recordType: 'occupation',
  schemaVersion: 'life-fact-v1',
  projectorVersion: 'test-occupation-projector-v1',
  project: () => ({
    summary: '사용자는 디자이너로 일합니다.',
    claimKind: 'fact' as const,
    relevance: 0.8,
    salience: 0.8,
  }),
});

function buildProjection(input: Readonly<{
  queryText: string;
  lifeFactValidFrom?: string | null;
  lifeFactValidTo?: string | null;
  includeLifeFact?: boolean;
  includeMemory?: boolean;
  includeSecondMemory?: boolean;
}>): ReturnType<typeof buildCharacterWorkingMemoryProjectionV1> {
  return buildCharacterWorkingMemoryProjectionV1({
    scope: {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
      authorizedThreadCharacterIds: ['seyeon'],
      relationshipRevision: null,
    },
    currentUserMessageRef: 'current-user',
    lifeFacts: input.includeLifeFact === false ? [] : [{
      factId: 'fact-a',
      factType: 'occupation',
      schemaVersion: 'life-fact-v1',
      value: { value: 'designer' },
      grantId: 'fact-grant-a',
      granteeCharacterId: 'seyeon',
      grantReason: 'user_choice',
      grantedAt: '2026-11-01T10:01:00.000Z',
      sourceKind: 'user_explicit',
      sourceMessageId: null,
      sourceMergeActionId: null,
      validFrom: input.lifeFactValidFrom ?? null,
      validTo: input.lifeFactValidTo ?? null,
      confirmedAt: '2026-11-01T10:00:00.000Z',
      createdAt: '2026-11-01T10:00:00.000Z',
    }],
    memories: input.includeMemory === false ? [] : [{
      memoryItemId: 'memory-a',
      memoryType: 'conversation_recall',
      schemaVersion: 'v1',
      content: {
        summary: '지난 상담에서 퇴사를 고민했습니다.',
        relevance: 0.9,
        salience: 0.9,
      },
      createdByCharacterId: 'seyeon',
      createdAt: '2026-10-01T00:00:00.000Z',
      grantId: 'memory-grant-a',
      granteeCharacterId: 'seyeon',
      grantReason: 'user_choice',
      grantedAt: '2026-10-01T00:01:00.000Z',
      sourceKind: 'user_approved',
      sourceTurnId: 'turn-a',
      sourceMessageId: 'message-a',
      sourceMergeActionId: null,
    }, ...(input.includeSecondMemory ? [{
      memoryItemId: 'memory-new',
      memoryType: 'conversation_recall',
      schemaVersion: 'v1',
      content: {
        summary: '최근 대화에서 오늘 계획을 이야기했습니다.',
        relevance: 0.2,
        salience: 0.1,
      },
      createdByCharacterId: 'seyeon',
      createdAt: '2026-11-06T00:00:00.000Z',
      grantId: 'memory-grant-new',
      granteeCharacterId: 'seyeon',
      grantReason: 'user_choice' as const,
      grantedAt: '2026-11-06T00:01:00.000Z',
      sourceKind: 'user_approved' as const,
      sourceTurnId: 'turn-new',
      sourceMessageId: 'message-new',
      sourceMergeActionId: null,
    }] : [])],
    relationship: null,
    relationshipEvents: [],
    recentMessages: [{
      messageId: 'current-user',
      sequenceNo: 1,
      senderType: 'user',
      characterId: null,
      text: input.queryText,
      createdAt: '2026-11-07T00:00:00.000Z',
    }],
    projectors: [
      ...(input.includeLifeFact === false ? [] : [lifeFactProjector]),
      ...(input.includeMemory === false ? [] : [memoryProjector]),
    ],
  });
}

describe('Character Working Memory retrieval v1', () => {
  it('retrieves an authorized memory using the exact current User turn and metadata', () => {
    const projection = buildProjection({ queryText: '지난번 퇴사 고민 기억나요?' });
    const result = retrieveCharacterWorkingMemoryV1({
      projection,
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });

    expect(result.retrievalMode).toBe('lexical+metadata');
    expect(result.records.map((item) => item.record.recordId)).toEqual(['memory-a']);
    expect(result.records[0]?.signals.explicitCallbackMatch).toBe(true);
    expect(result.trace.selectedSourceRefs).toEqual([
      'memory:memory-a:grant:memory-grant-a',
    ]);
  });

  it('recognizes polite past-conversation recall questions and prioritizes only authorized matching memory', () => {
    const expectedScope = {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
    };
    for (const queryText of [
      '지난 상담에서 했던 퇴사 고민 기억하세요?',
      '퇴사 고민에 대해 기억하시나요?',
      '퇴사 고민 기억하십니까？',
    ]) {
      const result = retrieveCharacterWorkingMemoryV1({
        projection: buildProjection({
          queryText, includeLifeFact: false, includeSecondMemory: true,
        }),
        expectedScope,
        now: '2026-11-07T00:00:00.000Z',
        limit: 5,
      });
      expect(detectExplicitMemoryCallbackRequestedV1(queryText)).toBe(true);
      expect(result.trace.explicitCallbackRequested).toBe(true);
      expect(result.trace.callbackFallbackUsed).toBe(false);
      expect(result.records.map(item => item.record.recordId)).toEqual(['memory-a']);
      expect(result.records[0]?.signals.callbackFallbackUsed).toBe(false);
    }
  });

  it('uses generic polite recall only for an explicit question and preserves caller suppression', () => {
    const expectedScope = {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
    };
    const projection = buildProjection({
      queryText: '기억하세요?',
      includeLifeFact: true,
      includeSecondMemory: true,
    });
    const common = {
      projection,
      expectedScope,
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    };
    const recalled = retrieveCharacterWorkingMemoryV1(common);
    expect(recalled.trace.queryTokenCount).toBe(0);
    expect(recalled.trace.explicitCallbackRequested).toBe(true);
    expect(recalled.trace.callbackFallbackUsed).toBe(true);
    expect(recalled.records.map(item => item.record.recordId))
      .toEqual(['memory-new', 'memory-a']);
    expect(recalled.records.every(item => item.record.recordKind === 'memory'))
      .toBe(true);
    const suppressed = retrieveCharacterWorkingMemoryV1({
      ...common, explicitCallbackRequested: false,
    });
    expect(suppressed.trace.explicitCallbackRequested).toBe(false);
    expect(suppressed.trace.callbackFallbackUsed).toBe(false);
    expect(suppressed.records).toEqual([]);

    for (const ordinaryStatement of [
      '제 주소 기억하세요.',
      '그것은 기억하세요!',
      '기억하시나요 라고 적어 주세요.',
    ]) {
      expect(detectExplicitMemoryCallbackRequestedV1(ordinaryStatement)).toBe(false);
    }
    const noQuestion = retrieveCharacterWorkingMemoryV1({
      ...common,
      projection: buildProjection({
        queryText: '기억하세요.',
        includeLifeFact: false,
        includeSecondMemory: true,
      }),
    });
    expect(noQuestion.trace.callbackFallbackUsed).toBe(false);
    expect(noQuestion.records).toEqual([]);
  });

  it('uses a bounded latest-memory fallback for a generic explicit callback', () => {
    const result = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({
        queryText: '지난번에 얘기했던 거 기억나요?',
        includeSecondMemory: true,
      }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });

    expect(result.records.map((item) => item.record.recordId)).toEqual(['memory-new', 'memory-a']);
    expect(result.records[0]?.signals.explicitCallbackMatch).toBe(true);
    expect(result.records[0]?.signals.callbackFallbackUsed).toBe(true);
    expect(result.trace.callbackFallbackUsed).toBe(true);
  });

  it('does not let a caller hint fabricate a generic callback in an unrelated short User turn', () => {
    const projection = buildProjection({
      queryText: '응?',
      includeLifeFact: false,
      includeSecondMemory: true,
    });
    const result = retrieveCharacterWorkingMemoryV1({
      projection,
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
      explicitCallbackRequested: true,
    });

    expect(result.records).toEqual([]);
    expect(result.trace.queryTokenCount).toBe(0);
    expect(result.trace.explicitCallbackRequested).toBe(false);
    expect(result.trace.callbackFallbackUsed).toBe(false);
    expect(result.trace.excluded).toHaveLength(2);
    expect(result.trace.excluded.every(item =>
      item.reason === 'NO_LEXICAL_MATCH')).toBe(true);
  });

  it('does not grant callback priority to an unrelated topical query on an external hint', () => {
    const result = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({
        queryText: '퇴사 고민',
        includeLifeFact: false,
      }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
      explicitCallbackRequested: true,
    });

    expect(result.records.map(item => item.record.recordId)).toEqual(['memory-a']);
    expect(result.trace.explicitCallbackRequested).toBe(false);
    expect(result.records[0]?.signals.explicitCallbackMatch).toBe(false);
    expect(result.records[0]?.signals.callbackFallbackUsed).toBe(false);
  });

  it('respects an explicit false callback hint and refuses invalid nonboolean hints', () => {
    const projection = buildProjection({
      queryText: '지난번에 얘기했던 거 기억나요?',
      includeLifeFact: false,
      includeSecondMemory: true,
    });
    const common = {
      projection,
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    };
    const suppressed = retrieveCharacterWorkingMemoryV1({
      ...common, explicitCallbackRequested: false,
    });
    expect(suppressed.records).toEqual([]);
    expect(suppressed.trace.callbackFallbackUsed).toBe(false);
    expect(suppressed.trace.explicitCallbackRequested).toBe(false);

    expect(() => retrieveCharacterWorkingMemoryV1({
      ...common,
      explicitCallbackRequested: 'true' as unknown as boolean,
    })).toThrow('callback hint must be boolean');
  });

  it('preserves topical words that start like callback scaffolding and abstains instead of recalling an unrelated episode', () => {
    for (const queryText of [
      '지난달 기억나요?',
      '저번주 기억나요?',
      '기억력 기억나요?',
      '대화형 기억나요?',
    ]) {
      const result = retrieveCharacterWorkingMemoryV1({
        projection: buildProjection({
          queryText,
          includeLifeFact: false,
          includeSecondMemory: true,
        }),
        expectedScope: {
          subjectId: 'subject-a',
          characterId: 'seyeon',
          threadId: 'thread-a',
        },
        now: '2026-11-07T00:00:00.000Z',
        limit: 5,
      });

      expect(result.trace.explicitCallbackRequested).toBe(true);
      expect(result.trace.queryTokenCount).toBe(1);
      expect(result.trace.callbackFallbackUsed).toBe(false);
      expect(result.records).toEqual([]);
      expect(result.trace.excluded.every((item) => item.reason === 'NO_LEXICAL_MATCH')).toBe(true);
    }
  });

  it('abstains when a specific multi-session recall has no matching topic', () => {
    const result = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({
        queryText: '지난번 쌀국수 약속 기억나요?',
        includeLifeFact: false,
        includeSecondMemory: true,
      }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });

    expect(result.trace.explicitCallbackRequested).toBe(true);
    expect(result.trace.callbackFallbackUsed).toBe(false);
    expect(result.records).toEqual([]);
  });

  it('selects the older relevant session over a newer unrelated one', () => {
    const result = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({
        queryText: '퇴사 고민',
        includeLifeFact: false,
        includeSecondMemory: true,
      }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 1,
    });

    expect(result.records.map((item) => item.record.recordId)).toEqual(['memory-a']);
    expect(result.trace.matchedCandidateCount).toBe(1);
  });

  it('limits generic recall to the latest episode when its budget is one record', () => {
    const result = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({
        queryText: '지난번에 얘기했던 거 기억나요?',
        includeLifeFact: false,
        includeSecondMemory: true,
      }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 1,
    });

    expect(result.records.map((item) => item.record.recordId)).toEqual(['memory-new']);
    expect(result.trace.matchedCandidateCount).toBe(2);
    expect(result.trace.selectedSourceRefs).toHaveLength(1);
  });

  it('does not retrieve memories without lexical support', () => {
    const result = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({ queryText: '고양이', includeLifeFact: false }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });

    expect(result.records).toEqual([]);
    expect(result.trace.callbackFallbackUsed).toBe(false);
    expect(result.trace.excluded[0]?.reason).toBe('NO_LEXICAL_MATCH');
  });

  it('excludes Life Facts that are not yet valid or have expired', () => {
    const notYetValid = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({
        queryText: '디자이너 직업',
        includeMemory: false,
        lifeFactValidFrom: '2026-12-01T00:00:00.000Z',
      }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });
    const expired = retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({
        queryText: '디자이너 직업',
        includeMemory: false,
        lifeFactValidTo: '2026-11-01T00:00:00.000Z',
      }),
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });

    expect(notYetValid.records).toEqual([]);
    expect(notYetValid.trace.excluded[0]?.reason).toBe('NOT_YET_VALID');
    expect(expired.records).toEqual([]);
    expect(expired.trace.excluded[0]?.reason).toBe('EXPIRED');
  });

  it('excludes records created or granted after the canonical User turn even when server time is later', () => {
    const projection = buildProjection({
      queryText: '퇴사 고민',
      includeLifeFact: false,
    });
    const expectedScope = {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
    };
    const now = '2026-11-09T00:00:00.000Z';
    const original = projection.projectedRecords[0]!;
    const run = (record: typeof original) => retrieveCharacterWorkingMemoryV1({
      projection: { ...projection, projectedRecords: [record] },
      expectedScope,
      now,
      limit: 5,
    });

    expect(run(original).records.map(item => item.record.recordId))
      .toEqual(['memory-a']);
    for (const field of ['createdAt', 'grantedAt'] as const) {
      const result = run({
        ...original,
        [field]: '2026-11-08T00:00:00.000Z',
      });
      expect(result.records).toEqual([]);
      expect(result.trace.excluded).toEqual([{
        sourceRef: original.sourceRef,
        reason: 'SOURCE_TIMESTAMP_AFTER_CURRENT_TURN',
      }]);
    }
  });

  it('excludes facts confirmed or first valid after the canonical turn without changing current-time revocation', () => {
    const projection = buildProjection({
      queryText: '디자이너 직업',
      includeMemory: false,
    });
    const original = projection.projectedRecords[0]!;
    const expectedScope = {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
    };
    const run = (record: typeof original) => retrieveCharacterWorkingMemoryV1({
      projection: { ...projection, projectedRecords: [record] },
      expectedScope,
      now: '2026-11-09T00:00:00.000Z',
      limit: 5,
    });
    expect(run(original).records.map(item => item.record.recordId))
      .toEqual(['fact-a']);
    const newlyConfirmed = run({
      ...original,
      confirmedAt: '2026-11-08T00:00:00.000Z',
    });
    expect(newlyConfirmed.records).toEqual([]);
    expect(newlyConfirmed.trace.excluded[0]?.reason)
      .toBe('SOURCE_TIMESTAMP_AFTER_CURRENT_TURN');

    const newlyValid = run({
      ...original,
      validFrom: '2026-11-08T00:00:00.000Z',
    });
    expect(newlyValid.records).toEqual([]);
    expect(newlyValid.trace.excluded[0]?.reason).toBe('NOT_YET_VALID');

    // Even if it was valid when the message was written, a fact expired
    // by the actual server read must not be resurrected.
    const expiredNow = run({
      ...original,
      validTo: '2026-11-08T00:00:00.000Z',
    });
    expect(expiredNow.records).toEqual([]);
    expect(expiredNow.trace.excluded[0]?.reason).toBe('EXPIRED');
  });

  it('fails closed for invalid grant/confirmation and fact-validity timestamp metadata', () => {
    const source = buildProjection({
      queryText: '디자이너 직업',
      includeMemory: false,
    });
    const expectedScope = {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
    };
    const evaluate = (projectedRecords: typeof source.projectedRecords) =>
      retrieveCharacterWorkingMemoryV1({
        projection: { ...source, projectedRecords },
        expectedScope,
        now: '2026-11-07T00:00:00.000Z',
        limit: 5,
      });
    const original = source.projectedRecords[0]!;
    expect(() => evaluate([{ ...original, grantedAt: 'not-a-timestamp' }]))
      .toThrow('valid source timestamps');
    expect(() => evaluate([{ ...original, confirmedAt: 'invalid-date' }]))
      .toThrow('valid source timestamps');
    expect(() => evaluate([{ ...original, validFrom: 'invalid-start' }]))
      .toThrow('valid source timestamps');
    expect(() => evaluate([{ ...original, validTo: 'invalid-end' }]))
      .toThrow('valid source timestamps');
    expect(() => evaluate([{
      ...original,
      validFrom: '2026-11-06T00:00:00.000Z',
      validTo: '2026-11-02T00:00:00.000Z',
    }])).toThrow('inverted fact-validity range');
  });

  it('excludes future-dated grants and blocks future current turns before retrieving', () => {
    const source = buildProjection({
      queryText: '퇴사 고민',
      includeLifeFact: false,
    });
    const expectedScope = {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
    };
    const result = retrieveCharacterWorkingMemoryV1({
      projection: {
        ...source,
        projectedRecords: source.projectedRecords.map(record => ({
          ...record,
          grantedAt: '2026-11-08T00:00:00.000Z',
        })),
      },
      expectedScope,
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });
    expect(result.records).toHaveLength(0);
    expect(result.trace.excluded[0]?.reason).toBe('SOURCE_TIMESTAMP_IN_FUTURE');
    expect(() => retrieveCharacterWorkingMemoryV1({
      projection: {
        ...source,
        currentUserMessage: {
          ...source.currentUserMessage,
          createdAt: '2026-11-08T00:00:00.000Z',
        },
      },
      expectedScope,
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    })).toThrow('current turn is in the future');
  });

  it('fails closed when the pinned Subject, Character, or thread differs', () => {
    expect(() => retrieveCharacterWorkingMemoryV1({
      projection: buildProjection({ queryText: '퇴사 고민' }),
      expectedScope: {
        subjectId: 'subject-b',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    })).toThrow(/scope does not match/);
  });

  it('detects explicit recall wording without treating it as a storage instruction', () => {
    expect(detectExplicitMemoryCallbackRequestedV1('지난번에 얘기한 퇴사 고민 기억나요?')).toBe(true);
    expect(detectExplicitMemoryCallbackRequestedV1('오늘 날씨가 좋네요.')).toBe(false);
  });

  it('does not expose unsupported Memory payloads without a positive projector', () => {
    const unsupported = buildCharacterWorkingMemoryProjectionV1({
      scope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
        authorizedThreadCharacterIds: ['seyeon'],
        relationshipRevision: null,
      },
      currentUserMessageRef: 'current-user',
      lifeFacts: [],
      memories: [{
        memoryItemId: 'memory-unapproved',
        memoryType: 'unregistered_type',
        schemaVersion: 'v99',
        content: { secret: 'never expose' },
        createdByCharacterId: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        grantId: 'grant-unapproved',
        granteeCharacterId: 'seyeon',
        grantReason: 'user_choice' as const,
        grantedAt: '2026-10-01T00:01:00.000Z',
        sourceKind: 'user_approved' as const,
        sourceTurnId: null,
        sourceMessageId: null,
        sourceMergeActionId: null,
      }],
      relationship: null,
      relationshipEvents: [],
      recentMessages: [{
        messageId: 'current-user',
        sequenceNo: 1,
        senderType: 'user',
        characterId: null,
        text: '퇴사 고민',
        createdAt: '2026-11-07T00:00:00.000Z',
      }],
    });
    const result = retrieveCharacterWorkingMemoryV1({
      projection: unsupported,
      expectedScope: {
        subjectId: 'subject-a',
        characterId: 'seyeon',
        threadId: 'thread-a',
      },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });

    expect(result.records).toEqual([]);
    expect(result.trace.unsupportedSchemaCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain('never expose');
  });

  it('denies before any source read when entitlement or another capability gate fails', async () => {
    const memoryRead = vi.fn(async () => []);
    const lifeFactRead = vi.fn(async () => []);
    const relationshipEventsRead = vi.fn(async () => []);
    const recentMessagesRead = vi.fn(async () => []);
    const relationshipRead = vi.fn(async () => []);
    await expect(retrieveCharacterWorkingMemoryForTurnV1({
      resolvedSubjectId: 'subject-a',
      capabilityGateInput: {
        needsSaju: false,
        characterCapabilityAllowed: true,
        userConsentAllowed: true,
        sajuDomainAvailability: 'not_requested',
        worldStateAllowed: true,
        entitlementAllowed: false,
        contentPolicyAllowed: true,
        clientCapabilityAllowed: true,
      },
      threadBinding: {
        threadId: 'thread-a',
        participantCharacterIds: ['seyeon'],
      },
      characterId: 'seyeon',
      currentUserMessageRef: 'current-user',
      expectedRelationshipRevision: null,
      recentMessageLimit: 4,
      relationshipEventLimit: 2,
      memoryAuthorityPort: { readGrantedMemories: memoryRead },
      nonMemoryAuthorityPort: {
        readGrantedLifeFacts: lifeFactRead,
        readRelationshipEvents: relationshipEventsRead,
        readRecentMessages: recentMessagesRead,
      },
      relationshipAuthorityPort: { readCurrentRelationship: relationshipRead },
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    })).rejects.toBeInstanceOf(CharacterWorkingMemoryRetrievalGateErrorV1);

    expect(memoryRead).not.toHaveBeenCalled();
    expect(lifeFactRead).not.toHaveBeenCalled();
    expect(relationshipEventsRead).not.toHaveBeenCalled();
    expect(recentMessagesRead).not.toHaveBeenCalled();
    expect(relationshipRead).not.toHaveBeenCalled();
  });

  it('uses the exact current User message returned by the authoritative thread read', async () => {
    const memoryAuthorityPort: ReaderContextMemoryReadAuthorityPortV1 = {
      readGrantedMemories: vi.fn(async () => [{
        memoryItemId: 'memory-api',
        memoryType: 'conversation_recall',
        schemaVersion: 'v1',
        content: { summary: '지난 대화에서 퇴사 고민을 했습니다.' },
        createdByCharacterId: 'seyeon',
        createdAt: '2026-10-01T00:00:00.000Z',
        grantId: 'grant-api',
        granteeCharacterId: 'seyeon',
        grantReason: 'user_choice' as const,
        grantedAt: '2026-10-01T00:01:00.000Z',
        sourceKind: 'user_approved' as const,
        sourceTurnId: 'turn-api',
        sourceMessageId: 'message-api',
        sourceMergeActionId: null,
      }]),
    };
    const nonMemoryAuthorityPort: ReaderContextNonMemoryReadAuthorityPortV1 = {
      readGrantedLifeFacts: vi.fn(async () => []),
      readRelationshipEvents: vi.fn(async () => []),
      readRecentMessages: vi.fn(async () => [{
        messageId: 'current-user',
        sequenceNo: 1,
        senderType: 'user',
        characterId: null,
        text: '지난번에 퇴사 고민했던 거 기억나요?',
        createdAt: '2026-11-07T00:00:00.000Z',
      }]),
    };
    const relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1 = {
      readCurrentRelationship: vi.fn(async () => []),
    };

    const result = await retrieveCharacterWorkingMemoryForTurnV1({
      resolvedSubjectId: 'subject-a',
      capabilityGateInput: {
        needsSaju: false,
        characterCapabilityAllowed: true,
        userConsentAllowed: true,
        sajuDomainAvailability: 'not_requested',
        worldStateAllowed: true,
        entitlementAllowed: true,
        contentPolicyAllowed: true,
        clientCapabilityAllowed: true,
      },
      threadBinding: {
        threadId: 'thread-a',
        participantCharacterIds: ['seyeon'],
      },
      characterId: 'seyeon',
      currentUserMessageRef: 'current-user',
      expectedRelationshipRevision: null,
      recentMessageLimit: 4,
      relationshipEventLimit: 2,
      memoryAuthorityPort,
      nonMemoryAuthorityPort,
      relationshipAuthorityPort,
      projectors: [memoryProjector],
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    });

    expect(result.retrieval.records.map((item) => item.record.recordId)).toEqual(['memory-api']);
    expect(result.context.currentUserMessage.text).toBe('지난번에 퇴사 고민했던 거 기억나요?');
    expect(result.retrieval.querySourceTurn).toEqual({
      messageId: 'current-user',
      sequenceNo: 1,
      createdAt: '2026-11-07T00:00:00.000Z',
      text: '지난번에 퇴사 고민했던 거 기억나요?',
    });
    expect(JSON.stringify(result.retrieval.trace))
      .not.toContain('지난번에 퇴사 고민했던 거 기억나요?');
    expect(result.context.scope).toEqual({
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
      relationshipRevision: null,
    });
    expect('projectedRecords' in result.context).toBe(false);
  });
});
