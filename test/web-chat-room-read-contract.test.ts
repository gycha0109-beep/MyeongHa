import { describe, expect, it } from 'vitest';

import {
  parseChatRoomReadPayloadV1,
  parseChatThreadIdV1,
} from '../apps/web/chat-room-read-contract.js';

const THREAD_ID = '93000000-0000-4000-8000-000000000001';

function payload() {
  return {
    threadId: THREAD_ID,
    characterId: 'canonical-primary',
    contentReleaseId: 'internal-release-not-projected',
    contentBundleId: 'internal-bundle-not-projected',
    contentRevision: 7,
    afterSequenceNo: 0,
    lastSequenceNo: 2,
    messages: [
      {
        messageId: '96000000-0000-4000-8000-000000000001',
        sequenceNo: 1,
        senderType: 'user',
        characterId: null,
        bodyText: 'hello',
        messagePayloadJsonb: { client: 'opaque' },
        messageSchemaVersion: null,
        createdAt: '2026-09-05T15:00:00.000Z',
        redacted: false,
        redactedAt: null,
      },
      {
        messageId: '96000000-0000-4000-8000-000000000002',
        sequenceNo: 2,
        senderType: 'character',
        characterId: 'canonical-primary',
        bodyText: 'source-backed answer',
        messagePayloadJsonb: {},
        messageSchemaVersion: 'dialogue-v1',
        createdAt: '2026-09-05T15:01:00.000Z',
        redacted: false,
        redactedAt: null,
      },
    ],
    relationship: { trust: 20 },
  };
}

describe('browser Chat room read contract', () => {
  it('accepts the authoritative thread stream and projects only render-safe fields', () => {
    const result = parseChatRoomReadPayloadV1(payload(), {
      expectedThreadId: THREAD_ID,
      expectedAfterSequenceNo: 0,
    });

    expect(result).toEqual({
      threadId: THREAD_ID,
      characterId: 'canonical-primary',
      afterSequenceNo: 0,
      lastSequenceNo: 2,
      messages: [
        {
          messageId: '96000000-0000-4000-8000-000000000001',
          sequenceNo: 1,
          senderType: 'user',
          characterId: null,
          bodyText: 'hello',
          createdAt: '2026-09-05T15:00:00.000Z',
          redacted: false,
          redactedAt: null,
        },
        {
          messageId: '96000000-0000-4000-8000-000000000002',
          sequenceNo: 2,
          senderType: 'character',
          characterId: 'canonical-primary',
          bodyText: 'source-backed answer',
          createdAt: '2026-09-05T15:01:00.000Z',
          redacted: false,
          redactedAt: null,
        },
      ],
    });
    expect(result).not.toHaveProperty('contentReleaseId');
    expect(result).not.toHaveProperty('contentBundleId');
    expect(result).not.toHaveProperty('relationship');
    expect(result.messages[0]).not.toHaveProperty('messagePayloadJsonb');
  });

  it('rejects a response for a different thread or cursor', () => {
    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), threadId: '93000000-0000-4000-8000-000000000002' },
      { expectedThreadId: THREAD_ID },
    )).toThrow('threadId does not match');

    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), afterSequenceNo: 4 },
      { expectedThreadId: THREAD_ID },
    )).toThrow('afterSequenceNo does not match');
  });

  it('rejects non-increasing streams and inconsistent lastSequenceNo', () => {
    const duplicateSequence = payload();
    duplicateSequence.messages[1]!.sequenceNo = 1;
    expect(() => parseChatRoomReadPayloadV1(duplicateSequence, {
      expectedThreadId: THREAD_ID,
    })).toThrow('not strictly increasing');

    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), lastSequenceNo: 99 },
      { expectedThreadId: THREAD_ID },
    )).toThrow('lastSequenceNo does not match');
  });

  it('rejects redacted content leaks at the browser trust boundary', () => {
    const base = payload();
    const leaked = {
      ...base,
      messages: [
        base.messages[0]!,
        {
          ...base.messages[1]!,
          bodyText: 'must not render',
          messagePayloadJsonb: null,
          redacted: true,
          redactedAt: '2026-09-05T15:02:00.000Z',
        },
      ],
    };

    expect(() => parseChatRoomReadPayloadV1(leaked, {
      expectedThreadId: THREAD_ID,
    })).toThrow('redacted message exposed content');
  });

  it('accepts only UUID thread route identities', () => {
    expect(parseChatThreadIdV1(THREAD_ID)).toBe(THREAD_ID);
    expect(parseChatThreadIdV1('not-a-thread')).toBeNull();
    expect(parseChatThreadIdV1('')).toBeNull();
    expect(parseChatThreadIdV1(null)).toBeNull();
  });
});
