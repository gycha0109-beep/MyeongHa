import { describe, expect, it, vi } from 'vitest';

import { ChatOpenClientErrorV1 } from '../apps/web/chat-open-client.js';
import { createReaderChatOpenControllerV1 } from '../apps/web/reader-chat-open-controller.js';

const THREAD_ID = '123e4567-e89b-42d3-a456-426614174000';

function readyScene(readerCharacterId = 'taegyeom') {
  return Object.freeze({
    state: 'ready' as const,
    readerCharacterId,
    officialReadingId: 'reading-1',
    presentation: Object.freeze({
      name: '대리자',
      title: '',
      intro: '',
      generic: true,
    }),
    domain: 'general',
    interpretationHash: 'sha256:v1:reader-result',
    segments: Object.freeze([]),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Reader Scene to Chat open controller', () => {
  it('opens Chat only from the server-authoritative Reader Scene identity', async () => {
    const states: Array<{ state: string; [key: string]: unknown }> = [];
    const onNavigate = vi.fn();
    const client = {
      openForServerCharacter: vi.fn().mockResolvedValue({
        threadId: THREAD_ID,
        characterId: 'taegyeom',
        created: true,
      }),
    };
    const controller = createReaderChatOpenControllerV1({
      client,
      onState: (state) => states.push(state),
      onNavigate,
    });

    const result = await controller.open(readyScene());

    expect(client.openForServerCharacter).toHaveBeenCalledWith({
      readerCharacterId: 'taegyeom',
    });
    expect(result).toEqual({
      state: 'opened',
      canRetry: false,
      readerCharacterId: 'taegyeom',
      officialReadingId: 'reading-1',
      threadId: THREAD_ID,
      created: true,
      destination: 'chat.html?threadId=123e4567-e89b-42d3-a456-426614174000',
    });
    expect(onNavigate).toHaveBeenCalledWith(
      'chat.html?threadId=123e4567-e89b-42d3-a456-426614174000',
    );
    expect(onNavigate.mock.calls[0]![0]).not.toContain('character=');
    expect(states.map((state) => state.state)).toEqual(['opening', 'opened']);
  });

  it('fails closed before transport when the Reader Scene is not ready', async () => {
    const client = { openForServerCharacter: vi.fn() };
    const controller = createReaderChatOpenControllerV1({
      client,
      onState: vi.fn(),
    });

    await expect(controller.open({
      ...readyScene(),
      state: 'protected_fallback',
      fallbackReason: 'semantic_guard_failed',
      segments: Object.freeze([]),
    })).resolves.toEqual({
      state: 'unavailable',
      canRetry: false,
      code: 'READER_CHAT_OPEN_SCENE_NOT_READY',
    });
    expect(client.openForServerCharacter).not.toHaveBeenCalled();
  });

  it('coalesces a double submit so one Reader action cannot open two threads', async () => {
    const pending = deferred<{
      threadId: string;
      characterId: string;
      created: boolean;
    }>();
    const client = {
      openForServerCharacter: vi.fn().mockReturnValue(pending.promise),
    };
    const controller = createReaderChatOpenControllerV1({
      client,
      onState: vi.fn(),
    });

    const first = controller.open(readyScene());
    const second = controller.open(readyScene());
    expect(client.openForServerCharacter).toHaveBeenCalledTimes(1);

    pending.resolve({
      threadId: THREAD_ID,
      characterId: 'taegyeom',
      created: false,
    });

    await expect(first).resolves.toMatchObject({ state: 'opened', threadId: THREAD_ID });
    await expect(second).resolves.toMatchObject({ state: 'opened', threadId: THREAD_ID });
  });

  it('retries only an explicitly retryable Chat open failure', async () => {
    const client = {
      openForServerCharacter: vi.fn()
        .mockRejectedValueOnce(
          new ChatOpenClientErrorV1(
            'CHAT_OPEN_CONTENT_UNAVAILABLE',
            'temporary',
            true,
          ),
        )
        .mockResolvedValueOnce({
          threadId: THREAD_ID,
          characterId: 'taegyeom',
          created: true,
        }),
    };
    const controller = createReaderChatOpenControllerV1({
      client,
      onState: vi.fn(),
    });

    await expect(controller.open(readyScene())).resolves.toEqual({
      state: 'retryable_error',
      canRetry: true,
      code: 'CHAT_OPEN_CONTENT_UNAVAILABLE',
    });
    await expect(controller.retry()).resolves.toMatchObject({
      state: 'opened',
      readerCharacterId: 'taegyeom',
      threadId: THREAD_ID,
    });
    expect(client.openForServerCharacter).toHaveBeenCalledTimes(2);
  });

  it('drops navigation when the Reader action is reset while Chat open is in flight', async () => {
    const pending = deferred<{
      threadId: string;
      characterId: string;
      created: boolean;
    }>();
    const onNavigate = vi.fn();
    const controller = createReaderChatOpenControllerV1({
      client: { openForServerCharacter: vi.fn().mockReturnValue(pending.promise) },
      onState: vi.fn(),
      onNavigate,
    });

    const opening = controller.open(readyScene());
    expect(controller.reset()).toEqual({ state: 'idle', canRetry: false });

    pending.resolve({
      threadId: THREAD_ID,
      characterId: 'taegyeom',
      created: true,
    });

    await expect(opening).resolves.toEqual({ state: 'idle', canRetry: false });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
