import { describe, expect, it } from 'vitest';
import {
  createPostgresSeyeonPostTurnOffWithoutTextPortV1,
} from '../apps/api/src/postgres-seyeon-post-turn-off-no-text-v1.js';

describe('Post-turn no-text OFF cleanup receipt', () => {
  it('accepts only its own processed DB receipt and does not select private text', async () => {
    let capturedSql = '';
    const port = createPostgresSeyeonPostTurnOffWithoutTextPortV1({
      async query<Row>(sql: string) {
        capturedSql = sql;
        return { rows: [{
          outboxEventId:'outbox',status:'processed',
          processedAt:'2026-10-30T00:00:00Z',reclaimed:false,
        }] as Row[] };
      },
    });
    await expect(port.completeOff({
      subjectId:'subject',outboxEventId:'outbox',lockOwner:'worker',
      leaseExpiresAt:'2026-10-30T00:01:00Z',
    })).resolves.toMatchObject({outboxEventId:'outbox',reclaimed:false});
    expect(capturedSql).not.toMatch(/body_text|assistant_text|user_text/i);
    expect(capturedSql).toContain('cmd_seyeon_post_turn_complete_off_without_text_v1');
  });
});
