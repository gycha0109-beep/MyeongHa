import {
  WebApiEnvelopeError,
  readApiErrorCode,
  unwrapApiSuccessEnvelope,
} from './api-envelope.js';
import {
  getActiveBearer,
  invalidateGuestSession,
  invalidateMemberSession,
} from './product-auth.js';
import {
  ReaderSceneContractErrorV1,
  parseReaderSceneEnvelopeV1,
} from './reader-scene-contract.js';

export const READER_RUNTIME_ENDPOINT_V1 =
  '/api/me/readings/reader-interpretation/preview';

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ReaderRuntimeClientErrorV1 extends Error {
  constructor(code, message, retryable = false, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ReaderRuntimeClientErrorV1';
    this.code = code;
    this.retryable = retryable;
  }
}

function requireIdentifier(value, field) {
  if (typeof value !== 'string') {
    throw new ReaderRuntimeClientErrorV1(
      'READER_REQUEST_INVALID',
      field + ' must be a string.',
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new ReaderRuntimeClientErrorV1(
      'READER_REQUEST_INVALID',
      field + ' is outside the supported bounds.',
    );
  }
  return normalized;
}

function requireUuidIdentifier(value, field) {
  const normalized = requireIdentifier(value, field);
  if (!UUID_V1.test(normalized)) {
    throw new ReaderRuntimeClientErrorV1(
      'READER_REQUEST_INVALID',
      field + ' must be a UUID.',
    );
  }
  return normalized;
}

function isAbortError(error) {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error && typeof error === 'object' && error.name === 'AbortError')
  );
}

function invalidateRejectedBearer(bearer, invalidators) {
  if (bearer.kind === 'member') {
    invalidators.member(bearer.token);
    return;
  }
  if (bearer.kind === 'guest') invalidators.guest(bearer.token);
}

function mapPublicFailure(response, payload) {
  const publicCode = readApiErrorCode(payload);

  if (response.status === 401 || publicCode === 'AUTH_REQUIRED') {
    return new ReaderRuntimeClientErrorV1(
      'READER_SESSION_REQUIRED',
      'Reader Scene requires a current session.',
    );
  }
  if (response.status === 403 || publicCode === 'ACCESS_DENIED') {
    return new ReaderRuntimeClientErrorV1(
      'READER_ACCESS_DENIED',
      'Reader Scene access is unavailable.',
    );
  }
  if (publicCode === 'INVALID_REQUEST' || response.status === 400) {
    return new ReaderRuntimeClientErrorV1(
      'READER_REQUEST_INVALID',
      'Reader Scene request is invalid.',
    );
  }
  if (
    publicCode === 'AUTHORITY_CONFLICT' ||
    publicCode === 'CONTEXT_MISMATCH' ||
    publicCode === 'SOURCE_MISMATCH' ||
    response.status === 409
  ) {
    return new ReaderRuntimeClientErrorV1(
      'READER_AUTHORITY_CONFLICT',
      'Reader Scene authority is inconsistent.',
    );
  }
  if (
    publicCode === 'PERSPECTIVE_UNAVAILABLE' ||
    publicCode === 'NOT_FOUND' ||
    response.status === 404
  ) {
    return new ReaderRuntimeClientErrorV1(
      'READER_CONTEXT_UNAVAILABLE',
      'Reader Scene context is unavailable.',
    );
  }
  if (response.status >= 500) {
    return new ReaderRuntimeClientErrorV1(
      'READER_SERVICE_UNAVAILABLE',
      'Reader Scene service is temporarily unavailable.',
      true,
    );
  }
  return new ReaderRuntimeClientErrorV1(
    'READER_REQUEST_FAILED',
    'Reader Scene request failed.',
    response.status === 408 || response.status === 429,
  );
}

async function readPayload(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new ReaderRuntimeClientErrorV1(
      'READER_MALFORMED_RESPONSE',
      'Reader Scene API returned invalid JSON.',
      false,
      error,
    );
  }
}

export function createReaderRuntimeClientV1(options = {}) {
  const enabled = options.enabled === true;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolveBearer = options.resolveBearer ?? getActiveBearer;
  const endpoint = options.endpoint ?? READER_RUNTIME_ENDPOINT_V1;
  const invalidators = {
    member: options.invalidateMember ?? invalidateMemberSession,
    guest: options.invalidateGuest ?? invalidateGuestSession,
  };

  if (typeof fetchImpl !== 'function') {
    throw new ReaderRuntimeClientErrorV1(
      'READER_TRANSPORT_UNAVAILABLE',
      'Reader Scene fetch transport is unavailable.',
    );
  }
  if (typeof resolveBearer !== 'function') {
    throw new ReaderRuntimeClientErrorV1(
      'READER_SESSION_REQUIRED',
      'Reader Scene session resolver is unavailable.',
    );
  }

  return Object.freeze({
    enabled,
    endpoint,
    async readReaderScene(input) {
      if (!enabled) {
        throw new ReaderRuntimeClientErrorV1(
          'READER_FEATURE_UNAVAILABLE',
          'Reader Scene feature is not activated.',
        );
      }

      const threadId = requireUuidIdentifier(input?.threadId, 'threadId');
      const officialReadingId = requireUuidIdentifier(
        input?.officialReadingId,
        'officialReadingId',
      );

      let bearer;
      try {
        bearer = await resolveBearer();
      } catch (error) {
        throw new ReaderRuntimeClientErrorV1(
          'READER_SESSION_REQUIRED',
          'Reader Scene session could not be resolved.',
          false,
          error,
        );
      }
      if (
        !bearer ||
        (bearer.kind !== 'member' && bearer.kind !== 'guest') ||
        typeof bearer.token !== 'string' ||
        bearer.token.trim().length === 0
      ) {
        throw new ReaderRuntimeClientErrorV1(
          'READER_SESSION_REQUIRED',
          'Reader Scene requires a current session.',
        );
      }

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + bearer.token,
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          signal: input?.signal,
          body: JSON.stringify({ threadId, officialReadingId }),
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new ReaderRuntimeClientErrorV1(
            'READER_REQUEST_ABORTED',
            'Reader Scene request was aborted.',
            false,
            error,
          );
        }
        throw new ReaderRuntimeClientErrorV1(
          'READER_SERVICE_UNAVAILABLE',
          'Reader Scene request transport failed.',
          true,
          error,
        );
      }

      const payload = await readPayload(response);
      if (!response.ok) {
        const failure = mapPublicFailure(response, payload);
        if (failure.code === 'READER_SESSION_REQUIRED') {
          invalidateRejectedBearer(bearer, invalidators);
        }
        throw failure;
      }

      let data;
      try {
        data = unwrapApiSuccessEnvelope(payload);
      } catch (error) {
        if (error instanceof WebApiEnvelopeError) {
          throw new ReaderRuntimeClientErrorV1(
            'READER_MALFORMED_RESPONSE',
            error.message,
            false,
            error,
          );
        }
        throw error;
      }

      try {
        const scene = parseReaderSceneEnvelopeV1(data);
        if (scene.officialReadingId !== officialReadingId) {
          throw new ReaderSceneContractErrorV1(
            'Reader Scene response officialReadingId does not match the requested Reading.',
          );
        }
        return scene;
      } catch (error) {
        if (error instanceof ReaderSceneContractErrorV1) {
          throw new ReaderRuntimeClientErrorV1(
            'READER_MALFORMED_RESPONSE',
            error.message,
            false,
            error,
          );
        }
        throw error;
      }
    },
  });
}
