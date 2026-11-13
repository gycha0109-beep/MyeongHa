import { describe, expect, it, vi } from 'vitest';

import {
  prepareCharacterWorkingMemoryContextV1,
} from '../apps/api/src/character-working-memory-context-v1.js';
import type {
  ReaderContextMemoryReadAuthorityPortV1,
} from '../apps/api/src/reader-context-memory-read.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
} from '../apps/api/src/reader-context-non-memory-read.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from '../apps/api/src/character-relationship-read.js';
describe('prepareCharacterWorkingMemoryContextV1', () => {
  it('reads the same Subject/Character/thread authorities and returns a read-only projection', async () => {
    const memoryAuthorityPort: ReaderContextMemoryReadAuthorityPortV1 = {
      readGrantedMemories: vi.fn(async () => [{
        memoryItemId: 'memory-a',
        memoryType: 'conversation_recall',
        schemaVersion: 'v1',
        content: { summary: 'raw memory payload' },
        createdByCharacterId: 'seyeon',
        createdAt: '2026-11-01T10:00:00.000Z',
        grantId: 'grant-a',
        granteeCharacterId: 'seyeon',
        grantReason: 'user_choice' as const,
        grantedAt: '2026-11-01T10:01:00.000Z',
        sourceKind: 'user_approved' as const,
        sourceTurnId: null,
        sourceMessageId: null,
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
        text: '현재 질문',
        createdAt: '2026-11-01T10:02:00.000Z',
      }]),
    };
    const relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1 = {
      readCurrentRelationship: vi.fn(async () => [{
        stateId: 'relationship-a',
        characterId: 'seyeon',
        closeness: 10,
        trust: 20,
        friction: 0,
        relationshipStage: 'familiar',
        policyVersion: 'relationship-policy-v1',
        revision: 2,
        lastInteractionAt: null,
        updatedAt: '2026-11-01T10:00:00.000Z',
      }]),
    };

    const result = await prepareCharacterWorkingMemoryContextV1({
      resolvedSubjectId: 'subject-a',
      threadBinding: {
        threadId: 'thread-a',
        participantCharacterIds: ['seyeon'],
      },
      characterId: 'seyeon',
      currentUserMessageRef: 'current-user',
      expectedRelationshipRevision: 2,
      recentMessageLimit: 12,
      relationshipEventLimit: 8,
      memoryAuthorityPort,
      nonMemoryAuthorityPort,
      relationshipAuthorityPort,
    });

    expect(memoryAuthorityPort.readGrantedMemories).toHaveBeenCalledWith({
      subjectId: 'subject-a',
      characterId: 'seyeon',
    });
    expect(nonMemoryAuthorityPort.readGrantedLifeFacts).toHaveBeenCalledWith({
      subjectId: 'subject-a',
      characterId: 'seyeon',
    });
    expect(nonMemoryAuthorityPort.readRelationshipEvents).toHaveBeenCalledWith({
      subjectId: 'subject-a',
      characterId: 'seyeon',
      beforeRevision: 2,
      limit: 8,
    });
    expect(nonMemoryAuthorityPort.readRecentMessages).toHaveBeenCalledWith({
      subjectId: 'subject-a',
      threadId: 'thread-a',
      limit: 13,
    });
    expect(relationshipAuthorityPort.readCurrentRelationship).toHaveBeenCalledWith({
      subjectId: 'subject-a',
      characterId: 'seyeon',
    });
    expect(result.projectedRecords).toEqual([]);
    expect(result.admissions).toEqual([
      expect.objectContaining({
        recordKind: 'memory',
        recordId: 'memory-a',
        outcome: 'UNSUPPORTED_SCHEMA',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('raw memory payload');
    expect(result.authority.readOnly).toBe(true);
    expect(result.authority.mayCreateDurableRecord).toBe(false);
  });

  it('fails before source reads when the active Character is not in the server thread binding', async () => {
    const memoryAuthorityPort: ReaderContextMemoryReadAuthorityPortV1 = {
      readGrantedMemories: vi.fn(async () => []),
    };
    const nonMemoryAuthorityPort: ReaderContextNonMemoryReadAuthorityPortV1 = {
      readGrantedLifeFacts: vi.fn(async () => []),
      readRelationshipEvents: vi.fn(async () => []),
      readRecentMessages: vi.fn(async () => []),
    };
    const relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1 = {
      readCurrentRelationship: vi.fn(async () => []),
    };

    await expect(prepareCharacterWorkingMemoryContextV1({
      resolvedSubjectId: 'subject-a',
      threadBinding: {
        threadId: 'thread-a',
        participantCharacterIds: ['baekheon'],
      },
      characterId: 'seyeon',
      currentUserMessageRef: 'current-user',
      expectedRelationshipRevision: null,
      recentMessageLimit: 12,
      relationshipEventLimit: 8,
      memoryAuthorityPort,
      nonMemoryAuthorityPort,
      relationshipAuthorityPort,
    })).rejects.toThrow(/server-bound Character thread/);

    expect(memoryAuthorityPort.readGrantedMemories).not.toHaveBeenCalled();
    expect(nonMemoryAuthorityPort.readRecentMessages).not.toHaveBeenCalled();
  });
});
