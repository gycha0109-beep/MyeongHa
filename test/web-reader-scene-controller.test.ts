import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { ReaderRuntimeClientErrorV1 } from '../apps/web/reader-runtime-client.js';
import { createReaderSceneControllerV1 } from '../apps/web/reader-scene-controller.js';
import type { ReaderSceneInterpretationV1 } from '../apps/web/reader-scene-contract.js';

const controllerTypesPath = new URL(
  '../apps/web/reader-scene-controller.d.ts',
  import.meta.url,
);

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
    domain: 'general',
    interpretationHash: 'sha256:v1:reader-result',
    utterance: Object.freeze({
      characterId: readerCharacterId,
      requestedDomain: 'general',
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

  it('does not expose a Records-to-Reader re-entry method', () => {
    const controller = createReaderSceneControllerV1({
      client: { readReaderScene: vi.fn() },
      onState: vi.fn(),
    });

    expect(controller).not.toHaveProperty('loadPersistedReading');
  });

  it('keeps the public controller type contract free of Records re-entry', async () => {
    const types = await readFile(controllerTypesPath, 'utf8');

    expect(types).not.toContain('PersistedReadingHandoffParseResultV1');
    expect(types).not.toContain('ReaderSceneControllerPersistedInputV1');
    expect(types).not.toContain('loadPersistedReading');
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
