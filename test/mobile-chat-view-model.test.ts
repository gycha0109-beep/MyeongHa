import { describe, expect, it } from 'vitest';

import { createMobileChatMessageViewV1, groupMobileChatMessagesV1 } from '../apps/mobile/src/features/chat/chat-view-model.js';
import type { ChatMessageV1 } from '../packages/api-client/src/chat.js';

describe('mobile Chat message view model', () => {
  it('never exposes redacted body text', () => {
    const view = createMobileChatMessageViewV1({
      messageId: 'message-1',
      sequenceNo: 1,
      senderType: 'character',
      characterId: 'baekheon',
      bodyText: 'secret body that must stay hidden',
      messagePayloadJsonb: { also: 'hidden' },
      messageSchemaVersion: 'v1',
      createdAt: '2026-09-29T00:00:00.000Z',
      redacted: true,
      redactedAt: '2026-09-29T01:00:00.000Z',
    });

    expect(view.body).toBe('가려진 메시지');
    expect(JSON.stringify(view)).not.toContain('secret body');
    expect(JSON.stringify(view)).not.toContain('also');
  });

  it('uses neutral labels instead of inferring Character names', () => {
    const character = createMobileChatMessageViewV1({
      messageId: 'message-2',
      sequenceNo: 2,
      senderType: 'character',
      characterId: 'baekheon',
      bodyText: 'hello',
      messagePayloadJsonb: null,
      messageSchemaVersion: null,
      createdAt: '2026-09-29T00:00:00.000Z',
      redacted: false,
      redactedAt: null,
    });
    expect(character.label).toBe('대화 상대');
    expect(JSON.stringify(character)).not.toContain('baekheon');
  });
  function makeMessage(
    sequenceNo: number,
    senderType: ChatMessageV1['senderType'],
    createdAt: string,
    extra: Partial<ChatMessageV1> = {},
  ): ChatMessageV1 {
    return {
      messageId: 'message-' + sequenceNo,
      sequenceNo,
      senderType,
      characterId: senderType === 'character' ? 'seyeon' : null,
      bodyText: 'line ' + sequenceNo,
      messagePayloadJsonb: null,
      messageSchemaVersion: null,
      createdAt,
      redacted: false,
      redactedAt: null,
      ...extra,
    };
  }

  it('uses the server-verified room name, but stays neutral without one', () => {
    const character = makeMessage(1, 'character', '2026-10-16T10:00:00.000Z');
    expect(createMobileChatMessageViewV1(character).label).toBe('대화 상대');
    expect(createMobileChatMessageViewV1(character, '세연').label).toBe('세연');
    expect(createMobileChatMessageViewV1(makeMessage(2, 'user', '2026-10-16T10:00:01.000Z'), '세연').label).toBe('나');
  });

  it('groups consecutive same-sender messages at exactly 3 minutes, with one final clock label', () => {
    const grouped = groupMobileChatMessagesV1([
      makeMessage(1, 'character', '2026-10-16T10:00:00.000Z'),
      makeMessage(2, 'character', '2026-10-16T10:03:00.000Z'),
      makeMessage(3, 'character', '2026-10-16T10:06:00.000Z'),
      makeMessage(4, 'character', '2026-10-16T10:09:00.001Z'),
    ], '세연');
    expect(grouped.map(x => x.messages.map(m => m.sequenceNo))).toEqual([[1, 2, 3], [4]]);
    expect(grouped[0]?.label).toBe('세연');
    expect(grouped[0]?.timeLabel).toBe(grouped[0]?.messages[2]?.timeLabel);
    expect(grouped[1]?.timeLabel).toBe(grouped[1]?.messages[0]?.timeLabel);
    expect(Object.isFrozen(grouped)).toBe(true);
    expect(Object.isFrozen(grouped[0]?.messages)).toBe(true);
  });

  it('breaks groups on sender changes, system messages, redactions, clock reversal and identity changes', () => {
    const messages = [
      makeMessage(1, 'character', '2026-10-16T10:00:00.000Z'),
      makeMessage(2, 'user', '2026-10-16T10:00:00.000Z'),
      makeMessage(3, 'user', '2026-10-16T10:00:30.000Z'),
      makeMessage(4, 'system', '2026-10-16T10:00:40.000Z'),
      makeMessage(5, 'character', '2026-10-16T10:01:00.000Z', { redacted: true, bodyText: 'secret' }),
      makeMessage(6, 'character', '2026-10-16T10:01:01.000Z'),
      makeMessage(7, 'character', '2026-10-16T10:01:02.000Z', { characterId: 'yeoul' }),
      makeMessage(8, 'character', '2026-10-16T10:01:00.000Z', { characterId: 'yeoul' }),
    ];
    const grouped = groupMobileChatMessagesV1(messages, '세연');
    expect(grouped.map(x => x.messages.map(m => m.sequenceNo))).toEqual([
      [1], [2, 3], [4], [5], [6], [7], [8],
    ]);
    expect(grouped[3]?.messages[0]?.body).toBe('가려진 메시지');
    expect(JSON.stringify(grouped)).not.toContain('secret');
  });

});
