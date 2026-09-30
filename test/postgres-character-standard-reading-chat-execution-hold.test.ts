import { describe, expect, it, vi } from 'vitest';

import {
  DEV_CHARACTER_CONTENT_BUNDLE,
  DEV_WORLD_CONTENT_BUNDLE,
} from '../packages/test-fixtures/src/index.js';
import {
  ContentReleaseRuntime,
  type ContentReleaseRuntimeEntry,
} from '../packages/world-content/src/index.js';
import {
  prepareChatReceiveCommand,
} from '../apps/api/src/chat-receive.js';
import {
  acquireCharacterStandardReadingChatExecutionHoldV1,
  markCharacterStandardReadingChatContextReadyHoldV1,
  markCharacterStandardReadingChatFailedHoldV1,
} from '../apps/api/src/postgres-character-standard-reading-chat-execution-hold.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from '../apps/api/src/character-standard-reading-chat-turn-preflight.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const RELEASE_ID = '33333333-3333-4333-8333-333333333333';
const BUNDLE_ID = '44444444-4444-4444-8444-444444444444';
const ATTEMPT_ID = '55555555-5555-4555-8555-555555555555';
const TURN_ID = '66666666-6666-4666-8666-666666666666';

function genuinePreflight(): CharacterStandardReadingChatTurnPreflightV1 {
  const characterId = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!.characterId;
  const entry = {
    release: {
      releaseId: RELEASE_ID,
      bundleId: BUNDLE_ID,
      contentVersion: 'hold-adapter-test-v1',
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'hold-adapter-test-v1',
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'hold-adapter-test-v1',
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  const releaseRuntime = {
    assertPinnedClientCompatible: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;

  const receivePlan = prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'hold-adapter-client-turn',
      text: 'hello',
      clientCapability: 'hold-adapter-capability',
    },
    releaseRuntime,
    trustedThread: {
      threadId: THREAD_ID,
      pinnedReleaseId: RELEASE_ID,
      participantCharacterIds: [characterId],
    },
  });

  return {
    receivePlan,
    runtime: {
      threadBinding: {
        threadId: THREAD_ID,
        status: 'active',
        activeContentReleaseId: RELEASE_ID,
        activeContentBundleId: BUNDLE_ID,
        contentRevision: 1,
        participantCharacterIds: [characterId],
      },
      source: {
        subjectId: SUBJECT_ID,
      },
      context: {
        characterId,
        contentBundleId: BUNDLE_ID,
      },
    },
  } as unknown as CharacterStandardReadingChatTurnPreflightV1;
}

describe('PostgreSQL Standard Reading Chat HOLD lifecycle adapter', () => {
  it('derives exact subject/thread/client turn/content authority from server preflight', async () => {
    const calls: { text: string; values?: readonly unknown[] }[] = [];
    const client: PostgresTransactionQueryV1 = {
      async query<Row>(text: string, values?: readonly unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        return {
          rows: [{
            turnId: TURN_ID,
            attemptId: ATTEMPT_ID,
            attemptNo: 1,
            executionMode: 'execute',
          }] as unknown as Row[],
        };
      },
    };

    await expect(
      acquireCharacterStandardReadingChatExecutionHoldV1({
        client,
        preflight: genuinePreflight(),
        attemptId: ATTEMPT_ID,
        plannerVersion: 'planner-v1',
      }),
    ).resolves.toEqual({
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      attemptNo: 1,
      executionMode: 'execute',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain(
      'cmd_acquire_standard_reading_chat_execution_hold_v1',
    );
    expect(calls[0]?.values).toEqual([
      SUBJECT_ID,
      THREAD_ID,
      'hold-adapter-client-turn',
      ATTEMPT_ID,
      'planner-v1',
      RELEASE_ID,
      BUNDLE_ID,
    ]);
  });

  it('rejects a structural receive-plan lookalike before touching PostgreSQL', async () => {
    const base = genuinePreflight();
    const forged = {
      ...base,
      receivePlan: Object.freeze({
        ...base.receivePlan,
        resolvedContent: Object.freeze({
          ...base.receivePlan.resolvedContent,
        }),
      }),
    } as CharacterStandardReadingChatTurnPreflightV1;
    const client = {
      query: vi.fn(),
    } as unknown as PostgresTransactionQueryV1;

    await expect(
      acquireCharacterStandardReadingChatExecutionHoldV1({
        client,
        preflight: forged,
        attemptId: ATTEMPT_ID,
        plannerVersion: 'planner-v1',
      }),
    ).rejects.toThrow(/not minted by server receive authority/u);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('maps content provenance and in-flight DB constraints to typed errors', async () => {
    for (const [constraint, code] of [
      [
        'standard_reading_chat_execution_content_provenance',
        'CONTENT_PROVENANCE_MISMATCH',
      ],
      [
        'standard_reading_chat_execution_attempt_in_flight',
        'ATTEMPT_IN_FLIGHT',
      ],
    ] as const) {
      const error = Object.assign(new Error(constraint), { constraint });
      const client = {
        query: vi.fn(async () => {
          throw error;
        }),
      } as unknown as PostgresTransactionQueryV1;

      await expect(
        acquireCharacterStandardReadingChatExecutionHoldV1({
          client,
          preflight: genuinePreflight(),
          attemptId: ATTEMPT_ID,
          plannerVersion: 'planner-v1',
        }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('uses only turn/attempt authority for context-ready transition', async () => {
    const calls: { text: string; values?: readonly unknown[] }[] = [];
    const client: PostgresTransactionQueryV1 = {
      async query<Row>(text: string, values?: readonly unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        return { rows: [{ replayed: false }] as unknown as Row[] };
      },
    };

    await markCharacterStandardReadingChatContextReadyHoldV1({
      client,
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
    });

    expect(calls[0]?.text).toContain(
      'cmd_mark_standard_reading_chat_context_ready_hold_v1',
    );
    expect(calls[0]?.values).toEqual([
      SUBJECT_ID,
      TURN_ID,
      ATTEMPT_ID,
    ]);
  });

  it('maps retryable boolean only to the two authoritative DB failure states', async () => {
    const calls: { text: string; values?: readonly unknown[] }[] = [];
    const client: PostgresTransactionQueryV1 = {
      async query<Row>(text: string, values?: readonly unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        return { rows: [{ replayed: false }] as unknown as Row[] };
      },
    };

    await markCharacterStandardReadingChatFailedHoldV1({
      client,
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      retryable: true,
      errorCode: 'RENDERER_FAILED',
    });
    await markCharacterStandardReadingChatFailedHoldV1({
      client,
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      retryable: false,
      errorCode: 'OUTPUT_GUARD_FAILED',
    });

    expect(calls.map((call) => call.values?.[3])).toEqual([
      'failed_retryable',
      'failed_final',
    ]);
  });
});
