import { describe, expect, it } from 'vitest';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from '../apps/api/src/postgres-chat-thread-runtime-binding.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

describe('PostgreSQL Chat thread runtime binding adapter', () => {
  it('binds the owner-authorized thread query and preserves participant order', async () => {
    const calls: { text: string; values?: readonly unknown[] }[] = [];
    const client: PostgresTransactionQueryV1 = {
      async query<Row>(text: string, values?: readonly unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        return {
          rows: [{
            threadId: '11111111-1111-4111-8111-111111111111',
            status: 'active',
            activeContentReleaseId: '22222222-2222-4222-8222-222222222222',
            activeContentBundleId: '33333333-3333-4333-8333-333333333333',
            contentRevision: '7',
            participantCharacterIds: ['baekheon'],
          }] as unknown as Row[],
        };
      },
    };

    const port = createPostgresChatThreadRuntimeBindingAuthorityPortV1(client);
    const rows = await port.readRuntimeBinding({
      subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      threadId: '11111111-1111-4111-8111-111111111111',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('qry_chat_thread_runtime_binding_v1');
    expect(calls[0]?.values).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(rows[0]?.contentRevision).toBe(7);
    expect(rows[0]?.participantCharacterIds).toEqual(['baekheon']);
  });
});
