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
  project: ({ payload }) => {
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
        grantReason: 'user_choice',
        grantedAt: '2026-10-01T00:01:00.000Z',
        sourceKind: 'user_approved',
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
        grantReason: 'user_choice',
        grantedAt: '2026-10-01T00:01:00.000Z',
        sourceKind: 'user_approved',
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
    expect(result.projection.currentUserMessage.text).toBe('지난번에 퇴사 고민했던 거 기억나요?');
    expect(result.projection.scope).toEqual({
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
      relationshipRevision: null,
    });
  });
});
