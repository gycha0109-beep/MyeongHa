// Watchtower-Track: character-memory
import { describe, expect, it } from 'vitest';
import { assertSeyeonFirstPositiveReceiptOutboxBoundV1 } from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
import type { RunProductionSeyeonChatResultV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';

const OUTBOX = 'a0000000-0000-4000-8000-000000000001';
const FOREIGN = 'a0000000-0000-4000-8000-000000000002';

function execution(status: 'deferred' | 'processed', outboxId = OUTBOX): RunProductionSeyeonChatResultV1['execution'] {
  return {
    disposition: 'executed',
    committedTurn: { postTurnOutboxEventId: OUTBOX },
    postTurnAnalysis: status === 'deferred'
      ? { status: 'deferred', outboxEventId: outboxId }
      : { status: 'processed', result: { outboxEventId: outboxId } },
  } as RunProductionSeyeonChatResultV1['execution'];
}

describe('S0 positive Memory first Fetch receipt requires original committed outbox', () => {
  it.each(['deferred', 'processed'] as const)('accepts exact %s outbox lineage', status => {
    expect(() => assertSeyeonFirstPositiveReceiptOutboxBoundV1(execution(status))).not.toThrow();
  });

  it.each(['deferred', 'processed'] as const)('denies foreign %s outbox lineage', status => {
    expect(() => assertSeyeonFirstPositiveReceiptOutboxBoundV1(execution(status, FOREIGN))).toThrow();
  });

  it('denies missing post-turn result', () => {
    const value = execution('deferred') as unknown as Record<string, unknown>;
    delete value.postTurnAnalysis;
    expect(() => assertSeyeonFirstPositiveReceiptOutboxBoundV1(
      value as unknown as RunProductionSeyeonChatResultV1['execution'],
    )).toThrow();
  });

  it('denies missing committed outbox identity', () => {
    const value = execution('deferred') as unknown as { committedTurn: { postTurnOutboxEventId?: string } };
    delete value.committedTurn.postTurnOutboxEventId;
    expect(() => assertSeyeonFirstPositiveReceiptOutboxBoundV1(
      value as unknown as RunProductionSeyeonChatResultV1['execution'],
    )).toThrow();
  });

  it('denies malformed and zero-value committed outbox identity', () => {
    for (const candidate of ['', 'not-a-uuid', '00000000-0000-0000-0000-000000000000']) {
      const value = execution('deferred') as unknown as { committedTurn: { postTurnOutboxEventId: string } };
      value.committedTurn.postTurnOutboxEventId = candidate;
      expect(() => assertSeyeonFirstPositiveReceiptOutboxBoundV1(
        value as unknown as RunProductionSeyeonChatResultV1['execution'],
      )).toThrow();
    }
  });
});
