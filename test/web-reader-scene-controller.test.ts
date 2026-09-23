import { describe, expect, it, vi } from 'vitest';

import { ReaderRuntimeClientErrorV1 } from '../apps/web/reader-runtime-client.js';
import { createReaderSceneControllerV1 } from '../apps/web/reader-scene-controller.js';
import type { ReaderSceneInterpretationV1 } from '../apps/web/reader-scene-contract.js';

function scene(
  readerCharacterId = 'baekheon',
  officialReadingId = 'reading-1',
): ReaderSceneInterpretationV1 {
  return Object.freeze({
    schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
    lifecycle: 'preview',
    mode: 'reader_interpretation',
    officialReadingId,
    readerCharacterId,
    domain: 'general_natal',
    interpretationHash: 'sha256:v1:reader-result',
    utterance: Object.freeze({
      characterId: readerCharacterId,
      requestedDomain: 'general_natal',
      segments: Object.freeze([
        Object.freeze({ kind: 'character_reaction', text: '핵심부터 보겠습니다.' }),
      ]),
    }),
  });
}

function deferred() {
  let resolve!: (value: ReturnType<typeof scene>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<ReturnType<typeof scene>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('web Reader Scene controller', () => {
  it('projects loading then ready and keeps server Reader identity authoritative', async () => {
    const states: Array<{ state: string; [key: string]: unknown }> = [];
    const client = { readReaderScene: vi.fn().mockResolvedValue(scene('taegyeom')) };
    const controller = createReaderSceneControllerV1({
      client,
      onState: (state) => states.push(state),
    });

    const result = await controller.load({
      threadId: 'thread-1',
      officialReadingId: 'reading-1',
    });

    expect(states[0]!.state).toBe('loading');
    expect(result).toMatchObject({
      state: 'ready',
      readerCharacterId: 'taegyeom',
      presentation: { name: '태겸', generic: false },
    });
    if ('presentation' in result) expect(result.presentation).not.toHaveProperty('id');
  });

  it('loads a persisted Reading only through the candidate launch boundary', async () => {
    const client = { readReaderScene: vi.fn().mockResolvedValue(scene('taegyeom', '44444444-4444-4444-8444-444444444444')) };
    const controller = createReaderSceneControllerV1({
      client,
      onState: vi.fn(),
    });

    const result = await controller.loadPersistedReading({
      threadId: '33333333-3333-4333-8333-333333333333',
      persistedReadingHandoff: {
        state: 'ready',
        source: 'records',
        readingId: '44444444-4444-4444-8444-444444444444',
        readingSessionId: '55555555-5555-4555-8555-555555555555',
        sajuDomain: 'career',
      },
    });

    expect(client.readReaderScene).toHaveBeenCalledTimes(1);
    expect(client.readReaderScene).toHaveBeenCalledWith(expect.objectContaining({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    }));
    const request = client.readReaderScene.mock.calls[0]![0];
    expect(request).not.toHaveProperty('readingSessionId');
    expect(request).not.toHaveProperty('sajuDomain');
    expect(result).toMatchObject({
      state: 'ready',
      readerCharacterId: 'taegyeom',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    });
    expect(result).not.toHaveProperty('presentationHint');
  });

  it('fails a persisted Reading launch closed before transport when thread authority is absent', async () => {
    const client = { readReaderScene: vi.fn() };
    const controller = createReaderSceneControllerV1({
      client,
      onState: vi.fn(),
    });

    const result = await controller.loadPersistedReading({
      threadId: null,
      persistedReadingHandoff: {
        state: 'ready',
        source: 'records',
        readingId: '44444444-4444-4444-8444-444444444444',
        readingSessionId: '55555555-5555-4555-8555-555555555555',
        sajuDomain: 'career',
      },
    });

    expect(result).toEqual({
      state: 'unavailable',
      canRetry: false,
      code: 'READER_SCENE_LAUNCH_INVALID',
    });
    expect(client.readReaderScene).not.toHaveBeenCalled();
  });

  it('retries only explicit retryable failures', async () => {
    const states: Array<{ state: string; [key: string]: unknown }> = [];
    const client = {
      readReaderScene: vi.fn()
        .mockRejectedValueOnce(
          new ReaderRuntimeClientErrorV1(
            'READER_SERVICE_UNAVAILABLE',
            'temporary',
            true,
          ),
        )
        .mockResolvedValueOnce(scene()),
    };
    const controller = createReaderSceneControllerV1({
      client,
      onState: (state) => states.push(state),
    });

    await controller.load({
      threadId: 'thread-1',
      officialReadingId: 'reading-1',
    });
    expect(controller.getState()).toMatchObject({
      state: 'retryable_error',
      canRetry: true,
    });

    const result = await controller.retry();
    expect(result.state).toBe('ready');
    expect(client.readReaderScene).toHaveBeenCalledTimes(2);
  });

  it('drops a stale response after a newer request becomes authoritative', async () => {
    const first = deferred();
    const second = deferred();
    const states: Array<{ state: string; [key: string]: unknown }> = [];
    const client = {
      readReaderScene: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };
    const controller = createReaderSceneControllerV1({
      client,
      onState: (state) => states.push(state),
    });

    const firstLoad = controller.load({
      threadId: 'thread-1',
      officialReadingId: 'reading-1',
    });
    const secondLoad = controller.load({
      threadId: 'thread-2',
      officialReadingId: 'reading-2',
    });

    second.resolve(scene('taegyeom', 'reading-2'));
    await secondLoad;

    first.resolve(scene('baekheon'));
    await firstLoad;

    expect(controller.getState()).toMatchObject({
      state: 'ready',
      readerCharacterId: 'taegyeom',
      officialReadingId: 'reading-2',
    });
    expect(states.filter((state) => state.state === 'ready')).toHaveLength(1);
  });

  it('separates feature unavailable from request failure', async () => {
    const states: Array<{ state: string; [key: string]: unknown }> = [];
    const controller = createReaderSceneControllerV1({
      client: {
        readReaderScene: vi.fn().mockRejectedValue(
          new ReaderRuntimeClientErrorV1(
            'READER_FEATURE_UNAVAILABLE',
            'not activated',
          ),
        ),
      },
      onState: (state) => states.push(state),
    });

    const result = await controller.load({
      threadId: 'thread-1',
      officialReadingId: 'reading-1',
    });

    expect(result).toEqual({
      state: 'feature_unavailable',
      canRetry: false,
      code: 'READER_FEATURE_UNAVAILABLE',
    });
  });
});
