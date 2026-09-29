import { describe, expect, it } from 'vitest';

import { createMobileChatMessageViewV1 } from '../apps/mobile/src/features/chat/chat-view-model.js';

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
});
