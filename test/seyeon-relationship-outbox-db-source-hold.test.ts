import { describe, expect, it } from 'vitest';
import {
  createPostgresSeyeonProductionRelationshipSyncOutboxPortV1,
  SeyeonRelationshipOutboxCurrentSourceHoldV1,
} from '../apps/api/src/postgres-seyeon-production-relationship-outbox-v1.js';

describe('G3 relationship Outbox current-source authority', () => {
  it('refuses producer enqueue and consumer claim before any database query', async () => {
    let dbQueries = 0;
    const port = createPostgresSeyeonProductionRelationshipSyncOutboxPortV1({
      async query() {
        dbQueries++;
        throw new Error('untrusted relationship material must not reach DB');
      },
    });
    await expect(port.enqueue({
      subjectId: 'subject',
      outboxEventId: 'outbox',
      turnId: 'turn',
      productionEvent: {} as never,
    })).rejects.toBeInstanceOf(SeyeonRelationshipOutboxCurrentSourceHoldV1);
    await expect(port.claim({
      subjectId: 'subject',
      outboxEventId: 'outbox',
      lockOwner: 'worker',
      leaseExpiresAt: '2026-10-30T16:00:00Z',
    })).rejects.toBeInstanceOf(SeyeonRelationshipOutboxCurrentSourceHoldV1);
    expect(dbQueries).toBe(0);
  });
});
