import { readApiErrorCode, unwrapApiSuccessEnvelope, WebApiEnvelopeError } from './api-envelope.js';
import { ensureActiveBearer } from './product-auth.js';

const DEFAULT_CREATE_ENDPOINT = '/api/birth-profiles';
const DEFAULT_CURRENT_ENDPOINT = '/api/me/birth-profile';

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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertCreateResponse(payload) {
  if (!isRecord(payload)) {
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

function assertCurrentBirthProfile(payload) {
  if (!isRecord(payload) || !Object.prototype.hasOwnProperty.call(payload, 'birthProfile')) {
    throw new BirthRuntimeError('WEB_BIRTH_MALFORMED_CURRENT', 'Current Birth Profile API returned a malformed payload.');
  }
  if (payload.birthProfile === null) return null;

  const profile = payload.birthProfile;
  if (!isRecord(profile) || profile.profileKind !== 'self' || profile.archivedAt !== null) {
    throw new BirthRuntimeError('WEB_BIRTH_MALFORMED_CURRENT', 'Current Birth Profile API returned a non-current self profile.');
  }
  const revision = profile.currentRevision;
  if (
    !isRecord(revision) ||
    typeof revision.revisionId !== 'string' || revision.revisionId.trim().length === 0 ||
    typeof revision.revisionNo !== 'number' || !Number.isSafeInteger(revision.revisionNo) || revision.revisionNo <= 0
  ) {
    throw new BirthRuntimeError('WEB_BIRTH_MALFORMED_CURRENT', 'Current Birth Profile API returned an invalid current revision.');
  }

  return Object.freeze({
    birthProfileId: typeof profile.birthProfileId === 'string' ? profile.birthProfileId : null,
    revisionId: revision.revisionId,
    revisionNo: revision.revisionNo,
  });
}

async function readErrorPayload(response) {
  try {
    const payload = await response.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function resolveAuthorizedBearer(resolveBearer) {
  let activeBearer;
  try {
    activeBearer = await resolveBearer();
  } catch (error) {
    throw new BirthRuntimeError('WEB_BIRTH_SESSION_PREPARE_FAILED', 'A current session could not be prepared.', error);
  }
  if (!activeBearer || typeof activeBearer.token !== 'string' || activeBearer.token.length === 0) {
    throw new BirthRuntimeError('WEB_BIRTH_SESSION_REQUIRED', 'A current session is required.');
  }
  return activeBearer;
}

function authorizationHeaders(token, json = false) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function parseSuccessEnvelope(response, malformedCode, malformedMessage) {
  let envelope;
  try {
    envelope = await response.json();
  } catch (error) {
    throw new BirthRuntimeError(malformedCode, `${malformedMessage} returned invalid JSON.`, error);
  }

  try {
    return unwrapApiSuccessEnvelope(envelope);
  } catch (error) {
    if (error instanceof WebApiEnvelopeError) {
      throw new BirthRuntimeError(malformedCode, error.message, error);
    }
    throw error;
  }
}

export function createBirthRuntimeClient(options = {}) {
  const fetchImpl = requireFetch(options.fetchImpl ?? globalThis.fetch);
  const createEndpoint = options.createEndpoint ?? options.endpoint ?? DEFAULT_CREATE_ENDPOINT;
  const currentEndpoint = options.currentEndpoint ?? DEFAULT_CURRENT_ENDPOINT;
  const resolveBearer = options.resolveBearer ?? ensureActiveBearer;

  return Object.freeze({
    async readCurrentBirthProfile() {
      const activeBearer = await resolveAuthorizedBearer(resolveBearer);
      let response;
      try {
        response = await fetchImpl(currentEndpoint, {
          method: 'GET',
          headers: authorizationHeaders(activeBearer.token),
          credentials: 'same-origin',
          cache: 'no-store',
        });
      } catch (error) {
        throw new BirthRuntimeError('WEB_BIRTH_CURRENT_REQUEST_FAILED', 'Current Birth Profile API request failed.', error);
      }

      if (response.status === 401 || response.status === 403) {
        throw new BirthRuntimeError('WEB_BIRTH_SESSION_REQUIRED', 'A current session is required.');
      }
      if (!response.ok) {
        throw new BirthRuntimeError('WEB_BIRTH_CURRENT_REQUEST_FAILED', `Current Birth Profile API request failed with status ${response.status}.`);
      }

      return assertCurrentBirthProfile(
        await parseSuccessEnvelope(response, 'WEB_BIRTH_MALFORMED_CURRENT', 'Current Birth Profile API'),
      );
    },

    async createBirthProfile(request) {
      const activeBearer = await resolveAuthorizedBearer(resolveBearer);
      let response;
      try {
        response = await fetchImpl(createEndpoint, {
          method: 'POST',
          headers: authorizationHeaders(activeBearer.token, true),
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

      return assertCreateResponse(
        await parseSuccessEnvelope(response, 'WEB_BIRTH_MALFORMED_RESPONSE', 'Birth Profile API'),
      );
    },
  });
}

export const BIRTH_RUNTIME_ENDPOINT_V1 = DEFAULT_CREATE_ENDPOINT;
export const BIRTH_CURRENT_ENDPOINT_V1 = DEFAULT_CURRENT_ENDPOINT;
