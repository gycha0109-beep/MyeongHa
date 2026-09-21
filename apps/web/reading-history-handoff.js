export const PERSISTED_READING_HANDOFF_SOURCE_V1 = 'records';

const MAX_IDENTIFIER_LENGTH = 512;
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

export function createPersistedReadingHandoffV1(input) {
  const readingId = normalizeRequired(input?.readingId, 'readingId', MAX_IDENTIFIER_LENGTH);
  const readingSessionId = normalizeRequired(
    input?.readingSessionId,
    'readingSessionId',
    MAX_IDENTIFIER_LENGTH,
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
