import { unwrapApiSuccessEnvelope, WebApiEnvelopeError } from './api-envelope.js';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  invalidateGuestSession,
  invalidateMemberSession,
} from './product-auth.js';

const DEFAULT_ENDPOINTS = Object.freeze({
  profile: '/api/me',
  lifeFacts: '/api/life-record',
  readings: '/api/readings',
  memories: '/api/memories',
});
const AUTHORITY_READ_ATTEMPTS = 2;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PRODUCT_AUTH_STORAGE_V1.memberSession) window.location.reload();
  });
}

export class RecordsRuntimeError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RecordsRuntimeError';
    this.code = code;
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new RecordsRuntimeError('WEB_RECORDS_FETCH_UNAVAILABLE', 'Records API transport is unavailable.');
  }
  return fetchImpl;
}

function assertJsonObject(value, endpoint) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', `Records API returned a malformed payload for ${endpoint}.`);
  }
  return value;
}

async function resolveAuthorizedBearer(resolveBearer) {
  let bearer;
  try {
    bearer = await resolveBearer();
  } catch (error) {
    throw new RecordsRuntimeError('WEB_RECORDS_SESSION_PREPARE_FAILED', 'Records session could not be prepared.', error);
  }

  if (
    !bearer ||
    (bearer.kind !== 'member' && bearer.kind !== 'guest') ||
    typeof bearer.token !== 'string' ||
    bearer.token.trim().length === 0
  ) {
    throw new RecordsRuntimeError('WEB_RECORDS_SESSION_REQUIRED', 'A current session is required.');
  }

  return bearer;
}

function sameAuthorizedBearer(left, right) {
  return left.kind === right.kind && left.token === right.token;
}

function sessionChangedFailure() {
  return new RecordsRuntimeError(
    'WEB_RECORDS_SESSION_CHANGED',
    'The active Records session changed while records were being read.',
  );
}

function invalidateRejectedBearer(bearer) {
  if (bearer.kind === 'member') {
    invalidateMemberSession(bearer.token);
    return;
  }
  if (bearer.kind === 'guest') invalidateGuestSession(bearer.token);
}

async function readJson(fetchImpl, endpoint, bearer) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearer.token}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    throw new RecordsRuntimeError('WEB_RECORDS_REQUEST_FAILED', 'Records API request failed.', error);
  }

  if (response.status === 401) {
    invalidateRejectedBearer(bearer);
    throw new RecordsRuntimeError('WEB_RECORDS_SESSION_REQUIRED', 'A current session is required.');
  }
  if (response.status === 403) {
    throw new RecordsRuntimeError('WEB_RECORDS_SESSION_REQUIRED', 'A current session is required.');
  }
  if (!response.ok) {
    throw new RecordsRuntimeError('WEB_RECORDS_REQUEST_FAILED', `Records API request failed with status ${response.status}.`);
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch (error) {
    throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', 'Records API returned invalid JSON.', error);
  }

  try {
    return assertJsonObject(unwrapApiSuccessEnvelope(envelope), endpoint);
  } catch (error) {
    if (error instanceof WebApiEnvelopeError) {
      throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', error.message, error);
    }
    throw error;
  }
}

export function createRecordsRuntimeClient(options = {}) {
  const fetchImpl = requireFetch(options.fetchImpl ?? globalThis.fetch);
  const resolveBearer = options.resolveBearer ?? ensureActiveBearer;
  const endpoints = Object.freeze({ ...DEFAULT_ENDPOINTS, ...(options.endpoints ?? {}) });

  async function readStable(readSnapshot) {
    for (let attempt = 0; attempt < AUTHORITY_READ_ATTEMPTS; attempt += 1) {
      const bearer = await resolveAuthorizedBearer(resolveBearer);
      const snapshot = await readSnapshot(bearer);
      const latest = await resolveAuthorizedBearer(resolveBearer);
      if (sameAuthorizedBearer(latest, bearer)) return snapshot;
    }
    throw sessionChangedFailure();
  }

  async function readEndpoint(endpoint) {
    return readStable((bearer) => readJson(fetchImpl, endpoint, bearer));
  }

  return Object.freeze({
    readProfile: () => readEndpoint(endpoints.profile),
    readLifeFacts: () => readEndpoint(endpoints.lifeFacts),
    readReadings: () => readEndpoint(endpoints.readings),
    readMemories: () => readEndpoint(endpoints.memories),
    readRecords() {
      return readStable(async (bearer) => {
        const profile = await readJson(fetchImpl, endpoints.profile, bearer);
        const [lifeFacts, readings, memories] = await Promise.all([
          readJson(fetchImpl, endpoints.lifeFacts, bearer),
          readJson(fetchImpl, endpoints.readings, bearer),
          readJson(fetchImpl, endpoints.memories, bearer),
        ]);
        return Object.freeze({ profile, lifeFacts, readings, memories });
      });
    },
  });
}

export const RECORDS_RUNTIME_ENDPOINTS_V1 = DEFAULT_ENDPOINTS;
