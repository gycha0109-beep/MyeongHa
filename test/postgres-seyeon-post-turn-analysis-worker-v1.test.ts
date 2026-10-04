import { describe, expect, it, vi } from 'vitest';

import {
  createPostgresSeyeonPostTurnAnalysisOutboxPortV1,
} from '../apps/api/src/postgres-seyeon-post-turn-analysis-worker-v1.js';
import type {
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

describe('Se-yeon post-turn PostgreSQL adapter V1', () => {
  it('maps the dedicated post-turn claim material', async () => {
    const queryClient = client([{
      outboxEventId: '11111111-1111-4111-8111-111111111111',
      turnId: '22222222-2222-4222-8222-222222222222',
      attemptId: '33333333-3333-4333-8333-333333333333',
      userMessageId: '44444444-4444-4444-8444-444444444444',
      userText: '도와드릴게요.',
      assistantMessageId: '55555555-5555-4555-8555-555555555555',
      assistantText: '이번에는 도움받을게요.',
      committedAt: '2026-10-04T02:00:00.000Z',
      snapshotJsonb: {
        schemaVersion: 'seyeon-post-turn-analysis-snapshot-v1',
      },
      snapshotHash: 'sha256:v1:snapshot',
      status: 'processing',
      lockOwner: 'worker-1',
      leaseExpiresAt: '2026-10-04T02:10:00.000Z',
      reclaimed: false,
    }]);
    const port = createPostgresSeyeonPostTurnAnalysisOutboxPortV1(
      queryClient,
    );

    await expect(port.claim({
      subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      outboxEventId: '11111111-1111-4111-8111-111111111111',
      lockOwner: 'worker-1',
      leaseExpiresAt: '2026-10-04T02:10:00.000Z',
    })).resolves.toEqual([
      expect.objectContaining({
        turnId: '22222222-2222-4222-8222-222222222222',
        userText: '도와드릴게요.',
        assistantText: '이번에는 도움받을게요.',
        snapshotHash: 'sha256:v1:snapshot',
        reclaimed: false,
      }),
    ]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_claim_seyeon_post_turn_analysis_v1'),
      [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111',
        'worker-1',
        '2026-10-04T02:10:00.000Z',
      ],
    );
  });

  it('maps successful completion replay material', async () => {
    const queryClient = client([{
      outboxEventId: '11111111-1111-4111-8111-111111111111',
      status: 'processed',
      processedAt: '2026-10-04T02:00:05.000Z',
      replayed: true,
    }]);
    const port = createPostgresSeyeonPostTurnAnalysisOutboxPortV1(
      queryClient,
    );

    await expect(port.complete({
      subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      outboxEventId: '11111111-1111-4111-8111-111111111111',
      lockOwner: 'worker-1',
    })).resolves.toEqual([
      {
        outboxEventId: '11111111-1111-4111-8111-111111111111',
        status: 'processed',
        processedAt: '2026-10-04T02:00:05.000Z',
        replayed: true,
      },
    ]);
  });
});
