import { parseReadingHistoryPayloadV1, ReadingHistoryContractErrorV1 } from './reading-history-contract.js';
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
function projectReadingHistory(payload) {
  try {
    return parseReadingHistoryPayloadV1(payload);
  } catch (error) {
    if (error instanceof ReadingHistoryContractErrorV1) {
      throw new RecordsRuntimeError(
        'WEB_RECORDS_MALFORMED_RESPONSE',
        'Records API returned a malformed Reading History payload.',
        error,
      );
    }
    throw error;
  }
}


function requirePageItems(payload, field, endpoint) {
  if (!Array.isArray(payload?.[field])) {
    throw new RecordsRuntimeError(
      'WEB_RECORDS_MALFORMED_RESPONSE',
      `Records API returned malformed ${field} for ${endpoint}.`,
    );
  }
  return payload[field];
}

function parsePagination(payload, endpoint) {
  const pagination = payload?.pagination;
  if (pagination === null || typeof pagination !== 'object' || Array.isArray(pagination)) {
    throw new RecordsRuntimeError(
      'WEB_RECORDS_MALFORMED_RESPONSE',
      `Records API returned malformed pagination for ${endpoint}.`,
    );
  }
  if (
    !Number.isSafeInteger(pagination.pageSize)
    || pagination.pageSize < 1
    || pagination.pageSize > 50
    || typeof pagination.hasMore !== 'boolean'
  ) {
    throw new RecordsRuntimeError(
      'WEB_RECORDS_MALFORMED_RESPONSE',
      `Records API returned invalid pagination bounds for ${endpoint}.`,
    );
  }
  if (pagination.hasMore) {
    if (typeof pagination.nextCursor !== 'string' || pagination.nextCursor.length === 0) {
      throw new RecordsRuntimeError(
        'WEB_RECORDS_MALFORMED_RESPONSE',
        `Records API omitted the next cursor for ${endpoint}.`,
      );
    }
  } else if (pagination.nextCursor !== null) {
    throw new RecordsRuntimeError(
      'WEB_RECORDS_MALFORMED_RESPONSE',
      `Records API returned a cursor for a terminal page at ${endpoint}.`,
    );
  }
  return pagination;
}

function appendCursor(endpoint, cursor) {
  const base = 'https://myeongha.invalid';
  const url = new URL(endpoint, base);
  url.searchParams.set('cursor', cursor);
  return url.origin === base ? `${url.pathname}${url.search}` : url.toString();
}

async function readPagedCollection(fetchImpl, endpoint, bearer, field) {
  const all = [];
  const seenCursors = new Set();
  let requestEndpoint = endpoint;

  for (;;) {
    const payload = await readJson(fetchImpl, requestEndpoint, bearer);
    const items = requirePageItems(payload, field, requestEndpoint);
    const pagination = parsePagination(payload, requestEndpoint);
    if (items.length > pagination.pageSize) {
      throw new RecordsRuntimeError(
        'WEB_RECORDS_MALFORMED_RESPONSE',
        `Records API exceeded its page bound for ${requestEndpoint}.`,
      );
    }
    all.push(...items);

    if (!pagination.hasMore) {
      return Object.freeze({
        ...payload,
        [field]: Object.freeze(all),
        pagination: Object.freeze({
          pageSize: pagination.pageSize,
          hasMore: false,
          nextCursor: null,
        }),
      });
    }

    const nextCursor = pagination.nextCursor;
    if (seenCursors.has(nextCursor)) {
      throw new RecordsRuntimeError(
        'WEB_RECORDS_MALFORMED_RESPONSE',
        `Records API returned a non-advancing cursor for ${endpoint}.`,
      );
    }
    seenCursors.add(nextCursor);
    requestEndpoint = appendCursor(endpoint, nextCursor);
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
    readLifeFacts: () => readStable((bearer) =>
      readPagedCollection(fetchImpl, endpoints.lifeFacts, bearer, 'facts')),
    readReadings: () => readStable(async (bearer) =>
      projectReadingHistory(
        await readPagedCollection(fetchImpl, endpoints.readings, bearer, 'readings'),
      )),
    readMemories: () => readStable((bearer) =>
      readPagedCollection(fetchImpl, endpoints.memories, bearer, 'memories')),
    readRecords() {
      return readStable(async (bearer) => {
        const profile = await readJson(fetchImpl, endpoints.profile, bearer);
        const [lifeFacts, readingsPayload, memories] = await Promise.all([
          readPagedCollection(fetchImpl, endpoints.lifeFacts, bearer, 'facts'),
          readPagedCollection(fetchImpl, endpoints.readings, bearer, 'readings'),
          readPagedCollection(fetchImpl, endpoints.memories, bearer, 'memories'),
        ]);
        const readings = projectReadingHistory(readingsPayload);
        return Object.freeze({ profile, lifeFacts, readings, memories });
      });
    },
  });
}

export const RECORDS_RUNTIME_ENDPOINTS_V1 = DEFAULT_ENDPOINTS;
