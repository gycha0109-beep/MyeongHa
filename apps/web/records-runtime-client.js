import { getUiLocaleRequestHeadersV1 } from './ui-i18n.js';
import {
  parseCurrentReaderRecordContinuityV1,
} from './commerce-reader-records-continuity.js';
import { parseReadingHistoryPayloadV1, ReadingHistoryContractErrorV1 } from './reading-history-contract.js';
import { unwrapApiSuccessEnvelope, WebApiEnvelopeError } from './api-envelope.js';
import { assertBirthProfile } from './my-runtime-client.js';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  invalidateGuestSession,
  invalidateMemberSession,
} from './product-auth.js';

const DEFAULT_ENDPOINTS = Object.freeze({
  profile: '/api/me',
  birthProfile: '/api/me/birth-profile',
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
        ...getUiLocaleRequestHeadersV1(),
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
const READER_CONTINUITY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER_CONTINUITY_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

async function readCurrentReaderContinuity(fetchImpl, bearer, input) {
  const readingId = typeof input?.readingId === 'string' && READER_CONTINUITY_UUID.test(input.readingId)
    ? input.readingId.toLowerCase() : null;
  const readerCharacterId = typeof input?.readerCharacterId === 'string'
    && READER_CONTINUITY_ID.test(input.readerCharacterId)
    ? input.readerCharacterId : null;
  if (readingId === null || readerCharacterId === null) {
    throw new RecordsRuntimeError('WEB_RECORDS_READER_CONTINUITY_INVALID', 'Reader identity is invalid.');
  }
  const endpoint = '/api/readings/' + encodeURIComponent(readingId)
    + '/reader-continuity?readerCharacterId=' + encodeURIComponent(readerCharacterId);

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + bearer.token,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new RecordsRuntimeError('WEB_RECORDS_READER_CONTINUITY_UNAVAILABLE',
      'Reader permission lookup is unavailable.');
  }
  if (response.status === 401) {
    invalidateRejectedBearer(bearer);
    throw new RecordsRuntimeError('WEB_RECORDS_SESSION_REQUIRED', 'Current session is required.');
  }
  if (response.status === 503) {
    // Feature/Privacy/Production hold is NOT a refund or denied purchase.
    return Object.freeze({ state: 'held' });
  }
  if (response.status === 403 || response.status === 404) {
    // Never infer a legal refund from a 404 or a cancelled HTTP request.
    return Object.freeze({ state: 'not_confirmed' });
  }
  if (!response.ok) {
    throw new RecordsRuntimeError('WEB_RECORDS_READER_CONTINUITY_UNAVAILABLE',
      'Reader permission lookup failed.');
  }
  try {
    const envelope = await response.json();
    return parseCurrentReaderRecordContinuityV1(envelope, { readingId, readerCharacterId });
  } catch {
    throw new RecordsRuntimeError('WEB_RECORDS_READER_CONTINUITY_INVALID',
      'Reader permission response was invalid.');
  }
}

async function readOptionalCurrentBirthProfile(fetchImpl, endpoint, bearer) {
  try {
    const payload = await readJson(fetchImpl, endpoint, bearer);
    // Share the validated current-self Birth contract with My.
    return Object.freeze({ status: 'ready', payload: assertBirthProfile(payload) });
  } catch (error) {
    // Revoked credentials cannot be downgraded into an optional-data error.
    if (error instanceof RecordsRuntimeError && error.code === 'WEB_RECORDS_SESSION_REQUIRED') throw error;
    // Other failures do not hide Life Facts, Official Readings or Memories.
    return Object.freeze({ status: 'unavailable' });
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
    /** Current Reader state is independent of historical record provenance. */
    readReaderContinuity: (input) =>
      readStable((bearer) => readCurrentReaderContinuity(fetchImpl, bearer, input)),
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
        const [lifeFacts, readingsPayload, memories, birth] = await Promise.all([
          readPagedCollection(fetchImpl, endpoints.lifeFacts, bearer, 'facts'),
          readPagedCollection(fetchImpl, endpoints.readings, bearer, 'readings'),
          readPagedCollection(fetchImpl, endpoints.memories, bearer, 'memories'),
          readOptionalCurrentBirthProfile(fetchImpl, endpoints.birthProfile, bearer),
        ]);
        const readings = projectReadingHistory(readingsPayload);
        return Object.freeze({ profile, lifeFacts, readings, memories, birth });
      });
    },
  });
}

export const RECORDS_RUNTIME_ENDPOINTS_V1 = DEFAULT_ENDPOINTS;
