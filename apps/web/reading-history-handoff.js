export const PERSISTED_READING_HANDOFF_SOURCE_V1 = 'records';

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_DOMAIN_LENGTH = 128;

function normalizeRequired(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw new TypeError(field + ' must be a string.');
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TypeError(field + ' is outside the supported bounds.');
  }
  return normalized;
}

function normalizeUuid(value, field) {
  const normalized = normalizeRequired(value, field, 36);
  if (!UUID_V1.test(normalized)) {
    throw new TypeError(field + ' must be a UUID.');
  }
  return normalized;
}

export function createPersistedReadingHandoffV1(input) {
  const readingId = normalizeUuid(input?.readingId, 'readingId');
  const readingSessionId = normalizeUuid(
    input?.readingSessionId,
    'readingSessionId',
  );
  const sajuDomain = normalizeRequired(input?.sajuDomain, 'sajuDomain', MAX_DOMAIN_LENGTH);

  return Object.freeze({
    source: PERSISTED_READING_HANDOFF_SOURCE_V1,
    readingId,
    readingSessionId,
    sajuDomain,
  });
}

export function buildPersistedReadingHandoffUrlV1(input, path = 'reading-detail.html') {
  const handoff = createPersistedReadingHandoffV1(input);
  const params = new URLSearchParams();
  params.set('from', handoff.source);
  params.set('readingId', handoff.readingId);
  params.set('readingSessionId', handoff.readingSessionId);
  params.set('sajuDomain', handoff.sajuDomain);
  return path + '?' + params.toString();
}

export function parsePersistedReadingHandoffV1(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(search || '');

  if (params.get('from') !== PERSISTED_READING_HANDOFF_SOURCE_V1) {
    return Object.freeze({ state: 'none' });
  }

  try {
    return Object.freeze({
      state: 'ready',
      ...createPersistedReadingHandoffV1({
        readingId: params.get('readingId'),
        readingSessionId: params.get('readingSessionId'),
        sajuDomain: params.get('sajuDomain'),
      }),
    });
  } catch {
    return Object.freeze({ state: 'invalid' });
  }
}
