import {
  ChatOpenClientErrorV1,
  buildChatThreadUrlV1,
} from './chat-open-client.js';

function projectErrorState(error) {
  if (!(error instanceof ChatOpenClientErrorV1)) {
    return Object.freeze({
      state: 'retryable_error',
      canRetry: true,
      code: 'CHAT_OPEN_REQUEST_FAILED',
    });
  }

  switch (error.code) {
    case 'CHAT_OPEN_SESSION_REQUIRED':
      return Object.freeze({
        state: 'auth_required',
        canRetry: false,
        code: error.code,
      });
    case 'CHAT_OPEN_MEMBER_REQUIRED':
      return Object.freeze({
        state: 'member_required',
        canRetry: false,
        code: error.code,
      });
    case 'CHAT_OPEN_CHARACTER_UNAVAILABLE':
      return Object.freeze({
        state: 'character_unavailable',
        canRetry: false,
        code: error.code,
      });
    case 'CHAT_OPEN_CONTENT_UNAVAILABLE':
    case 'CHAT_OPEN_REQUEST_FAILED':
      return Object.freeze({
        state: error.retryable ? 'retryable_error' : 'unavailable',
        canRetry: error.retryable,
        code: error.code,
      });
    default:
      return Object.freeze({
        state: 'unavailable',
        canRetry: false,
        code: error.code,
      });
  }
}

function readReadyScene(scene) {
  if (
    scene === null ||
    typeof scene !== 'object' ||
    scene.state !== 'ready' ||
    typeof scene.readerCharacterId !== 'string' ||
    scene.readerCharacterId.trim().length === 0 ||
    typeof scene.officialReadingId !== 'string' ||
    scene.officialReadingId.trim().length === 0
  ) {
    return null;
  }
  return Object.freeze({
    readerCharacterId: scene.readerCharacterId.trim(),
    officialReadingId: scene.officialReadingId.trim(),
  });
}

export function createReaderChatOpenControllerV1(options) {
  if (!options || !options.client || typeof options.client.openForServerCharacter !== 'function') {
    throw new TypeError('Reader Chat open controller requires a Chat open client.');
  }
  if (typeof options.onState !== 'function') {
    throw new TypeError('Reader Chat open controller requires an onState callback.');
  }
  if (options.onNavigate !== undefined && typeof options.onNavigate !== 'function') {
    throw new TypeError('Reader Chat open controller onNavigate must be a function.');
  }

  let generation = 0;
  let currentState = Object.freeze({ state: 'idle', canRetry: false });
  let lastReadyScene = null;
  let activePromise = null;

  function emit(state) {
    currentState = state;
    options.onState(state);
    return state;
  }

  function open(scene) {
    if (activePromise !== null) return activePromise;

    const readyScene = readReadyScene(scene);
    if (readyScene === null) {
      return Promise.resolve(emit(Object.freeze({
        state: 'unavailable',
        canRetry: false,
        code: 'READER_CHAT_OPEN_SCENE_NOT_READY',
      })));
    }

    lastReadyScene = readyScene;
    const requestGeneration = ++generation;
    emit(Object.freeze({
      state: 'opening',
      canRetry: false,
      readerCharacterId: readyScene.readerCharacterId,
      officialReadingId: readyScene.officialReadingId,
      generation: requestGeneration,
    }));

    activePromise = (async () => {
      try {
        const result = await options.client.openForServerCharacter({
          readerCharacterId: readyScene.readerCharacterId,
        });
        if (requestGeneration !== generation) return currentState;

        const destination = buildChatThreadUrlV1(result.threadId);
        const opened = emit(Object.freeze({
          state: 'opened',
          canRetry: false,
          readerCharacterId: result.characterId,
          officialReadingId: readyScene.officialReadingId,
          threadId: result.threadId,
          created: result.created,
          destination,
        }));
        if (typeof options.onNavigate === 'function') options.onNavigate(destination);
        return opened;
      } catch (error) {
        if (requestGeneration !== generation) return currentState;
        return emit(projectErrorState(error));
      } finally {
        activePromise = null;
      }
    })();

    return activePromise;
  }

  function retry() {
    if (!currentState.canRetry || lastReadyScene === null || activePromise !== null) {
      return activePromise ?? Promise.resolve(currentState);
    }
    return open(Object.freeze({
      state: 'ready',
      readerCharacterId: lastReadyScene.readerCharacterId,
      officialReadingId: lastReadyScene.officialReadingId,
    }));
  }

  function reset() {
    generation += 1;
    lastReadyScene = null;
    return emit(Object.freeze({ state: 'idle', canRetry: false }));
  }

  return Object.freeze({
    open,
    retry,
    reset,
    getState: () => currentState,
  });
}
