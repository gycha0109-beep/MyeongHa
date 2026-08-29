import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  CHAT_THREAD_STREAM_READ_AUTHORITY_BINDING_V1,
  ChatThreadStreamReadAuthorityPortErrorV1,
  getChatThreadStream,
  type ChatThreadStreamAuthorityRowV1,
  type ChatThreadStreamReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '91000000-0000-0000-0000-000000000001';
const THREAD_ID = '91000000-0000-0000-0000-000000000101';
const CHARACTER_ID = 'char-chat-stream-b108';

const VISIBLE_MESSAGE: ChatThreadStreamAuthorityRowV1 = Object.freeze({
  messageId: '91000000-0000-0000-0000-000000000201',
  sequenceNo: 4,
  senderType: 'character',
  characterId: CHARACTER_ID,
  bodyText: 'stored visible answer',
  messagePayloadJsonb: Object.freeze({ emotion: 'neutral' }),
  messageSchemaVersion: 'character-message/v1',
  createdAt: '2026-08-30T01:02:03.000Z',
  redacted: false,
  redactedAt: null,
});

const REDACTED_MESSAGE: ChatThreadStreamAuthorityRowV1 = Object.freeze({
  messageId: '91000000-0000-0000-0000-000000000202',
  sequenceNo: 5,
  senderType: 'system',
  characterId: null,
  bodyText: null,
  messagePayloadJsonb: null,
  messageSchemaVersion: 'system-message/v1',
  createdAt: '2026-08-30T01:02:04.000Z',
  redacted: true,
  redactedAt: '2026-08-30T02:00:00.000Z',
});

class FakeChatThreadStreamReadAuthorityPortV1
  implements ChatThreadStreamReadAuthorityPortV1 {
  readonly calls: Array<{
    subjectId: string;
    threadId: string;
    afterSequenceNo: number;
  }> = [];

  result: readonly ChatThreadStreamAuthorityRowV1[] | Error = Object.freeze([
    VISIBLE_MESSAGE,
    REDACTED_MESSAGE,
  ]);

  readStream(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly afterSequenceNo: number;
  }): readonly ChatThreadStreamAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('chat thread sequence stream API authority boundary', () => {
  it('pins the service boundary to the verified owner-authorized sequence query', () => {
    expect(CHAT_THREAD_STREAM_READ_AUTHORITY_BINDING_V1)
      .toBe('public.qry_chat_thread_stream_v1');
  });

  it('passes only trusted subject, route thread, and explicit sequence cursor to authority', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();

    const result = await getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 3,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{
      subjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 3,
    }]);
    expect(result.threadId).toBe(THREAD_ID);
    expect(result.afterSequenceNo).toBe(3);
    expect(result.messages).toEqual([
      {
        messageId: VISIBLE_MESSAGE.messageId,
        sequenceNo: 4,
        senderType: 'character',
        characterId: CHARACTER_ID,
        bodyText: 'stored visible answer',
        messagePayloadJsonb: { emotion: 'neutral' },
        messageSchemaVersion: 'character-message/v1',
        createdAt: '2026-08-30T01:02:03.000Z',
        redacted: false,
        redactedAt: null,
      },
      {
        messageId: REDACTED_MESSAGE.messageId,
        sequenceNo: 5,
        senderType: 'system',
        characterId: null,
        bodyText: null,
        messagePayloadJsonb: null,
        messageSchemaVersion: 'system-message/v1',
        createdAt: '2026-08-30T01:02:04.000Z',
        redacted: true,
        redactedAt: '2026-08-30T02:00:00.000Z',
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.messages)).toBe(true);
    expect(result.messages.every((message) => Object.isFrozen(message))).toBe(true);
  });

  it('allows an empty authorized stream after the requested cursor', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();
    port.result = Object.freeze([]);

    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 99,
      authorityPort: port,
    })).resolves.toEqual({
      threadId: THREAD_ID,
      afterSequenceNo: 99,
      messages: [],
    });
  });

  it('preserves redaction tombstones while never exposing redacted body or payload', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();
    port.result = Object.freeze([REDACTED_MESSAGE]);

    const result = await getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    });

    expect(result.messages[0]).toMatchObject({
      redacted: true,
      bodyText: null,
      messagePayloadJsonb: null,
      redactedAt: '2026-08-30T02:00:00.000Z',
    });
  });

  it('drops private provenance even if an adapter row accidentally carries extra fields', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...VISIBLE_MESSAGE,
        subjectId: 'must-not-leak',
        turnId: 'must-not-leak',
        attemptId: 'must-not-leak',
        contentHash: 'must-not-leak',
        threadCharacterId: 'must-not-leak',
      } as ChatThreadStreamAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('subjectId');
    expect(serialized).not.toContain('turnId');
    expect(serialized).not.toContain('attemptId');
    expect(serialized).not.toContain('contentHash');
    expect(serialized).not.toContain('threadCharacterId');
    expect(serialized).not.toContain('must-not-leak');
  });

  it('does not invent page size, next-cursor, or deletion workflow state', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();
    const result = await getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 3,
      authorityPort: port,
    });

    expect(result).not.toHaveProperty('pageSize');
    expect(result).not.toHaveProperty('nextCursor');
    expect(result).not.toHaveProperty('hasMore');
    expect(result).not.toHaveProperty('threadStatus');
    expect(result).not.toHaveProperty('deletionJob');
  });

  it('requires trusted resolved subject identity before polling authority', async () => {
    const missingPort = new FakeChatThreadStreamReadAuthorityPortV1();
    await expectApiCode(
      getChatThreadStream({
        threadId: THREAD_ID,
        afterSequenceNo: 0,
        authorityPort: missingPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.calls).toHaveLength(0);

    const blankPort = new FakeChatThreadStreamReadAuthorityPortV1();
    await expectApiCode(
      getChatThreadStream({
        resolvedSubjectId: '   ',
        threadId: THREAD_ID,
        afterSequenceNo: 0,
        authorityPort: blankPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.calls).toHaveLength(0);
  });

  it('rejects invalid route thread selectors before DB authority', async () => {
    for (const threadId of [undefined, null, '', '   ', 123] as const) {
      const port = new FakeChatThreadStreamReadAuthorityPortV1();
      await expectApiCode(
        getChatThreadStream({
          resolvedSubjectId: SUBJECT_ID,
          threadId,
          afterSequenceNo: 0,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.calls).toHaveLength(0);
    }
  });

  it('requires an explicit non-negative safe-integer sequence cursor without inventing a default', async () => {
    for (const afterSequenceNo of [
      undefined,
      null,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      '0',
    ] as const) {
      const port = new FakeChatThreadStreamReadAuthorityPortV1();
      await expectApiCode(
        getChatThreadStream({
          resolvedSubjectId: SUBJECT_ID,
          threadId: THREAD_ID,
          afterSequenceNo,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.calls).toHaveLength(0);
    }
  });

  it('maps unknown/cross-owner/deleted thread and ineligible subject authority failures to NOT_FOUND', async () => {
    for (const code of ['THREAD_UNAVAILABLE', 'SUBJECT_INELIGIBLE'] as const) {
      const port = new FakeChatThreadStreamReadAuthorityPortV1();
      port.result = new ChatThreadStreamReadAuthorityPortErrorV1(code, 'hidden authority reason');

      const error = await expectApiCode(
        getChatThreadStream({
          resolvedSubjectId: SUBJECT_ID,
          threadId: THREAD_ID,
          afterSequenceNo: 0,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
      expect(error.message).toBe('Chat thread is unavailable for the current subject.');
    }
  });

  it('maps authority cursor/input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeChatThreadStreamReadAuthorityPortV1();
    invalidPort.result = new ChatThreadStreamReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'chat stream cursor must be a non-negative sequence number',
    );

    await expectApiCode(
      getChatThreadStream({
        resolvedSubjectId: SUBJECT_ID,
        threadId: THREAD_ID,
        afterSequenceNo: 0,
        authorityPort: invalidPort,
      }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeChatThreadStreamReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;

    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed when authority returns content for a redacted tombstone', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...REDACTED_MESSAGE, bodyText: 'secret should be masked' }),
    ]);

    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    })).rejects.toThrow('exposed content for a redacted tombstone');

    port.result = Object.freeze([
      Object.freeze({ ...REDACTED_MESSAGE, messagePayloadJsonb: { secret: true } }),
    ]);

    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    })).rejects.toThrow('exposed content for a redacted tombstone');
  });

  it('fails closed on inconsistent redaction metadata', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...REDACTED_MESSAGE, redactedAt: null }),
    ]);
    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    })).rejects.toThrow('without redactedAt');

    port.result = Object.freeze([
      Object.freeze({ ...VISIBLE_MESSAGE, redactedAt: '2026-08-30T02:00:00.000Z' }),
    ]);
    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    })).rejects.toThrow('redactedAt for visible content');
  });

  it('fails closed on out-of-cursor, non-increasing, or duplicate message identities', async () => {
    const port = new FakeChatThreadStreamReadAuthorityPortV1();

    port.result = Object.freeze([
      Object.freeze({ ...VISIBLE_MESSAGE, sequenceNo: 3 }),
    ]);
    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 3,
      authorityPort: port,
    })).rejects.toThrow('outside the requested cursor');

    port.result = Object.freeze([
      VISIBLE_MESSAGE,
      Object.freeze({ ...REDACTED_MESSAGE, sequenceNo: 4 }),
    ]);
    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    })).rejects.toThrow('non-increasing sequence stream');

    port.result = Object.freeze([
      VISIBLE_MESSAGE,
      Object.freeze({ ...REDACTED_MESSAGE, messageId: VISIBLE_MESSAGE.messageId }),
    ]);
    await expect(getChatThreadStream({
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      afterSequenceNo: 0,
      authorityPort: port,
    })).rejects.toThrow('duplicate message identity');
  });
});
