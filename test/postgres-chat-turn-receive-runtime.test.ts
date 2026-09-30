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
  allocateChatTurnAttemptRuntimeV1,
  markChatTurnContextReadyRuntimeV1,
  markChatTurnFailedRuntimeV1,
  persistPreparedChatReceiveV1,
} from '../apps/api/src/postgres-chat-turn-receive-runtime.js';
import type {
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const RELEASE_ID = '88888888-8888-4888-8888-888888888888';
const BUNDLE_ID = '77777777-7777-4777-8777-777777777777';
const THREAD_ID = '66666666-6666-4666-8666-666666666666';
const SUBJECT_ID = '55555555-5555-4555-8555-555555555555';

function receivePlan() {
  const entry = {
    release: {
      releaseId: RELEASE_ID,
      bundleId: BUNDLE_ID,
      contentVersion: 'chat-turn-receive-runtime-test-v1',
    },
    characters: {
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'chat-turn-receive-runtime-test-v1',
    },
    world: {
      ...DEV_WORLD_CONTENT_BUNDLE,
      bundleId: BUNDLE_ID,
      contentVersion: 'chat-turn-receive-runtime-test-v1',
    },
    lifecycle: 'active',
  } as unknown as ContentReleaseRuntimeEntry;

  const releaseRuntime = {
    assertPinnedClientCompatible: vi.fn(() => entry),
  } as unknown as ContentReleaseRuntime;

  return prepareChatReceiveCommand({
    request: {
      threadId: THREAD_ID,
      clientTurnId: 'client-turn-1',
      text: '안녕하세요',
      clientCapability: 'chat-turn-receive-test-capability',
    },
    releaseRuntime,
    trustedThread: {
      threadId: THREAD_ID,
      pinnedReleaseId: RELEASE_ID,
      participantCharacterIds: [DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!.characterId],
    },
  });
}

class ScriptedClient implements PostgresTransactionQueryV1 {
  readonly calls: { text: string; values?: readonly unknown[] }[] = [];

  constructor(
    readonly rowsByBinding: Readonly<Record<string, readonly unknown[]>>,
  ) {}

  async query<Row>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }> {
    this.calls.push(values === undefined ? { text } : { text, values });

    const binding = Object.keys(this.rowsByBinding).find((key) => text.includes(key));
    if (binding === undefined) {
      throw new Error(`Unexpected SQL: ${text}`);
    }

    return {
      rows: this.rowsByBinding[binding] as readonly Row[],
    };
  }
}

describe('Production Chat receive lifecycle adapter', () => {
  it('persists only the server-minted normalized request through the runtime wrapper', async () => {
    const client = new ScriptedClient({
      cmd_receive_chat_turn_runtime_v1: [{
        turnId: '44444444-4444-4444-8444-444444444444',
        messageId: '33333333-3333-4333-8333-333333333333',
        sequenceNo: 7,
        replayed: false,
      }],
    });

    const result = await persistPreparedChatReceiveV1({
      client,
      resolvedSubjectId: SUBJECT_ID,
      receivePlan: receivePlan(),
      turnId: '44444444-4444-4444-8444-444444444444',
      messageId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).toEqual({
      turnId: '44444444-4444-4444-8444-444444444444',
      messageId: '33333333-3333-4333-8333-333333333333',
      sequenceNo: 7,
      replayed: false,
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.text).toContain('cmd_receive_chat_turn_runtime_v1');
    expect(client.calls[0]!.values?.slice(0, 10)).toEqual([
      SUBJECT_ID,
      THREAD_ID,
      'client-turn-1',
      expect.stringMatching(/^sha256:v1:/u),
      'chat-request-v1',
      JSON.stringify({
        threadId: THREAD_ID,
        clientTurnId: 'client-turn-1',
        text: '안녕하세요',
        clientCapability: 'chat-turn-receive-test-capability',
      }),
      RELEASE_ID,
      BUNDLE_ID,
      '44444444-4444-4444-8444-444444444444',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(client.calls[0]!.values?.[10]).toBe('안녕하세요');
    expect(client.calls[0]!.values?.[11]).toBeNull();
    expect(client.calls[0]!.values?.[12]).toEqual(
      expect.stringMatching(/^sha256:v1:[0-9a-f]{64}$/u),
    );
  });

  it('accepts authoritative replay ids instead of forcing the new candidate ids', async () => {
    const client = new ScriptedClient({
      cmd_receive_chat_turn_runtime_v1: [{
        turnId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        sequenceNo: 1,
        replayed: true,
      }],
    });

    await expect(
      persistPreparedChatReceiveV1({
        client,
        resolvedSubjectId: SUBJECT_ID,
        receivePlan: receivePlan(),
        turnId: '44444444-4444-4444-8444-444444444444',
        messageId: '33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toEqual({
      turnId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      sequenceNo: 1,
      replayed: true,
    });
  });

  it('rejects a structural receive-plan lookalike before PostgreSQL', async () => {
    const genuine = receivePlan();
    const forged = Object.freeze({
      ...genuine,
      resolvedContent: Object.freeze({ ...genuine.resolvedContent }),
    });
    const client = new ScriptedClient({});

    await expect(
      persistPreparedChatReceiveV1({
        client,
        resolvedSubjectId: SUBJECT_ID,
        receivePlan: forged,
        turnId: '44444444-4444-4444-8444-444444444444',
        messageId: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toThrow(/not minted by server receive authority/u);

    expect(client.calls).toEqual([]);
  });

  it('uses only runtime wrapper functions for attempt, context-ready and failure transitions', async () => {
    const client = new ScriptedClient({
      cmd_allocate_chat_turn_attempt_runtime_v1: [{
        attemptId: '22222222-2222-4222-8222-222222222222',
        attemptNo: 1,
        replayed: false,
      }],
      cmd_mark_chat_turn_context_ready_runtime_v1: [{
        replayed: false,
      }],
      cmd_mark_chat_turn_failed_runtime_v1: [{
        replayed: false,
      }],
    });

    await expect(
      allocateChatTurnAttemptRuntimeV1({
        client,
        resolvedSubjectId: SUBJECT_ID,
        turnId: '11111111-1111-4111-8111-111111111111',
        attemptId: '22222222-2222-4222-8222-222222222222',
        plannerVersion: 'planner-v1',
      }),
    ).resolves.toEqual({
      attemptId: '22222222-2222-4222-8222-222222222222',
      attemptNo: 1,
      replayed: false,
    });

    await expect(
      markChatTurnContextReadyRuntimeV1({
        client,
        resolvedSubjectId: SUBJECT_ID,
        turnId: '11111111-1111-4111-8111-111111111111',
        attemptId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toBe(false);

    await expect(
      markChatTurnFailedRuntimeV1({
        client,
        resolvedSubjectId: SUBJECT_ID,
        turnId: '11111111-1111-4111-8111-111111111111',
        attemptId: '22222222-2222-4222-8222-222222222222',
        failureState: 'failed_retryable',
        errorCode: 'CONTEXT_UNAVAILABLE',
      }),
    ).resolves.toBe(false);

    expect(client.calls.map((call) => call.text)).toEqual([
      expect.stringContaining('cmd_allocate_chat_turn_attempt_runtime_v1'),
      expect.stringContaining('cmd_mark_chat_turn_context_ready_runtime_v1'),
      expect.stringContaining('cmd_mark_chat_turn_failed_runtime_v1'),
    ]);
    expect(client.calls.every((call) => !call.text.includes('cmd_allocate_chat_turn_attempt_v1('))).toBe(true);
    expect(client.calls.every((call) => !call.text.includes('cmd_mark_chat_turn_context_ready_v1('))).toBe(true);
    expect(client.calls.every((call) => !call.text.includes('cmd_mark_chat_turn_failed_v1('))).toBe(true);
  });
});
