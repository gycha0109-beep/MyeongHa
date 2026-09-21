import { describe, expect, it, vi } from 'vitest';

import {
  createPostgresReaderContextMemoryGrantsAuthorityPortV1,
  createPostgresReaderContextMemoryItemsAuthorityPortV1,
} from '../apps/api/src/postgres-reader-context-memory.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

describe('Reader Memory PostgreSQL runtime authority adapters', () => {
  it('projects current Memory Items through the owner-scoped query', async () => {
    const queryClient = client([{
      memoryItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      memoryType: 'reader_memory',
      schemaVersion: 'v1',
      contentJsonb: { summary: '직업 선택 고민' },
      createdByCharacterId: 'baekheon',
      createdAt: '2026-09-21T00:01:20.000Z',
    }]);
    const port = createPostgresReaderContextMemoryItemsAuthorityPortV1(queryClient);

    await expect(port.readCurrentItems({
      subjectId: '11111111-1111-4111-8111-111111111111',
    })).resolves.toEqual([expect.objectContaining({
      memoryItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      createdByCharacterId: 'baekheon',
    })]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_memory_items_v1'),
      ['11111111-1111-4111-8111-111111111111'],
    );
  });

  it('projects active Reader grants through the owner-scoped query', async () => {
    const queryClient = client([{
      grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      characterId: 'baekheon',
      grantReason: 'user_explicit',
      grantedAt: '2026-09-21T00:01:25.000Z',
    }]);
    const port = createPostgresReaderContextMemoryGrantsAuthorityPortV1(queryClient);

    await expect(port.readActiveGrants({
      subjectId: '11111111-1111-4111-8111-111111111111',
      memoryItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    })).resolves.toEqual([expect.objectContaining({
      grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      characterId: 'baekheon',
    })]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_memory_active_grants_v1'),
      [
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      ],
    );
  });
});
