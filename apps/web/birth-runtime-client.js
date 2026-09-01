import { readApiErrorCode, unwrapApiSuccessEnvelope, WebApiEnvelopeError } from './api-envelope.js';

const DEFAULT_ENDPOINT = '/api/birth-profiles';

export class BirthRuntimeError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BirthRuntimeError';
    this.code = code;
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new BirthRuntimeError('WEB_BIRTH_FETCH_UNAVAILABLE', 'Birth Profile API transport is unavailable.');
  }
  return fetchImpl;
}

function assertCreateResponse(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BirthRuntimeError('WEB_BIRTH_MALFORMED_RESPONSE', 'Birth Profile API returned a malformed payload.');
  }

  const { birthProfileId, revisionId, revisionNo } = payload;
  if (
    typeof birthProfileId !== 'string' || birthProfileId.trim().length === 0 ||
    typeof revisionId !== 'string' || revisionId.trim().length === 0 ||
    revisionNo !== 1
  ) {
    throw new BirthRuntimeError('WEB_BIRTH_MALFORMED_RESPONSE', 'Birth Profile API returned an invalid create receipt.');
  }

  return Object.freeze({ birthProfileId, revisionId, revisionNo });
}

async function readErrorPayload(response) {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function createBirthRuntimeClient(options = {}) {
  const fetchImpl = requireFetch(options.fetchImpl ?? globalThis.fetch);
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;

  return Object.freeze({
    async createBirthProfile(request) {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify(request),
        });
      } catch (error) {
        throw new BirthRuntimeError('WEB_BIRTH_REQUEST_FAILED', 'Birth Profile API request failed.', error);
      }

      if (response.status === 401 || response.status === 403) {
        throw new BirthRuntimeError('WEB_BIRTH_SESSION_REQUIRED', 'A current session is required.');
      }

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const publicCode = readApiErrorCode(payload);
        if (publicCode === 'INVALID_REQUEST') {
          throw new BirthRuntimeError('WEB_BIRTH_INVALID_REQUEST', 'Birth Profile input was rejected.');
        }
        if (publicCode === 'NOT_FOUND') {
          throw new BirthRuntimeError('WEB_BIRTH_NOT_AVAILABLE', 'Birth Profile is unavailable for the current subject.');
        }
        throw new BirthRuntimeError('WEB_BIRTH_REQUEST_FAILED', `Birth Profile API request failed with status ${response.status}.`);
      }

      let envelope;
      try {
        envelope = await response.json();
      } catch (error) {
        throw new BirthRuntimeError('WEB_BIRTH_MALFORMED_RESPONSE', 'Birth Profile API returned invalid JSON.', error);
      }

      try {
        return assertCreateResponse(unwrapApiSuccessEnvelope(envelope));
      } catch (error) {
        if (error instanceof WebApiEnvelopeError) {
          throw new BirthRuntimeError('WEB_BIRTH_MALFORMED_RESPONSE', error.message, error);
        }
        throw error;
      }
    },
  });
}

export const BIRTH_RUNTIME_ENDPOINT_V1 = DEFAULT_ENDPOINT;
