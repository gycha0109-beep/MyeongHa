import { describe, expect, it } from 'vitest';

import {
  InMemorySeyeonEventLedgerV2,
} from '../packages/domain/src/index.js';
import {
  prepareInternalPinnedSeyeonDogfoodReceivePlanV1,
} from '../apps/api/src/chat-receive.js';
import {
  SeyeonProductionChatExecutionErrorV1,
  assertSeyeonProductionAttemptOwnershipV1,
  bindSeyeonProductionCurrentUserTurnV1,
  resolveSeyeonProductionCommittedReplayV1,
  runSeyeonProductionChatExecutionV1,
} from '../apps/api/src/seyeon-production-chat-execution-v1.js';
import {
  createSeyeonProductionRuntimeIdPortV1,
} from '../apps/api/src/seyeon-production-runtime-ids-v1.js';

describe('Se-yeon Production Chat execution V1', () => {
  it('returns the authoritative committed assistant response without re-executing the turn', () => {
    const receivedTurn = Object.freeze({
      turnId: 'turn-committed',
      userMessageId: 'user-committed',
      userText: '같은 요청',
      threadCharacterId: 'thread-character',
      contentReleaseId: 'release-1',
      contentBundleId: 'bundle-1',
      turnState: 'committed',
      committedTurn: Object.freeze({
        attemptId: 'attempt-1',
        assistantMessageId: 'assistant-1',
        assistantText: '이미 저장된 세연 답변',
        sequenceNo: 8,
        committedAt: '2026-10-04T00:00:00.000Z',
      }),
      replayed: true,
    });

    const replay = resolveSeyeonProductionCommittedReplayV1(receivedTurn);

    expect(replay).toEqual(expect.objectContaining({
      disposition: 'committed_replay',
      assistantText: '이미 저장된 세연 답변',
      committedTurn: expect.objectContaining({
        turnId: 'turn-committed',
        attemptId: 'attempt-1',
        assistantMessageId: 'assistant-1',
        sequenceNo: 8,
        replayed: true,
      }),
    }));
  });

  it('rejects terminal replay without a reusable committed response', () => {
    expect(() =>
      resolveSeyeonProductionCommittedReplayV1(Object.freeze({
        turnId: 'turn-failed',
        userMessageId: 'user-failed',
        userText: '실패 턴 재요청',
        threadCharacterId: 'thread-character',
        contentReleaseId: 'release-1',
        contentBundleId: 'bundle-1',
        turnState: 'failed_final',
        committedTurn: null,
        replayed: true,
      })),
    ).toThrow(SeyeonProductionChatExecutionErrorV1);
  });

  it('does not let a second execution reuse an already active attempt', () => {
    expect(() =>
      assertSeyeonProductionAttemptOwnershipV1({
        attemptId: 'attempt-running',
        attemptNo: 1,
        replayed: true,
      }),
    ).toThrow(/already in flight/i);

    expect(() =>
      assertSeyeonProductionAttemptOwnershipV1({
        attemptId: 'attempt-owned',
        attemptNo: 1,
        replayed: false,
      }),
    ).not.toThrow();
  });

  it('appends the authoritative current user message exactly once after historical context', () => {
    const bound = bindSeyeonProductionCurrentUserTurnV1({
      historicalContext: {
        relationship: null,
        recentMessages: Object.freeze([
          Object.freeze({
            messageId: 'historical-user',
            role: 'user' as const,
            text: '이전 사용자 메시지',
          }),
          Object.freeze({
            messageId: 'historical-seyeon',
            role: 'assistant' as const,
            text: '이전 세연 메시지',
          }),
        ]),
        retrievedMemories: Object.freeze([]),
      },
      userMessageId: 'current-user',
      userText: '현재 사용자 메시지',
    });

    expect(bound.recentMessages).toEqual([
      {
        messageId: 'historical-user',
        role: 'user',
        text: '이전 사용자 메시지',
      },
      {
        messageId: 'historical-seyeon',
        role: 'assistant',
        text: '이전 세연 메시지',
      },
      {
        messageId: 'current-user',
        role: 'user',
        text: '현재 사용자 메시지',
      },
    ]);
    expect(bound.recentMessages.at(-1)).toEqual({
      messageId: 'current-user',
      role: 'user',
      text: '현재 사용자 메시지',
    });
  });

  it('keeps committed replay independent from deferred post-turn model execution', async () => {
    let providerCalls = 0;
    const provider = {
      providerKey: 'must-not-run',
      modelKey: 'must-not-run',
      generate() {
        providerCalls += 1;
        throw new Error('provider must not run for committed replay');
      },
    };

    const receivePlan = prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
      request: {
        threadId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
        clientTurnId: 'replay-turn-1',
        text: '같은 요청',
        clientCapability: 'internal-seyeon-dogfood-v1',
      },
      trustedThread: {
        threadId: '11111111-1111-4111-8111-111111111111',
        pinnedReleaseId: '22222222-2222-4222-8222-222222222222',
        participantCharacterIds: ['seyeon'],
      },
      pinnedBundleId: '33333333-3333-4333-8333-333333333333',
      contentVersion: 'internal-v1',
    });

    const idPort = createSeyeonProductionRuntimeIdPortV1(() =>
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    const result = await runSeyeonProductionChatExecutionV1({
      mode: 'WRITE_DARK',
      resolvedSubjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      threadId: '11111111-1111-4111-8111-111111111111',
      receivePlan,
      baseContext: {},
      relationshipReadPort: {
        readCurrent() {
          throw new Error('relationship read must not run for committed replay');
        },
      },
      contextReadPort: {
        readPersonalRecords() {
          throw new Error('context read must not run for committed replay');
        },
        readRelationshipHistory() {
          throw new Error('context read must not run for committed replay');
        },
        readRecentMessages() {
          throw new Error('context read must not run for committed replay');
        },
      },
      productionAuthorityRef: 'test:production-runtime',
      idPort,
      interpreterProvider: provider,
      rendererProvider: provider,
      semanticReviewerProvider: provider,
      persistencePort: {
        receiveTurn() {
          return {
            turnId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            userMessageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            userText: '같은 요청',
            threadCharacterId: 'seyeon',
            contentReleaseId: '22222222-2222-4222-8222-222222222222',
            contentBundleId: '33333333-3333-4333-8333-333333333333',
            turnState: 'committed',
            committedTurn: {
              attemptId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              assistantMessageId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              assistantText: '이미 저장된 세연 답변',
              sequenceNo: 2,
              committedAt: '2026-10-04T00:00:00.000Z',
            },
            replayed: true,
          };
        },
        allocateAttempt() {
          throw new Error('attempt allocation must not run');
        },
        markContextReady() {
          throw new Error('context-ready must not run');
        },
        failAttempt() {
          throw new Error('failure must not run');
        },
        persistGenerated() {
          throw new Error('generation persistence must not run');
        },
        persistValidated() {
          throw new Error('validation persistence must not run');
        },
        commitTurn() {
          throw new Error('commit must not run');
        },
      },
      executionIdPort: idPort,
      postTurn: {
        ledger: new InMemorySeyeonEventLedgerV2(),
        analysisOutboxPort: {
          findByTurn() {
            return [
              {
                outboxEventId: '12121212-1212-4212-8212-121212121212',
                status: 'pending',
                leaseExpiresAt: null,
              },
            ];
          },
          claim() {
            throw new Error('deferred replay must not claim post-turn work');
          },
          checkpoint() {
            throw new Error('deferred replay must not checkpoint post-turn work');
          },
          complete() {
            throw new Error('deferred replay must not complete post-turn work');
          },
        },
        executionMode: 'DEFERRED',
        semanticRelevanceByEventId: {},
      },
    });

    expect(result.disposition).toBe('committed_replay');
    if (result.disposition === 'committed_replay') {
      expect(result.assistantText).toBe('이미 저장된 세연 답변');
      expect(result.committedTurn.postTurnOutboxEventId)
        .toBe('12121212-1212-4212-8212-121212121212');
    }
    expect(providerCalls).toBe(0);
  });

  it('fails closed if the current user message leaked into historical context already', () => {
    expect(() =>
      bindSeyeonProductionCurrentUserTurnV1({
        historicalContext: {
          relationship: null,
          recentMessages: Object.freeze([
            Object.freeze({
              messageId: 'current-user',
              role: 'user' as const,
              text: '중복 현재 메시지',
            }),
          ]),
          retrievedMemories: Object.freeze([]),
        },
        userMessageId: 'current-user',
        userText: '중복 현재 메시지',
      }),
    ).toThrow(SeyeonProductionChatExecutionErrorV1);
  });
});
