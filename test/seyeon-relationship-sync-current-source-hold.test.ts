import { describe, expect, it } from 'vitest';
import {
  createProductionSeyeonRelationshipWorkerRuntimeV1,
  SeyeonRelationshipSyncSourceAuthorityHoldV1,
} from '../apps/api/src/production-seyeon-relationship-worker-runtime-v1.js';

describe('Production relationship sync source authority', () => {
  it('rejects queued legacy relationship Events before any Subject DB or Outbox access', async () => {
    let connections = 0;
    const runtime = createProductionSeyeonRelationshipWorkerRuntimeV1({
      databaseConfig: {} as never,
      pool: {
        connect() {
          connections++;
          throw new Error('Production DB must not be entered');
        },
      },
    });
    await expect(runtime.run({
      verifiedEvidence: {} as never,
      outboxEventId: 'legacy-outbox',
      lockOwner: 'worker',
      leaseExpiresAt: '2026-10-30T15:00:00Z',
    })).rejects.toBeInstanceOf(SeyeonRelationshipSyncSourceAuthorityHoldV1);
    expect(connections).toBe(0);
    await runtime.close();
  });
});
