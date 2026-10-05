import { describe, expect, it, vi } from 'vitest';

import {
  createPostgresSeyeonProductionContextReadAuthorityPortV1,
} from '../apps/api/src/postgres-seyeon-production-context-read-v1.js';
import type {
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

describe('Se-yeon Production context PostgreSQL read adapter', () => {
  it('reads explicitly granted current personal records through the PHASE P query', async () => {
    const queryClient = client([{
      recordKind: 'memory',
      recordId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      recordType: 'legacy_memory',
      schemaVersion: 'v1',
      payload: { summary: 'stored' },
      grantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      grantReason: 'user_explicit',
      grantedAt: '2026-10-03T00:00:00.000Z',
    }]);
    const port =
      createPostgresSeyeonProductionContextReadAuthorityPortV1(queryClient);

    await expect(port.readPersonalRecords({
      subjectId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
    })).resolves.toEqual([
      expect.objectContaining({
        recordKind: 'memory',
        recordType: 'legacy_memory',
      }),
    ]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'qry_seyeon_production_personal_record_context_v1',
      ),
      ['11111111-1111-4111-8111-111111111111', 'seyeon'],
    );
  });

  it('reads serialized PHASE N history at the exact pinned revision', async () => {
    const history = [{
      action: 'record',
      ledgerEntryId: 'ledger:1',
      dedupeKey: 'history:1',
      recordedAt: '2026-10-03T00:00:00.000Z',
      event: {},
    }];
    const queryClient = client([{ historyRecordsJsonb: history }]);
    const port =
      createPostgresSeyeonProductionContextReadAuthorityPortV1(queryClient);

    await expect(port.readRelationshipHistory({
      subjectId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      throughRevision: 1,
    })).resolves.toEqual(history);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'qry_production_relationship_history_runtime_v1',
      ),
      ['11111111-1111-4111-8111-111111111111', 'seyeon', 1],
    );
  });

  it('reuses the redaction-aware recent-message projection', async () => {
    const queryClient = client([{
      messageId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      sequenceNo: '4',
      senderType: 'character',
      characterId: 'seyeon',
      text: '다시 이어가 볼까요?',
      createdAt: '2026-10-03T00:01:00.000Z',
    }]);
    const port =
      createPostgresSeyeonProductionContextReadAuthorityPortV1(queryClient);

    await expect(port.readRecentMessages({
      subjectId: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      limit: 12,
    })).resolves.toEqual([
      expect.objectContaining({
        sequenceNo: 4,
        characterId: 'seyeon',
      }),
    ]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_reader_context_recent_messages_v1'),
      [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        12,
      ],
    );
  });
});
