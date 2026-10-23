import { ReaderRuntimeClientErrorV1 } from './reader-runtime-client.js';
import { projectReaderSceneViewModelV1 } from './reader-scene-contract.js';
import { projectReaderSceneLocalePresentationV1 } from './reader-scene-locale-presentation-v1.js';
import { getUiLocale } from './ui-i18n.js';

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

  const resolveUiLocale = options.getUiLocale ?? getUiLocale;
  if (typeof resolveUiLocale !== 'function') {
    throw new TypeError('Reader Scene UI locale resolver must be a function.');
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
    // Capture the presentation preference when this request begins. Do not
    // relabel an in-flight source response if the user changes UI language.
    const requestedUiLocale = resolveUiLocale();
    const requestGeneration = ++generation;
    if (activeController !== null) activeController.abort();
    activeController = new AbortController();
    lastInput = Object.freeze({
      threadId: input.threadId,
      officialReadingId: input.officialReadingId,
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
        // Display preference only: never use this as Reader output approval.
        uiLocale: requestedUiLocale,
        signal: activeController.signal,
      });
      if (requestGeneration !== generation) return currentState;

      return emit(projectReaderSceneLocalePresentationV1(
        projectReaderSceneViewModelV1(scene), requestedUiLocale,
      ));
    } catch (error) {
      if (requestGeneration !== generation) return currentState;
      const projected = projectErrorState(error);
      if (projected.state === 'aborted') return currentState;
      return emit(projected);
    } finally {
      if (requestGeneration === generation) activeController = null;
    }
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
    retry,
    cancel,
    getState: () => currentState,
  });
}
