import { describe, expect, it } from 'vitest';

import {
  SEYEON_INTERNAL_DOGFOOD_HARNESS_BINDINGS_V1,
  runSeyeonInternalDogfoodTurnV1,
} from '../apps/api/src/seyeon-internal-dogfood-harness-v1.js';
import type {
  ProductionSeyeonChatRuntimeV1,
} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import type {
  ProductionSeyeonPostTurnWorkerRuntimeV1,
} from '../apps/api/src/production-seyeon-post-turn-worker-runtime-v1.js';
import type {
  ProductionSeyeonRelationshipWorkerRuntimeV1,
} from '../apps/api/src/production-seyeon-relationship-worker-runtime-v1.js';

const EVIDENCE = Object.freeze({
  kind: 'member' as const,
  verifiedAuthUserId: '91000000-0000-0000-0000-000000000001',
});

const TURN = Object.freeze({
  verifiedEvidence: EVIDENCE,
  threadId: '11111111-1111-4111-8111-111111111111',
  clientTurnId: 'dogfood-turn-1',
  text: '오늘은 조금 복잡했어요.',
  postTurnLease: Object.freeze({
    lockOwner: 'dogfood-post-turn',
    leaseExpiresAt: '2026-10-04T06:00:00.000Z',
  }),
  relationshipLease: Object.freeze({
    lockOwner: 'dogfood-relationship',
    leaseExpiresAt: '2026-10-04T06:00:00.000Z',
  }),
});

function fakeChatRuntime(
  execution: unknown,
  calls: string[],
): ProductionSeyeonChatRuntimeV1 {
  return {
    async run() {
      calls.push('chat');
      return {
        runtimeVersion: 'production-seyeon-chat-runtime-v1',
        subjectId: '92000000-0000-0000-0000-000000000001',
        threadBinding: {},
        bundleManifest: {},
        execution,
      } as unknown as Awaited<
        ReturnType<ProductionSeyeonChatRuntimeV1['run']>
      >;
    },
    async close() {},
  };
}

function fakePostTurnRuntime(
  result: unknown,
  calls: string[],
  subjectId = '92000000-0000-0000-0000-000000000001',
): ProductionSeyeonPostTurnWorkerRuntimeV1 {
  return {
    async run(input) {
      calls.push('post:' + input.outboxEventId);
      return {
        runtimeVersion: 'production-seyeon-post-turn-worker-runtime-v1',
        subjectId,
        result,
      } as unknown as Awaited<
        ReturnType<ProductionSeyeonPostTurnWorkerRuntimeV1['run']>
      >;
    },
    async close() {},
  };
}

function fakeRelationshipRuntime(
  calls: string[],
  subjectId = '92000000-0000-0000-0000-000000000001',
): ProductionSeyeonRelationshipWorkerRuntimeV1 {
  return {
    async run(input) {
      calls.push('relationship:' + input.outboxEventId);
      return {
        runtimeVersion: 'production-seyeon-relationship-worker-runtime-v1',
        subjectId,
        result: {
          version: 'seyeon-production-relationship-sync-outbox-v1',
          outboxEventId: input.outboxEventId,
          reclaimed: false,
          applyResult: {
            applyVersion: 'production-relationship-event-apply-v1',
            stateId: 'state-1',
            historyEntryId: 'history-1',
            eventId: 'event-1',
            applied: true,
            replayed: false,
            revisionBefore: 2,
            revisionAfter: 3,
            relationship: {},
          },
          processedAt: '2026-10-04T05:00:00.000Z',
          completionReplayed: false,
        },
      } as unknown as Awaited<
        ReturnType<ProductionSeyeonRelationshipWorkerRuntimeV1['run']>
      >;
    },
    async close() {},
  };
}

describe('Se-yeon internal dogfood harness V1', () => {
  it('remains internal and does not create browser/public authority', () => {
    expect(SEYEON_INTERNAL_DOGFOOD_HARNESS_BINDINGS_V1).toEqual({
      publicRoute: null,
      routeMounted: false,
      browserAuthority: false,
      existingSingleCharacterThreadRequired: true,
      chatRelationshipMode: 'WRITE_DARK',
      chatPostTurnExecution: 'DEFERRED',
      downstreamExecution: 'OPERATOR_DRIVEN',
    });
  });

  it('drains deferred post-turn and relationship work in explicit order', async () => {
    const calls: string[] = [];
    const result = await runSeyeonInternalDogfoodTurnV1({
      runtimes: {
        chat: fakeChatRuntime({
          disposition: 'executed',
          postTurnAnalysis: {
            status: 'deferred',
            outboxEventId: 'post-turn-1',
          },
        }, calls),
        postTurn: fakePostTurnRuntime({
          decision: 'enqueued',
          outboxEventId: 'post-turn-1',
          reclaimed: false,
          productionEventId: 'production-event-1',
          relationshipSyncOutboxEventId: 'relationship-sync-1',
          relationshipSyncReplayed: false,
          processedAt: '2026-10-04T05:00:00.000Z',
        }, calls),
        relationship: fakeRelationshipRuntime(calls),
      },
      turn: TURN,
    });

    expect(calls).toEqual([
      'chat',
      'post:post-turn-1',
      'relationship:relationship-sync-1',
    ]);
    expect(result.disposition).toBe('executed');
    expect(result.relationshipRevision).toEqual({
      revisionBefore: 2,
      revisionAfter: 3,
      applied: true,
      replayed: false,
    });
  });

  it('does not invent relationship work when post-turn authority rejects it', async () => {
    const calls: string[] = [];
    const result = await runSeyeonInternalDogfoodTurnV1({
      runtimes: {
        chat: fakeChatRuntime({
          disposition: 'executed',
          postTurnAnalysis: {
            status: 'deferred',
            outboxEventId: 'post-turn-rejected',
          },
        }, calls),
        postTurn: fakePostTurnRuntime({
          decision: 'rejected',
          outboxEventId: 'post-turn-rejected',
          reclaimed: false,
          processedAt: '2026-10-04T05:00:00.000Z',
        }, calls),
        relationship: fakeRelationshipRuntime(calls),
      },
      turn: TURN,
    });

    expect(calls).toEqual(['chat', 'post:post-turn-rejected']);
    expect(result.relationship).toBeNull();
    expect(result.relationshipRevision).toBeNull();
  });

  it('never re-runs downstream workers for committed Chat replay', async () => {
    const calls: string[] = [];
    const result = await runSeyeonInternalDogfoodTurnV1({
      runtimes: {
        chat: fakeChatRuntime({
          disposition: 'committed_replay',
        }, calls),
        postTurn: fakePostTurnRuntime({
          decision: 'none',
        }, calls),
        relationship: fakeRelationshipRuntime(calls),
      },
      turn: TURN,
    });

    expect(calls).toEqual(['chat']);
    expect(result.disposition).toBe('committed_replay');
    expect(result.postTurn).toBeNull();
    expect(result.relationship).toBeNull();
  });
  it.each(['disabled', 'none', 'rejected', 'shadow'] as const)(
    'does not invoke relationship apply for post-turn decision %s',
    async (decision) => {
      const calls: string[] = [];
      const postTurnResult =
        decision === 'shadow'
          ? {
              decision,
              outboxEventId: 'post-turn-no-apply',
              reclaimed: false,
              productionEventId: 'shadow-event-1',
              processedAt: '2026-10-04T05:00:00.000Z',
            }
          : {
              decision,
              outboxEventId: 'post-turn-no-apply',
              reclaimed: false,
              processedAt: '2026-10-04T05:00:00.000Z',
            };

      const result = await runSeyeonInternalDogfoodTurnV1({
        runtimes: {
          chat: fakeChatRuntime({
            disposition: 'executed',
            postTurnAnalysis: {
              status: 'deferred',
              outboxEventId: 'post-turn-no-apply',
            },
          }, calls),
          postTurn: fakePostTurnRuntime(postTurnResult, calls),
          relationship: fakeRelationshipRuntime(calls),
        },
        turn: TURN,
      });

      expect(calls).toEqual(['chat', 'post:post-turn-no-apply']);
      expect(result.relationship).toBeNull();
      expect(result.relationshipRevision).toBeNull();
    },
  );

  it('fails closed if Production Chat unexpectedly stops being deferred', async () => {
    const calls: string[] = [];
    await expect(
      runSeyeonInternalDogfoodTurnV1({
        runtimes: {
          chat: fakeChatRuntime({
            disposition: 'executed',
            postTurnAnalysis: {
              status: 'processed',
            },
          }, calls),
          postTurn: fakePostTurnRuntime({ decision: 'none' }, calls),
          relationship: fakeRelationshipRuntime(calls),
        },
        turn: TURN,
      }),
    ).rejects.toThrow(/requires deferred post-turn execution/i);

    expect(calls).toEqual(['chat']);
  });

  it('fails closed when the post-turn worker resolves a different Subject', async () => {
    const calls: string[] = [];
    await expect(
      runSeyeonInternalDogfoodTurnV1({
        runtimes: {
          chat: fakeChatRuntime({
            disposition: 'executed',
            postTurnAnalysis: {
              status: 'deferred',
              outboxEventId: 'post-turn-subject-drift',
            },
          }, calls),
          postTurn: fakePostTurnRuntime(
            {
              decision: 'none',
              outboxEventId: 'post-turn-subject-drift',
              reclaimed: false,
              processedAt: '2026-10-04T05:00:00.000Z',
            },
            calls,
            '92000000-0000-0000-0000-000000000099',
          ),
          relationship: fakeRelationshipRuntime(calls),
        },
        turn: TURN,
      }),
    ).rejects.toThrow(/different canonical Subject/i);

    expect(calls).toEqual(['chat', 'post:post-turn-subject-drift']);
  });

  it('fails closed when the relationship worker resolves a different Subject', async () => {
    const calls: string[] = [];
    await expect(
      runSeyeonInternalDogfoodTurnV1({
        runtimes: {
          chat: fakeChatRuntime({
            disposition: 'executed',
            postTurnAnalysis: {
              status: 'deferred',
              outboxEventId: 'post-turn-relationship-drift',
            },
          }, calls),
          postTurn: fakePostTurnRuntime({
            decision: 'enqueued',
            outboxEventId: 'post-turn-relationship-drift',
            reclaimed: false,
            productionEventId: 'production-event-drift',
            relationshipSyncOutboxEventId: 'relationship-sync-drift',
            relationshipSyncReplayed: false,
            processedAt: '2026-10-04T05:00:00.000Z',
          }, calls),
          relationship: fakeRelationshipRuntime(
            calls,
            '92000000-0000-0000-0000-000000000099',
          ),
        },
        turn: TURN,
      }),
    ).rejects.toThrow(/different canonical Subject/i);

    expect(calls).toEqual([
      'chat',
      'post:post-turn-relationship-drift',
      'relationship:relationship-sync-drift',
    ]);
  });

  it('propagates post-turn failure without attempting relationship apply', async () => {
    const calls: string[] = [];
    const failingPostTurn = {
      async run(input: { outboxEventId: string }) {
        calls.push('post:' + input.outboxEventId);
        throw new Error('simulated post-turn crash');
      },
      async close() {},
    } as unknown as ProductionSeyeonPostTurnWorkerRuntimeV1;

    await expect(
      runSeyeonInternalDogfoodTurnV1({
        runtimes: {
          chat: fakeChatRuntime({
            disposition: 'executed',
            postTurnAnalysis: {
              status: 'deferred',
              outboxEventId: 'post-turn-crash',
            },
          }, calls),
          postTurn: failingPostTurn,
          relationship: fakeRelationshipRuntime(calls),
        },
        turn: TURN,
      }),
    ).rejects.toThrow(/simulated post-turn crash/);

    expect(calls).toEqual(['chat', 'post:post-turn-crash']);
  });

});
