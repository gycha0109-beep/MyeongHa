import { describe, expect, it, vi } from 'vitest';

import {
  prepareSeyeonInternalDogfoodThreadV1,
} from '../apps/api/src/seyeon-internal-dogfood-thread-preparation-v1.js';
import type {
  SeyeonInternalDogfoodEvidenceSnapshotV1,
} from '../apps/api/src/seyeon-internal-dogfood-evidence-v1.js';
import type {
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const THREAD_ID = '33333333-3333-4333-8333-333333333333';

function snapshot(input: {
  readonly messageCount?: number;
  readonly relationship?: boolean;
} = {}): SeyeonInternalDogfoodEvidenceSnapshotV1 {
  return {
    version: 'seyeon-internal-dogfood-evidence-v1',
    subjectId: '22222222-2222-4222-8222-222222222222',
    thread: {
      threadId: THREAD_ID,
      activeContentReleaseId: '55555555-5555-4555-8555-555555555555',
      activeContentBundleId: '66666666-6666-4666-8666-666666666666',
      contentRevision: 0,
      participantCharacterIds: ['seyeon'],
    },
    stream: {
      messageCount: input.messageCount ?? 0,
      maxSequenceNo: input.messageCount ?? 0,
      messageIds:
        input.messageCount === undefined || input.messageCount === 0
          ? []
          : ['message-1'],
      userMessageCount: input.messageCount ?? 0,
      characterMessageCount: 0,
      systemMessageCount: 0,
    },
    memory: {
      itemIds: [],
      grants: [],
    },
    relationship: {
      version: 'seyeon-internal-dogfood-relationship-inspector-v1',
      subjectId: '22222222-2222-4222-8222-222222222222',
      relationship: input.relationship
        ? ({
            revision: 1,
          } as any)
        : null,
      activeEventKinds: input.relationship
        ? ['CHARACTER_SELF_DISCLOSURE']
        : [],
      activeEventIds: input.relationship
        ? ['event-1']
        : [],
    },
  };
}

const unusedPool: PostgresSubjectPoolV1 = {
  async connect() {
    throw new Error('injected openThread must be used');
  },
};

describe('Se-yeon internal dogfood thread preparation V1', () => {
  it('creates or reuses only the governed Se-yeon Member thread and accepts a clean result', async () => {
    const openThread = vi.fn(async (input: any) => {
      expect(input.characterId).toBe('seyeon');
      expect(input.verifiedEvidence).toEqual({
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      });
      return {
        threadId: THREAD_ID,
        characterId: 'seyeon',
        created: true,
      };
    });

    const result = await prepareSeyeonInternalDogfoodThreadV1({
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      },
      pool: unusedPool,
      evidenceInspector: {
        async inspect() {
          return snapshot();
        },
      },
      createUuid: () => '77777777-7777-4777-8777-777777777777',
      openThread,
    });

    expect(result.status).toBe('READY_CREATED');
    expect(result.threadId).toBe(THREAD_ID);
    expect(result.reasons).toEqual([]);
    expect(openThread).toHaveBeenCalledTimes(1);
  });

  it('stops before live scenario execution when the reused thread already has history', async () => {
    const result = await prepareSeyeonInternalDogfoodThreadV1({
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      },
      pool: unusedPool,
      evidenceInspector: {
        async inspect() {
          return snapshot({ messageCount: 1 });
        },
      },
      createUuid: () => '77777777-7777-4777-8777-777777777777',
      openThread: async () => ({
        threadId: THREAD_ID,
        characterId: 'seyeon',
        created: false,
      }),
    });

    expect(result.status).toBe('NOT_RUN_PREREQUISITE');
    expect(result.created).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/already contains/i);
  });

  it('does not call Member thread-open authority for Guest evidence', async () => {
    const openThread = vi.fn();
    const result = await prepareSeyeonInternalDogfoodThreadV1({
      verifiedEvidence: {
        kind: 'guest',
        verifiedGuestTokenHash: 'verified-guest-hash',
      },
      pool: unusedPool,
      evidenceInspector: {
        async inspect() {
          throw new Error('must not inspect');
        },
      },
      createUuid: () => '77777777-7777-4777-8777-777777777777',
      openThread,
    });

    expect(result.status).toBe('NOT_RUN_PREREQUISITE');
    expect(openThread).not.toHaveBeenCalled();
  });
});
