const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ReadingHistoryContractErrorV1 extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'ReadingHistoryContractErrorV1';
  }
}

function fail(message) {
  throw new ReadingHistoryContractErrorV1(
    'Reading History browser contract rejected response: ' + message,
  );
}

function requireUuid(value, field) {
  if (typeof value !== 'string') fail(field + ' is invalid');
  const normalized = value.trim();
  if (!UUID_V1.test(normalized)) fail(field + ' is invalid');
  return normalized;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(field + ' is invalid');
  }
  return value;
}

function requireStringArray(value, field) {
  if (!Array.isArray(value)) fail(field + ' is invalid');
  const items = value.map((item) => requireString(item, field));
  if (new Set(items).size !== items.length) fail(field + ' contains duplicates');
  const sorted = [...items].sort((left, right) => left.localeCompare(right));
  if (sorted.some((item, index) => item !== items[index])) fail(field + ' is not deterministic');
  return Object.freeze(items);
}

function requireTimestamp(value, field) {
  const stored = requireString(value, field);
  if (!Number.isFinite(Date.parse(stored))) fail(field + ' is invalid');
  return stored;
}

function parseReading(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('reading item is invalid');
  }

  return Object.freeze({
    readingId: requireUuid(value.readingId, 'readingId'),
    readingSessionId: requireUuid(value.readingSessionId, 'readingSessionId'),
    sajuDomain: requireString(value.sajuDomain, 'sajuDomain'),
    readingContractVersion: requireString(
      value.readingContractVersion,
      'readingContractVersion',
    ),
    productResponseState: requireString(
      value.productResponseState,
      'productResponseState',
    ),
    readerCharacterIds: requireStringArray(value.readerCharacterIds, 'readerCharacterIds'),
    createdAt: requireTimestamp(value.createdAt, 'createdAt'),
    completedAt: requireTimestamp(value.completedAt, 'completedAt'),
  });
}

export function parseReadingHistoryPayloadV1(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('payload is invalid');
  }
  if (!Array.isArray(payload.readings)) fail('readings is invalid');

  const seenReadingIds = new Set();
  const readings = payload.readings.map((value) => {
    const reading = parseReading(value);
    if (seenReadingIds.has(reading.readingId)) {
      fail('readingId is duplicated');
    }
    seenReadingIds.add(reading.readingId);
    return reading;
  });

  return Object.freeze({ readings: Object.freeze(readings) });
}
