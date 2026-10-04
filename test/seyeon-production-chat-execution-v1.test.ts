import { describe, expect, it } from 'vitest';

import {
  SeyeonProductionChatExecutionErrorV1,
  assertSeyeonProductionAttemptOwnershipV1,
  bindSeyeonProductionCurrentUserTurnV1,
  resolveSeyeonProductionCommittedReplayV1,
} from '../apps/api/src/seyeon-production-chat-execution-v1.js';

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
