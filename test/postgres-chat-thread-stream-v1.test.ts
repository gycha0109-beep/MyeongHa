import { describe, expect, it } from 'vitest';

import {
  createPostgresChatThreadStreamReadAuthorityPortV1,
} from '../apps/api/src/postgres-chat-thread-stream-v1.js';
import type {
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

describe('PostgreSQL Chat thread stream evidence adapter V1', () => {
  it('binds the governed stream query and maps rows without adding content authority', async () => {
    const calls: Array<{
      text: string;
      values: readonly unknown[] | undefined;
    }> = [];
    const client: PostgresTransactionQueryV1 = {
      async query<Row>(text: string, values?: readonly unknown[]) {
        calls.push({ text, values });
        return {
          rows: [{
            messageId: 'message-1',
            sequenceNo: '1',
            senderType: 'character',
            characterId: 'seyeon',
            bodyText: 'hello',
            messagePayloadJsonb: { emotion: 'neutral' },
            messageSchemaVersion: 'character-message/v1',
            createdAt: '2026-10-04T00:00:00.000Z',
            redacted: false,
            redactedAt: null,
          } as Row],
        };
      },
    };

    const port =
      createPostgresChatThreadStreamReadAuthorityPortV1(client);
    const rows = await port.readStream({
      subjectId: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      afterSequenceNo: 0,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain(
      'public.qry_chat_thread_stream_v1',
    );
    expect(calls[0]?.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      0,
    ]);
    expect(rows).toEqual([{
      messageId: 'message-1',
      sequenceNo: 1,
      senderType: 'character',
      characterId: 'seyeon',
      bodyText: 'hello',
      messagePayloadJsonb: { emotion: 'neutral' },
      messageSchemaVersion: 'character-message/v1',
      createdAt: '2026-10-04T00:00:00.000Z',
      redacted: false,
      redactedAt: null,
    }]);
  });

  it('maps governed invalid cursor constraints to INVALID_INPUT', async () => {
    const client: PostgresTransactionQueryV1 = {
      async query() {
        throw Object.assign(new Error('bad cursor'), {
          constraint: 'qry_chat_thread_stream_cursor_valid',
        });
      },
    };
    const port =
      createPostgresChatThreadStreamReadAuthorityPortV1(client);

    await expect(
      port.readStream({
        subjectId: 'subject',
        threadId: 'thread',
        afterSequenceNo: -1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
