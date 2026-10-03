import { describe, expect, it } from 'vitest';

import type {
  ProductionRelationshipEventV1,
} from '../packages/domain/src/relationship-event-registry-v1.js';
import type {
  ProductionRelationshipHistoryRecordV1,
} from '../packages/domain/src/relationship-policy-reference-replay-v1.js';
import {
  bindSeyeonProductionCharacterContextInputV1,
  composeSeyeonProductionContextV1,
  SeyeonProductionContextErrorV1,
  type SeyeonProductionPersonalRecordProjectorV1,
} from '../apps/api/src/seyeon-production-context-v1.js';
import type {
  SeyeonProductionContextReadAuthorityPortV1,
} from '../apps/api/src/seyeon-production-context-read-v1.js';
import type {
  SeyeonProductionRelationshipTurnBindingV1,
} from '../apps/api/src/seyeon-production-relationship-read-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const CURRENT_USER_MESSAGE = '33333333-3333-4333-8333-333333333333';

function event(
  id: string,
  statement: string,
  occurredAt = '2026-10-03T01:00:00.000Z',
): ProductionRelationshipEventV1 {
  const sourceRef = 'server-observation:' + id;
  return Object.freeze({
    schemaVersion: 'relationship-event-v1',
    authority: 'authorized_relationship_event_v1',
    eventId: id,
    dedupeKey: 'event:' + id,
    subjectId: SUBJECT_ID,
    characterId: 'seyeon',
    eventKind: 'CHARACTER_DETAIL_REMEMBERED',
    eventSchemaVersion: '1',
    characterBehaviorKey: 'seyeon.remembered_detail',
    occurredAt,
    source: Object.freeze({
      sourceKind: 'server_observation',
      sourceRef,
      sourceMessageRefs: Object.freeze([]),
      authorityRefs: Object.freeze(['authority:test']),
    }),
    causalPredecessorEventIds: Object.freeze([]),
    facts: Object.freeze([Object.freeze({
      factKey: 'detail',
      statement,
      sourceRefs: Object.freeze([sourceRef]),
    })]),
    characterInterpretation: null,
    payload: Object.freeze({ detailKey: 'detail:test' }),
  });
}

function record(
  relationshipEvent: ProductionRelationshipEventV1,
  revision: number,
): ProductionRelationshipHistoryRecordV1 {
  return Object.freeze({
    action: 'record' as const,
    ledgerEntryId: 'ledger:' + revision,
    dedupeKey: 'history:' + revision,
    recordedAt: relationshipEvent.occurredAt,
    event: relationshipEvent,
  });
}

function port(input: {
  readonly personalRecords?: readonly {
    readonly recordKind: 'life_fact' | 'memory';
    readonly recordId: string;
    readonly recordType: string;
    readonly schemaVersion: string;
    readonly payload: unknown;
    readonly grantId: string;
    readonly grantReason: string;
    readonly grantedAt: string;
  }[];
  readonly history?: readonly ProductionRelationshipHistoryRecordV1[];
  readonly recentMessages?: readonly {
    readonly messageId: string;
    readonly sequenceNo: number;
    readonly senderType: string;
    readonly characterId: string | null;
    readonly text: string;
    readonly createdAt: string;
  }[];
} = {}): SeyeonProductionContextReadAuthorityPortV1 {
  return Object.freeze({
    readPersonalRecords: () => input.personalRecords ?? [],
    readRelationshipHistory: () => input.history ?? [],
    readRecentMessages: () => input.recentMessages ?? [],
  });
}

describe('Se-yeon Production context V1', () => {
  it('uses only the corrected active relationship Event', async () => {
    const original = event('event-original', '원래 세부');
    const replacement = event('event-corrected', '정정된 세부');
    const history: readonly ProductionRelationshipHistoryRecordV1[] = [
      record(original, 1),
      Object.freeze({
        action: 'correct' as const,
        ledgerEntryId: 'ledger:2',
        dedupeKey: 'history:2',
        recordedAt: '2026-10-03T01:05:00.000Z',
        targetEventId: original.eventId,
        replacementEvent: replacement,
        reason: 'authoritative correction',
      }),
    ];

    const result = await composeSeyeonProductionContextV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: CURRENT_USER_MESSAGE,
      relationshipRevisionUsedForTurn: 2,
      authorityPort: port({ history }),
    });

    expect(result.retrievedMemories).toEqual([
      expect.objectContaining({
        memoryId: 'relationship-event:event-corrected',
        summary: '정정된 세부',
        causalAuthority: 'authorized_shared_history',
      }),
    ]);
    expect(result.activeRelationshipEventCount).toBe(1);
  });

  it('removes a retracted relationship Event from future context', async () => {
    const original = event('event-original', '취소될 세부');
    const history: readonly ProductionRelationshipHistoryRecordV1[] = [
      record(original, 1),
      Object.freeze({
        action: 'retract' as const,
        ledgerEntryId: 'ledger:2',
        dedupeKey: 'history:2',
        recordedAt: '2026-10-03T01:05:00.000Z',
        targetEventId: original.eventId,
        reason: 'authoritative retraction',
      }),
    ];

    const result = await composeSeyeonProductionContextV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: CURRENT_USER_MESSAGE,
      relationshipRevisionUsedForTurn: 2,
      authorityPort: port({ history }),
    });

    expect(result.retrievedMemories).toEqual([]);
    expect(result.activeRelationshipEventCount).toBe(0);
  });

  it('fails closed when replay does not match the turn-pinned revision', async () => {
    const one = event('event-one', '첫 사건');
    await expect(composeSeyeonProductionContextV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: CURRENT_USER_MESSAGE,
      relationshipRevisionUsedForTurn: 2,
      authorityPort: port({ history: [record(one, 1)] }),
    })).rejects.toBeInstanceOf(SeyeonProductionContextErrorV1);
  });

  it('excludes the current user message and rejects another Character', async () => {
    const result = await composeSeyeonProductionContextV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: CURRENT_USER_MESSAGE,
      relationshipRevisionUsedForTurn: null,
      authorityPort: port({
        recentMessages: [
          {
            messageId: 'previous-user',
            sequenceNo: 1,
            senderType: 'user',
            characterId: null,
            text: '이전 사용자 메시지',
            createdAt: '2026-10-03T03:00:00.000Z',
          },
          {
            messageId: 'previous-seyeon',
            sequenceNo: 2,
            senderType: 'character',
            characterId: 'seyeon',
            text: '이전 세연 메시지',
            createdAt: '2026-10-03T03:01:00.000Z',
          },
          {
            messageId: CURRENT_USER_MESSAGE,
            sequenceNo: 3,
            senderType: 'user',
            characterId: null,
            text: '현재 턴',
            createdAt: '2026-10-03T03:02:00.000Z',
          },
        ],
      }),
    });

    expect(result.recentMessages).toEqual([
      { messageId: 'previous-user', role: 'user', text: '이전 사용자 메시지' },
      { messageId: 'previous-seyeon', role: 'assistant', text: '이전 세연 메시지' },
    ]);

    await expect(composeSeyeonProductionContextV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: CURRENT_USER_MESSAGE,
      relationshipRevisionUsedForTurn: null,
      authorityPort: port({
        recentMessages: [{
          messageId: 'other-character',
          sequenceNo: 1,
          senderType: 'character',
          characterId: 'baekheon',
          text: '다른 캐릭터',
          createdAt: '2026-10-03T03:00:00.000Z',
        }],
      }),
    })).rejects.toThrow(/another Character/i);
  });

  it('keeps unknown personal-record schemas out until an exact server-owned projector exists', async () => {
    const personalRecords = [{
      recordKind: 'memory' as const,
      recordId: 'memory-1',
      recordType: 'test_memory',
      schemaVersion: 'test-v1',
      payload: { summary: '승인된 테스트 기억' },
      grantId: 'grant-1',
      grantReason: 'user_explicit',
      grantedAt: '2026-10-03T04:00:00.000Z',
    }];

    const closed = await composeSeyeonProductionContextV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: CURRENT_USER_MESSAGE,
      relationshipRevisionUsedForTurn: null,
      authorityPort: port({ personalRecords }),
    });

    expect(closed.retrievedMemories).toEqual([]);
    expect(closed.personalRecordAdmissions[0]?.reason).toBe('UNSUPPORTED_SCHEMA');

    const projector: SeyeonProductionPersonalRecordProjectorV1 = {
      recordKind: 'memory',
      recordType: 'test_memory',
      schemaVersion: 'test-v1',
      project(input) {
        const payload = input.payload as { summary?: unknown };
        if (typeof payload.summary !== 'string') throw new Error('invalid test payload');
        return {
          summary: payload.summary,
          claimKind: 'fact',
          relevance: 1,
          salience: 1,
        };
      },
    };

    const admitted = await composeSeyeonProductionContextV1({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: CURRENT_USER_MESSAGE,
      relationshipRevisionUsedForTurn: null,
      authorityPort: port({ personalRecords }),
      serverOwnedPersonalRecordProjectors: [projector],
    });

    expect(admitted.retrievedMemories[0]).toMatchObject({
      memoryId: 'memory:memory-1',
      sourceRef: 'memory:memory-1:grant:grant-1',
      summary: '승인된 테스트 기억',
    });
  });

  it('binds server context instead of caller-shaped recent dialogue or memory', () => {
    const turnBinding: SeyeonProductionRelationshipTurnBindingV1 = {
      version: 'seyeon-production-relationship-read-v1',
      relationshipRevisionUsedForTurn: null,
      relationship: null,
      relationshipSemantics: null,
      freshness: 'EMPTY',
    };
    const productionContext = {
      version: 'seyeon-production-context-v1' as const,
      relationshipRevisionUsedForTurn: null,
      historyThroughRevision: 0,
      recentMessages: [{
        messageId: 'server-message',
        role: 'user' as const,
        text: '서버 대화',
      }],
      retrievedMemories: [],
      personalRecordAdmissions: [],
      activeRelationshipEventCount: 0,
    };

    const forged = {
      focuses: ['memory'],
      recentMessages: [{ messageId: 'forged', role: 'user', text: '위조' }],
      retrievedMemories: [{ memoryId: 'forged' }],
    } as unknown as Parameters<
      typeof bindSeyeonProductionCharacterContextInputV1
    >[0]['base'];

    const bound = bindSeyeonProductionCharacterContextInputV1({
      base: forged,
      turnBinding,
      productionContext,
    });

    expect(bound.recentMessages).toEqual(productionContext.recentMessages);
    expect(bound.retrievedMemories).toEqual([]);
    expect(bound.focuses).toEqual(['memory']);
  });
});
