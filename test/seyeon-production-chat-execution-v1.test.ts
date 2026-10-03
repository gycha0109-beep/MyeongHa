import { describe, expect, it } from 'vitest';

import {
  SeyeonProductionChatExecutionErrorV1,
  bindSeyeonProductionCurrentUserTurnV1,
} from '../apps/api/src/seyeon-production-chat-execution-v1.js';

describe('Se-yeon Production Chat execution V1', () => {
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
