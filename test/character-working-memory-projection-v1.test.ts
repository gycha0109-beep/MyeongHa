import { describe, expect, it } from 'vitest';

import {
  buildCharacterWorkingMemoryProjectionV1,
  CharacterWorkingMemoryProjectionErrorV1,
  type BuildCharacterWorkingMemoryProjectionInputV1,
  type CharacterWorkingMemoryRecordProjectorV1,
} from '../packages/domain/src/character-working-memory-projection-v1.js';

const factProjector: CharacterWorkingMemoryRecordProjectorV1 = Object.freeze({
  recordKind: 'life_fact',
  recordType: 'occupation',
  schemaVersion: 'life-fact-v1',
  projectorVersion: 'occupation-projector-v1',
  project: ({ payload }: Readonly<{ recordId: string; payload: unknown }>) => ({
    summary: '사용자의 직업은 디자이너입니다.',
    claimKind: 'fact' as const,
    relevance: 0.8,
    salience: 0.7,
  }),
});

const memoryProjector: CharacterWorkingMemoryRecordProjectorV1 = Object.freeze({
  recordKind: 'memory',
  recordType: 'conversation_recall',
  schemaVersion: 'v1',
  projectorVersion: 'conversation-recall-projector-v1',
  project: ({ payload }: Readonly<{ recordId: string; payload: unknown }>) => {
    const row = payload as { summary?: unknown };
    if (typeof row.summary !== 'string') {
      throw new TypeError('invalid conversation recall payload');
    }
    return {
      summary: row.summary,
      claimKind: 'character_interpretation' as const,
      relevance: 0.5,
      salience: 0.6,
    };
  },
});

function baseInput(
  overrides: Partial<BuildCharacterWorkingMemoryProjectionInputV1> = {},
): BuildCharacterWorkingMemoryProjectionInputV1 {
  return {
    scope: {
      subjectId: 'subject-a',
      characterId: 'seyeon',
      threadId: 'thread-a',
      authorizedThreadCharacterIds: ['seyeon', 'baekheon'],
      relationshipRevision: 4,
    },
    currentUserMessageRef: 'message-current-user',
    lifeFacts: [{
      factId: 'fact-a',
      factType: 'occupation',
      schemaVersion: 'life-fact-v1',
      value: { value: 'designer' },
      grantId: 'fact-grant-a',
      granteeCharacterId: 'seyeon',
    }],
    memories: [{
      memoryItemId: 'memory-a',
      memoryType: 'conversation_recall',
      schemaVersion: 'v1',
      content: { summary: '지난 대화에서 퇴사를 고민했습니다.' },
      createdByCharacterId: 'baekheon',
      createdAt: '2026-11-01T10:00:00.000Z',
      grantId: 'memory-grant-a',
      granteeCharacterId: 'seyeon',
      grantReason: 'user_choice',
      grantedAt: '2026-11-01T10:01:00.000Z',
    }],
    relationship: {
      stateId: 'relationship-a',
      characterId: 'seyeon',
      closeness: 42,
      trust: 57,
      friction: 11,
      relationshipStage: 'familiar',
      policyVersion: 'relationship-policy-v1',
      revision: 4,
      lastInteractionAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:01:00.000Z',
    },
    relationshipEvents: [{
      eventType: 'RETURN_VISIT',
      eventSchemaVersion: 'relationship-event-v1',
      stateRevisionAfter: 3,
      policyVersion: 'relationship-policy-v1',
      appliedAt: '2026-10-31T10:00:00.000Z',
    }],
    recentMessages: [
      {
        messageId: 'message-user-1',
        sequenceNo: 1,
        senderType: 'user',
        characterId: null,
        text: '오늘은 조금 피곤해요.',
        createdAt: '2026-11-01T09:00:00.000Z',
      },
      {
        messageId: 'message-seyeon-1',
        sequenceNo: 2,
        senderType: 'character',
        characterId: 'seyeon',
        text: '오늘은 무리하지 마세요.',
        createdAt: '2026-11-01T09:01:00.000Z',
      },
      {
        messageId: 'message-baekheon-1',
        sequenceNo: 3,
        senderType: 'character',
        characterId: 'baekheon',
        text: '다른 캐릭터의 대사입니다.',
        createdAt: '2026-11-01T09:02:00.000Z',
      },
      {
        messageId: 'message-system-1',
        sequenceNo: 4,
        senderType: 'system',
        characterId: null,
        text: 'internal event',
        createdAt: '2026-11-01T09:03:00.000Z',
      },
      {
        messageId: 'message-current-user',
        sequenceNo: 5,
        senderType: 'user',
        characterId: null,
        text: '오늘은 어떻게 지냈어요?',
        createdAt: '2026-11-01T09:04:00.000Z',
      },
    ],
    projectors: [factProjector, memoryProjector],
    ...overrides,
  };
}

describe('Character Working Memory projection v1', () => {
  it('projects only explicitly granted, schema-approved records with provenance', () => {
    const result = buildCharacterWorkingMemoryProjectionV1(baseInput());

    expect(result.schemaVersion).toBe('character-working-memory-projection-v1');
    expect(result.authority).toEqual({
      readOnly: true,
      mayCreateDurableRecord: false,
      mayChangeAccessGrant: false,
      mayMutateRelationship: false,
      includesProtectedSaju: false,
    });
    expect(result.projectedRecords).toEqual([
      expect.objectContaining({
        recordKind: 'life_fact',
        recordId: 'fact-a',
        claimKind: 'fact',
        sourceRef: 'life_fact:fact-a:grant:fact-grant-a',
        grantId: 'fact-grant-a',
      }),
      expect.objectContaining({
        recordKind: 'memory',
        recordId: 'memory-a',
        claimKind: 'character_interpretation',
        sourceRef: 'memory:memory-a:grant:memory-grant-a',
        grantReason: 'user_choice',
        createdByCharacterId: 'baekheon',
      }),
    ]);
    expect(result.relationshipEventIndex.exposure).toBe('metadata_only');
    expect(result.recentConversation.map((message) => message.messageId)).toEqual([
      'message-user-1',
      'message-seyeon-1',
    ]);
    expect(result.excludedMessages).toEqual([
      {
        messageId: 'message-baekheon-1',
        reason: 'OTHER_CHARACTER_MESSAGE_REQUIRES_SEPARATE_CONTEXT_AUTHORITY',
      },
      {
        messageId: 'message-system-1',
        reason: 'SYSTEM_MESSAGE_NOT_CHAT_CONTEXT',
      },
      {
        messageId: 'message-current-user',
        reason: 'CURRENT_USER_MESSAGE_SEPARATE_INPUT',
      },
    ]);
  });

  it('does not expose payloads when the positive type/schema projector is absent', () => {
    const input = baseInput({
      projectors: [],
      memories: [{
        ...baseInput().memories[0]!,
        content: { privateInternalOnly: 'DO_NOT_EXPOSE' },
      }],
    });
    const result = buildCharacterWorkingMemoryProjectionV1(input);

    expect(result.projectedRecords).toEqual([]);
    expect(result.admissions).toEqual([
      expect.objectContaining({
        recordKind: 'life_fact',
        outcome: 'UNSUPPORTED_SCHEMA',
      }),
      expect.objectContaining({
        recordKind: 'memory',
        outcome: 'UNSUPPORTED_SCHEMA',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPOSE');
  });

  it('rejects a Life Fact grant returned for another Character', () => {
    const input = baseInput({
      lifeFacts: [{
        ...baseInput().lifeFacts[0]!,
        granteeCharacterId: 'baekheon',
      }],
    });
    expect(() => buildCharacterWorkingMemoryProjectionV1(input)).toThrowError(
      expect.objectContaining({
        code: 'LIFE_FACT_GRANT_SCOPE_MISMATCH',
      }),
    );
  });

  it('rejects a Memory grant returned for another Character', () => {
    const input = baseInput({
      memories: [{
        ...baseInput().memories[0]!,
        granteeCharacterId: 'baekheon',
      }],
    });
    expect(() => buildCharacterWorkingMemoryProjectionV1(input)).toThrowError(
      expect.objectContaining({
        code: 'MEMORY_GRANT_SCOPE_MISMATCH',
      }),
    );
  });

  it('rejects relationship state that does not match the pinned turn revision', () => {
    const input = baseInput({
      relationship: {
        ...baseInput().relationship!,
        revision: 3,
      },
    });
    expect(() => buildCharacterWorkingMemoryProjectionV1(input)).toThrowError(
      expect.objectContaining({
        code: 'RELATIONSHIP_REVISION_MISMATCH',
      }),
    );
  });

  it('rejects relationship event metadata newer than the pinned projection', () => {
    const input = baseInput({
      relationshipEvents: [{
        ...baseInput().relationshipEvents[0]!,
        stateRevisionAfter: 5,
      }],
    });
    expect(() => buildCharacterWorkingMemoryProjectionV1(input)).toThrowError(
      expect.objectContaining({
        code: 'RELATIONSHIP_EVENT_REVISION_INVALID',
      }),
    );
  });

  it('requires the exact current User message to be the newest message in the thread snapshot', () => {
    const input = baseInput({
      currentUserMessageRef: 'message-user-1',
    });
    expect(() => buildCharacterWorkingMemoryProjectionV1(input)).toThrowError(
      expect.objectContaining({
        code: 'CURRENT_USER_MESSAGE_NOT_LATEST',
      }),
    );
  });

  it('keeps protected Official Reading and Saju context outside this projection', () => {
    const input = {
      ...baseInput(),
      protectedSaju: { privateText: 'must not enter ordinary memory' },
    } as unknown as BuildCharacterWorkingMemoryProjectionInputV1;

    expect(() => buildCharacterWorkingMemoryProjectionV1(input)).toThrowError(
      expect.objectContaining({
        code: 'PROTECTED_READING_CONTEXT_SEPARATE',
      }),
    );
  });

  it('requires the active Character to be a server-authorized thread participant', () => {
    const input = baseInput({
      scope: {
        ...baseInput().scope,
        authorizedThreadCharacterIds: ['baekheon'],
      },
    });
    expect(() => buildCharacterWorkingMemoryProjectionV1(input)).toThrowError(
      expect.objectContaining({
        code: 'THREAD_CHARACTER_NOT_AUTHORIZED',
      }),
    );
  });

  it('exposes the projection error type for callers that need typed failure handling', () => {
    expect(new CharacterWorkingMemoryProjectionErrorV1('TEST', 'test').code).toBe('TEST');
  });
});
