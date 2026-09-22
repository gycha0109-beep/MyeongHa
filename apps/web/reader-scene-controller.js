import { ReaderRuntimeClientErrorV1 } from './reader-runtime-client.js';
import { projectReaderSceneViewModelV1 } from './reader-scene-contract.js';
import {
  ReaderSceneLaunchInputErrorV1,
  createReaderSceneLaunchRequestV1,
} from './reader-scene-launch-input.js';

function projectErrorState(error) {
  if (!(error instanceof ReaderRuntimeClientErrorV1)) {
    return Object.freeze({
      state: 'retryable_error',
      canRetry: true,
      code: 'READER_SERVICE_UNAVAILABLE',
    });
  }

  switch (error.code) {
    case 'READER_FEATURE_UNAVAILABLE':
      return Object.freeze({
        state: 'feature_unavailable',
        canRetry: false,
        code: error.code,
      });
    case 'READER_SESSION_REQUIRED':
      return Object.freeze({
        state: 'auth_required',
        canRetry: false,
        code: error.code,
      });
    case 'READER_ACCESS_DENIED':
      return Object.freeze({
        state: 'access_denied',
        canRetry: false,
        code: error.code,
      });
    case 'READER_SERVICE_UNAVAILABLE':
    case 'READER_REQUEST_FAILED':
      return Object.freeze({
        state: error.retryable ? 'retryable_error' : 'unavailable',
        canRetry: error.retryable,
        code: error.code,
      });
    case 'READER_REQUEST_ABORTED':
      return Object.freeze({
        state: 'aborted',
        canRetry: false,
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

export function createReaderSceneControllerV1(options) {
  if (!options || !options.client || typeof options.client.readReaderScene !== 'function') {
    throw new TypeError('Reader Scene controller requires a runtime client.');
  }
  if (typeof options.onState !== 'function') {
    throw new TypeError('Reader Scene controller requires an onState callback.');
  }

  let generation = 0;
  let activeController = null;
  let lastInput = null;
  let currentState = Object.freeze({ state: 'idle', canRetry: false });

  function emit(state) {
    currentState = state;
    options.onState(state);
    return state;
  }

  async function load(input) {
    const requestGeneration = ++generation;
    if (activeController !== null) activeController.abort();
    activeController = new AbortController();
    lastInput = Object.freeze({
      threadId: input.threadId,
      officialReadingId: input.officialReadingId,
      presentationHint:
        typeof input.presentationHint === 'string' ? input.presentationHint : null,
    });

    emit(Object.freeze({
      state: 'loading',
      canRetry: false,
      generation: requestGeneration,
    }));

    try {
      const scene = await options.client.readReaderScene({
        threadId: lastInput.threadId,
        officialReadingId: lastInput.officialReadingId,
        signal: activeController.signal,
      });
      if (requestGeneration !== generation) return currentState;

      return emit(projectReaderSceneViewModelV1(scene, {
        presentationHint: lastInput.presentationHint,
        resolvePresentation: options.resolvePresentation,
      }));
    } catch (error) {
      if (requestGeneration !== generation) return currentState;
      const projected = projectErrorState(error);
      if (projected.state === 'aborted') return currentState;
      return emit(projected);
    } finally {
      if (requestGeneration === generation) activeController = null;
    }
  }

  function loadPersistedReading(input) {
    let request;
    try {
      request = createReaderSceneLaunchRequestV1({
        threadId: input?.threadId,
        persistedReadingHandoff: input?.persistedReadingHandoff,
      });
    } catch (error) {
      generation += 1;
      if (activeController !== null) activeController.abort();
      activeController = null;
      lastInput = null;
      if (error instanceof ReaderSceneLaunchInputErrorV1) {
        return Promise.resolve(emit(Object.freeze({
          state: 'unavailable',
          canRetry: false,
          code: error.code,
        })));
      }
      throw error;
    }

    return load({
      ...request,
      presentationHint:
        typeof input?.presentationHint === 'string' ? input.presentationHint : null,
    });
  }

  function retry() {
    if (!currentState.canRetry || lastInput === null) return Promise.resolve(currentState);
    return load(lastInput);
  }

  function cancel() {
    generation += 1;
    if (activeController !== null) activeController.abort();
    activeController = null;
    return emit(Object.freeze({ state: 'idle', canRetry: false }));
  }

  return Object.freeze({
    load,
    loadPersistedReading,
    retry,
    cancel,
    getState: () => currentState,
  });
}
