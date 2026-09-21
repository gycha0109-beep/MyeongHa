import { describe, expect, it, vi } from 'vitest';

import {
  ReaderContextNonMemoryReadAuthorityPortErrorV1,
} from '../apps/api/src/reader-context-non-memory-read.js';
import {
  createPostgresReaderContextNonMemoryReadAuthorityPortV1,
} from '../apps/api/src/postgres-reader-context-non-memory.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

describe('Reader non-Memory PostgreSQL runtime authority adapter', () => {
  it('projects only server-returned Reader-granted Life Facts', async () => {
    const queryClient = client([{
      factId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      factType: 'occupation',
      schemaVersion: 'life-fact-v1',
      value: { value: 'designer' },
      grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      granteeCharacterId: 'baekheon',
    }]);
    const port = createPostgresReaderContextNonMemoryReadAuthorityPortV1(queryClient);

    await expect(port.readGrantedLifeFacts({
      subjectId: '11111111-1111-4111-8111-111111111111',
      characterId: 'baekheon',
    })).resolves.toEqual([{
      factId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      factType: 'occupation',
      schemaVersion: 'life-fact-v1',
      value: { value: 'designer' },
      grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      granteeCharacterId: 'baekheon',
    }]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_reader_context_granted_life_facts_v1'),
      ['11111111-1111-4111-8111-111111111111', 'baekheon'],
    );
  });

  it('keeps relationship event history raw and passes the server-owned window', async () => {
    const queryClient = client([{
      eventType: 'RETURN_VISIT',
      eventSchemaVersion: 'relationship-event-v1',
      stateRevisionAfter: '7',
      policyVersion: 'relationship-policy-v1',
      appliedAt: '2026-09-22T00:00:00.000Z',
    }]);
    const port = createPostgresReaderContextNonMemoryReadAuthorityPortV1(queryClient);

    await expect(port.readRelationshipEvents({
      subjectId: '11111111-1111-4111-8111-111111111111',
      characterId: 'baekheon',
      beforeRevision: 9,
      limit: 3,
    })).resolves.toEqual([{
      eventType: 'RETURN_VISIT',
      eventSchemaVersion: 'relationship-event-v1',
      stateRevisionAfter: 7,
      policyVersion: 'relationship-policy-v1',
      appliedAt: '2026-09-22T00:00:00.000Z',
    }]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_reader_context_relationship_events_v1'),
      ['11111111-1111-4111-8111-111111111111', 'baekheon', 9, 3],
    );
  });

  it('preserves recent message provenance returned by the owner-scoped query', async () => {
    const queryClient = client([{
      messageId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      sequenceNo: '12',
      senderType: 'character',
      characterId: 'baekheon',
      text: '다시 오셨군요.',
      createdAt: '2026-09-22T00:01:00.000Z',
    }]);
    const port = createPostgresReaderContextNonMemoryReadAuthorityPortV1(queryClient);

    await expect(port.readRecentMessages({
      subjectId: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      limit: 4,
    })).resolves.toEqual([{
      messageId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      sequenceNo: 12,
      senderType: 'character',
      characterId: 'baekheon',
      text: '다시 오셨군요.',
      createdAt: '2026-09-22T00:01:00.000Z',
    }]);
  });

  it('maps an unavailable owned thread without weakening the authority boundary', async () => {
    const error = Object.assign(new Error('thread unavailable'), {
      constraint: 'qry_reader_context_recent_messages_thread_unavailable',
    });
    const queryClient = {
      query: vi.fn(async () => {
        throw error;
      }),
    } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresReaderContextNonMemoryReadAuthorityPortV1(queryClient);

    await expect(port.readRecentMessages({
      subjectId: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      limit: 4,
    })).rejects.toMatchObject({
      name: 'ReaderContextNonMemoryReadAuthorityPortErrorV1',
      code: 'THREAD_UNAVAILABLE',
    } satisfies Partial<ReaderContextNonMemoryReadAuthorityPortErrorV1>);
  });
});
